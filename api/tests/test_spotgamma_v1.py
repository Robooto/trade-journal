import base64
from datetime import datetime as real_datetime
import pytest


@pytest.mark.asyncio
async def test_hiro_screens(client, monkeypatch):
    class DummyElement:
        def click(self):
            pass
        def send_keys(self, *a, **kw):
            pass

    class DummyDriver:
        def get(self, url):
            pass
        def find_element(self, *a, **kw):
            return DummyElement()
        def get_screenshot_as_png(self):
            return b'data'
        def quit(self):
            pass

    monkeypatch.setenv("SPOTGAMMA_USERNAME", "u")
    monkeypatch.setenv("SPOTGAMMA_PASSWORD", "p")
    import app.routers.v1.spotgamma as spg
    monkeypatch.setattr(spg.webdriver, "Chrome", lambda options=None: DummyDriver())

    def fake_login(*args, **kwargs):
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
