import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.schema import PositionsResponse

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
