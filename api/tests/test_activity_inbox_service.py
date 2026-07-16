import json
from datetime import date, datetime, timezone
from pathlib import Path

from app import tastytrade
from app.services.activity_inbox_service import (
    build_activity_review_events,
    fetch_activity_inbox,
)
from app.services.brokerage_normalizer import normalize_activity_event
from app.tastytrade import TastyPage
from app.tastytrade_schema import TastyAccount, TastyOrder, TastyTransaction


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "tastytrade"
FETCHED_AT = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)
SESSION_DATE = date(2026, 7, 14)


def load_items(name: str) -> list[dict]:
    with (FIXTURE_DIR / name).open() as fixture:
        return json.load(fixture)["data"]["items"]


def test_explicit_group_fill_becomes_one_opening_review_event():
    transactions = [
        TastyTransaction.model_validate(item)
        for item in load_items("transactions_FAKE_OPTIONS.json")
    ]
    orders = [
        TastyOrder.model_validate(item)
        for item in load_items("orders_FAKE_OPTIONS.json")
    ]
    normalized = [
        normalize_activity_event(
            "FAKE-OPTIONS",
            transaction,
            fetched_at=FETCHED_AT,
        )
        for transaction in transactions
    ]

    result = build_activity_review_events(
        SESSION_DATE,
        normalized,
        orders,
    )

    assert len(result) == 1
    event = result[0]
    assert event.activity_group_id.endswith("group-fill:FAKE-GROUP-1")
    assert event.review_kind.value == "opening"
    assert event.grouping_status == "explicit"
    assert event.underlying_symbol == "AAPL"
    assert event.leg_count == 2
    assert event.order_ids == ["70001"]
    assert event.order_status == "Filled"
    assert event.order_type == "Limit"
    assert event.order_price == 1.4
    assert event.order_price_effect == "Credit"
    assert event.net_value_dollars == 137.7
    assert event.fees_dollars == 2.3
    assert event.summary == (
        "AAPL - opening activity - 2 legs - $137.70 net credit"
    )


def test_multi_leg_transaction_without_group_id_remains_ambiguous():
    transaction = TastyTransaction.model_validate(
        {
            "id": 91001,
            "transaction-type": "Trade",
            "transaction-sub-type": "Sell to Open",
            "executed-at": "2026-07-14T16:00:00+00:00",
            "symbol": "NVDA  260821P00100000",
            "underlying-symbol": "NVDA",
            "instrument-type": "Equity Option",
            "action": "Sell to Open",
            "quantity": "1",
            "net-value": "125.00",
            "net-value-effect": "Credit",
            "leg-count": 2,
        }
    )
    normalized = normalize_activity_event(
        "FAKE-OPTIONS",
        transaction,
        fetched_at=FETCHED_AT,
    )

    result = build_activity_review_events(
        SESSION_DATE,
        [normalized],
        [],
    )

    assert len(result) == 1
    assert result[0].grouping_status == "ambiguous"
    assert result[0].review_kind.value == "opening"
    assert result[0].activity_group_id == normalized.activity_id
    assert result[0].warnings == [
        "Multi-leg transaction has no broker group-fill identifier."
    ]


def test_open_and_close_legs_in_explicit_group_are_labeled_roll():
    raw = [
        {
            "id": 92001,
            "transaction-type": "Trade",
            "transaction-sub-type": "Buy to Close",
            "executed-at": "2026-07-14T17:00:00+00:00",
            "underlying-symbol": "SPY",
            "symbol": "SPY OLD",
            "action": "Buy to Close",
            "quantity": "1",
            "net-value": "50",
            "net-value-effect": "Debit",
            "ext-group-fill-id": "FAKE-ROLL-1",
        },
        {
            "id": 92002,
            "transaction-type": "Trade",
            "transaction-sub-type": "Sell to Open",
            "executed-at": "2026-07-14T17:00:00+00:00",
            "underlying-symbol": "SPY",
            "symbol": "SPY NEW",
            "action": "Sell to Open",
            "quantity": "1",
            "net-value": "80",
            "net-value-effect": "Credit",
            "ext-group-fill-id": "FAKE-ROLL-1",
        },
    ]
    normalized = [
        normalize_activity_event(
            "FAKE-OPTIONS",
            TastyTransaction.model_validate(item),
            fetched_at=FETCHED_AT,
        )
        for item in raw
    ]

    result = build_activity_review_events(
        SESSION_DATE,
        normalized,
        [],
    )

    assert len(result) == 1
    assert result[0].review_kind.value == "roll"
    assert result[0].grouping_status == "explicit"
    assert result[0].net_value_dollars == 30.0
    assert result[0].summary == (
        "SPY - roll activity - 2 legs - $30.00 net credit"
    )


def test_fetch_activity_inbox_retains_source_status_and_grouped_events(
    monkeypatch,
):
    orders = [
        TastyOrder.model_validate(item)
        for item in load_items("orders_FAKE_OPTIONS.json")
    ]
    transactions = [
        TastyTransaction.model_validate(item)
        for item in load_items("transactions_FAKE_OPTIONS.json")
    ]
    monkeypatch.setattr(
        tastytrade,
        "fetch_accounts",
        lambda token: [
            TastyAccount.model_validate(
                {
                    "account-number": "FAKE-OPTIONS",
                    "nickname": "Options",
                }
            )
        ],
    )

    def fetch_orders(token, account_number, **kwargs):
        assert kwargs["start_date"] == kwargs["end_date"] == "2026-07-14"
        return TastyPage(
            items=orders,
            page_offset=0,
            per_page=100,
            total_items=1,
            total_pages=1,
            has_more=False,
        )

    def fetch_transactions(token, account_number, **kwargs):
        return TastyPage(
            items=transactions,
            page_offset=0,
            per_page=2000,
            total_items=2,
            total_pages=1,
            has_more=False,
        )

    monkeypatch.setattr(tastytrade, "fetch_orders", fetch_orders)
    monkeypatch.setattr(
        tastytrade,
        "fetch_transactions",
        fetch_transactions,
    )

    inbox = fetch_activity_inbox(
        "Bearer FAKE",
        SESSION_DATE,
        fetched_at=FETCHED_AT,
    )

    assert inbox.schema_version == "broker-activity-inbox.v1"
    assert len(inbox.events) == 1
    assert inbox.events[0].review_kind.value == "opening"
    assert [source.status.value for source in inbox.source_status] == [
        "ok",
        "ok",
        "ok",
    ]
    assert inbox.warnings == []


def test_fetch_activity_inbox_keeps_order_failure_non_fatal(monkeypatch):
    monkeypatch.setattr(
        tastytrade,
        "fetch_accounts",
        lambda token: [TastyAccount(account_number="FAKE-OPTIONS")],
    )
    monkeypatch.setattr(
        tastytrade,
        "fetch_orders",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("secret")),
    )
    monkeypatch.setattr(
        tastytrade,
        "fetch_transactions",
        lambda *args, **kwargs: TastyPage(
            items=[],
            page_offset=0,
            per_page=2000,
            total_items=0,
            total_pages=0,
            has_more=False,
        ),
    )

    inbox = fetch_activity_inbox(
        "Bearer FAKE",
        SESSION_DATE,
        fetched_at=FETCHED_AT,
    )

    assert [source.status.value for source in inbox.source_status] == [
        "ok",
        "unavailable",
        "ok",
    ]
    assert "secret" not in str(inbox.model_dump())
