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

    entry_id = body["id"]
    updated = {
        "notes": "Updated notes",
        "events": [{"time": "10:00", "price": 5010, "note": "mid"}]
    }
    put_resp = await client.put(f"/v1/entries/{entry_id}", json=updated)
    assert put_resp.status_code == 200
    updated_body = put_resp.json()
    assert updated_body["notes"] == updated["notes"]
    assert updated_body["events"] == updated["events"]

