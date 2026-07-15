import pytest
import json
from pathlib import Path

from app import tastytrade


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "tastytrade"


def load_fixture(name: str) -> dict:
    with (FIXTURE_DIR / name).open() as fixture:
        return json.load(fixture)


def test_fetch_watchlists_uses_read_only_endpoint(monkeypatch):
    captured = {}

    def fake_request(method, path, **kwargs):
        captured.update(method=method, path=path, kwargs=kwargs)
        return load_fixture("watchlists.json")

    monkeypatch.setattr(tastytrade, "_request_json", fake_request)

    watchlists = tastytrade.fetch_watchlists("Bearer FAKE")

    assert captured["method"] == "GET"
    assert captured["path"] == "/watchlists"
    assert captured["kwargs"]["headers"]["Authorization"] == "Bearer FAKE"
    assert watchlists[0].name == "Core Options"


def test_fetch_orders_retains_pagination_and_bounded_dates(monkeypatch):
    captured = {}

    def fake_request(method, path, **kwargs):
        captured.update(method=method, path=path, kwargs=kwargs)
        return load_fixture("orders_FAKE_OPTIONS.json")

    monkeypatch.setattr(tastytrade, "_request_json", fake_request)

    page = tastytrade.fetch_orders(
        "Bearer FAKE",
        "FAKE-OPTIONS",
        start_date="2026-07-14",
        end_date="2026-07-14",
    )

    assert captured["method"] == "GET"
    assert captured["path"] == "/accounts/FAKE-OPTIONS/orders"
    assert captured["kwargs"]["params"]["start-date"] == "2026-07-14"
    assert captured["kwargs"]["params"]["end-date"] == "2026-07-14"
    assert captured["kwargs"]["params"]["sort"] == "Asc"
    assert page.total_items == 1
    assert page.has_more is False
    assert page.items[0].legs[0].action == "Sell to Open"


def test_fetch_transactions_requests_max_safe_page_and_keeps_metadata(monkeypatch):
    captured = {}

    def fake_request(method, path, **kwargs):
        captured.update(method=method, path=path, kwargs=kwargs)
        return load_fixture("transactions_FAKE_OPTIONS.json")

    monkeypatch.setattr(tastytrade, "_request_json", fake_request)

    page = tastytrade.fetch_transactions(
        "Bearer FAKE",
        "FAKE-OPTIONS",
        start_date="2026-07-14",
        end_date="2026-07-14",
    )

    assert captured["path"] == "/accounts/FAKE-OPTIONS/transactions"
    assert captured["kwargs"]["params"]["per-page"] == 2000
    assert page.total_items == 2
    assert page.has_more is False
    assert page.items[0].ext_group_fill_id == "FAKE-GROUP-1"


def test_fetch_historical_earnings_does_not_claim_upcoming_date(monkeypatch):
    captured = {}

    def fake_request(method, path, **kwargs):
        captured.update(method=method, path=path, kwargs=kwargs)
        return load_fixture("earnings_AAPL.json")

    monkeypatch.setattr(tastytrade, "_request_json", fake_request)

    reports = tastytrade.fetch_historical_earnings(
        "Bearer FAKE",
        "aapl",
        start_date="2026-01-01",
        end_date="2026-07-15",
    )

    assert captured["path"].endswith("/earnings-reports/AAPL")
    assert captured["kwargs"]["params"] == {
        "start-date": "2026-01-01",
        "end-date": "2026-07-15",
    }
    assert reports[0].occurred_date == "2026-04-30"


@pytest.mark.parametrize(
    ("start_date", "end_date", "per_page", "message"),
    [
        ("2026-07-15", "2026-07-14", 2000, "start_date"),
        ("07/14/2026", "2026-07-15", 2000, "YYYY-MM-DD"),
        ("2026-07-14", "2026-07-15", 2001, "between 1 and 2000"),
    ],
)
def test_fetch_transactions_rejects_unbounded_or_invalid_windows(
    monkeypatch, start_date, end_date, per_page, message
):
    def unexpected_request(*args, **kwargs):
        raise AssertionError("Invalid request should not reach Tastytrade.")

    monkeypatch.setattr(tastytrade, "_request_json", unexpected_request)

    with pytest.raises(ValueError, match=message):
        tastytrade.fetch_transactions(
            "Bearer FAKE",
            "FAKE-OPTIONS",
            start_date=start_date,
            end_date=end_date,
            per_page=per_page,
        )
