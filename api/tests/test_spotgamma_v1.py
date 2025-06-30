import base64
from datetime import datetime as real_datetime
import pytest


@pytest.mark.asyncio
async def test_hiro_screens(client, monkeypatch):
    class DummyLocator:
        async def click(self):
            pass

    class DummyPage:
        async def goto(self, url):
            pass
        async def wait_for_load_state(self, state):
            pass
        def get_by_role(self, *a, **kw):
            return DummyLocator()
        async def screenshot(self):
            return b'data'
        async def fill(self, *args, **kwargs):
            pass
    class DummyContext:
        async def new_page(self):
            return DummyPage()
    class DummyBrowser:
        async def new_context(self):
            return DummyContext()
        async def close(self):
            pass
    class DummyChromium:
        async def launch(self, headless=True, args=None):
            return DummyBrowser()
    class DummyPlaywright:
        def __init__(self):
            self.chromium = DummyChromium()
    class DummyManager:
        async def __aenter__(self):
            return DummyPlaywright()
        async def __aexit__(self, exc_type, exc, tb):
            pass

    monkeypatch.setenv("SPOTGAMMA_USERNAME", "u")
    monkeypatch.setenv("SPOTGAMMA_PASSWORD", "p")
    import app.routers.v1.spotgamma as spg
    monkeypatch.setattr(spg, "async_playwright", lambda: DummyManager())

    async def fake_login(*args, **kwargs):
        return None

    monkeypatch.setattr(spg, "login", fake_login)
    class FakeDateTime:
        @classmethod
        def utcnow(cls):
            return real_datetime(2024, 1, 1, 0, 0, 0)

    monkeypatch.setattr(spg, "datetime", FakeDateTime)

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
    def fake_load(f):
        return f.filename
    def fake_detect(img):
        return img == "a"
    monkeypatch.setattr("app.routers.v1.spotgamma.load_image", fake_load)
    monkeypatch.setattr("app.routers.v1.spotgamma.detect_cross", fake_detect)
    files = {"img1": ("a", b"foo", "image/png"), "img2": ("b", b"bar", "image/png")}
    resp = await client.post("/v1/spotgamma/detect-crossing", files=files)
    assert resp.status_code == 200
    assert resp.json() == {"a": True, "b": False}
