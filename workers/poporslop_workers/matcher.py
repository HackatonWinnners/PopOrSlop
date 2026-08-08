"""Link oracle_events to tracked companies (plan §5).

Confidence ladder:
  - exact external-id match (CIK for EDGAR) → 1.0, auto-confirmed
  - fuzzy normalized-name match ≥ 90       → auto-confirmed
  - fuzzy 70–90                             → pending, admin review screen
Anything below 70 stays unmatched — silence is better than a wrong link.
"""

from __future__ import annotations

import re
import unicodedata

from rapidfuzz import fuzz

from .common import db

AUTO_CONFIRM = 90.0
PENDING_FLOOR = 70.0

# Legal-form noise that inflates name distance without carrying identity.
_STOPWORDS = re.compile(
    r"\b(inc|incorporated|corp|corporation|co|company|llc|l\.l\.c|ltd|limited|"
    r"gmbh|ug|ag|plc|lp|l\.p|holdings?|technologies|technology|labs?)\b\.?",
    re.IGNORECASE,
)


def normalize_name(name: str) -> str:
    # ASCII-fold first: Schrödinbug ↔ Schrodinbug must be the same name.
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = _STOPWORDS.sub(" ", name.lower())
    name = re.sub(r"[^a-z0-9 ]+", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def match_event(parsed: dict, companies: list[dict]) -> tuple[dict, float, str] | None:
    """companies: [{id, name, ext_ids}]. Returns (company, confidence, method)."""
    cik = str(parsed.get("cik", "")).lstrip("0")
    if cik:
        for c in companies:
            if str(c["ext_ids"].get("cik", "")).lstrip("0") == cik:
                return c, 1.0, "cik"

    raw_name = parsed.get("issuer_name") or parsed.get("company_name") or ""
    norm = normalize_name(raw_name)
    if not norm:
        return None
    best: tuple[dict, float] | None = None
    for c in companies:
        score = fuzz.token_sort_ratio(norm, normalize_name(c["name"]))
        if best is None or score > best[1]:
            best = (c, score)
    if best and best[1] >= PENDING_FLOOR:
        return best[0], best[1] / 100.0, "name_fuzzy"
    return None


def run() -> dict:
    matched_confirmed = 0
    matched_pending = 0
    scanned = 0

    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, name, ext_ids FROM companies")
        companies = [{"id": r[0], "name": r[1], "ext_ids": r[2] or {}} for r in cur.fetchall()]
        if not companies:
            return {"note": "no companies tracked yet", "scanned": 0}

        cur.execute(
            """
            SELECT e.id, e.parsed FROM oracle_events e
            LEFT JOIN event_company_matches m ON m.oracle_event_id = e.id
            WHERE m.oracle_event_id IS NULL
            """
        )
        for event_id, parsed in cur.fetchall():
            scanned += 1
            hit = match_event(parsed or {}, companies)
            if hit is None:
                continue
            company, confidence, method = hit
            status = "confirmed" if confidence >= AUTO_CONFIRM / 100.0 else "pending"
            cur.execute(
                """
                INSERT INTO event_company_matches (oracle_event_id, company_id, confidence, method, status)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (event_id, company["id"], confidence, method, status),
            )
            if status == "confirmed":
                matched_confirmed += 1
            else:
                matched_pending += 1
        conn.commit()

    return {"scanned": scanned, "confirmed": matched_confirmed, "pending": matched_pending}
