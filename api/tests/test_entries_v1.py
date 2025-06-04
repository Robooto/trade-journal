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
async def test_add_event(client):
    # Create a new entry first
    resp = await client.post("/v1/entries", json=sample_entry)
    assert resp.status_code == 201
    entry = resp.json()
    entry_id = entry["id"]

    # Record current event count
    start_len = len(entry["events"])

    new_event = {"time": "10:00", "price": 5050.0, "note": "added"}
    ev_resp = await client.post(f"/v1/entries/{entry_id}/events", json=new_event)
    assert ev_resp.status_code == 201

    # Fetch entry again to check events list
    fetch = await client.get(f"/v1/entries/{entry_id}")
    assert fetch.status_code == 200
    updated = fetch.json()
    assert len(updated["events"]) == start_len + 1
    assert any(
        e["time"] == new_event["time"]
        and e["price"] == new_event["price"]
        and e["note"] == new_event["note"]
        for e in updated["events"]
    )

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

