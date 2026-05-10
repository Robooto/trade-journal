import logging
import re
from collections import defaultdict
from typing import Any, Dict, List, Tuple, Set, Optional
from datetime import datetime

from sqlalchemy.orm import Session
from pydantic import BaseModel

from app import tastytrade
from app.services.trades_errors import TastytradeAuthError, TastytradeFetchError
from app.services.strategy_classifier import classify_strategy


def _as_tasty_dict(value: Any, *, by_alias: bool = True) -> dict:
    if isinstance(value, BaseModel):
        return value.model_dump(by_alias=by_alias, exclude_none=True)
    return dict(value)


def _optional_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _quantity_multiplier(position: dict) -> tuple[int, int]:
    try:
        quantity = int(position.get("quantity", 1))
    except (TypeError, ValueError):
        quantity = 1
    try:
        multiplier = int(position.get("multiplier", 1))
    except (TypeError, ValueError):
        multiplier = 1
    return quantity, multiplier


def _direction_sign(quantity_direction: Optional[str]) -> int:
    return -1 if (quantity_direction or "").strip().lower() == "short" else 1


def _brokerage_greek_total(value: float) -> int:
    return int(round(value * 100))


def _optional_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _numeric_field(data: dict, *keys: str) -> Optional[float]:
    for key in keys:
        value = _optional_float(data.get(key))
        if value is not None:
            return value
    return None


def _compact_dict(data: dict) -> dict:
    return {key: value for key, value in data.items() if value is not None}


def extract_expiration_date(expires_at: str) -> str:
    """
    Extract just the date part from an expiration timestamp, ignoring time.
    
    Args:
        expires_at: ISO format timestamp like "2025-08-15T20:15:00.000+00:00"
    
    Returns:
        Date string like "2025-08-15" or original string if parsing fails
    """
    if not expires_at:
        return expires_at
    
    try:
        # Parse the ISO format timestamp and extract just the date
        dt = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d')
    except (ValueError, AttributeError):
        # If parsing fails, try to extract date with simple string manipulation
        if 'T' in expires_at:
            return expires_at.split('T')[0]
        return expires_at


def parse_equity_option_symbol(symbol: str) -> Tuple[Optional[float], Optional[str]]:
    """
    Parse OCC-formatted equity option symbol to extract strike and option type.
    
    Format: ROOT(6 chars, padded) + YYMMDD + C/P + Strike(8 digits)
    Example: AAPL  220617C00150000
    
    Returns:
        Tuple of (strike_price, option_type) or (None, None) if parsing fails
    """
    if not symbol or len(symbol) < 21:  # Minimum length for OCC format
        return None, None
    
    try:
        # Extract the last 9 characters (option type + 8-digit strike)
        option_suffix = symbol[-9:]
        option_type = option_suffix[0]  # C or P
        strike_str = option_suffix[1:]  # 8-digit strike
        
        if option_type not in ('C', 'P'):
            return None, None
            
        # Convert 8-digit strike to float (divide by 1000)
        strike_price = float(strike_str) / 1000.0
        
        return strike_price, option_type
    except (ValueError, IndexError):
        return None, None


def acquire_token(db: Session) -> str:
    """Authenticate and return a session token."""
    try:
        return tastytrade.get_active_token(db)
    except Exception as e:
        logging.error(f"Authentication to Tastytrade failed: {e}")
        raise TastytradeAuthError(f"Authentication to Tastytrade failed: {e}") from e


