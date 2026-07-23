from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.routers.v1 import broker
from app.schemas.brokerage import (
    AccountHoldingSnapshotV1,
    BrokerActivityInboxV1,
    BrokerActivityReviewEventV1,
    DataStatus,
    HoldingSnapshotV1,
    SourceMetadataV1,
    ResearchSymbolContextV1,
)
from app.tastytrade_schema import TastyWatchlist
from app.services.trades_errors import TastytradeFetchError


GENERATED_AT = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)


def snapshot():
    source = SourceMetadataV1(
        source="tastytrade",
        endpoint="/accounts/FAKE-EMPTY/positions",
        fetched_at=GENERATED_AT,
        status=DataStatus.OK,
    )
    return HoldingSnapshotV1(
        generated_at=GENERATED_AT,
        accounts=[
            AccountHoldingSnapshotV1(
                account_number="FAKE-EMPTY",
                nickname="Empty",
                account_type="Individual",
                holdings=[],
                source=source,
            )
        ],
        source_status=[source],
    )


@pytest.mark.asyncio
async def test_get_holdings_returns_versioned_all_account_contract(
    client, monkeypatch
):
    monkeypatch.setattr(
        broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE"
    )
    monkeypatch.setattr(
        broker, "fetch_holding_snapshot", lambda token: snapshot()
    )

    response = await client.get("/v1/broker/holdings")

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "holding-snapshot.v1"
    assert payload["accounts"][0]["account_number"] == "FAKE-EMPTY"
    assert payload["accounts"][0]["holdings"] == []
    assert payload["accounts"][0]["source"]["status"] == "ok"


@pytest.mark.asyncio
async def test_get_holdings_returns_safe_auth_error(client, monkeypatch):
    def fail_auth(db):
        raise RuntimeError("secret upstream detail")

    monkeypatch.setattr(broker.tastytrade, "get_active_token", fail_auth)

    response = await client.get("/v1/broker/holdings")

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Authentication to Tastytrade failed."
    }
    assert "secret upstream detail" not in response.text


@pytest.mark.asyncio
async def test_get_holdings_returns_bad_gateway_for_account_failure(
    client, monkeypatch
):
    monkeypatch.setattr(
        broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE"
    )

    def fail_snapshot(token):
        raise TastytradeFetchError("Unable to fetch brokerage accounts.")

    monkeypatch.setattr(broker, "fetch_holding_snapshot", fail_snapshot)

    response = await client.get("/v1/broker/holdings")

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Unable to fetch brokerage accounts."
    }


