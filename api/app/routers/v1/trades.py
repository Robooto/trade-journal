import logging
import re
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, List, Tuple, Optional

from app.schema import PositionsResponse

from app.db import get_db
from app import tastytrade

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
         - total_credit_received (rounded to 2 decimals)
         - current_group_price (rounded to 2 decimals)
         - group_approximate_p_l = total_credit_received - current_group_price (rounded to 2 decimals)
         - percent_credit_received = int((group_approximate_p_l / total_credit_received) * 100), or None
    """
    try:
        token = tastytrade.get_active_token(db)
    except Exception as e:
        logging.error(f"Authentication to Tastytrade failed: {e}")
        raise HTTPException(status_code=500, detail=f"Authentication to Tastytrade failed: {e}")

    try:
        accounts = tastytrade.fetch_accounts(token)
    except Exception as e:
        logging.error(f"Failed to fetch accounts: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch accounts: {e}")

    # Gather positions and unique symbols for market data
    positions_by_account = []
    equity_option_syms: set[str] = set()
    future_option_syms: set[str] = set()

    for acct in accounts:
        acct_num = acct.get("account_number")
        nickname = acct.get("nickname", "")
        try:
            raw_positions = tastytrade.fetch_positions(token, acct_num)
        except Exception as e:
            logging.error(f"Failed to fetch positions for account {acct_num}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch positions for account {acct_num}: {e}")

        filtered_positions = [
            pos for pos in raw_positions
            if pos.get("instrument-type", "") != "Equity"
        ]

        if not filtered_positions:
            continue

        augmented: List[Dict] = []
        for pos in filtered_positions:
            p = pos.copy()

            symbol = p.get("symbol")
            inst_type = p.get("instrument-type", "")
            if symbol:
                if inst_type == "Equity Option":
                    equity_option_syms.add(symbol)
                elif inst_type == "Future Option":
                    future_option_syms.add(symbol)

            augmented.append(p)

        positions_by_account.append({
            "account_number": acct_num,
            "nickname": nickname,
            "positions": augmented,
        })

    # Fetch market data once for all unique option symbols
    market_map: Dict[str, Dict] = {}
    if equity_option_syms or future_option_syms:
        try:
            md_list = tastytrade.fetch_market_data(
                token,
                [],
                sorted(equity_option_syms),
                [],
                sorted(future_option_syms),
            )
            for item in md_list:
                sym = item.get("symbol")
                if sym:
                    market_map[sym] = item
        except Exception as e:
            logging.error(f"Failed to fetch market data: {e}")

    # Build response per account with groups and market/volatility data
    accounts_data = []
    for acct in positions_by_account:
        acct_num = acct["account_number"]
        nickname = acct["nickname"]
        pos_list = acct["positions"]

        # attach market data and compute approximate P/L
        for p in pos_list:
            sym = p.get("symbol")
            if sym and sym in market_map:
                md_item = market_map[sym].copy()
                qty_dir = p.get("quantity-direction")
                delta_val = md_item.get("delta")
                if qty_dir and delta_val is not None:
                    try:
                        delta_float = abs(float(delta_val))
                    except (TypeError, ValueError):
                        pass
                    else:
                        if "C" in sym:
                            sign = 1 if qty_dir == "Long" else -1
                        elif "P" in sym:
                            sign = 1 if qty_dir == "Short" else -1
                        else:
                            sign = 1
                        md_item["computed_delta"] = sign * delta_float
            else:
                md_item = {}

            p["market_data"] = md_item

            try:
                avg_open = float(p.get("average-open-price", "0"))
                mark = float(md_item.get("mark"))
                quantity = int(p.get("quantity", 1))
                multiplier = int(p.get("multiplier", 1))
            except (TypeError, ValueError):
                approximate_pl = 0.0
            else:
                approximate_pl = (avg_open - mark) * quantity * multiplier

            p["approximate-p-l"] = approximate_pl

        grouping: Dict[Tuple[str, str], List[Dict]] = defaultdict(list)
        for p in pos_list:
            underlying = p.get("underlying-symbol", "") or ""
            expires = p.get("expires-at", "") or ""
            grouping[(underlying, expires)].append(p)

        groups_list = []
        for (underlying, expires), plist in grouping.items():
            total_credit_unrounded = 0.0
            current_credit_unrounded = 0.0
            delta_sum_unrounded = 0.0

            for p in plist:
                cost_effect = p.get("cost-effect", "")
                try:
                    avg_open = float(p.get("average-open-price", "0"))
                except (ValueError, TypeError):
                    avg_open = 0.0
                try:
                    close_price = float(p.get("close-price", "0"))
                except (ValueError, TypeError):
                    close_price = 0.0

                if cost_effect == "Debit":
                    total_credit_unrounded += avg_open
                    current_credit_unrounded += close_price
                elif cost_effect == "Credit":
                    total_credit_unrounded -= avg_open
                    current_credit_unrounded -= close_price

                md = p.get("market_data", {})
                try:
                    delta_sum_unrounded += float(md.get("computed_delta", 0))
                except (TypeError, ValueError):
                    pass

            total_credit_received = round(total_credit_unrounded, 2)
            current_group_price = round(current_credit_unrounded, 2)
            group_pl = round(total_credit_received - current_group_price, 2)

            if total_credit_received != 0:
                percent_credit_received = int((group_pl / total_credit_received) * 100)
            else:
                percent_credit_received = None

            # total delta should be expressed as the sum of individual option
            # deltas without any additional scaling. Each position's delta is
            # already reported as a decimal value (e.g. 0.5 for 50 deltas), so
            # we simply sum the computed deltas for the group and round to two
            # decimals.
            total_delta = round(delta_sum_unrounded, 2)

            groups_list.append({
                "underlying_symbol": underlying,
                "expires_at": expires,
                "total_credit_received": total_credit_received,
                "current_group_price": current_group_price,
                "group_approximate_p_l": group_pl,
                "percent_credit_received": percent_credit_received,
                "total_delta": total_delta,
                "positions": plist,
            })

        def root_symbol(sym: str) -> str:
            if sym and sym.startswith("/"):
                return re.sub(r"[FGHJKMNQUVXZ]\d+$", "", sym)
            return sym

        unique_roots = sorted({root_symbol(g["underlying_symbol"]) for g in groups_list if g["underlying_symbol"]})
        vol_map: Dict[str, Optional[float]] = {}
        if unique_roots:
            try:
                vol_data = tastytrade.fetch_volatility_data(token, unique_roots)
                for item in vol_data:
                    sym = item.get("symbol")
                    iv = item.get("implied-volatility-index-rank")
                    if sym is not None and iv is not None:
                        try:
                            vol_map[sym] = round(float(iv) * 100, 1)
                        except (ValueError, TypeError):
                            vol_map[sym] = None
            except Exception as e:
                logging.error(f"Failed to fetch volatility data: {e}")
        for g in groups_list:
            g["iv_rank"] = vol_map.get(root_symbol(g["underlying_symbol"]))

        if groups_list:
            accounts_data.append({
                "account_number": acct_num,
                "nickname": nickname,
                "groups": groups_list,
            })

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
