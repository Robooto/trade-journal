import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List

from app.schemas.trades import (
    BracketOrderRequest,
    BracketOrderResponse,
    LlmPositionsSummaryResponse,
    MarketDataRequest,
    MarketDataSummaryResponse,
    PositionsResponse,
    VolatilityDataRequest,
    VolatilityDataSummaryResponse,
)

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
    build_llm_positions_summary,
    build_market_data_summary,
    build_volatility_data_summary,
)
from app.services.trades_errors import TastytradeAuthError, TastytradeFetchError

router = APIRouter(
    prefix="/v1/trades",
    tags=["v1 – trades"]
)


def _jsonable_tasty(value):
    if isinstance(value, BaseModel):
        return value.model_dump(by_alias=True, exclude_none=True)
    return value


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


def _load_positions_data(db: Session) -> list[dict]:
    try:
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

        return accounts_data
    except TastytradeAuthError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except TastytradeFetchError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


def _get_tastytrade_token_or_403(db: Session) -> str:
    try:
        return tastytrade.get_active_token(db)
    except Exception as e:
        logging.error(f"Authentication to Tastytrade failed: {e}")
        raise HTTPException(status_code=403, detail=f"Authentication to Tastytrade failed: {e}") from e


def _fetch_market_data_or_500(
    token: str,
    equity: List[str],
    equity_option: List[str],
    future: List[str],
    future_option: List[str],
):
    try:
        return tastytrade.fetch_market_data(token, equity, equity_option, future, future_option)
    except Exception as e:
        logging.error(f"Failed to fetch market data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch market data: {e}") from e


def _fetch_volatility_data_or_500(token: str, symbols: List[str]):
    try:
        return tastytrade.fetch_volatility_data(token, symbols)
    except Exception as e:
        logging.error(f"Failed to fetch volatility data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch volatility data: {e}") from e


def _place_complex_order_or_500(token: str, account_number: str, payload: dict):
    try:
        return tastytrade.place_complex_order(token, account_number, payload)
    except Exception as e:
        logging.error(f"Failed to submit bracket order: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to submit bracket order: {e}") from e


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
    return PositionsResponse(accounts=_load_positions_data(db))


@router.get(
    "/summary",
    summary="Get LLM-friendly positions summary",
    response_model=LlmPositionsSummaryResponse,
)
def get_positions_summary(db: Session = Depends(get_db)):
    """
    Return positions with snake_case field names, numeric values, and no raw broker
    payload nesting. This is intended for LLM context and analysis.
    """
    return build_llm_positions_summary(_load_positions_data(db))

@router.post("/market-data",summary="Get market data for symbols", response_model=List[dict])
def get_market_data(equity: List[str], equity_option: List[str], future: List[str], future_option: List[str], db: Session = Depends(get_db)):
    """
    Fetch market data for the given symbols from the Tastytrade API.
    Returns a list of market data dictionaries.
    """
    token = _get_tastytrade_token_or_403(db)
    market_data = _fetch_market_data_or_500(token, equity, equity_option, future, future_option)
    return [_jsonable_tasty(item) for item in market_data]


@router.post(
    "/market-data/summary",
    summary="Get LLM-friendly market data for symbols",
    response_model=MarketDataSummaryResponse,
    response_model_exclude_none=True,
)
def get_market_data_summary(req: MarketDataRequest, db: Session = Depends(get_db)):
    """
    Fetch market data and return a compact snake_case response with numeric fields.
    """
    token = _get_tastytrade_token_or_403(db)
    market_data = _fetch_market_data_or_500(
        token,
        req.equity,
        req.equity_option,
        req.future,
        req.future_option,
    )
    requested_symbols = req.equity + req.equity_option + req.future + req.future_option
    return build_market_data_summary(market_data, requested_symbols)

@router.post("/volatility-data",summary="Get volatility data for symbols", response_model=List[dict])
def get_volatility_data(symbols: List[str], db: Session = Depends(get_db)):
    """
    Fetch volatility data for the given symbols from the Tastytrade API.
    Returns a list of volatility data dictionaries.
    """
    token = _get_tastytrade_token_or_403(db)
    volatility_data = _fetch_volatility_data_or_500(token, symbols)
    return [_jsonable_tasty(item) for item in volatility_data]


@router.post(
    "/volatility-data/summary",
    summary="Get LLM-friendly volatility data for symbols",
    response_model=VolatilityDataSummaryResponse,
    response_model_exclude_none=True,
)
def get_volatility_data_summary(req: VolatilityDataRequest, db: Session = Depends(get_db)):
    """
    Fetch volatility data and return percentage fields already scaled for humans.
    """
    token = _get_tastytrade_token_or_403(db)
    volatility_data = _fetch_volatility_data_or_500(token, req.symbols)
    return build_volatility_data_summary(volatility_data, req.symbols)


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
        token = _get_tastytrade_token_or_403(db)
        tasty_response = _jsonable_tasty(
            _place_complex_order_or_500(token, req.account_number, payload)
        )

    return BracketOrderResponse(
        **{
            "dry-run": req.dry_run,
            "payload": payload,
            "take-profit-price": take_profit_price,
            "stop-loss-price": stop_loss_price,
            "tasty-response": tasty_response,
        }
    )
