"""Cron entrypoint: python -m poporslop_workers.cli <job> [options]."""

import argparse
import json
import sys
from datetime import date, datetime, timedelta

from .archive_backfill import run as run_archive_backfill
from .auto_resolver import run as run_auto_resolver
from .matcher import run as run_matcher
from .sources.companies_house import run as run_companies_house
from .sources.edgar_formd import run as run_edgar_formd
from .sources.insolvenz_de import run as run_insolvenz_de


def main() -> None:
    parser = argparse.ArgumentParser(prog="poporslop-worker")
    sub = parser.add_subparsers(dest="job", required=True)

    edgar = sub.add_parser("edgar_formd", help="ingest one day's Form D filings")
    edgar.add_argument("--date", help="YYYY-MM-DD (default: yesterday)")
    edgar.add_argument("--enrich-limit", type=int, default=25, help="Form D XMLs to fetch")

    sub.add_parser("companies_house", help="poll UK filing history for tracked companies")
    sub.add_parser("insolvenz_de", help="search DE insolvency notices for tracked companies")
    sub.add_parser("matcher", help="link unmatched oracle_events to companies")
    sub.add_parser("auto_resolver", help="draft proposals from confirmed matches")
    sub.add_parser("archive_backfill", help="save evidence URLs to the Wayback Machine")

    args = parser.parse_args()
    if args.job == "edgar_formd":
        day = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today() - timedelta(days=1)
        result = run_edgar_formd(day, enrich_limit=args.enrich_limit)
    elif args.job == "companies_house":
        result = run_companies_house()
    elif args.job == "insolvenz_de":
        result = run_insolvenz_de()
    elif args.job == "matcher":
        result = run_matcher()
    elif args.job == "auto_resolver":
        result = run_auto_resolver()
    elif args.job == "archive_backfill":
        result = run_archive_backfill()
    else:  # pragma: no cover
        parser.error(f"unknown job {args.job}")
        return
    json.dump(result, sys.stdout)
    print()


if __name__ == "__main__":
    main()
