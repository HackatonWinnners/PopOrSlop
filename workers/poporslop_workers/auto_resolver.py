"""Draft resolution proposals from confirmed oracle-event matches (plan §5).

For every confirmed event↔company match, check the company's open/locked
markets against their resolver_config:

  {"rule": "funding_gte", "amount_usd": N}
      Form D with total sold/offering ≥ N (SAFEs count — any securities sale
      per the adopted §15 default)  → draft YES
  {"rule": "survival"}
      insolvency notice / strike-off → draft NO ("still operating?" phrasing)

Drafts only — proposer='auto_resolver', status='draft'. The admin reviews
and posts; workers never touch market status, ledger, or lmsr_state.
"""

from __future__ import annotations

import json

from .common import db

SOURCE_KINDS = {
    "edgar_formd": "funding",
    "companies_house": None,  # kind carried per-event in parsed.kind
    "insolvenz_de": "survival",
}


def event_kind(source: str, parsed: dict) -> str | None:
    fixed = SOURCE_KINDS.get(source)
    return parsed.get("kind") or fixed


def outcome_index(outcomes: list[str], wanted: str) -> int | None:
    for i, o in enumerate(outcomes):
        if o.strip().upper() == wanted:
            return i
    return None


def funding_amount(parsed: dict) -> float | None:
    for key in ("total_amount_sold", "total_offering_amount"):
        raw = parsed.get(key)
        if raw is None or str(raw).strip().lower() in ("", "indefinite"):
            continue
        try:
            return float(str(raw).replace(",", ""))
        except ValueError:
            continue
    return None


def draft_for(market: dict, event: dict) -> tuple[int, str] | None:
    """Returns (outcome_idx, summary) if the event resolves the market."""
    config = market.get("resolver_config") or {}
    rule = config.get("rule")
    kind = event_kind(event["source"], event["parsed"])

    if rule == "funding_gte" and kind == "funding":
        amount = funding_amount(event["parsed"])
        threshold = float(config.get("amount_usd", 0))
        if amount is not None and amount >= threshold:
            idx = outcome_index(market["outcomes"], "YES")
            if idx is not None:
                return idx, (
                    f"{event['parsed'].get('issuer_name') or event['parsed'].get('company_name')}: "
                    f"securities sale of ${amount:,.0f} ≥ ${threshold:,.0f} threshold "
                    f"({event['source']} {event['external_ref']})"
                )
    elif rule == "survival" and kind == "survival":
        idx = outcome_index(market["outcomes"], "NO")
        if idx is not None:
            return idx, (
                f"{event['parsed'].get('company_name')}: insolvency/strike-off notice "
                f"({event['source']} {event['external_ref']})"
            )
    return None


def run() -> dict:
    drafted = 0
    considered = 0

    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT e.id, e.source, e.external_ref, e.raw_url, e.archived_url, e.hash, e.parsed,
                   m.company_id
            FROM oracle_events e
            JOIN event_company_matches m
              ON m.oracle_event_id = e.id AND m.status = 'confirmed'
            """
        )
        events = [
            {
                "id": r[0], "source": r[1], "external_ref": r[2], "raw_url": r[3],
                "archived_url": r[4], "hash": r[5], "parsed": r[6] or {}, "company_id": r[7],
            }
            for r in cur.fetchall()
        ]

        for event in events:
            cur.execute(
                """
                SELECT id, outcomes, resolver_config FROM markets
                WHERE company_id = %s AND status IN ('OPEN', 'LOCKED')
                """,
                (event["company_id"],),
            )
            for market_id, outcomes, resolver_config in cur.fetchall():
                considered += 1
                hit = draft_for(
                    {"outcomes": outcomes, "resolver_config": resolver_config}, event
                )
                if hit is None:
                    continue
                outcome_idx, summary = hit
                # One draft per (market, event) — re-runs stay quiet.
                cur.execute(
                    """
                    SELECT 1 FROM resolution_proposals
                    WHERE market_id = %s AND proposer = 'auto_resolver'
                      AND evidence::text LIKE %s
                    """,
                    (market_id, f'%{event["external_ref"]}%'),
                )
                if cur.fetchone():
                    continue
                evidence = [
                    {
                        "source": event["source"],
                        "externalRef": event["external_ref"],
                        "url": event["raw_url"],
                        "archivedUrl": event["archived_url"],
                        "sha256": event["hash"],
                        "summary": summary,
                    }
                ]
                cur.execute(
                    """
                    INSERT INTO resolution_proposals (market_id, outcome_idx, evidence, proposer, status)
                    VALUES (%s, %s, %s, 'auto_resolver', 'draft')
                    """,
                    (market_id, outcome_idx, json.dumps(evidence)),
                )
                drafted += 1
        conn.commit()

    return {"considered": considered, "drafted": drafted}
