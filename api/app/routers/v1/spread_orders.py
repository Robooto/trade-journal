"""Manual SPXW 0DTE credit spreads sent from the Trace page's ladder and chain grid.

Preview (tastytrade dry run) is always available once an account is configured. Sending, repricing
and cancelling require LIVE_TRADING_ENABLED=true, SPREAD_ORDER_ACCOUNT and an explicitly confirmed
request; only one order may be working at a time.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import UTC, date, datetime
from typing import Any

import requests
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import tastytrade
from app.db import get_db
from app.models import ManualSpreadOrderORM
from app.schemas.spread_orders import (
    SpreadLegsRequest,
    SpreadOrder,
    SpreadOrderConfig,
    SpreadOrderList,
    SpreadPreview,
    SpreadPriceRequest,
    SpreadQuote,
    SpreadReplaceRequest,
    SpreadSubmitRequest,
)
from app.services import spread_orders as rules
from app.settings import settings

router = APIRouter(prefix="/v1/spread-orders", tags=["v1 – manual SPX spreads"])

CHAIN_TTL_SECONDS = 600
_chain_cache: dict[date, tuple[float, list[dict]]] = {}
UNKNOWN = "Submit unknown"


def _token(db: Session) -> str:
    try:
        return tastytrade.get_active_token(db)
    except Exception as exc:
        logging.error("Authentication to tastytrade failed: %s", exc)
        raise HTTPException(status_code=403, detail="Brokerage authorization is unavailable.") from exc


def _tasty_message(response: requests.Response | None) -> str | None:
    try:
        error = (response.json() or {}).get("error") or {}
    except (ValueError, AttributeError):
        return None
    parts = [error.get("message")] + [e.get("message") for e in error.get("errors") or [] if isinstance(e, dict)]
    return " ".join(p for p in parts if p) or None


def _broker(call, *args):
    """Run a tastytrade call; a broker rejection is a 422 with tastytrade's own reason."""
    try:
        return call(*args)
    except rules.SpreadOrderError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except requests.HTTPError as exc:
        response = exc.response
        if response is not None and 400 <= response.status_code < 500:
            raise HTTPException(status_code=422, detail=_tasty_message(response) or "tastytrade rejected the request.") from exc
        raise HTTPException(status_code=502, detail="tastytrade is unavailable.") from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="tastytrade did not answer.") from exc


def _account() -> str:
    if not settings.spread_order_account:
        raise HTTPException(status_code=503, detail="No spread-order account is configured (SPREAD_ORDER_ACCOUNT).")
    return settings.spread_order_account


def _require_live(confirmed: bool) -> str:
    if not settings.live_trading_enabled:
        raise HTTPException(status_code=503, detail="Live order submission is disabled. Set LIVE_TRADING_ENABLED=true to enable it.")
    account = _account()
    if not confirmed:
        raise HTTPException(status_code=400, detail="A reviewed order must be explicitly confirmed before it is sent.")
    return account


def _chain(token: str, expiration: date) -> list[dict]:
    cached = _chain_cache.get(expiration)
    if cached and time.monotonic() - cached[0] < CHAIN_TTL_SECONDS:
        return cached[1]
    chain = _broker(tastytrade.fetch_nested_option_chain, token, "SPX")
    _chain_cache.clear()
    _chain_cache[expiration] = (time.monotonic(), chain)
    return chain


def _legs(token: str, side: str, short_strike: float) -> tuple[date, str, str]:
    expiration = rules.expiration_today()
    short_symbol, long_symbol = _broker(rules.find_legs, _chain(token, expiration), expiration, side, short_strike)
    return expiration, short_symbol, long_symbol


def _quote(token: str, side: str, short_strike: float) -> dict[str, Any]:
    expiration, short_symbol, long_symbol = _legs(token, side, short_strike)
    rows = {row.symbol: row for row in _broker(tastytrade.fetch_market_data, token, [], [short_symbol, long_symbol], [], [])}
    if short_symbol not in rows or long_symbol not in rows:
        raise HTTPException(status_code=502, detail="Quotes for both legs are unavailable.")
    return {"side": side, "expiration": expiration, "short_strike": short_strike,
            "long_strike": rules.long_strike(side, short_strike), "width": rules.WIDTH,
            "short_symbol": short_symbol, "long_symbol": long_symbol, "quoted_at": datetime.now(UTC),
            **rules.spread_quote(rows[short_symbol], rows[long_symbol])}


