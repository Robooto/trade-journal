"""Manual SPXW 0DTE credit spreads from the Trace page: contracts, prices, payloads and order state.

Pure rules only. ``app/tastytrade.py`` sends the orders; the router enforces the server switch,
the configured account and explicit confirmation.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from zoneinfo import ZoneInfo

from app.services.values import to_float

ROOT = "SPXW"
WIDTH = 5
MAX_QUANTITY = 1
# Cboe accepts SPX/SPXW spread net prices only in $0.05 steps (legs may print in pennies).
TICK = Decimal("0.05")
EASTERN = ZoneInfo("America/New_York")
WORKING = {"Received", "Routed", "In Flight", "Live", "Contingent", "Cancel Requested", "Replace Requested"}


class SpreadOrderError(ValueError):
    """A request that cannot become a valid order; the message is safe to show."""


def expiration_today(now: datetime | None = None) -> date:
    """The 0DTE expiration: today's date in New York."""
    return (now or datetime.now(EASTERN)).astimezone(EASTERN).date()


def long_strike(side: str, short_strike: float, width: int = WIDTH) -> float:
    if side == "call":
        return short_strike + width
    if side == "put":
        return short_strike - width
    raise SpreadOrderError("Side must be call or put.")


def find_legs(chain: list[dict], expiration: date, side: str, short_strike: float, width: int = WIDTH) -> tuple[str, str]:
    """The broker's own symbols for the short and long legs of a same-day PM SPXW spread."""
    if short_strike <= 0 or short_strike % 5:
        raise SpreadOrderError("SPX strikes are 5 points apart; pick a strike divisible by 5.")
    day = expiration.isoformat()
    expiries = [e for root in chain if root.get("root-symbol") == ROOT
                for e in root.get("expirations", [])
                if e.get("expiration-date") == day and e.get("settlement-type") == "PM"]
    if len(expiries) != 1:
        raise SpreadOrderError(f"No same-day SPXW expiration for {day}.")
    by_strike = {to_float(row.get("strike-price")): row for row in expiries[0].get("strikes", [])}
    legs = []
    for strike in (short_strike, long_strike(side, short_strike, width)):
        symbol = (by_strike.get(float(strike)) or {}).get(side)
        if not symbol:
            raise SpreadOrderError(f"The {strike:g} {side} is not listed for {day}.")
        legs.append(symbol)
    return legs[0], legs[1]


def nearest_tick(value: float) -> Decimal:
    return (Decimal(str(value)) / TICK).to_integral_value(rounding=ROUND_HALF_UP) * TICK


def validate_price(price: float, width: int = WIDTH) -> Decimal:
    value = Decimal(str(price))
    if value <= 0 or value >= width:
        raise SpreadOrderError(f"The credit must be above $0 and below the {width}-point width.")
    if value % TICK:
        raise SpreadOrderError("SPX spread prices move in $0.05 steps.")
    return value


def spread_quote(short: Any, long: Any, width: int = WIDTH) -> dict[str, Any]:
    """Natural (sell the bid, buy the ask) and mid credit, and a limit at the mid rounded to the nearest tick (halves round up)."""
    short_bid, short_ask = to_float(getattr(short, "bid", None)), to_float(getattr(short, "ask", None))
    long_bid, long_ask = to_float(getattr(long, "bid", None)), to_float(getattr(long, "ask", None))
    quoted = None not in (short_bid, short_ask, long_bid, long_ask)
    natural = round(short_bid - long_ask, 2) if quoted else None
    mid = round((short_bid + short_ask) / 2 - (long_bid + long_ask) / 2, 3) if quoted else None
    suggested = None
    if mid is not None:
        rounded = nearest_tick(mid)
        suggested = float(rounded) if TICK <= rounded < width else None
    return {
        "short": {"bid": short_bid, "ask": short_ask, "delta": to_float(getattr(short, "delta", None))},
        "long": {"bid": long_bid, "ask": long_ask, "delta": to_float(getattr(long, "delta", None))},
        "natural": natural, "mid": mid, "suggested_price": suggested,
    }


def build_payload(short_symbol: str, long_symbol: str, price: Decimal, quantity: int = 1) -> dict[str, Any]:
    if quantity < 1 or quantity > MAX_QUANTITY:
        raise SpreadOrderError(f"Quantity is limited to {MAX_QUANTITY}.")
    return {
        "time-in-force": "Day",
        "order-type": "Limit",
        "price": f"{price:.2f}",
        "price-effect": "Credit",
        "legs": [
            {"instrument-type": "Equity Option", "symbol": short_symbol, "quantity": quantity, "action": "Sell to Open"},
            {"instrument-type": "Equity Option", "symbol": long_symbol, "quantity": quantity, "action": "Buy to Open"},
        ],
    }


def order_state(order: dict[str, Any], short_symbol: str) -> dict[str, Any]:
    """Status, ids and the net fill credit (short fills minus long fills) of a tastytrade order."""
    fills: dict[str, float] = {}
    for leg in order.get("legs") or []:
        filled = [(to_float(f.get("fill-price")), to_float(f.get("quantity"))) for f in leg.get("fills") or []]
        filled = [(p, q) for p, q in filled if p is not None and q]
        if filled:
            fills[leg.get("symbol")] = sum(p * q for p, q in filled) / sum(q for _, q in filled)
    credit = None
    if len(fills) == 2 and short_symbol in fills:
        long_price = next(p for s, p in fills.items() if s != short_symbol)
        credit = round(fills[short_symbol] - long_price, 2)
    status = order.get("status") or "Unknown"
    return {
        "tasty_order_id": str(order["id"]) if order.get("id") is not None else None,
        "status": status,
        "working": status in WORKING,
        "cancellable": bool(order.get("cancellable")),
        "editable": bool(order.get("editable")),
        "fill_credit": credit,
        "reject_reason": order.get("reject-reason"),
    }


def preview_summary(result: dict[str, Any]) -> dict[str, Any]:
    """Buying-power change, fees and warnings from a dry run, signed as tastytrade reports them."""
    bp = result.get("buying-power-effect") or {}
    fees = result.get("fee-calculation") or {}
    def signed(value, effect):
        number = to_float(value)
        return None if number is None else (-number if effect == "Debit" else number)
    return {
        "buying_power_change": signed(bp.get("change-in-buying-power"), bp.get("change-in-buying-power-effect")),
        "fees": signed(fees.get("total-fees"), fees.get("total-fees-effect")),
        "warnings": [w.get("message") or str(w) if isinstance(w, dict) else str(w) for w in result.get("warnings") or []],
    }
