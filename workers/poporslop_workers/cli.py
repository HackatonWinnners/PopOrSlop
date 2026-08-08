"""Cron entrypoint: python -m poporslop_workers.cli <job> [options]."""

import argparse
import json
import sys
from datetime import date, datetime, timedelta

from .matcher import run as run_matcher
from .sources.edgar_formd import run as run_edgar_formd


def main() -> None:
    parser = argparse.ArgumentParser(prog="poporslop-worker")
    sub = parser.add_subparsers(dest="job", required=True)

    edgar = sub.add_parser("edgar_formd", help="ingest one day's Form D filings")
    edgar.add_argument("--date", help="YYYY-MM-DD (default: yesterday)")
    edgar.add_argument("--enrich-limit", type=int, default=25, help="Form D XMLs to fetch")

    sub.add_parser("matcher", help="link unmatched oracle_events to companies")

    args = parser.parse_args()
    if args.job == "edgar_formd":
        day = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today() - timedelta(days=1)
        result = run_edgar_formd(day, enrich_limit=args.enrich_limit)
    elif args.job == "matcher":
        result = run_matcher()
    else:  # pragma: no cover
        parser.error(f"unknown job {args.job}")
        return
    json.dump(result, sys.stdout)
    print()


if __name__ == "__main__":
    main()