def _price(price: float):
    try:
        return rules.validate_price(price)
    except rules.SpreadOrderError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _event(row: ManualSpreadOrderORM, kind: str, **details) -> None:
    events = json.loads(row.events or "[]")
    events.append({"at": datetime.now(UTC).isoformat(), "kind": kind, **details})
    row.events = json.dumps(events)


def _apply(row: ManualSpreadOrderORM, order: dict[str, Any]) -> None:
    state = rules.order_state(order, row.short_symbol)
    if state["tasty_order_id"]:
        row.tasty_order_id = state["tasty_order_id"]
    if state["status"] != row.status or state["fill_credit"] != row.fill_credit:
        _event(row, "status", status=state["status"], fill_credit=state["fill_credit"], reject_reason=state["reject_reason"])
    row.status = state["status"]
    row.fill_credit = state["fill_credit"]


def _view(row: ManualSpreadOrderORM) -> SpreadOrder:
    return SpreadOrder(
        id=row.id, session_date=row.session_date, account_number=row.account_number, side=row.side,
        short_strike=row.short_strike, long_strike=row.long_strike, width=row.width, quantity=row.quantity,
        short_symbol=row.short_symbol, long_symbol=row.long_symbol, limit_price=row.limit_price,
        tasty_order_id=row.tasty_order_id, status=row.status,
        working=row.status in rules.WORKING or row.status == UNKNOWN, fill_credit=row.fill_credit,
        events=json.loads(row.events or "[]"), created_at=row.created_at, updated_at=row.updated_at,
    )


