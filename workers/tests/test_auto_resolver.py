from poporslop_workers.auto_resolver import draft_for, funding_amount

FUNDING_MARKET = {
    "outcomes": ["YES", "NO"],
    "resolver_config": {"rule": "funding_gte", "amount_usd": 5_000_000},
}
SURVIVAL_MARKET = {
    "outcomes": ["YES", "NO"],
    "resolver_config": {"rule": "survival"},
}


def formd_event(amount):
    return {
        "source": "edgar_formd",
        "external_ref": "0001998877-26-000004",
        "parsed": {"issuer_name": "Acme Robotics Inc", "total_amount_sold": amount, "kind": "funding"},
    }


def test_funding_over_threshold_drafts_yes():
    hit = draft_for(FUNDING_MARKET, formd_event("7500000"))
    assert hit is not None
    idx, summary = hit
    assert idx == 0  # YES
    assert "7,500,000" in summary


def test_funding_under_threshold_stays_quiet():
    assert draft_for(FUNDING_MARKET, formd_event("450000")) is None


def test_indefinite_amount_stays_quiet():
    assert draft_for(FUNDING_MARKET, formd_event("Indefinite")) is None
    assert funding_amount({"total_offering_amount": "Indefinite"}) is None


def test_insolvency_drafts_no_on_survival_market():
    event = {
        "source": "insolvenz_de",
        "external_ref": "detail.jsf?id=abc123",
        "parsed": {"company_name": "Schrödinbug Labs GmbH", "kind": "survival"},
    }
    hit = draft_for(SURVIVAL_MARKET, event)
    assert hit is not None
    idx, _ = hit
    assert idx == 1  # NO


def test_kind_mismatch_never_crosses_rules():
    # A funding filing must not resolve a survival market, and vice versa.
    assert draft_for(SURVIVAL_MARKET, formd_event("9000000")) is None
