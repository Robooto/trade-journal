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
async def test_get_created_entry(client):
    """Create an entry then fetch it by id."""
    create_resp = await client.post("/v1/entries", json=sample_entry)
    assert create_resp.status_code == 201
    created = create_resp.json()
    entry_id = created["id"]

    get_resp = await client.get(f"/v1/entries/{entry_id}")
    assert get_resp.status_code == 200
    fetched = get_resp.json()

    assert fetched["id"] == entry_id
    assert fetched["date"] == sample_entry["date"]
    assert fetched["esPrice"] == sample_entry["esPrice"]
    assert fetched["delta"] == sample_entry["delta"]
    assert fetched["notes"] == sample_entry["notes"]
    assert fetched["marketDirection"] == sample_entry["marketDirection"]
    assert fetched["events"] == sample_entry["events"]

