import pytest

@pytest.mark.asyncio
async def test_hello_root(client):
    resp = await client.get("/v1/")
    assert resp.status_code == 200
    assert resp.json() == {"message": "Hello, Trade Journal v1!"}

