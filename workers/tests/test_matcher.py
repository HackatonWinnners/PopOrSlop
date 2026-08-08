from poporslop_workers.matcher import match_event, normalize_name


COMPANIES = [
    {"id": "c1", "name": "Acme Robotics", "ext_ids": {"cik": "1998877"}},
    {"id": "c2", "name": "Schrödinbug Labs", "ext_ids": {}},
    {"id": "c3", "name": "Hot Reload", "ext_ids": {}},
]


def test_normalize_strips_legal_noise():
    assert normalize_name("ACME ROBOTICS INC") == "acme robotics"
    assert normalize_name("Hot Reload Technologies, LLC") == "hot reload"


def test_cik_match_wins_regardless_of_name():
    company, confidence, method = match_event(
        {"cik": "1998877", "company_name": "TOTALLY DIFFERENT NAME"}, COMPANIES
    )
    assert company["id"] == "c1"
    assert confidence == 1.0
    assert method == "cik"


def test_fuzzy_name_confirms_close_match():
    hit = match_event({"company_name": "Schrodinbug Labs, Inc."}, COMPANIES)
    assert hit is not None
    company, confidence, method = hit
    assert company["id"] == "c2"
    assert confidence >= 0.9
    assert method == "name_fuzzy"


def test_unrelated_name_stays_unmatched():
    assert match_event({"company_name": "Unrelated Biotech Holdings LP"}, COMPANIES) is None
