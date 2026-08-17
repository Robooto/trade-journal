import pytest

from app import tastytrade
from app.tastytrade import TastyPage
from app.tastytrade_schema import TastyAccount, TastyTransaction


def _transaction(
    transaction_id: int,
    *,
    order_id: int,
    group_id: str,
    symbol: str,
    action: str,
    value: str,
    value_effect: str,
    executed_at: str,
) -> TastyTransaction:
    return TastyTransaction.model_validate({
        "id": transaction_id,
        "account-number": "5WT00001",
        "transaction-type": "Trade",
        "transaction-sub-type": action,
        "transaction-date": executed_at[:10],
        "executed-at": executed_at,
        "symbol": symbol,
        "underlying-symbol": "SPX",
        "instrument-type": "Equity Option",
        "action": action,
        "quantity": "1",
        "value": value,
        "value-effect": value_effect,
        "order-id": order_id,
        "ext-group-fill-id": group_id,
    })


@pytest.mark.asyncio
async def test_broker_history_sync_normalizes_fills_and_is_idempotent(client, monkeypatch):
    transactions = [
        _transaction(
            1,
            order_id=1001,
            group_id="OPEN",
            symbol="SPXW  260812C07755000",
            action="Sell to Open",
            value="200",
            value_effect="Credit",
            executed_at="2026-08-12T15:13:00Z",
        ),
        _transaction(
            2,
            order_id=1001,
            group_id="OPEN",
            symbol="SPXW  260812C07760000",
            action="Buy to Open",
            value="50",
            value_effect="Debit",
            executed_at="2026-08-12T15:13:00Z",
        ),
        _transaction(
            3,
            order_id=1002,
            group_id="CLOSE",
            symbol="SPXW  260812C07755000",
            action="Buy to Close",
            value="100",
            value_effect="Debit",
            executed_at="2026-08-12T15:40:00Z",
        ),
        _transaction(
            4,
            order_id=1002,
            group_id="CLOSE",
            symbol="SPXW  260812C07760000",
            action="Sell to Close",
            value="10",
            value_effect="Credit",
            executed_at="2026-08-12T15:40:00Z",
        ),
    ]
    monkeypatch.setattr(tastytrade, "get_active_token", lambda db: "TOKEN")
    monkeypatch.setattr(
        tastytrade,
        "fetch_accounts",
        lambda token: [TastyAccount(account_number="5WT00001")],
    )
    monkeypatch.setattr(
        tastytrade,
        "fetch_orders",
        lambda *args, **kwargs: TastyPage(
            items=[],
            page_offset=0,
            per_page=100,
            total_items=0,
            total_pages=0,
            has_more=False,
        ),
    )
    monkeypatch.setattr(
        tastytrade,
        "fetch_transactions",
        lambda *args, **kwargs: TastyPage(
            items=transactions,
            page_offset=0,
            per_page=2000,
            total_items=len(transactions),
            total_pages=1,
            has_more=False,
        ),
    )
    request = {"start_date": "2026-08-01", "end_date": "2026-08-16"}

    first = await client.post("/v1/broker/imported-spread-trades/sync", json=request)
    second = await client.post("/v1/broker/imported-spread-trades/sync", json=request)

    assert first.status_code == 200
    assert first.json()["accounts"] == 1
    assert first.json()["source_rows"] == 4
    assert first.json()["filled_orders"] == 2
    assert first.json()["paired_positions"] == 1
    assert first.json()["imported"] == 1
    assert first.json()["warnings"] == []
    trade = first.json()["trades"][0]
    assert trade["source"] == "tastytrade_history"
    assert trade["account_number"] == "5WT00001"
    assert trade["entry_order_id"] == "1001"
    assert trade["exit_order_id"] == "1002"
    assert trade["strategy"] == "bear_call_credit"
    assert trade["zero_dte"] is True
    assert trade["entry_price"] == 1.5
    assert trade["exit_price"] == 0.9
    assert trade["gross_pnl_dollars"] == 60
    assert trade["holding_minutes"] == 27

    assert second.status_code == 200
    assert second.json()["imported"] == 0
    assert second.json()["existing"] == 1


@pytest.mark.asyncio
async def test_broker_history_sync_limits_request_window(client, monkeypatch):
    monkeypatch.setattr(tastytrade, "get_active_token", lambda db: "TOKEN")

    response = await client.post(
        "/v1/broker/imported-spread-trades/sync",
        json={"start_date": "2026-01-01", "end_date": "2026-08-16"},
    )

    assert response.status_code == 422
    assert "181 calendar days" in response.json()["detail"]