def _row(db: Session, order_id: int) -> ManualSpreadOrderORM:
    row = db.get(ManualSpreadOrderORM, order_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Spread order not found.")
    return row


@router.get("/config", response_model=SpreadOrderConfig)
def spread_order_config():
    return SpreadOrderConfig(live_enabled=settings.live_trading_enabled, account_number=settings.spread_order_account or None,
                             width=rules.WIDTH, max_quantity=rules.MAX_QUANTITY, tick=float(rules.TICK))


@router.post("/quote", response_model=SpreadQuote)
def quote_spread(req: SpreadLegsRequest, db: Session = Depends(get_db)):
    return _quote(_token(db), req.side, req.short_strike)


@router.post("/preview", response_model=SpreadPreview)
def preview_spread(req: SpreadPriceRequest, db: Session = Depends(get_db)):
    """tastytrade's dry run of the exact order: nothing is placed."""
    account = _account()
    price = _price(req.price)
    token = _token(db)
    _, short_symbol, long_symbol = _legs(token, req.side, req.short_strike)
    payload = _broker(rules.build_payload, short_symbol, long_symbol, price, req.quantity)
    result = _broker(tastytrade.dry_run_order, token, account, payload)
    return SpreadPreview(account_number=account, payload=payload, **rules.preview_summary(result))


@router.post("", response_model=SpreadOrder, status_code=status.HTTP_201_CREATED)
def submit_spread(req: SpreadSubmitRequest, db: Session = Depends(get_db)):
    account = _require_live(req.confirmed)
    price = _price(req.price)
    working = [r for r in db.query(ManualSpreadOrderORM).filter(ManualSpreadOrderORM.account_number == account).all()
               if _view(r).working]
    if working:
        raise HTTPException(status_code=409, detail="Another spread order is still working; wait for it or cancel it first.")
    token = _token(db)
    quote = _quote(token, req.side, req.short_strike)
    payload = _broker(rules.build_payload, quote["short_symbol"], quote["long_symbol"], price, req.quantity)
    row = ManualSpreadOrderORM(
        session_date=quote["expiration"], account_number=account, side=req.side, short_strike=req.short_strike,
        long_strike=quote["long_strike"], width=rules.WIDTH, quantity=req.quantity, short_symbol=quote["short_symbol"],
        long_symbol=quote["long_symbol"], limit_price=float(price), status=UNKNOWN, events="[]",
        quote_at_submit=json.dumps({k: quote[k] for k in ("short", "long", "natural", "mid")}),
    )
    _event(row, "submit", price=float(price))
    db.add(row)
    db.commit()
    try:
        result = tastytrade.place_order(token, account, payload)
    except requests.HTTPError as exc:
        response = exc.response
        if response is not None and 400 <= response.status_code < 500:
            row.status = "Rejected"
            reason = _tasty_message(response) or "tastytrade rejected the order."
            _event(row, "rejected", reason=reason)
            db.commit()
            raise HTTPException(status_code=422, detail=reason) from exc
        _event(row, "submit_unknown", error=f"HTTP {response.status_code if response is not None else '?'}")
        db.commit()
        raise HTTPException(status_code=502, detail="tastytrade's answer was lost; check the account's orders before sending again.") from exc
    except requests.RequestException as exc:
        # The order may or may not exist: keep the row working so nothing else is sent until it is checked.
        _event(row, "submit_unknown", error=type(exc).__name__)
        db.commit()
        raise HTTPException(status_code=502, detail="tastytrade's answer was lost; check the account's orders before sending again.") from exc
    _apply(row, result.get("order") or result)
    db.commit()
    db.refresh(row)
    return _view(row)


@router.get("", response_model=SpreadOrderList)
def list_spread_orders(session_date: date | None = Query(default=None), db: Session = Depends(get_db)):
    day = session_date or rules.expiration_today()
    rows = (db.query(ManualSpreadOrderORM).filter(ManualSpreadOrderORM.session_date == day)
            .order_by(ManualSpreadOrderORM.id.desc()).all())
    return SpreadOrderList(rows=[_view(r) for r in rows])


@router.get("/{order_id}", response_model=SpreadOrder)
def refresh_spread_order(order_id: int, db: Session = Depends(get_db)):
    """The order as tastytrade reports it now; terminal orders are returned as recorded."""
    row = _row(db, order_id)
    if row.tasty_order_id and row.status in rules.WORKING:
        _apply(row, _broker(tastytrade.fetch_order, _token(db), row.account_number, row.tasty_order_id))
    elif row.status == UNKNOWN:
        # The send's answer was lost: find the order by its two legs, or record that it was never placed.
        legs = {row.short_symbol, row.long_symbol}
        found = [o for o in _broker(tastytrade.fetch_live_orders, _token(db), row.account_number)
                 if {leg.get("symbol") for leg in o.get("legs") or []} == legs]
        if found:
            _apply(row, max(found, key=lambda o: str(o.get("received-at") or "")))
        else:
            row.status = "Not placed"
            _event(row, "status", status=row.status, note="No matching order in tastytrade's live orders.")
    else:
        return _view(row)
    db.commit()
    db.refresh(row)
    return _view(row)


@router.put("/{order_id}/price", response_model=SpreadOrder)
def reprice_spread_order(order_id: int, req: SpreadReplaceRequest, db: Session = Depends(get_db)):
    """Cancel-replace a working order at a new credit; if the original fills first, the replacement is dropped."""
    _require_live(req.confirmed)
    row = _row(db, order_id)
    if row.status not in rules.WORKING or not row.tasty_order_id:
        raise HTTPException(status_code=409, detail="Only a working order can be repriced.")
    price = _price(req.price)
    payload = rules.build_payload(row.short_symbol, row.long_symbol, price, row.quantity)
    result = _broker(tastytrade.replace_order, _token(db), row.account_number, row.tasty_order_id, payload)
    _event(row, "replace", price=float(price), replaced_order_id=row.tasty_order_id)
    row.limit_price = float(price)
    _apply(row, result.get("order") or result)
    db.commit()
    db.refresh(row)
    return _view(row)


@router.delete("/{order_id}", response_model=SpreadOrder)
def cancel_spread_order(order_id: int, db: Session = Depends(get_db)):
    """Cancelling is always allowed for a working order, even with live submission switched off."""
    row = _row(db, order_id)
    if row.status not in rules.WORKING or not row.tasty_order_id:
        raise HTTPException(status_code=409, detail="Only a working order can be cancelled.")
    result = _broker(tastytrade.cancel_order, _token(db), row.account_number, row.tasty_order_id)
    _event(row, "cancel")
    _apply(row, result.get("order") or result)
    db.commit()
    db.refresh(row)
    return _view(row)
