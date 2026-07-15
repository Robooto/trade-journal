import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.brokerage import (
    AssetClass,
    BrokerActivityEventV1,
    BrokerActivityKind,
    DataStatus,
    ResearchSymbolContextV1,
    ResearchSymbolItemV1,
    SourceMetadataV1,
    VolatilityContextV1,
)
from app.services.brokerage_normalizer import (
    build_holding_snapshot,
    normalize_activity_event,
)
from app.tastytrade_schema import (
    TastyAccount,
    TastyEarningsReport,
    TastyOrder,
    TastyPosition,
    TastyTransaction,
    TastyWatchlist,
)


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "tastytrade"
FETCHED_AT = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)


def load_fixture(name: str) -> dict:
    with (FIXTURE_DIR / name).open() as fixture:
        return json.load(fixture)


def fixture_items(name: str) -> list[dict]:
    return load_fixture(name)["data"]["items"]


def test_wave1_fixtures_are_sanitized():
    fixture_names = [
        "accounts_wave1.json",
        "positions_FAKE_OPTIONS.json",
        "positions_FAKE_HOLD.json",
        "positions_FAKE_MIXED.json",
        "watchlists.json",
        "market_metrics_research.json",
        "market_data_research.json",
        "earnings_AAPL.json",
        "orders_FAKE_OPTIONS.json",
        "transactions_FAKE_OPTIONS.json",
    ]
    forbidden_keys = {
        "access_token",
        "access-token",
        "authorization",
        "password",
        "refresh_token",
        "refresh-token",
        "secret",
        "session_token",
        "session-token",
    }
    combined = ""
    for name in fixture_names:
        payload = load_fixture(name)
        combined += json.dumps(payload)
        stack = [payload]
        while stack:
            value = stack.pop()
            if isinstance(value, dict):
                assert forbidden_keys.isdisjoint(
                    {str(key).lower() for key in value}
                )
                stack.extend(value.values())
            elif isinstance(value, list):
                stack.extend(value)

    assert "FAKE-" in combined
    assert "Bearer " not in combined


def test_raw_wave1_fixtures_parse_into_typed_models():
    accounts = [
        TastyAccount.model_validate(item["account"])
        for item in fixture_items("accounts_wave1.json")
    ]
    watchlists = [
        TastyWatchlist.model_validate(item)
        for item in fixture_items("watchlists.json")
    ]
    orders = [
        TastyOrder.model_validate(item)
        for item in fixture_items("orders_FAKE_OPTIONS.json")
    ]
    transactions = [
        TastyTransaction.model_validate(item)
        for item in fixture_items("transactions_FAKE_OPTIONS.json")
    ]
    earnings = [
        TastyEarningsReport.model_validate(item)
        for item in fixture_items("earnings_AAPL.json")
    ]

    assert len(accounts) == 3
    assert watchlists[0].watchlist_entries[0].symbol == "AAPL"
    assert orders[0].legs[0].action == "Sell to Open"
    assert transactions[0].ext_group_fill_id == "FAKE-GROUP-1"
    assert earnings[0].occurred_date == "2026-04-30"


def test_holding_snapshot_preserves_accounts_and_all_asset_classes():
    accounts = [
        TastyAccount.model_validate(item["account"])
        for item in fixture_items("accounts_wave1.json")
    ]
    positions_by_account = {
        "FAKE-OPTIONS": [
            TastyPosition.model_validate(item)
            for item in fixture_items("positions_FAKE_OPTIONS.json")
        ],
        "FAKE-HOLD": [
            TastyPosition.model_validate(item)
            for item in fixture_items("positions_FAKE_HOLD.json")
        ],
        "FAKE-MIXED": [
            TastyPosition.model_validate(item)
            for item in fixture_items("positions_FAKE_MIXED.json")
        ],
    }

    snapshot = build_holding_snapshot(
        accounts, positions_by_account, fetched_at=FETCHED_AT
    )

    assert snapshot.schema_version == "holding-snapshot.v1"
    assert len(snapshot.accounts) == 3
    assert sum(len(account.holdings) for account in snapshot.accounts) == 6

    hold_account = next(
        account
        for account in snapshot.accounts
        if account.account_number == "FAKE-HOLD"
    )
    aapl = next(holding for holding in hold_account.holdings if holding.symbol == "AAPL")
    assert aapl.asset_class == AssetClass.EQUITY
    assert aapl.market_value_dollars == 5250
    assert aapl.signed_cost_basis_dollars == 3750
    assert aapl.unrealized_pl_dollars == 1500

    option_account = next(
        account
        for account in snapshot.accounts
        if account.account_number == "FAKE-OPTIONS"
    )
    short_put = next(
        holding
        for holding in option_account.holdings
        if holding.quantity_direction == "short"
    )
    assert short_put.asset_class == AssetClass.EQUITY_OPTION
    assert short_put.signed_quantity == -1
    assert short_put.market_value_dollars == -175
    assert short_put.unrealized_pl_dollars == 75

    mixed_account = next(
        account
        for account in snapshot.accounts
        if account.account_number == "FAKE-MIXED"
    )
    assert mixed_account.source.status == DataStatus.PARTIAL
    assert mixed_account.source.missing_fields == ["mark"]


