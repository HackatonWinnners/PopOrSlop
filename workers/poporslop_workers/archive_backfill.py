"""Wayback Machine backfill (plan §5 / decision #9).

oracle_events.raw_content (gzipped at fetch time) is the guaranteed evidence
copy; archived_url is best-effort. SPN2 rate limits anonymous saves hard, so
this job archives a small batch per run and simply retries the rest on the
next cron tick. Events referenced by posted proposals are archived first.
"""

from __future__ import annotations

import time

from .common import db
from .common.http import client

SAVE_URL = "https://web.archive.org/save/"
PER_RUN = 8
DELAY_S = 6.0  # anonymous SPN2 tolerates ~5-12 saves/min


def run() -> dict:
    archived = 0
    failed = 0
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT e.id, e.raw_url,
                   EXISTS (SELECT 1 FROM resolution_proposals p
                           WHERE p.status <> 'draft'
                             AND p.evidence::text LIKE '%' || e.external_ref || '%') AS in_proposal
            FROM oracle_events e
            WHERE e.archived_url IS NULL AND e.raw_url IS NOT NULL
            ORDER BY in_proposal DESC, e.fetched_at DESC
            LIMIT %s
            """,
            (PER_RUN,),
        )
        rows = cur.fetchall()
        with client() as c:
            for event_id, raw_url, _prio in rows:
                try:
                    res = c.get(SAVE_URL + raw_url, timeout=90.0)
                    loc = res.headers.get("content-location") or ""
                    if res.status_code in (200, 302) and "/web/" in (loc or res.url.path):
                        snapshot = f"https://web.archive.org{loc}" if loc else str(res.url)
                        cur.execute(
                            "UPDATE oracle_events SET archived_url = %s WHERE id = %s",
                            (snapshot, event_id),
                        )
                        archived += 1
                    else:
                        failed += 1
                except Exception:
                    failed += 1
                time.sleep(DELAY_S)
        conn.commit()
    return {"archived": archived, "failed_or_deferred": failed, "batch": len(rows)}
