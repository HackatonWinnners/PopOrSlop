"""Postgres access for workers.

Workers write ONLY oracle_events / event_company_matches / resolution_proposals
(drafts). Market status, ledger, and lmsr_state belong to the TS app — one
writer per table class keeps the concurrency story trivial (plan §1).
"""

import json
import os

import psycopg

DEFAULT_URL = "postgres://poporslop:poporslop@localhost:5433/poporslop"


def connect() -> psycopg.Connection:
    return psycopg.connect(os.environ.get("DATABASE_URL", DEFAULT_URL), autocommit=False)


def insert_oracle_event(
    cur: psycopg.Cursor,
    *,
    source: str,
    external_ref: str,
    raw_url: str | None = None,
    parsed: dict | None = None,
    event_ts=None,
    raw_content: bytes | None = None,
    content_hash: str | None = None,
) -> bool:
    """Idempotent insert; the UNIQUE(source, external_ref) key makes cron
    double-fires and backfills free. Returns True if a new row landed."""
    cur.execute(
        """
        INSERT INTO oracle_events (source, external_ref, raw_url, parsed, event_ts, raw_content, hash)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (source, external_ref) DO NOTHING
        """,
        (source, external_ref, raw_url, json.dumps(parsed or {}), event_ts, raw_content, content_hash),
    )
    return cur.rowcount == 1
