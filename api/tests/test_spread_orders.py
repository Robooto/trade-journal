from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
import requests

from app import tastytrade
from app.routers.v1 import spread_orders as route
from app.services import spread_orders as rules

DAY = date(2026, 10, 26)
SYM = {(strike, side): f"SPXW  261026{side[0].upper()}0{strike * 1000:07d}" for strike in range(7600, 7700, 5) for side in ("call", "put")}
CHAIN = [
    {"root-symbol": "SPX", "expirations": []},
    {"root-symbol": "SPXW", "expirations": [
        {"expiration-date": "2026-10-23", "settlement-type": "PM", "strikes": []},
        {"expiration-date": "2026-10-26", "settlement-type": "PM", "strikes": [
            {"strike-price": f"{s}.0", "call": SYM[(s, "call")], "put": SYM[(s, "put")]} for s in range(7600, 7700, 5)]},
    ]},
]


def quote(symbol, bid, ask, delta=0.2):
    return SimpleNamespace(symbol=symbol, bid=str(bid), ask=str(ask), delta=str(delta))


def tasty_order(order_id=101, status="Live", fills=None):
    legs = [{"symbol": SYM[(7650, "call")], "fills": fills[0] if fills else []},
            {"symbol": SYM[(7655, "call")], "fills": fills[1] if fills else []}]
    return {"id": order_id, "status": status, "cancellable": status == "Live", "editable": status == "Live", "legs": legs}


def http_error(code, message):
    response = requests.Response()
    response.status_code = code
    response._content = ('{"error": {"message": "%s"}}' % message).encode()
    return requests.HTTPError(response=response)


# ---------- rules ----------

def test_legs_come_from_the_same_day_pm_spxw_chain():
    assert rules.find_legs(CHAIN, DAY, "call", 7650) == (SYM[(7650, "call")], SYM[(7655, "call")])
    assert rules.find_legs(CHAIN, DAY, "put", 7650) == (SYM[(7650, "put")], SYM[(7645, "put")])
    with pytest.raises(rules.SpreadOrderError, match="5 points"):
        rules.find_legs(CHAIN, DAY, "call", 7652)
    with pytest.raises(rules.SpreadOrderError, match="not listed"):
        rules.find_legs(CHAIN, DAY, "call", 7695)
    with pytest.raises(rules.SpreadOrderError, match="No same-day"):
        rules.find_legs(CHAIN, date(2026, 10, 27), "call", 7650)


def test_prices_move_in_nickels_below_the_width():
    assert rules.validate_price(1.1) == Decimal("1.1")
    for bad in (1.12, 0, 5, 5.5):
        with pytest.raises(rules.SpreadOrderError):
            rules.validate_price(bad)


def test_quote_natural_mid_and_suggested_limit():
    q = rules.spread_quote(quote("s", 2.10, 2.30), quote("l", 1.00, 1.15))
    assert q["natural"] == 0.95 and q["mid"] == pytest.approx(1.125) and q["suggested_price"] == 1.15
    assert rules.spread_quote(quote("s", 2.10, 2.30), quote("l", 1.00, 1.17))["suggested_price"] == 1.1  # mid 1.115
    assert rules.spread_quote(quote("s", None, 2.3), quote("l", 1, 1.1))["suggested_price"] is None


def test_payload_is_a_day_limit_credit_with_one_lot():
    payload = rules.build_payload("S", "L", Decimal("1.10"))
    assert payload["price"] == "1.10" and payload["price-effect"] == "Credit" and payload["time-in-force"] == "Day"
    assert [(leg["symbol"], leg["action"], leg["quantity"]) for leg in payload["legs"]] == [("S", "Sell to Open", 1), ("L", "Buy to Open", 1)]
    with pytest.raises(rules.SpreadOrderError, match="Quantity"):
        rules.build_payload("S", "L", Decimal("1.10"), quantity=2)


def test_order_state_reads_the_net_fill_credit():
    filled = tasty_order(status="Filled", fills=([{"fill-price": "2.20", "quantity": "1"}], [{"fill-price": "1.05", "quantity": "1"}]))
    state = rules.order_state(filled, SYM[(7650, "call")])
    assert state["fill_credit"] == 1.15 and state["status"] == "Filled" and not state["working"]
    assert rules.order_state(tasty_order(), SYM[(7650, "call")])["working"] is True


