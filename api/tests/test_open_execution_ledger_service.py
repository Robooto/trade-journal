from datetime import date, datetime, timezone

from app.services.cache_service import InMemoryCache
from app.services.open_execution_ledger_service import load_open_execution_groups
from app.tastytrade import TastyPage
from app.tastytrade_schema import TastyTransaction


def _transaction(
    transaction_id: int,
    symbol: str,
    *,
    order_id: int | None = 100,
    group_fill_id: str | None = None,
    action: str = "Buy to Open",
) -> TastyTransaction:
    return TastyTransaction.model_validate({
        "id": transaction_id,
        "transaction-type": "Trade",
        "transaction-sub-type": action,
        "executed-at": "2026-07-07T15:30:00Z",
        "symbol": symbol,
        "underlying-symbol": "SPX",
        "instrument-type": "Equity Option",
        "action": action,
        "quantity": "1",
        "price": "2.50",
        "order-id": order_id,
        "ext-group-fill-id": group_fill_id,
    })


def test_order_id_groups_four_opening_legs_when_group_fill_is_absent(monkeypatch):
    transactions = [
        _transaction(index, f"SPX LEG {index}", action=action)
        for index, action in enumerate(
            ["Buy to Open", "Sell to Open", "Sell to Open", "Buy to Open"],
            start=1,
        )
    ]
    calls = []
    monkeypatch.setattr(
        "app.services.open_execution_ledger_service.tastytrade.fetch_transactions",
        lambda *args, **kwargs: (
            calls.append(kwargs) or TastyPage(
                items=transactions, page_offset=0, per_page=2000, has_more=False,
                total_items=len(transactions), total_pages=1,
            )
        ),
    )
    cache = InMemoryCache()

    result = load_open_execution_groups(
        "TOKEN",
        "FAKE",
        date(2024, 7, 17),
        date(2026, 7, 17),
        fetched_at=datetime(2026, 7, 17, tzinfo=timezone.utc),
        cache=cache,
    )
    cached = load_open_execution_groups(
        "TOKEN", "FAKE", date(2024, 7, 17), date(2026, 7, 17), cache=cache
    )

    assert len(result.groups) == 1
    assert len(result.groups[0].legs) == 4
    assert result.groups[0].provenance_source == "order"
    assert result.groups[0].broker_order_id == "100"
    assert result.groups[0].match_status == "unmatched"
    assert len(calls) == 1
    assert cached is result


def test_group_fill_takes_priority_and_closing_rows_are_excluded(monkeypatch):
    transactions = [
        _transaction(1, "SPX A", order_id=100, group_fill_id="GROUP-1"),
        _transaction(2, "SPX B", order_id=100, group_fill_id="GROUP-1"),
        _transaction(3, "SPX A", order_id=200, action="Sell to Close"),
    ]
    monkeypatch.setattr(
        "app.services.open_execution_ledger_service.tastytrade.fetch_transactions",
        lambda *args, **kwargs: TastyPage(
            items=transactions, page_offset=0, per_page=2000, has_more=False,
            total_items=len(transactions), total_pages=1,
        ),
    )

    result = load_open_execution_groups(
        "TOKEN", "FAKE", date(2026, 1, 1), date(2026, 7, 17),
        cache=InMemoryCache(),
    )

    assert len(result.groups) == 1
    assert result.groups[0].provenance_source == "group_fill"
    assert result.groups[0].broker_group_fill_id == "GROUP-1"
    assert len(result.groups[0].legs) == 2


def test_missing_provenance_is_retained_with_partial_source_status(monkeypatch):
    transaction = _transaction(1, "SPX A", order_id=None)
    monkeypatch.setattr(
        "app.services.open_execution_ledger_service.tastytrade.fetch_transactions",
        lambda *args, **kwargs: TastyPage(
            items=[transaction], page_offset=0, per_page=2000, has_more=False,
            total_items=1, total_pages=1,
        ),
    )

    result = load_open_execution_groups(
        "TOKEN", "FAKE", date(2026, 1, 1), date(2026, 7, 17),
        cache=InMemoryCache(),
    )

    assert result.source.status.value == "partial"
    assert result.groups[0].provenance_source == "unmatched"
    assert result.warnings


def test_transaction_source_failure_returns_unavailable_collection(monkeypatch):
    def fail(*args, **kwargs):
        raise RuntimeError("broker offline")

    monkeypatch.setattr(
        "app.services.open_execution_ledger_service.tastytrade.fetch_transactions",
        fail,
    )

    result = load_open_execution_groups(
        "TOKEN", "FAKE", date(2026, 1, 1), date(2026, 7, 17),
        cache=InMemoryCache(),
    )

    assert result.groups == []
    assert result.source.status.value == "unavailable"
    assert result.warnings == ["Brokerage transaction history is unavailable."]