@pytest.mark.asyncio
async def test_get_activity_inbox_returns_versioned_session_contract(
    client, monkeypatch
):
    monkeypatch.setattr(
        broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE"
    )

    def fake_inbox(token, session_date):
        assert token == "Bearer FAKE"
        return BrokerActivityInboxV1(
            session_date=session_date,
            generated_at=GENERATED_AT,
            events=[],
            source_status=[
                SourceMetadataV1(
                    source="tastytrade",
                    endpoint="/customers/me/accounts",
                    fetched_at=GENERATED_AT,
                    status=DataStatus.OK,
                )
            ],
        )

    monkeypatch.setattr(broker, "fetch_activity_inbox", fake_inbox)

    response = await client.get(
        "/v1/broker/activity-inbox",
        params={"session_date": "2026-07-14"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "broker-activity-inbox.v1"
    assert payload["session_date"] == "2026-07-14"
    assert payload["events"] == []


@pytest.mark.asyncio
async def test_get_activity_inbox_requires_valid_explicit_session_date(client):
    response = await client.get(
        "/v1/broker/activity-inbox",
        params={"session_date": "yesterday"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_activity_disposition_is_idempotent_and_enriches_inbox(
    client,
    monkeypatch,
):
    activity_group_id = "tastytrade:FAKE:group-fill:review-test"
    request = {
        "activity_group_id": activity_group_id,
        "session_date": "2026-07-14",
        "status": "reviewed",
        "journal_entry_id": "00000000-0000-0000-0000-000000000001",
    }

    first = await client.put("/v1/broker/activity-disposition", json=request)
    second = await client.put("/v1/broker/activity-disposition", json=request)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["status"] == "reviewed"
    assert second.json()["journal_entry_id"] == request["journal_entry_id"]

    monkeypatch.setattr(
        broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE"
    )

    def fake_inbox(token, session_date):
        return BrokerActivityInboxV1(
            session_date=session_date,
            generated_at=GENERATED_AT,
            events=[
                BrokerActivityReviewEventV1(
                    activity_group_id=activity_group_id,
                    session_date=session_date,
                    account_number="FAKE-OPTIONS",
                    review_kind="opening",
                    occurred_at=GENERATED_AT,
                    grouping_status="explicit",
                    leg_count=0,
                    legs=[],
                    summary="AAPL opening activity",
                )
            ],
            source_status=[],
        )

    monkeypatch.setattr(broker, "fetch_activity_inbox", fake_inbox)
    monkeypatch.setattr(
        broker,
        "enrich_activity_market_context",
        lambda inbox: inbox,
    )
    enriched = await client.get(
        "/v1/broker/activity-inbox",
        params={"session_date": "2026-07-14"},
    )

    assert enriched.status_code == 200
    payload = enriched.json()
    assert payload["pending_count"] == 0
    assert payload["reviewed_count"] == 1
    assert payload["skipped_count"] == 0
    assert payload["events"][0]["review_status"] == "reviewed"
    assert payload["events"][0]["journal_entry_id"] == request["journal_entry_id"]

    request["status"] = "skipped"
    request["journal_entry_id"] = None
    changed = await client.put("/v1/broker/activity-disposition", json=request)
    assert changed.status_code == 200
    assert changed.json()["status"] == "skipped"
    assert "journal_entry_id" not in changed.json()


@pytest.mark.asyncio
async def test_get_watchlists_returns_private_lists_and_write_state(
    client, monkeypatch
):
    monkeypatch.setattr(
        broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE"
    )
    monkeypatch.setattr(
        broker.tastytrade,
        "fetch_watchlists",
        lambda token: [
            TastyWatchlist.model_validate(
                {
                    "name": "Core Options",
                    "group-name": "Personal",
                    "order-index": 1,
                    "watchlist-entries": [
                        {"symbol": "AAPL", "instrument-type": "Equity"},
                        {"symbol": "NVDA", "instrument-type": "Equity"},
                    ],
                }
            )
        ],
    )
    monkeypatch.setattr(
        broker,
        "settings",
        SimpleNamespace(brokerage_watchlist_writes_enabled=True),
    )

    response = await client.get("/v1/broker/watchlists")

    assert response.status_code == 200
    assert response.json() == {
        "schema_version": "broker-watchlists.v1",
        "writes_enabled": True,
        "watchlists": [
            {
                "name": "Core Options",
                "group_name": "Personal",
                "order_index": 1,
                "symbols": ["AAPL", "NVDA"],
                "symbol_count": 2,
            }
        ],
    }


@pytest.mark.asyncio
async def test_get_watchlist_research_returns_unique_enriched_symbols(
    client, monkeypatch
):
    watchlists = [
        TastyWatchlist.model_validate(
            {
                "name": "Core Options",
                "group-name": "Personal",
                "order-index": 1,
                "watchlist-entries": [
                    {"symbol": "AAPL", "instrument-type": "Equity"},
                    {"symbol": "NVDA", "instrument-type": "Equity"},
                ],
            }
        ),
        TastyWatchlist.model_validate(
            {
                "name": "Earnings",
                "group-name": "Personal",
                "order-index": 2,
                "watchlist-entries": [
                    {"symbol": "AAPL", "instrument-type": "Equity"},
                ],
            }
        ),
    ]
    monkeypatch.setattr(
        broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE"
    )
    monkeypatch.setattr(
        broker.tastytrade, "fetch_watchlists", lambda token: watchlists
    )
    monkeypatch.setattr(
        broker,
        "settings",
        SimpleNamespace(brokerage_watchlist_writes_enabled=True),
    )

    def fake_context(db, token, symbols, **kwargs):
        assert symbols == ["AAPL", "NVDA"]
        assert kwargs["watchlists_override"] is watchlists
        return ResearchSymbolContextV1(
            generated_at=GENERATED_AT,
            requested_symbols=symbols,
            items=[],
            missing_symbols=[],
            source_status=[],
        )

    monkeypatch.setattr(broker, "fetch_research_symbol_context", fake_context)

    response = await client.get("/v1/broker/watchlist-research")

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "broker-watchlist-research.v1"
    assert payload["writes_enabled"] is True
    assert [item["name"] for item in payload["watchlists"]] == [
        "Core Options",
        "Earnings",
    ]
    assert payload["watchlists"][0]["symbols"] == ["AAPL", "NVDA"]
    assert payload["items"] == []


@pytest.mark.asyncio
async def test_add_watchlist_symbol_requires_explicit_write_setting(
    client, monkeypatch
):
    monkeypatch.setattr(
        broker,
        "settings",
        SimpleNamespace(brokerage_watchlist_writes_enabled=False),
    )

    response = await client.post(
        "/v1/broker/watchlists/Core%20Options/symbols",
        json={"symbol": "TSLA"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Brokerage watchlist writes are disabled."


@pytest.mark.asyncio
async def test_add_watchlist_symbol_returns_updated_membership(
    client, monkeypatch
):
    monkeypatch.setattr(
        broker,
        "settings",
        SimpleNamespace(brokerage_watchlist_writes_enabled=True),
    )
    monkeypatch.setattr(
        broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE"
    )
    updated = TastyWatchlist.model_validate(
        {
            "name": "Core Options",
            "group-name": "Personal",
            "order-index": 1,
            "watchlist-entries": [
                {"symbol": "AAPL", "instrument-type": "Equity"},
                {"symbol": "TSLA", "instrument-type": "Equity"},
            ],
        }
    )
    monkeypatch.setattr(
        broker.tastytrade,
        "add_symbol_to_watchlist",
        lambda token, watchlist_name, symbol, instrument_type: (updated, True),
    )

    response = await client.post(
        "/v1/broker/watchlists/Core%20Options/symbols",
        json={"symbol": "tsla"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "watchlist-symbol-write.v1"
    assert payload["symbol"] == "TSLA"
    assert payload["added"] is True
    assert payload["watchlist"]["symbols"] == ["AAPL", "TSLA"]


@pytest.mark.asyncio
async def test_post_research_context_returns_versioned_batch(
    client, monkeypatch
):
    monkeypatch.setattr(
        broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE"
    )

    def fake_context(db, token, symbols):
        return ResearchSymbolContextV1(
            generated_at=GENERATED_AT,
            requested_symbols=["AAPL"],
            items=[],
            missing_symbols=[],
            source_status=[],
        )

    monkeypatch.setattr(
        broker,
        "fetch_research_symbol_context",
        fake_context,
    )

    response = await client.post(
        "/v1/broker/research-symbol-context",
        json={"symbols": ["aapl"]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "research-symbol-context.v1"
    assert payload["requested_symbols"] == ["AAPL"]


@pytest.mark.asyncio
async def test_post_research_context_rejects_empty_symbols(
    client, monkeypatch
):
    monkeypatch.setattr(
        broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE"
    )

    def fail_empty(db, token, symbols):
        raise ValueError("At least one non-empty symbol is required.")

    monkeypatch.setattr(
        broker,
        "fetch_research_symbol_context",
        fail_empty,
    )

    response = await client.post(
        "/v1/broker/research-symbol-context",
        json={"symbols": [" "]},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "At least one non-empty symbol is required."
    }


@pytest.mark.asyncio
async def test_get_activity_inbox_defaults_to_previous_market_session(
    client,
    monkeypatch,
):
    monkeypatch.setattr(
        broker.tastytrade, "get_active_token", lambda db: "Bearer FAKE"
    )
    monkeypatch.setattr(
        broker,
        "previous_us_equity_market_session",
        lambda: date(2026, 7, 15),
    )

    def fake_inbox(token, session_date):
        assert token == "Bearer FAKE"
        assert session_date == date(2026, 7, 15)
        return BrokerActivityInboxV1(
            session_date=session_date,
            generated_at=GENERATED_AT,
            events=[],
            source_status=[],
        )

    monkeypatch.setattr(broker, "fetch_activity_inbox", fake_inbox)

    response = await client.get("/v1/broker/activity-inbox")

    assert response.status_code == 200
    assert response.json()["session_date"] == "2026-07-15"