def fetch_accounts(token: str) -> List[dict]:
    """Fetch the list of accounts for the authenticated user."""
    try:
        return [
            _as_tasty_dict(account, by_alias=False)
            for account in tastytrade.fetch_accounts(token)
        ]
    except Exception as e:
        logging.error(f"Failed to fetch accounts: {e}")
        raise TastytradeFetchError(f"Failed to fetch accounts: {e}") from e


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
            raw_positions = [
                _as_tasty_dict(position)
                for position in tastytrade.fetch_positions(token, acct_num)
            ]
        except Exception as e:
            logging.error(f"Failed to fetch positions for account {acct_num}: {e}")
            raise TastytradeFetchError(
                f"Failed to fetch positions for account {acct_num}: {e}"
            ) from e

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

    for raw_item in md_list:
        item = _as_tasty_dict(raw_item)
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
                direction_sign = _direction_sign(qty_dir)
                quantity, multiplier = _quantity_multiplier(p)
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
                position_greek_sign = direction_sign * quantity * multiplier
                for greek in ("delta", "theta", "vega", "gamma", "rho"):
                    greek_value = _optional_float(md_item.get(greek))
                    if greek_value is not None:
                        md_item[f"computed_position_{greek}"] = round(
                            greek_value * position_greek_sign, 4
                        )
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
                
            # Parse strike and option type for Equity Options
            inst_type = p.get("instrument-type")
            if inst_type == "Equity Option" and sym:
                strike, option_type = parse_equity_option_symbol(sym)
                p["strike"] = strike
                p["option-type"] = option_type


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
        account_position_delta = 0.0
        account_theta = 0.0
        account_vega = 0.0
        account_gamma = 0.0
        account_rho = 0.0
        grouping: Dict[Tuple[str, str], List[dict]] = defaultdict(list)
        for p in pos_list:
            underlying = p.get("underlying-symbol", "") or ""
            expires_full = p.get("expires-at", "") or ""
            # Group by date only, ignoring time differences
            expires_date = extract_expiration_date(expires_full)
            grouping[(underlying, expires_date)].append(p)

        groups_list = []
        for (underlying, expires_date), plist in grouping.items():
            # Use the first position's full expires_at for display purposes
            # All positions in this group should have the same date, just potentially different times
            first_expires = plist[0].get("expires-at", "") if plist else expires_date
            total_credit_unrounded = 0.0
            current_price_unrounded = 0.0
            delta_sum_unrounded = 0.0
            position_delta_sum_unrounded = 0.0
            theta_sum_unrounded = 0.0
            vega_sum_unrounded = 0.0
            gamma_sum_unrounded = 0.0
            rho_sum_unrounded = 0.0

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
                position_delta = _optional_float(md.get("computed_position_delta"))
                if position_delta is not None:
                    position_delta_sum_unrounded += position_delta
                theta = _optional_float(md.get("computed_position_theta"))
                if theta is not None:
                    theta_sum_unrounded += theta
                vega = _optional_float(md.get("computed_position_vega"))
                if vega is not None:
                    vega_sum_unrounded += vega
                gamma = _optional_float(md.get("computed_position_gamma"))
                if gamma is not None:
                    gamma_sum_unrounded += gamma
                rho = _optional_float(md.get("computed_position_rho"))
                if rho is not None:
                    rho_sum_unrounded += rho

            total_credit_received = round(total_credit_unrounded * multiplier, 2)
            current_group_p_l = round(current_price_unrounded, 2)
            if total_credit_received != 0:
                percent_credit_received = int((current_group_p_l / abs(total_credit_received)) * 100)
            else:
                percent_credit_received = None

            total_delta = round(delta_sum_unrounded, 2)
            total_position_delta = _brokerage_greek_total(position_delta_sum_unrounded)
            total_theta = _brokerage_greek_total(theta_sum_unrounded)
            total_vega = _brokerage_greek_total(vega_sum_unrounded)
            total_gamma = _brokerage_greek_total(gamma_sum_unrounded)
            total_rho = _brokerage_greek_total(rho_sum_unrounded)
            account_position_delta += total_position_delta
            account_theta += total_theta
            account_vega += total_vega
            account_gamma += total_gamma
            account_rho += total_rho

            beta_val = beta_map.get(underlying)
            beta_delta = None
            if beta_val is not None:
                beta_delta = round(beta_val * total_delta, 2)
                account_beta_delta += beta_delta

            groups_list.append({
                "underlying_symbol": underlying,
                "expires_at": first_expires,  # Use the full timestamp from first position
                "total_credit_received": total_credit_received,
                "current_group_p_l": current_group_p_l,
                "percent_credit_received": percent_credit_received,
                "total_delta": total_delta,
                "total_position_delta": total_position_delta,
                "total_theta": total_theta,
                "total_vega": total_vega,
                "total_gamma": total_gamma,
                "total_rho": total_rho,
                "beta_delta": beta_delta,
                "positions": plist,
            })

        accounts_data.append({
            "account_number": acct_num,
            "nickname": nickname,
            "groups": groups_list,
            "total_beta_delta": round(account_beta_delta, 2),
            "total_position_delta": int(round(account_position_delta)),
            "total_theta": int(round(account_theta)),
            "total_vega": int(round(account_vega)),
            "total_gamma": int(round(account_gamma)),
            "total_rho": int(round(account_rho)),
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
                for raw_item in vol_data:
                    item = _as_tasty_dict(raw_item)
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
            bal = _as_tasty_dict(tastytrade.fetch_account_balance(token, acct_num))
            used = bal.get("used-derivative-buying-power")
            deriv = bal.get("margin-equity")
            if used is not None and deriv is not None:
                denom = float(deriv)
                if denom:
                    percent_used_bp = int(float(used) / denom * 100)
        except Exception as e:
            logging.error(f"Failed to fetch balance for account {acct_num}: {e}")

        acct["percent_used_bp"] = percent_used_bp


def build_market_data_summary(items: List[Any], requested_symbols: List[str]) -> dict:
    """Return a compact, numeric market data payload suitable for LLM context."""
    normalized = []
    seen_symbols = set()

    for raw_item in items:
        item = _as_tasty_dict(raw_item)
        symbol = item.get("symbol")
        if not symbol:
            continue
        seen_symbols.add(symbol)
        normalized.append(_compact_dict({
            "symbol": symbol,
            "mark": _numeric_field(item, "mark"),
            "open": _numeric_field(item, "open"),
            "close": _numeric_field(item, "close"),
            "bid": _numeric_field(item, "bid"),
            "ask": _numeric_field(item, "ask"),
            "last": _numeric_field(item, "last", "last-price"),
            "beta": _numeric_field(item, "beta"),
            "delta": _numeric_field(item, "delta"),
            "theta": _numeric_field(item, "theta"),
            "vega": _numeric_field(item, "vega"),
            "gamma": _numeric_field(item, "gamma"),
            "rho": _numeric_field(item, "rho"),
            "implied_volatility": _numeric_field(
                item,
                "implied-volatility",
                "implied-volatility-index",
                "volatility",
            ),
        }))

    return {
        "items": normalized,
        "requested_symbols": requested_symbols,
        "missing_symbols": [
            symbol for symbol in requested_symbols if symbol not in seen_symbols
        ],
    }


def build_volatility_data_summary(items: List[Any], requested_symbols: List[str]) -> dict:
    """Return compact volatility data with percentages already scaled for humans."""
    normalized = []
    seen_symbols = set()

    for raw_item in items:
        item = _as_tasty_dict(raw_item)
        symbol = item.get("symbol")
        if not symbol:
            continue
        seen_symbols.add(symbol)
        iv_rank = _numeric_field(item, "implied-volatility-index-rank")
        iv_change = _numeric_field(item, "implied-volatility-index-5-day-change")
        normalized.append(_compact_dict({
            "symbol": symbol,
            "iv_rank_percent": round(iv_rank * 100, 1) if iv_rank is not None else None,
            "iv_5d_change_percent": round(iv_change * 100, 2) if iv_change is not None else None,
        }))

    return {
        "items": normalized,
        "requested_symbols": requested_symbols,
        "missing_symbols": [
            symbol for symbol in requested_symbols if symbol not in seen_symbols
        ],
    }


def build_llm_positions_summary(accounts_data: List[dict]) -> dict:
    """Strip broker-specific nesting from grouped positions for LLM consumers."""
    accounts = []
    portfolio = {
        "account_count": 0,
        "group_count": 0,
        "position_count": 0,
        "percent_used_bp": None,
        "total_beta_delta": 0.0,
        "total_position_delta": 0,
        "theta": 0,
        "vega": 0,
        "gamma": 0,
        "rho": 0,
    }
    percent_used_values = []

    for account in accounts_data:
        portfolio["account_count"] += 1
        if account.get("percent_used_bp") is not None:
            percent_used_values.append(account["percent_used_bp"])
        portfolio["total_beta_delta"] += account.get("total_beta_delta") or 0
        portfolio["total_position_delta"] += account.get("total_position_delta") or 0
        portfolio["theta"] += account.get("total_theta") or 0
        portfolio["vega"] += account.get("total_vega") or 0
        portfolio["gamma"] += account.get("total_gamma") or 0
        portfolio["rho"] += account.get("total_rho") or 0

        groups = []
        positions_by_underlying: dict[str, list[dict]] = defaultdict(list)
        for group in account.get("groups", []):
            portfolio["group_count"] += 1
            positions = []
            for position in group.get("positions", []):
                portfolio["position_count"] += 1
                underlying = position.get("underlying-symbol") or group.get("underlying_symbol", "")
                if underlying:
                    positions_by_underlying[underlying].append(position)
                market_data = position.get("market_data", {})
                positions.append(_compact_dict({
                    "symbol": position.get("symbol") or position.get("instrument-symbol"),
                    "instrument_type": position.get("instrument-type"),
                    "underlying_symbol": position.get("underlying-symbol"),
                    "expiration_date": extract_expiration_date(position.get("expires-at", "")),
                    "quantity": _optional_int(position.get("quantity")),
                    "quantity_direction": position.get("quantity-direction"),
                    "multiplier": _optional_int(position.get("multiplier")),
                    "average_open_price": _numeric_field(position, "average-open-price"),
                    "mark": _numeric_field(market_data, "mark"),
                    "approximate_pl": _numeric_field(position, "approximate-p-l"),
                    "strike": _numeric_field(position, "strike"),
                    "option_type": position.get("option-type"),
                    "delta": _numeric_field(market_data, "computed_position_delta", "delta"),
                    "theta": _numeric_field(market_data, "computed_position_theta", "theta"),
                    "vega": _numeric_field(market_data, "computed_position_vega", "vega"),
                    "gamma": _numeric_field(market_data, "computed_position_gamma", "gamma"),
                    "rho": _numeric_field(market_data, "computed_position_rho", "rho"),
                }))

            groups.append(_compact_dict({
                "underlying_symbol": group.get("underlying_symbol", ""),
                "expiration_date": extract_expiration_date(group.get("expires_at", "")),
                "total_credit_received": group.get("total_credit_received", 0),
                "current_pl": group.get("current_group_p_l", 0),
                "percent_credit_received": group.get("percent_credit_received"),
                "total_delta": group.get("total_delta"),
                "total_position_delta": group.get("total_position_delta"),
                "beta_delta": group.get("beta_delta"),
                "theta": group.get("total_theta"),
                "vega": group.get("total_vega"),
                "gamma": group.get("total_gamma"),
                "rho": group.get("total_rho"),
                "iv_rank_percent": group.get("iv_rank"),
                "iv_5d_change_percent": group.get("iv_5d_change"),
                "strategy": classify_strategy(group.get("positions", [])),
                "positions": positions,
            }))

        underlying_strategies = []
        for underlying_symbol, underlying_positions in sorted(positions_by_underlying.items()):
            strategy = classify_strategy(underlying_positions)
            if strategy["label"] == "unknown":
                continue
            expiration_dates = sorted({
                extract_expiration_date(position.get("expires-at", ""))
                for position in underlying_positions
                if position.get("expires-at")
            })
            underlying_strategies.append({
                "underlying_symbol": underlying_symbol,
                "leg_count": len(underlying_positions),
                "expiration_dates": expiration_dates,
                **strategy,
            })

        accounts.append(_compact_dict({
            "account_number": account.get("account_number", ""),
            "nickname": account.get("nickname", ""),
            "percent_used_bp": account.get("percent_used_bp"),
            "total_beta_delta": account.get("total_beta_delta"),
            "total_position_delta": account.get("total_position_delta"),
            "theta": account.get("total_theta"),
            "vega": account.get("total_vega"),
            "gamma": account.get("total_gamma"),
            "rho": account.get("total_rho"),
            "underlying_strategies": underlying_strategies,
            "groups": groups,
        }))

    if percent_used_values:
        portfolio["percent_used_bp"] = max(percent_used_values)
    portfolio["total_beta_delta"] = round(portfolio["total_beta_delta"], 2)

    units = {
        "mark": "price",
        "close": "price",
        "average_open_price": "price",
        "total_credit_received": "dollars",
        "current_pl": "dollars",
        "approximate_pl": "dollars",
        "percent_used_bp": "percent",
        "percent_credit_received": "percent",
        "iv_rank_percent": "percent",
        "iv_5d_change_percent": "percent",
        "total_delta": "raw option delta sum",
        "total_position_delta": "brokerage display integer",
        "theta": "brokerage display integer",
        "vega": "brokerage display integer",
        "gamma": "brokerage display integer",
        "rho": "brokerage display integer",
        "beta_delta": "SPY beta weighted delta",
    }

    return {
        "portfolio": _compact_dict(portfolio),
        "units": units,
        "accounts": accounts,
    }
