"""Companies House (UK) filing-history poller (spec §5.2, plan §5).

Tracks companies with ext_ids.ch set. Watches:
  - SH01 (allotment of shares)      → funding evidence ("visible-by" phrasing:
                                      SH01s lag the actual round by weeks)
  - strike-off / dissolution types  → survival evidence

Free REST API, HTTP Basic auth with the key as username. 600 req/5min —
trivial at our company count. external_ref = filing transaction_id.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import httpx

from ..common import db

API = "https://api.company-information.service.gov.uk"
SOURCE = "companies_house"

FUNDING_TYPES = {"SH01"}
SURVIVAL_TYPES = {"DS01", "GAZ1", "GAZ2"}  # strike-off application / gazette notices
WATCHED = FUNDING_TYPES | SURVIVAL_TYPES


def classify(filing: dict) -> str | None:
    t = (filing.get("type") or "").upper()
    if t in FUNDING_TYPES:
        return "funding"
    if t in SURVIVAL_TYPES or "strike" in (filing.get("category") or ""):
        return "survival"
    return None


def parse_filings(company_number: str, payload: dict) -> list[dict]:
    """Extract watched filings from a filing-history payload."""
    out = []
    for item in payload.get("items", []):
        kind = classify(item)
        if kind is None:
            continue
        out.append(
            {
                "external_ref": item.get("transaction_id"),
                "kind": kind,
                "type": item.get("type"),
                "category": item.get("category"),
                "description": item.get("description"),
                "date": item.get("date"),
                "company_number": company_number,
            }
        )
    return out


def run() -> dict:
    api_key = os.environ.get("CH_API_KEY")
    if not api_key:
        return {"note": "CH_API_KEY not set — skipping (get a free key at developer.company-information.service.gov.uk)"}

    inserted = 0
    checked = 0
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, name, ext_ids->>'ch' FROM companies WHERE ext_ids ? 'ch'")
        tracked = cur.fetchall()
        if not tracked:
            return {"note": "no companies with ext_ids.ch tracked", "checked": 0}

        with httpx.Client(auth=(api_key, ""), timeout=30.0) as c:
            for _company_id, name, number in tracked:
                res = c.get(f"{API}/company/{number}/filing-history", params={"items_per_page": 50})
                if res.status_code == 404:
                    continue
                res.raise_for_status()
                checked += 1
                for filing in parse_filings(number, res.json()):
                    if not filing["external_ref"]:
                        continue
                    event_ts = None
                    if filing["date"]:
                        event_ts = datetime.fromisoformat(filing["date"]).replace(tzinfo=timezone.utc)
                    inserted += db.insert_oracle_event(
                        cur,
                        source=SOURCE,
                        external_ref=filing["external_ref"],
                        raw_url=f"https://find-and-update.company-information.service.gov.uk/company/{number}/filing-history",
                        parsed={**filing, "company_name": name},
                        event_ts=event_ts,
                    )
        conn.commit()
    return {"checked": checked, "inserted": inserted}