def test_preview_summary_signs_debits_negative():
    summary = rules.preview_summary({"buying-power-effect": {"change-in-buying-power": "390.0", "change-in-buying-power-effect": "Debit"},
                                     "fee-calculation": {"total-fees": "2.4", "total-fees-effect": "Debit"},
                                     "warnings": [{"message": "Closing only"}]})
    assert summary == {"buying_power_change": -390.0, "fees": -2.4, "warnings": ["Closing only"]}


# ---------- routes ----------

@pytest.fixture
def broker(monkeypatch):
    calls = []
    monkeypatch.setattr(rules, "expiration_today", lambda now=None: DAY)
    monkeypatch.setattr(tastytrade, "get_active_token", lambda db: "TOKEN")
    monkeypatch.setattr(tastytrade, "fetch_nested_option_chain", lambda token, symbol: CHAIN)
    monkeypatch.setattr(tastytrade, "fetch_market_data", lambda token, e, opts, f, fo: [
        quote(SYM[(7650, "call")], 2.10, 2.30), quote(SYM[(7655, "call")], 1.00, 1.15)])
    for name in ("dry_run_order", "place_order", "fetch_order", "fetch_live_orders", "replace_order", "cancel_order"):
        def fail(*args, name=name):
            raise AssertionError(f"unexpected {name}")
        monkeypatch.setattr(tastytrade, name, fail)
    route._chain_cache.clear()

    def use(name, fn):
        def wrapped(*args):
            calls.append((name, args))
            return fn(*args)
        monkeypatch.setattr(tastytrade, name, wrapped)
    return SimpleNamespace(calls=calls, use=use)


def configure(monkeypatch, live=True, account="5WW38633"):
    monkeypatch.setattr(route, "settings", SimpleNamespace(live_trading_enabled=live, spread_order_account=account))


@pytest.fixture(autouse=True)
def clear_orders():
    from app.db import SessionLocal
    from app.models import ManualSpreadOrderORM
    with SessionLocal() as db:
        db.query(ManualSpreadOrderORM).delete()
        db.commit()


ORDER = {"side": "call", "short_strike": 7650, "price": 1.1}


@pytest.mark.asyncio
async def test_quote_and_preview_never_place(client, broker, monkeypatch):
    configure(monkeypatch, live=False)
    response = await client.post("/v1/spread-orders/quote", json={"side": "call", "short_strike": 7650})
    assert response.status_code == 200
    body = response.json()
    assert body["long_strike"] == 7655 and body["natural"] == 0.95 and body["suggested_price"] == 1.15
    broker.use("dry_run_order", lambda token, account, payload: {"buying-power-effect": {"change-in-buying-power": "390", "change-in-buying-power-effect": "Debit"}})
    response = await client.post("/v1/spread-orders/preview", json=ORDER)
    assert response.status_code == 200 and response.json()["buying_power_change"] == -390
    assert [c[0] for c in broker.calls] == ["dry_run_order"] and broker.calls[0][1][1] == "5WW38633"


@pytest.mark.asyncio
async def test_preview_rejects_off_tick_prices_and_needs_an_account(client, broker, monkeypatch):
    configure(monkeypatch)
    assert (await client.post("/v1/spread-orders/preview", json={**ORDER, "price": 1.12})).status_code == 422
    configure(monkeypatch, account="")
    assert (await client.post("/v1/spread-orders/preview", json=ORDER)).status_code == 503


@pytest.mark.asyncio
async def test_sending_needs_the_switch_the_account_and_confirmation(client, broker, monkeypatch):
    configure(monkeypatch, live=False)
    assert (await client.post("/v1/spread-orders", json={**ORDER, "confirmed": True})).status_code == 503
    configure(monkeypatch)
    assert (await client.post("/v1/spread-orders", json=ORDER)).status_code == 400
    configure(monkeypatch, account="")
    assert (await client.post("/v1/spread-orders", json={**ORDER, "confirmed": True})).status_code == 503


