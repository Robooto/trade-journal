from datetime import datetime, timezone

import pytest

from app.routers.v1 import broker
from app.schemas.brokerage import (
    AccountHoldingSnapshotV1,
    DataStatus,
    HoldingSnapshotV1,
    SourceMetadataV1,
)
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
