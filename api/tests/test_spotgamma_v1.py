import base64
from datetime import datetime as real_datetime
import pytest


@pytest.mark.asyncio
async def test_hiro_screens(client, monkeypatch):
    # Mock the SpotGamma service
    class MockSpotGammaService:
        async def get_hiro_screenshots(self):
            return {
                "timestamp": "2024-01-01T00:00:00Z",
                "images": [
                    {"name": "20240101-000000-SP500.png", "data": base64.b64encode(b'data').decode()},
                    {"name": "20240101-000000-SPEquities.png", "data": base64.b64encode(b'data').decode()}
                ]
            }

    # Patch the service import in the routes module
    monkeypatch.setattr("app.routers.v1.spotgamma.SpotGammaService", MockSpotGammaService)

    resp = await client.get("/v1/spotgamma/hiro")
    assert resp.status_code == 200
    data = resp.json()
    assert "timestamp" in data and "images" in data
    assert len(data["images"]) == 2
    names = [img["name"] for img in data["images"]]
    assert names[0].endswith("SP500.png")
    assert base64.b64decode(data["images"][0]["data"]) == b"data"


@pytest.mark.asyncio
async def test_detect_crossing(client, monkeypatch):
    # Mock the ImageAnalysisService
    class MockImageAnalysisService:
        def analyze_chart_crossing(self, img1, img2):
            return {
                img1.filename: img1.filename == "a",
                img2.filename: img2.filename == "b"
            }

    # Patch the service import in the routes module
    monkeypatch.setattr("app.routers.v1.spotgamma.ImageAnalysisService", MockImageAnalysisService)
    
    files = {"img1": ("a", b"foo", "image/png"), "img2": ("b", b"bar", "image/png")}
    resp = await client.post("/v1/spotgamma/detect-crossing", files=files)
    assert resp.status_code == 200
    assert resp.json() == {"a": True, "b": True}
