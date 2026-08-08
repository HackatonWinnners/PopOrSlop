from poporslop_workers.sources.companies_house import classify, parse_filings

PAYLOAD = {
    "items": [
        {"transaction_id": "t1", "type": "SH01", "category": "capital", "description": "statement-of-capital", "date": "2026-07-15"},
        {"transaction_id": "t2", "type": "AA", "category": "accounts", "description": "accounts", "date": "2026-06-01"},
        {"transaction_id": "t3", "type": "GAZ1", "category": "gazette", "description": "gazette-notice-compulsory", "date": "2026-08-01"},
        {"transaction_id": "t4", "type": "CS01", "category": "confirmation-statement", "description": "confirmation", "date": "2026-05-20"},
    ]
}


def test_classify_watched_types():
    assert classify({"type": "SH01"}) == "funding"
    assert classify({"type": "GAZ1"}) == "survival"
    assert classify({"type": "AA"}) is None


def test_parse_filings_keeps_only_watched():
    rows = parse_filings("12345678", PAYLOAD)
    assert [r["external_ref"] for r in rows] == ["t1", "t3"]
    assert rows[0]["kind"] == "funding"
    assert rows[1]["kind"] == "survival"
    assert rows[0]["company_number"] == "12345678"