@pytest.mark.asyncio
async def test_send_reprice_fill_and_one_working_order_at_a_time(client, broker, monkeypatch):
    configure(monkeypatch)
    broker.use("place_order", lambda token, account, payload: {"order": tasty_order(101, "Received")})
    response = await client.post("/v1/spread-orders", json={**ORDER, "confirmed": True})
    assert response.status_code == 201
    sent = response.json()
    assert sent["status"] == "Received" and sent["working"] and sent["tasty_order_id"] == "101"
    assert broker.calls[-1][1][2]["price"] == "1.10"
    assert (await client.post("/v1/spread-orders", json={**ORDER, "confirmed": True})).status_code == 409

    broker.use("replace_order", lambda token, account, order_id, payload: tasty_order(102, "Live"))
    response = await client.put(f"/v1/spread-orders/{sent['id']}/price", json={"price": 1.05, "confirmed": True})
    assert response.json()["tasty_order_id"] == "102" and response.json()["limit_price"] == 1.05
    assert broker.calls[-1][1][2] == "101" and broker.calls[-1][1][3]["price"] == "1.05"

    filled = tasty_order(102, "Filled", fills=([{"fill-price": "2.15", "quantity": "1"}], [{"fill-price": "1.10", "quantity": "1"}]))
    broker.use("fetch_order", lambda token, account, order_id: filled)
    response = await client.get(f"/v1/spread-orders/{sent['id']}")
    assert response.json()["status"] == "Filled" and response.json()["fill_credit"] == 1.05 and not response.json()["working"]
    kinds = [e["kind"] for e in response.json()["events"]]
    assert kinds[0] == "submit" and "replace" in kinds
    listed = (await client.get("/v1/spread-orders")).json()["rows"]
    assert [r["id"] for r in listed] == [sent["id"]]


@pytest.mark.asyncio
async def test_a_rejection_is_recorded_and_explained(client, broker, monkeypatch):
    configure(monkeypatch)
    def reject(*args):
        raise http_error(422, "Price must be in increments of 0.05")
    broker.use("place_order", reject)
    response = await client.post("/v1/spread-orders", json={**ORDER, "confirmed": True})
    assert response.status_code == 422 and "increments" in response.json()["detail"]
    assert (await client.get("/v1/spread-orders")).json()["rows"][0]["status"] == "Rejected"


@pytest.mark.asyncio
async def test_a_lost_answer_blocks_new_orders_until_it_is_found(client, broker, monkeypatch):
    configure(monkeypatch)
    def timeout(*args):
        raise requests.Timeout()
    broker.use("place_order", timeout)
    response = await client.post("/v1/spread-orders", json={**ORDER, "confirmed": True})
    assert response.status_code == 502
    row = (await client.get("/v1/spread-orders")).json()["rows"][0]
    assert row["status"] == "Submit unknown" and row["working"]
    assert (await client.post("/v1/spread-orders", json={**ORDER, "confirmed": True})).status_code == 409

    broker.use("fetch_live_orders", lambda token, account: [tasty_order(101, "Live")])
    assert (await client.get(f"/v1/spread-orders/{row['id']}")).json()["status"] == "Live"

    broker.use("cancel_order", lambda token, account, order_id: tasty_order(101, "Cancel Requested"))
    configure(monkeypatch, live=False)  # Cancelling never needs the live switch.
    assert (await client.delete(f"/v1/spread-orders/{row['id']}")).json()["status"] == "Cancel Requested"


@pytest.mark.asyncio
async def test_a_lost_answer_with_no_matching_order_is_not_placed(client, broker, monkeypatch):
    configure(monkeypatch)
    def timeout(*args):
        raise requests.ConnectionError()
    broker.use("place_order", timeout)
    await client.post("/v1/spread-orders", json={**ORDER, "confirmed": True})
    row = (await client.get("/v1/spread-orders")).json()["rows"][0]
    broker.use("fetch_live_orders", lambda token, account: [])
    refreshed = (await client.get(f"/v1/spread-orders/{row['id']}")).json()
    assert refreshed["status"] == "Not placed" and not refreshed["working"]
