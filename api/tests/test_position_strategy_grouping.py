from app.services.trades_service import group_positions_and_compute_totals


def _leg(
    symbol: str,
    expiration: str,
    strike: float,
    direction: str,
    *,
    group_fill_id: str | None = None,
    option_type: str = "C",
) -> dict:
    leg = {
        "instrument-type": "Equity Option",
        "symbol": symbol,
        "underlying-symbol": "AAPL",
        "expires-at": expiration,
        "average-open-price": "1.00",
        "quantity": "1",
        "quantity-direction": direction,
        "multiplier": "100",
        "strike": strike,
        "option-type": option_type,
        "approximate-p-l": 0,
    }
    if group_fill_id:
        leg["ext-group-fill-id"] = group_fill_id
    return leg


def _groups(positions: list[dict]) -> list[dict]:
    accounts = [{
        "account_number": "TEST",
        "nickname": "Options",
        "positions": positions,
    }]
    return group_positions_and_compute_totals(accounts, {})[0]["groups"]


def test_calendar_legs_across_expirations_share_one_position_group():
    groups = _groups([
        _leg("AAPL FRONT", "2026-08-21", 200, "Short"),
        _leg("AAPL BACK", "2026-09-18", 200, "Long"),
    ])

    assert len(groups) == 1
    assert groups[0]["strategy_label"] == "calendar"
    assert groups[0]["grouping_source"] == "inferred"
    assert groups[0]["expiration_dates"] == ["2026-08-21", "2026-09-18"]


def test_diagonal_legs_across_expirations_share_one_position_group():
    groups = _groups([
        _leg("AAPL FRONT", "2026-08-21", 205, "Short"),
        _leg("AAPL BACK", "2026-09-18", 200, "Long"),
    ])

    assert len(groups) == 1
    assert groups[0]["strategy_label"] == "diagonal"
    assert groups[0]["grouping_source"] == "inferred"


def test_explicit_broker_fill_group_takes_priority_across_expirations():
    groups = _groups([
        _leg("AAPL FRONT", "2026-08-21", 205, "Short", group_fill_id="FILL-1"),
        _leg("AAPL BACK", "2026-09-18", 200, "Long", group_fill_id="FILL-1"),
    ])

    assert len(groups) == 1
    assert groups[0]["grouping_source"] == "broker_group_fill"
    assert groups[0]["strategy_label"] == "diagonal"


def test_ambiguous_cross_expiration_legs_are_not_automatically_merged():
    groups = _groups([
        _leg("AAPL SHORT ONE", "2026-08-21", 205, "Short"),
        _leg("AAPL SHORT TWO", "2026-08-21", 210, "Short"),
        _leg("AAPL LONG", "2026-09-18", 200, "Long"),
    ])

    assert len(groups) == 2
    assert all(group["grouping_source"] == "expiration" for group in groups)


def test_same_expiration_iron_condors_are_not_split_across_dates():
    groups = _groups([
        _leg("AAPL AUG LP", "2026-08-21", 190, "Long", option_type="P"),
        _leg("AAPL AUG SP", "2026-08-21", 195, "Short", option_type="P"),
        _leg("AAPL AUG SC", "2026-08-21", 205, "Short"),
        _leg("AAPL AUG LC", "2026-08-21", 210, "Long"),
        _leg("AAPL SEP LP", "2026-09-18", 185, "Long", option_type="P"),
        _leg("AAPL SEP SP", "2026-09-18", 190, "Short", option_type="P"),
        _leg("AAPL SEP SC", "2026-09-18", 210, "Short"),
        _leg("AAPL SEP LC", "2026-09-18", 215, "Long"),
    ])

    assert len(groups) == 2
    assert {group["strategy_label"] for group in groups} == {"iron_condor"}
    assert all(group["grouping_source"] == "expiration" for group in groups)
    assert sorted(len(group["positions"]) for group in groups) == [4, 4]


def test_multiple_legs_in_one_expiration_disable_cross_expiration_inference():
    groups = _groups([
        _leg("AAPL AUG SHORT", "2026-08-21", 200, "Short"),
        _leg("AAPL AUG LONG", "2026-08-21", 210, "Long"),
        _leg("AAPL SEP LONG", "2026-09-18", 200, "Long"),
    ])

    assert len(groups) == 2
