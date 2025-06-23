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
         - total_credit_received using the quantity direction sign and group multiplier
        - current_group_p_l as the sum of the positions' approximate P/L values
        - percent_credit_received = int((current_group_p_l / total_credit_received) * 100), or None
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
    equity_underlyings: set[str] = set()
    future_underlyings: set[str] = set()

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

            underlying = p.get("underlying-symbol")
            if underlying:
                if underlying.startswith("/"):
                    future_underlyings.add(underlying)
                else:
                    equity_underlyings.add(underlying)

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

    # Fetch betas for unique underlyings
    beta_map: Dict[str, float] = {}
    if equity_underlyings or future_underlyings:
        try:
            md_list = tastytrade.fetch_market_data(
                token,
                sorted(equity_underlyings),
                [],
                sorted(future_underlyings),
                [],
            )
            for item in md_list:
                sym = item.get("symbol")
                beta_val = item.get("beta")
                if sym is not None and beta_val is not None:
                    try:
                        beta_map[sym] = float(beta_val)
                    except (ValueError, TypeError):
                        pass
        except Exception as e:
            logging.error(f"Failed to fetch beta data: {e}")

    # Build response per account with groups and market/volatility data
    accounts_data = []
    for acct in positions_by_account:
        acct_num = acct["account_number"]
        nickname = acct["nickname"]
        pos_list = acct["positions"]

        account_beta_delta = 0.0

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
                        md_item["computed_delta"] = round(sign * delta_float, 2)
            else:
                md_item = {}

            p["market_data"] = md_item

            try:
                avg_open = float(p.get("average-open-price", "0"))
                mark = float(md_item.get("mark"))
                quantity = int(p.get("quantity", 1))
                multiplier = int(p.get("multiplier", 1))
                qty_dir = p.get("quantity-direction")
            except (TypeError, ValueError):
                approximate_pl = 0.0
            else:
                # Long positions profit when the mark is above the open price,
                # while short positions profit when the mark is below.  If the
                # direction is missing, fall back to the short calculation so
                # the value remains negative when mark > average price.
                if qty_dir == "Long":
                    approximate_pl = (mark - avg_open) * quantity * multiplier
                else:
                    approximate_pl = (avg_open - mark) * quantity * multiplier

            p["approximate-p-l"] = round(approximate_pl, 2)
            underlying_sym = p.get("underlying-symbol")
            if underlying_sym in beta_map:
                p["beta"] = beta_map[underlying_sym]

        grouping: Dict[Tuple[str, str], List[Dict]] = defaultdict(list)
        for p in pos_list:
            underlying = p.get("underlying-symbol", "") or ""
            expires = p.get("expires-at", "") or ""
            grouping[(underlying, expires)].append(p)

        groups_list = []
        for (underlying, expires), plist in grouping.items():
            total_credit_unrounded = 0.0
            current_price_unrounded = 0.0
            delta_sum_unrounded = 0.0

            multiplier = 1
            for idx, p in enumerate(plist):
                qty_dir = p.get("quantity-direction")
                try:
                    avg_open = float(p.get("average-open-price", "0"))
                except (ValueError, TypeError):
                    avg_open = 0.0
                try:
                    pl_val = float(p.get("approximate-p-l", 0))
                except (ValueError, TypeError):
                    pl_val = 0.0

                if idx == 0:
                    try:
                        multiplier = int(p.get("multiplier", 1))
                    except (TypeError, ValueError):
                        multiplier = 1

                sign = -1 if qty_dir == "Long" else 1
                total_credit_unrounded += sign * avg_open
                current_price_unrounded += pl_val

                md = p.get("market_data", {})
                try:
                    delta_sum_unrounded += float(md.get("computed_delta", 0))
                except (TypeError, ValueError):
                    pass

            total_credit_received = round(total_credit_unrounded * multiplier, 2)
            current_group_p_l = round(current_price_unrounded, 2)
            if total_credit_received != 0:
                percent_credit_received = int((current_group_p_l / total_credit_received) * 100)
            else:
                percent_credit_received = None

            # total delta should be expressed as the sum of individual option
            # deltas without any additional scaling. Each position's delta is
            # already reported as a decimal value (e.g. 0.5 for 50 deltas), so
            # we simply sum the computed deltas for the group and round to two
            # decimals.
            total_delta = round(delta_sum_unrounded, 2)

            beta_val = beta_map.get(underlying)
            beta_delta = None
            if beta_val is not None:
                beta_delta = round(beta_val * total_delta, 2)
                account_beta_delta += beta_delta

            groups_list.append({
                "underlying_symbol": underlying,
                "expires_at": expires,
                "total_credit_received": total_credit_received,
                "current_group_p_l": current_group_p_l,
                "percent_credit_received": percent_credit_received,
                "total_delta": total_delta,
                "beta_delta": beta_delta,
                "positions": plist,
            })

        def root_symbol(sym: str) -> str:
            if sym and sym.startswith("/"):
                return re.sub(r"[FGHJKMNQUVXZ]\d+$", "", sym)
            return sym

        unique_roots = sorted({root_symbol(g["underlying_symbol"]) for g in groups_list if g["underlying_symbol"]})
        vol_rank_map: Dict[str, Optional[float]] = {}
        vol_change_map: Dict[str, Optional[float]] = {}
        if unique_roots:
            try:
                vol_data = tastytrade.fetch_volatility_data(token, unique_roots)
                for item in vol_data:
                    sym = item.get("symbol")
                    iv = item.get("implied-volatility-index-rank")
                    change = item.get("implied-volatility-index-5-day-change")
                    if sym is not None:
                        if iv is not None:
                            try:
                                vol_rank_map[sym] = round(float(iv) * 100, 1)
                            except (ValueError, TypeError):
                                vol_rank_map[sym] = None
                        if change is not None:
                            try:
                                vol_change_map[sym] = round(float(change) * 100, 2)
                            except (ValueError, TypeError):
                                vol_change_map[sym] = None
            except Exception as e:
                logging.error(f"Failed to fetch volatility data: {e}")
        for g in groups_list:
            root = root_symbol(g["underlying_symbol"])
            g["iv_rank"] = vol_rank_map.get(root)
            g["iv_5d_change"] = vol_change_map.get(root)

        percent_used_bp = None
        try:
            bal = tastytrade.fetch_account_balance(token, acct_num)
            used = bal.get("used-derivative-buying-power")
            deriv = bal.get("derivative-buying-power")
            equity_bp = bal.get("equity-buying-power")
            if used is not None and deriv is not None and equity_bp is not None:
                denom = float(deriv) + float(equity_bp)
                if denom:
                    percent_used_bp = int(float(used) / denom * 100)
        except Exception as e:
            logging.error(f"Failed to fetch balance for account {acct_num}: {e}")

        if groups_list:
            accounts_data.append({
                "account_number": acct_num,
                "nickname": nickname,
                "groups": groups_list,
                "total_beta_delta": round(account_beta_delta, 2),
                "percent_used_bp": percent_used_bp,
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