def test_holding_snapshot_keeps_empty_accounts():
    accounts = [
        TastyAccount.model_validate(item["account"])
        for item in fixture_items("accounts_wave1.json")
    ]
    snapshot = build_holding_snapshot(accounts, {}, fetched_at=FETCHED_AT)

    assert len(snapshot.accounts) == 3
    assert all(account.holdings == [] for account in snapshot.accounts)
    assert all(account.source.status == DataStatus.OK for account in snapshot.accounts)


def test_contracts_separate_iv_index_change_from_iv_rank_change():
    context = ResearchSymbolContextV1(
        generated_at=FETCHED_AT,
        requested_symbols=["AAPL"],
        items=[
            ResearchSymbolItemV1(
                symbol="AAPL",
                volatility=VolatilityContextV1(
                    iv_rank_percent=44,
                    iv_index_5_day_change_percent=1.8,
                    iv_rank_5_day_change_percent=-3.5,
                ),
            )
        ],
    )

    volatility = context.items[0].volatility
    assert volatility.iv_index_5_day_change_percent == 1.8
    assert volatility.iv_rank_5_day_change_percent == -3.5


def test_activity_contract_retains_explicit_group_fill_id():
    source = SourceMetadataV1(
        source="tastytrade",
        endpoint="/accounts/FAKE-OPTIONS/transactions",
        fetched_at=FETCHED_AT,
    )
    event = BrokerActivityEventV1(
        activity_id="tastytrade:FAKE-OPTIONS:transaction:81001",
        account_number="FAKE-OPTIONS",
        kind=BrokerActivityKind.FILL,
        occurred_at=FETCHED_AT,
        broker_transaction_id="81001",
        order_id="70001",
        group_fill_id="FAKE-GROUP-1",
        symbol="AAPL  260821P00200000",
        underlying_symbol="AAPL",
        grouping_status="explicit",
        source=source,
    )

    assert event.schema_version == "broker-activity-event.v1"
    assert event.grouping_status == "explicit"


def test_source_contract_rejects_undeclared_fields():
    with pytest.raises(ValidationError):
        SourceMetadataV1(
            source="tastytrade",
            fetched_at=FETCHED_AT,
            undocumented=True,
        )


def test_transaction_fixture_normalizes_to_activity_events():
    transactions = [
        TastyTransaction.model_validate(item)
        for item in fixture_items("transactions_FAKE_OPTIONS.json")
    ]

    events = [
        normalize_activity_event(
            "FAKE-OPTIONS", transaction, fetched_at=FETCHED_AT
        )
        for transaction in transactions
    ]

    assert all(event.kind == BrokerActivityKind.FILL for event in events)
    assert all(event.grouping_status == "explicit" for event in events)
    assert {event.group_fill_id for event in events} == {"FAKE-GROUP-1"}
    assert events[0].net_value_dollars == 248.85
    assert events[1].net_value_dollars == -111.15
    assert events[0].fees_dollars == 1.15
    assert events[0].occurred_at.isoformat() == "2026-07-14T15:32:01+00:00"


def test_multi_leg_activity_without_group_id_is_explicitly_ambiguous():
    raw = fixture_items("transactions_FAKE_OPTIONS.json")[0].copy()
    raw.pop("ext-group-fill-id")

    event = normalize_activity_event(
        "FAKE-OPTIONS", raw, fetched_at=FETCHED_AT
    )

    assert event.grouping_status == "ambiguous"
    assert "no broker group-fill identifier" in event.warnings[0]
