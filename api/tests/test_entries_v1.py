import pytest

sample_entry = {
    "date": "2024-01-01",
    "esPrice": 5000.0,
    "delta": 1.2,
    "notes": "Test entry",
    "marketDirection": "up",
    "events": [
        {"time": "09:30", "price": 5000.0, "note": "open"}
    ]
}

@pytest.mark.asyncio
async def test_list_entries_empty(client):
    resp = await client.get("/v1/entries")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []

@pytest.mark.asyncio
async def test_create_entry(client):
    resp = await client.post("/v1/entries", json=sample_entry)
    assert resp.status_code == 201
    body = resp.json()
    assert body["esPrice"] == sample_entry["esPrice"]
    assert body["marketDirection"] == sample_entry["marketDirection"]

    list_resp = await client.get("/v1/entries")
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] == 1
    assert len(list_data["items"]) == 1


@pytest.mark.asyncio
async def test_pagination_skip_limit(client):
    """Verify skip/limit pagination returns the correct slice and total."""
    # add three more entries so we have at least four total
    for i in range(3):
        entry = sample_entry.copy()
        entry["date"] = f"2024-01-0{i+2}"
        entry["esPrice"] = 5000.0 + i
        resp = await client.post("/v1/entries", json=entry)
        assert resp.status_code == 201

    resp = await client.get("/v1/entries?skip=1&limit=1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 4
    assert len(data["items"]) == 1
    # second most recent date should be 2024-01-03
    assert data["items"][0]["date"] == "2024-01-03"


