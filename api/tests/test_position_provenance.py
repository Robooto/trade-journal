from datetime import date, datetime, UTC
from types import SimpleNamespace

from app.services import trades_service
from app.services.cache_service import InMemoryCache
from app.services.open_execution_ledger_service import load_open_execution_groups
from app.services.position_grouping import group_positions_and_compute_totals
from app.services.position_provenance import EXECUTION_GROUP_FIELD, stamp_execution_groups
from app.tastytrade import TastyPage
from app.tastytrade_schema import TastyTransaction

EXP = "2026-11-20T21:15:00.000Z"


def leg(symbol, direction, option_type, strike, quantity=1):
    return {"symbol": symbol, "instrument-type": "Equity Option", "underlying-symbol": "SPX",
            "quantity-direction": direction, "option-type": option_type, "strike": strike,
            "quantity": quantity, "multiplier": 100, "expires-at": EXP, "average-open-price": 1.0,
            "close-price": 1.0, "mark": 1.0}


def condor(prefix, low):
    """Long put, short put, short call, long call at increasing strikes."""
    return [leg(f"{prefix}P{low}", "Long", "P", low), leg(f"{prefix}P{low + 10}", "Short", "P", low + 10),
            leg(f"{prefix}C{low + 60}", "Short", "C", low + 60), leg(f"{prefix}C{low + 70}", "Long", "C", low + 70)]


def group(group_id, symbols, *, source="order", opened="2026-10-01"):
    return SimpleNamespace(execution_group_id=group_id, provenance_source=source,
                           opened_at=datetime.fromisoformat(opened + "T15:00:00+00:00"),
                           legs=[SimpleNamespace(symbol=s) for s in symbols])


def test_two_trades_on_one_expiration_get_their_own_orders():
    first, second = condor("A", 6500), condor("B", 6600)
    positions = first + second
    uncovered = stamp_execution_groups(positions, [group("g1", [p["symbol"] for p in first]),
                                                   group("g2", [p["symbol"] for p in second])])
    assert uncovered == []
    assert {p[EXECUTION_GROUP_FIELD] for p in first} == {"g1"} and {p[EXECUTION_GROUP_FIELD] for p in second} == {"g2"}

    (account,) = group_positions_and_compute_totals(
        [{"account_number": "1", "nickname": "", "positions": positions}], {})
    assert [(g["strategy_label"], g["grouping_source"]) for g in account["groups"]] == [
        ("iron_condor", "broker_order"), ("iron_condor", "broker_order")]


def test_a_closed_earlier_trade_on_the_same_contract_does_not_claim_it():
    current = condor("A", 6500)
    old_trade = group("old", [current[0]["symbol"], "CLOSED-LEG"], opened="2026-06-01")
    stamp_execution_groups(current, [old_trade, group("new", [p["symbol"] for p in current])])
    assert {p[EXECUTION_GROUP_FIELD] for p in current} == {"new"}


def test_adds_to_the_same_structure_share_one_group():
    current = condor("A", 6500)
    symbols = [p["symbol"] for p in current]
    stamp_execution_groups(current, [group("later", symbols, opened="2026-10-02"), group("first", symbols)])
    assert {p[EXECUTION_GROUP_FIELD] for p in current} == {"first"}


def test_a_contract_shared_by_two_open_trades_leaves_both_on_expiration_grouping():
    first, second = condor("A", 6500), condor("B", 6600)
    shared = first[1]
    second[1] = shared  # both condors use the same short put; tastytrade nets it into one row
    positions = first + second[:1] + second[2:]
    uncovered = stamp_execution_groups(positions, [group("g1", [p["symbol"] for p in first]),
                                                   group("g2", [p["symbol"] for p in second])])
    assert uncovered == [] and not any(EXECUTION_GROUP_FIELD in p for p in positions)
    (account,) = group_positions_and_compute_totals(
        [{"account_number": "1", "nickname": "", "positions": positions}], {})
    assert [g["grouping_source"] for g in account["groups"]] == ["expiration"]


def test_legs_without_an_opening_order_are_reported_and_left_alone():
    current = condor("A", 6500)
    uncovered = stamp_execution_groups(current, [group("g1", [current[0]["symbol"]], source="unmatched")])
    assert set(uncovered) == {p["symbol"] for p in current}
    assert not any(EXECUTION_GROUP_FIELD in p for p in current)


def transactions(rows):
    return [TastyTransaction.model_validate({
        "id": index, "transaction-type": "Trade", "transaction-sub-type": action, "action": action,
        "executed-at": "2026-10-01T15:30:00Z", "symbol": symbol, "underlying-symbol": "SPX",
        "instrument-type": "Equity Option", "quantity": "1", "price": "1", "order-id": order_id,
    }) for index, (symbol, action, order_id) in enumerate(rows, start=1)]


def test_ledger_and_provenance_end_to_end_with_a_rescan_for_a_new_trade(monkeypatch):
    first, second = condor("A", 6500), condor("B", 6600)
    opens = [(p["symbol"], "Sell to Open" if p["quantity-direction"] == "Short" else "Buy to Open", 1) for p in first]
    scans = []

    def fetch(token, account, **kwargs):
        rows = opens if not scans else opens + [(p["symbol"], "Buy to Open", 2) for p in second]
        scans.append(kwargs)
        return TastyPage(items=transactions(rows), page_offset=0, per_page=2000, total_items=len(rows),
                         total_pages=1, has_more=False)

    monkeypatch.setattr("app.services.open_execution_ledger_service.tastytrade.fetch_transactions", fetch)
    cache = InMemoryCache()
    stale = load_open_execution_groups("T", "1", date(2024, 10, 1), date(2026, 10, 17), cache=cache,
                                       fetched_at=datetime(2026, 10, 17, 14, tzinfo=UTC))
    monkeypatch.setattr(trades_service, "load_open_execution_groups",
                        lambda *args, **kwargs: load_open_execution_groups(*args, cache=cache, **kwargs))
    from app.services.concurrency import Outcome

    positions = [{"account_number": "1", "nickname": "", "positions": first + second}]
    trades_service.apply_execution_provenance("T", positions, {"1": Outcome(value=stale)})
    assert len(scans) == 2  # the new condor was missing and the cached scan was old, so it rescanned
    (account,) = group_positions_and_compute_totals(positions, {})
    assert [g["strategy_label"] for g in account["groups"]] == ["iron_condor", "iron_condor"]
    assert {g["grouping_source"] for g in account["groups"]} == {"broker_order"}


def test_unavailable_history_keeps_expiration_grouping():
    from app.services.concurrency import Outcome

    positions = [{"account_number": "1", "nickname": "", "positions": condor("A", 6500)}]
    trades_service.apply_execution_provenance("T", positions, {"1": Outcome(error=RuntimeError("down"))})
    (account,) = group_positions_and_compute_totals(positions, {})
    assert account["groups"][0]["grouping_source"] == "expiration"
