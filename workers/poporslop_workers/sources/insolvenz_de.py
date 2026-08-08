"""Insolvenzbekanntmachungen.de poller (spec §5.2, plan §5).

Searches the public DE insolvency-notice portal for each tracked DE company
name. §4 InsoBekV limits unrestricted search to ~2 weeks after publication,
so this runs 2×/day; names that age out unmatched get flagged for manual
search rather than silently dropped.

The portal is a POST-form + HTML-table site; parsing is isolated in
parse_results() and covered by fixture tests. external_ref = the portal's
case detail link (court + Aktenzeichen encoded), which is stable per notice.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from lxml import html as lxml_html

from ..common import db
from ..common.http import client

SEARCH_URL = "https://neu.insolvenzbekanntmachungen.de/ap/suche.jsf"
SOURCE = "insolvenz_de"


def parse_results(page_html: str) -> list[dict]:
    """Extract notice rows from a search-results page.

    Result rows carry a detail link plus court / Aktenzeichen / subject text.
    Portal markup shifts occasionally — keep selectors loose and covered by
    the fixture test so breakage is loud.
    """
    doc = lxml_html.fromstring(page_html)
    out = []
    for link in doc.xpath('//a[contains(@href, "detail") or contains(@onclick, "detail")]'):
        row_text = " ".join(link.xpath("ancestor::tr[1]//text()")).strip()
        row_text = re.sub(r"\s+", " ", row_text)
        if not row_text:
            continue
        href = link.get("href") or ""
        # Court references look like "36a IN 2291/26" — digits, optional
        # lowercase division letter, register sign, number/year.
        m_az = re.search(r"\b(\d+[a-z]?\s*[A-Z]{1,4}\s*\d+/\d+)\b", row_text)
        date_m = re.search(r"\b(\d{2})\.(\d{2})\.(\d{4})\b", row_text)
        out.append(
            {
                "external_ref": href or row_text[:120],
                "aktenzeichen": m_az.group(1) if m_az else None,
                "row_text": row_text[:500],
                "date": f"{date_m.group(3)}-{date_m.group(2)}-{date_m.group(1)}" if date_m else None,
            }
        )
    return out


def run() -> dict:
    inserted = 0
    searched = 0
    stale_names: list[str] = []

    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, name FROM companies WHERE jurisdiction = 'DE'")
        tracked = cur.fetchall()
        if not tracked:
            return {"note": "no DE companies tracked", "searched": 0}

        with client() as c:
            for _company_id, name in tracked:
                # The JSF form wants a session; GET first, then POST the search.
                c.get(SEARCH_URL)
                res = c.post(
                    SEARCH_URL,
                    data={
                        "frm_suche:lsom_bundesland:som": "--+Alle+Bundesl%C3%A4nder+--",
                        "frm_suche:litx_firmaNachname:text": name,
                        "frm_suche:cbt_suchen": "Suchen",
                    },
                )
                if res.status_code != 200:
                    stale_names.append(name)
                    continue
                searched += 1
                for notice in parse_results(res.text):
                    event_ts = None
                    if notice["date"]:
                        event_ts = datetime.fromisoformat(notice["date"]).replace(tzinfo=timezone.utc)
                    inserted += db.insert_oracle_event(
                        cur,
                        source=SOURCE,
                        external_ref=notice["external_ref"],
                        raw_url=SEARCH_URL,
                        parsed={**notice, "searched_name": name, "company_name": name, "kind": "survival"},
                        event_ts=event_ts,
                    )
        conn.commit()

    result: dict = {"searched": searched, "inserted": inserted}
    if stale_names:
        result["flag_for_manual_search"] = stale_names
    return result
