from pathlib import Path

from poporslop_workers.sources.insolvenz_de import parse_results

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_results_extracts_notices():
    rows = parse_results((FIXTURES / "insolvenz_results.html").read_text())
    assert len(rows) == 2
    assert rows[0]["external_ref"] == "detail.jsf?id=abc123"
    assert rows[0]["aktenzeichen"] == "36a IN 2291/26"
    assert rows[0]["date"] == "2026-08-05"
    assert "Schrödinbug Labs GmbH" in rows[0]["row_text"]


def test_parse_results_stable_on_reparse():
    text = (FIXTURES / "insolvenz_results.html").read_text()
    assert parse_results(text) == parse_results(text)
