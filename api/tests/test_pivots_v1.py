import pytest
from datetime import date, timedelta


@pytest.mark.asyncio
async def test_latest_pivot_not_found(client):
    resp = await client.get("/v1/pivots/latest")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "No pivot levels recorded for this index"


@pytest.mark.asyncio
async def test_create_and_fetch_latest_pivot(client):
    today = date.today().isoformat()
    payload = {"price": 6790}

    create_resp = await client.post("/v1/pivots", json=payload)
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["price"] == 6790
    assert created["index"] == "SPX"
    assert created["date"] == today

    latest_resp = await client.get("/v1/pivots/latest")
    assert latest_resp.status_code == 200
    latest = latest_resp.json()
    assert latest == created


@pytest.mark.asyncio
async def test_history_respects_index_and_limit(client):
    base_day = date(2024, 1, 1)
    # seed SPX entries across several days
    for offset in range(10):
        payload = {
            "price": 6700 + offset,
            "date": (base_day + timedelta(days=offset)).isoformat(),
        }
        resp = await client.post("/v1/pivots", json=payload)
        assert resp.status_code == 201

    # add a different index to ensure filtering works
    resp = await client.post(
        "/v1/pivots",
        json={
            "price": 7000,
            "index": "NDX",
            "date": "2024-02-01",
        },
    )
    assert resp.status_code == 201

    history_resp = await client.get("/v1/pivots/history", params={"limit": 7})
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert len(history) == 7
    # ensure newest date first and belongs to SPX
    dates = [item["date"] for item in history]
    assert dates == sorted(dates, reverse=True)
    assert all(item["index"] == "SPX" for item in history)

    ndx_resp = await client.get(
        "/v1/pivots/history", params={"limit": 5, "index": "ndx"}
    )
    assert ndx_resp.status_code == 200
    ndx_history = ndx_resp.json()
    assert len(ndx_history) == 1
    assert ndx_history[0]["index"] == "NDX"
