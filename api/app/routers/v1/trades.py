import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.schema import PositionsResponse, BracketOrderRequest, BracketOrderResponse

from app.db import get_db
from app import tastytrade
from app.services.trades_service import (
    acquire_token,
    fetch_accounts,
    collect_positions_and_symbols,
    fetch_market_and_beta_data,
    augment_positions_with_market_data,
    group_positions_and_compute_totals,
    apply_volatility,
    apply_balance,
)

router = APIRouter(
    prefix="/v1/trades",
    tags=["v1 – trades"]
)


def _is_credit_trade(quantity_direction: str, cost_effect: str | None) -> bool:
    direction = (quantity_direction or "").strip().lower()
    if direction == "short":
        return True
    if direction == "long":
        return False
    return (cost_effect or "").strip().lower() == "credit"


def _round_price(value: float) -> float:
    return round(float(value) + 1e-8, 2)


def _clamp_price(value: float) -> float:
    if value < 0.01:
        return 0.01
    return value


def _build_bracket_payload(req: BracketOrderRequest) -> tuple[dict, float, float]:
    is_credit = _is_credit_trade(req.quantity_direction, req.cost_effect)
    entry_price = float(req.entry_price)
    if is_credit:
        take_profit_price = entry_price * (1 - req.take_profit_percent / 100)
        stop_loss_price = entry_price * (1 + req.stop_loss_percent / 100)
    else:
        take_profit_price = entry_price * (1 + req.take_profit_percent / 100)
        stop_loss_price = max(0.01, entry_price * (1 - req.stop_loss_percent / 100))

    take_profit_price = _round_price(_clamp_price(take_profit_price))
    stop_loss_price = _round_price(_clamp_price(stop_loss_price))

    action = "Buy to Close" if req.quantity_direction.strip().lower() == "short" else "Sell to Close"
    price_effect = "Debit" if is_credit else "Credit"

    payload = {
        "type": "OCO",
        "orders": [
            {
                "order-type": "Limit",
                "price": take_profit_price,
                "price-effect": price_effect,
                "time-in-force": "GTC",
                "legs": [
                    {
                        "symbol": req.symbol,
                        "instrument-type": req.instrument_type,
                        "action": action,
                        "quantity": req.quantity,
                    }
                ],
            },
            {
                "order-type": "Stop",
                "time-in-force": "GTC",
                "stop-trigger": stop_loss_price,
                "legs": [
                    {
                        "symbol": req.symbol,
                        "instrument-type": req.instrument_type,
                        "action": action,
                        "quantity": req.quantity,
                    }
                ],
            },
        ],
    }
    return payload, take_profit_price, stop_loss_price

@router.get(
    "",
    summary="Get all non-equity positions grouped by underlying-symbol and expiration",
    response_model=PositionsResponse,
)
def get_all_positions(db: Session = Depends(get_db)):
    """
    Retrieve all positions across all accounts, excluding:
      - Entire accounts that have no non-Equity positions.
      - Any individual position where "instrument-type" == "Equity".
    For each remaining position:
      1. Compute an 'approximate-p-l'.
      2. Group by 'underlying-symbol' and 'expires-at'.
      3. For each group, compute:
         - total_credit_received using the quantity direction sign and group multiplier
        - current_group_p_l as the sum of the positions' approximate P/L values
        - percent_credit_received = int((current_group_p_l / abs(total_credit_received)) * 100), or None
    """
    token = acquire_token(db)
    accounts = fetch_accounts(token)

    (
        positions_by_account,
        equity_option_syms,
        future_option_syms,
        equity_underlyings,
        future_underlyings,
    ) = collect_positions_and_symbols(token, accounts)

    market_map, beta_map = fetch_market_and_beta_data(
        token,
        equity_option_syms,
        future_option_syms,
        equity_underlyings,
        future_underlyings,
    )

    augment_positions_with_market_data(positions_by_account, market_map, beta_map)

    accounts_data = group_positions_and_compute_totals(positions_by_account, beta_map)

    apply_volatility(token, accounts_data)
    apply_balance(token, accounts_data)

    return PositionsResponse(accounts=accounts_data)

@router.post("/market-data",summary="Get market data for symbols", response_model=List[dict])
def get_market_data(equity: List[str], equity_option: List[str], future: List[str], future_option: List[str], db: Session = Depends(get_db)):
    """
    Fetch market data for the given symbols from the Tastytrade API.
    Returns a list of market data dictionaries.
    """
    try:
        token = tastytrade.get_active_token(db)
    except Exception as e:
        logging.error(f"Authentication to Tastytrade failed: {e}")
        raise HTTPException(status_code=403, detail=f"Authentication to Tastytrade failed: {e}")

    try:
        market_data = tastytrade.fetch_market_data(token, equity, equity_option, future, future_option)
    except Exception as e:
        logging.error(f"Failed to fetch market data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch market data: {e}")

    return market_data

@router.post("/volatility-data",summary="Get volatility data for symbols", response_model=List[dict])
def get_volatility_data(symbols: List[str], db: Session = Depends(get_db)):
    """
    Fetch volatility data for the given symbols from the Tastytrade API.
    Returns a list of volatility data dictionaries.
    """
    try:
        token = tastytrade.get_active_token(db)
    except Exception as e:
        logging.error(f"Authentication to Tastytrade failed: {e}")
        raise HTTPException(status_code=403, detail=f"Authentication to Tastytrade failed: {e}")

    try:
        volatility_data = tastytrade.fetch_volatility_data(token, symbols)
    except Exception as e:
        logging.error(f"Failed to fetch volatility data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch volatility data: {e}")

    return volatility_data


@router.post(
    "/bracket-orders",
    summary="Submit a single-leg bracket (OCO) order",
    response_model=BracketOrderResponse,
)
def submit_bracket_order(req: BracketOrderRequest, db: Session = Depends(get_db)):
    """
    Build an OCO payload from single-leg inputs and submit to Tastytrade unless dry_run is true.
    """
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity must be positive")
    if req.entry_price <= 0:
        raise HTTPException(status_code=400, detail="entry_price must be positive")
    if req.take_profit_percent <= 0 or req.stop_loss_percent <= 0:
        raise HTTPException(status_code=400, detail="percent values must be positive")

    payload, take_profit_price, stop_loss_price = _build_bracket_payload(req)
    tasty_response = None

    if not req.dry_run:
        try:
            token = tastytrade.get_active_token(db)
            tasty_response = tastytrade.place_complex_order(token, req.account_number, payload)
        except Exception as e:
            logging.error(f"Failed to submit bracket order: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to submit bracket order: {e}")

    return BracketOrderResponse(
        **{
            "dry-run": req.dry_run,
            "payload": payload,
            "take-profit-price": take_profit_price,
            "stop-loss-price": stop_loss_price,
            "tasty-response": tasty_response,
        }
    )
