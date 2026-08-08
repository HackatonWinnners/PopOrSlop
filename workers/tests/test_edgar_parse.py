from pathlib import Path

from poporslop_workers.sources.edgar_formd import parse_form_d_xml, parse_form_index

FIXTURES = Path(__file__).parent / "fixtures"


def test_form_index_filters_to_form_d():
    rows = parse_form_index((FIXTURES / "form.20260806.idx").read_text())
    assert [r.form_type for r in rows] == ["D", "D", "D/A", "D"]
    assert rows[0].company_name == "ACME ROBOTICS INC"
    assert rows[0].cik == "1998877"
    assert rows[0].accession == "0001998877-26-000004"
    assert rows[1].company_name == "Schrodinbug Labs, Inc."


def test_form_index_reparse_is_stable():
    text = (FIXTURES / "form.20260806.idx").read_text()
    assert parse_form_index(text) == parse_form_index(text)


def test_form_d_xml_facts():
    facts = parse_form_d_xml((FIXTURES / "primary_doc.xml").read_bytes())
    assert facts["issuer_name"] == "ACME ROBOTICS INC"
    assert facts["cik"] == "0001998877"
    assert facts["total_offering_amount"] == "7500000"
    assert facts["date_of_first_sale"] == "2026-07-30"
