import logging
import re
from collections import defaultdict
from typing import Dict, List, Tuple, Set

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import tastytrade


def acquire_token(db: Session) -> str:
    """Authenticate and return a session token."""
    try:
        return tastytrade.get_active_token(db)
    except Exception as e:
        logging.error(f"Authentication to Tastytrade failed: {e}")
        raise HTTPException(status_code=500, detail=f"Authentication to Tastytrade failed: {e}")


def fetch_accounts(token: str) -> List[dict]:
    """Fetch the list of accounts for the authenticated user."""
    try:
        return tastytrade.fetch_accounts(token)
    except Exception as e:
        logging.error(f"Failed to fetch accounts: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch accounts: {e}")


def collect_positions_and_symbols(
    token: str, accounts: List[dict]
) -> Tuple[List[dict], Set[str], Set[str], Set[str], Set[str]]:
    """Fetch positions per account and gather unique symbols."""
    positions_by_account: List[dict] = []
    equity_option_syms: Set[str] = set()
    future_option_syms: Set[str] = set()
    equity_underlyings: Set[str] = set()
    future_underlyings: Set[str] = set()

    for acct in accounts:
        acct_num = acct.get("account_number")
        nickname = acct.get("nickname", "")
        try:
            raw_positions = tastytrade.fetch_positions(token, acct_num)
        except Exception as e:
            logging.error(f"Failed to fetch positions for account {acct_num}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch positions for account {acct_num}: {e}")

        filtered = [p for p in raw_positions if p.get("instrument-type", "") != "Equity"]
        if not filtered:
            continue

        augmented: List[dict] = []
        for pos in filtered:
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

    return (
        positions_by_account,
        equity_option_syms,
        future_option_syms,
        equity_underlyings,
        future_underlyings,
    )


def fetch_market_and_beta_data(
    token: str,
    equity_option_syms: Set[str],
    future_option_syms: Set[str],
    equity_underlyings: Set[str],
    future_underlyings: Set[str],
) -> Tuple[Dict[str, dict], Dict[str, float]]:
    """Retrieve option market data and underlying beta values in one request."""

    market_map: Dict[str, dict] = {}
    beta_map: Dict[str, float] = {}

    symbols_present = (
        equity_option_syms
        or future_option_syms
        or equity_underlyings
        or future_underlyings
    )
    if not symbols_present:
        return market_map, beta_map

    try:
        md_list = tastytrade.fetch_market_data(
            token,
            sorted(equity_underlyings),
            sorted(equity_option_syms),
            sorted(future_underlyings),
            sorted(future_option_syms),
        )
    except Exception as e:
        logging.error(f"Failed to fetch market/beta data: {e}")
        return market_map, beta_map

    for item in md_list:
        sym = item.get("symbol")
        if not sym:
            continue
        if sym in equity_option_syms or sym in future_option_syms:
            market_map[sym] = item
        beta_val = item.get("beta")
        if beta_val is not None and (sym in equity_underlyings or sym in future_underlyings):
            try:
                beta_map[sym] = float(beta_val)
            except (ValueError, TypeError):
                pass

    return market_map, beta_map


def augment_positions_with_market_data(
    positions_by_account: List[dict], market_map: Dict[str, dict], beta_map: Dict[str, float]
) -> None:
    """Attach market data, compute P/L and beta for each position."""
    for acct in positions_by_account:
        for p in acct["positions"]:
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
                if qty_dir == "Long":
                    approximate_pl = (mark - avg_open) * quantity * multiplier
                else:
                    approximate_pl = (avg_open - mark) * quantity * multiplier

            p["approximate-p-l"] = round(approximate_pl, 2)

            underlying_sym = p.get("underlying-symbol")
            if underlying_sym in beta_map:
                p["beta"] = beta_map[underlying_sym]


def group_positions_and_compute_totals(
    positions_by_account: List[dict], beta_map: Dict[str, float]
) -> List[dict]:
    """Group positions by underlying and expiration and compute totals."""
    accounts_data: List[dict] = []

    for acct in positions_by_account:
        acct_num = acct["account_number"]
        nickname = acct["nickname"]
        pos_list = acct["positions"]

        account_beta_delta = 0.0
        grouping: Dict[Tuple[str, str], List[dict]] = defaultdict(list)
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
                    qty = int(p.get("quantity", 1))
                except (ValueError, TypeError):
                    qty = 1
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
                total_credit_unrounded += sign * avg_open * qty
                current_price_unrounded += pl_val

                md = p.get("market_data", {})
                try:
                    delta_sum_unrounded += float(md.get("computed_delta", 0))
                except (TypeError, ValueError):
                    pass

            total_credit_received = round(total_credit_unrounded * multiplier, 2)
            current_group_p_l = round(current_price_unrounded, 2)
            if total_credit_received != 0:
                percent_credit_received = int((current_group_p_l / abs(total_credit_received)) * 100)
            else:
                percent_credit_received = None

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

        accounts_data.append({
            "account_number": acct_num,
            "nickname": nickname,
            "groups": groups_list,
            "total_beta_delta": round(account_beta_delta, 2),
        })

    return accounts_data


def _root_symbol(sym: str) -> str:
    if sym and sym.startswith("/"):
        return re.sub(r"[FGHJKMNQUVXZ]\d+$", "", sym)
    return sym


def apply_volatility(token: str, accounts_data: List[dict]) -> None:
    """Augment groups with implied volatility information."""

    for acct in accounts_data:
        acct_num = acct["account_number"]
        groups_list = acct["groups"]

        unique_roots = sorted({_root_symbol(g["underlying_symbol"]) for g in groups_list if g["underlying_symbol"]})
        vol_rank_map: Dict[str, float] = {}
        vol_change_map: Dict[str, float] = {}
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
            root = _root_symbol(g["underlying_symbol"])
            g["iv_rank"] = vol_rank_map.get(root)
            g["iv_5d_change"] = vol_change_map.get(root)


def apply_balance(token: str, accounts_data: List[dict]) -> None:
    """Attach margin balance usage to each account."""

    for acct in accounts_data:
        acct_num = acct["account_number"]

        percent_used_bp = None
        try:
            bal = tastytrade.fetch_account_balance(token, acct_num)
            used = bal.get("used-derivative-buying-power")
            deriv = bal.get("margin-equity")
            if used is not None and deriv is not None:
                denom = float(deriv)
                if denom:
                    percent_used_bp = int(float(used) / denom * 100)
        except Exception as e:
            logging.error(f"Failed to fetch balance for account {acct_num}: {e}")

        acct["percent_used_bp"] = percent_used_bp


