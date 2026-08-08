"""EDGAR Form D ingester (spec §5.2, plan §5).

Strategy: the daily form index (plain text, one line per filing) is the
cheap, reliable primary — one request per day covers every Form D. Filings
land as oracle_events keyed by accession number. A second "enrich" pass
fetches the Form D XML (issuer CIK, offering amount) for a bounded number of
events; the matcher can run on index data alone since it carries CIK + name.

Form D must be filed within 15 days of first sale — never the sole
resolution criterion (foreign issuers / 4(a)(2) raises don't file).
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone

from lxml import etree

from ..common import db
from ..common.http import client, get

INDEX_URL = "https://www.sec.gov/Archives/edgar/daily-index/{year}/QTR{qtr}/form.{ymd}.idx"
ARCHIVES = "https://www.sec.gov/Archives/"
SOURCE = "edgar_formd"
POLITE_DELAY_S = 0.25  # ≤5 req/s per SEC fair-access policy


@dataclass
class IndexRow:
    form_type: str
    company_name: str
    cik: str
    date_filed: str
    path: str

    @property
    def accession(self) -> str:
        m = re.search(r"(\d{10}-\d{2}-\d{6})", self.path)
        return m.group(1) if m else self.path


def parse_form_index(text: str, forms: tuple[str, ...] = ("D", "D/A")) -> list[IndexRow]:
    """Parse a daily form.idx. Layout: header block, then fixed-order columns
    Form Type / Company Name / CIK / Date Filed / File Name, whitespace-aligned."""
    rows: list[IndexRow] = []
    in_body = False
    for line in text.splitlines():
        if line.startswith("---"):
            in_body = True
            continue
        if not in_body or not line.strip():
            continue
        # File name is the last whitespace-separated token; form type the first.
        parts = line.split()
        if len(parts) < 5:
            continue
        form_type = parts[0]
        if form_type not in forms:
            continue
        path = parts[-1]
        date_filed = parts[-2]
        cik = parts[-3]
        company_name = " ".join(parts[1:-3])
        rows.append(IndexRow(form_type, company_name, cik, date_filed, path))
    return rows


def parse_form_d_xml(xml_bytes: bytes) -> dict:
    """Extract issuer + offering facts from a primary_doc.xml Form D."""
    root = etree.fromstring(xml_bytes)
    ns_agnostic = etree.ETXPath("//*[local-name()=$name]")

    def first_text(name: str) -> str | None:
        for node in ns_agnostic(root, name=name):
            # Container elements carry whitespace text; look for real content.
            text = (node.text or "").strip() or (node.findtext("./*") or "").strip()
            if text:
                return text
        return None

    return {
        "issuer_name": first_text("entityName"),
        "cik": first_text("cik"),
        "total_offering_amount": first_text("totalOfferingAmount"),
        "total_amount_sold": first_text("totalAmountSold"),
        "date_of_first_sale": first_text("dateOfFirstSale") or first_text("value"),
        "industry": first_text("industryGroupType"),
    }


def run(day: date, enrich_limit: int = 0) -> dict:
    """Ingest one day's Form D filings. Idempotent: re-runs insert nothing."""
    qtr = (day.month - 1) // 3 + 1
    url = INDEX_URL.format(year=day.year, qtr=qtr, ymd=day.strftime("%Y%m%d"))
    inserted = 0
    skipped = 0
    enriched = 0

    with client() as c, db.connect() as conn, conn.cursor() as cur:
        res = get(c, url)
        if res.status_code == 404:
            return {"day": day.isoformat(), "note": "no index (weekend/holiday?)", "inserted": 0}
        res.raise_for_status()
        rows = parse_form_index(res.text)

        for row in rows:
            fresh = db.insert_oracle_event(
                cur,
                source=SOURCE,
                external_ref=row.accession,
                raw_url=ARCHIVES + row.path,
                parsed={
                    "form_type": row.form_type,
                    "company_name": row.company_name,
                    "cik": row.cik.lstrip("0") or "0",
                    "date_filed": row.date_filed,
                },
                event_ts=datetime.strptime(row.date_filed, "%Y%m%d").replace(tzinfo=timezone.utc)
                if re.fullmatch(r"\d{8}", row.date_filed)
                else None,
            )
            inserted += fresh
            skipped += not fresh

        # Enrichment: pull the Form D XML for the newest N events lacking
        # offering data. raw_content (gzipped) is the guaranteed evidence copy.
        if enrich_limit > 0:
            cur.execute(
                """
                SELECT id, raw_url FROM oracle_events
                WHERE source = %s AND raw_content IS NULL
                ORDER BY fetched_at DESC LIMIT %s
                """,
                (SOURCE, enrich_limit),
            )
            for event_id, raw_url in cur.fetchall():
                filing_index_url = raw_url.replace(".txt", "-index.htm")
                time.sleep(POLITE_DELAY_S)
                idx_res = get(c, filing_index_url)
                # The index links both an XSL-rendered HTML view and the raw
                # XML at .../primary_doc.xml — take the raw one only.
                links = re.findall(r'href="(/Archives/[^"]*primary_doc\.xml)"', idx_res.text)
                raw_links = [l for l in links if "/xsl" not in l.lower()]
                if not raw_links:
                    continue
                time.sleep(POLITE_DELAY_S)
                xml_res = get(c, "https://www.sec.gov" + raw_links[0])
                if not xml_res.content.lstrip().startswith(b"<?xml"):
                    # Error page / throttle response — leave for a later pass.
                    continue
                try:
                    facts = parse_form_d_xml(xml_res.content)
                except etree.XMLSyntaxError:
                    continue
                cur.execute(
                    """
                    UPDATE oracle_events
                    SET parsed = parsed || %s::jsonb,
                        raw_content = %s,
                        hash = %s,
                        archived_url = NULL
                    WHERE id = %s
                    """,
                    (
                        json.dumps({k: v for k, v in facts.items() if v is not None}),
                        gzip.compress(xml_res.content),
                        hashlib.sha256(xml_res.content).hexdigest(),
                        event_id,
                    ),
                )
                enriched += 1

        conn.commit()

    return {
        "day": day.isoformat(),
        "index_rows": len(rows),
        "inserted": inserted,
        "already_present": skipped,
        "enriched": enriched,
    }
