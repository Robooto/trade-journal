import logging
import re
from collections import defaultdict
from typing import Any, Dict, List, Tuple, Set, Optional
from datetime import date, datetime

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
    default_multiplier = 100 if "Option" in (position.get("instrument-type") or "") else 1
    try:
        multiplier = int(position.get("multiplier") or default_multiplier)
    except (TypeError, ValueError):
        multiplier = default_multiplier
    return quantity, multiplier


def _direction_sign(quantity_direction: Optional[str]) -> int:
    return -1 if (quantity_direction or "").strip().lower() == "short" else 1


def _brokerage_greek_total(value: float) -> int:
    return int(round(value))


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


def days_to_expiration(expires_at: str, today: Optional[date] = None) -> Optional[int]:
    expiration_date = extract_expiration_date(expires_at)
    if not expiration_date:
        return None
    try:
        expires_on = date.fromisoformat(expiration_date)
    except ValueError:
        return None
    today = today or datetime.now().date()
    return (expires_on - today).days


def _signed_credit_value(position: dict, price: Optional[float]) -> Optional[float]:
    if price is None:
        return None
    quantity, multiplier = _quantity_multiplier(position)
    value = price * quantity * multiplier
    return value if (position.get("quantity-direction") or "").strip().lower() == "short" else -value


def _position_money_fields(position: dict) -> dict[str, Optional[float]]:
    avg_open = _numeric_field(position, "average-open-price")
    mark = _numeric_field(position.get("market_data", {}), "mark")
    quantity, multiplier = _quantity_multiplier(position)
    open_value = avg_open * quantity * multiplier if avg_open is not None else None
    current_value = mark * quantity * multiplier if mark is not None else None
    signed_open = _signed_credit_value(position, avg_open)
    signed_current = _signed_credit_value(position, mark)
    unrealized = None
    if signed_open is not None and signed_current is not None:
        unrealized = signed_open - signed_current
    return {
        "open_value_dollars": round(open_value, 2) if open_value is not None else None,
        "current_value_dollars": round(current_value, 2) if current_value is not None else None,
        "net_open_credit_or_debit_dollars": round(signed_open, 2) if signed_open is not None else None,
        "net_current_value_dollars": round(signed_current, 2) if signed_current is not None else None,
        "unrealized_pl_dollars": round(unrealized, 2) if unrealized is not None else None,
    }


def _assignment_exposure(position: dict) -> Optional[float]:
    if (
        position.get("option-type") != "P"
        or (position.get("quantity-direction") or "").strip().lower() != "short"
    ):
        return None
    strike = _numeric_field(position, "strike")
    if strike is None:
        return None
    quantity, multiplier = _quantity_multiplier(position)
    return round(strike * quantity * multiplier, 2)


def _spread_percent(position: dict) -> Optional[float]:
    market_data = position.get("market_data", {})
    bid = _numeric_field(market_data, "bid")
    ask = _numeric_field(market_data, "ask")
    mark = _numeric_field(market_data, "mark")
    if bid is None or ask is None or mark is None or mark == 0:
        return None
    return abs(ask - bid) / abs(mark) * 100


def _management_flags(
    *,
    strategy_label: str,
    days_to_nearest_expiration: Optional[int],
    percent_credit_captured: Optional[float],
    beta_delta_shares: Optional[float],
    theta_dollars_per_day: Optional[float],
    vega_dollars_per_vol_point: Optional[float],
    assignment_exposure_dollars: Optional[float],
    positions: list[dict],
) -> list[str]:
    flags = []
    if percent_credit_captured is not None and 45 <= percent_credit_captured < 60:
        flags.append("near_50_percent_profit")
    if days_to_nearest_expiration is not None and days_to_nearest_expiration <= 14:
        flags.append("expires_within_14_days")
    if beta_delta_shares is not None and abs(beta_delta_shares) >= 100:
        flags.append("high_beta_underlying")
    if vega_dollars_per_vol_point is not None and vega_dollars_per_vol_point < 0:
        flags.append("short_vega")
    if vega_dollars_per_vol_point is not None and vega_dollars_per_vol_point > 0:
        flags.append("positive_vega")
    if theta_dollars_per_day is not None and theta_dollars_per_day < 0:
        flags.append("negative_theta")
    if any((_spread_percent(position) or 0) >= 25 for position in positions):
        flags.append("wide_bid_ask_spread")
    if strategy_label == "unknown":
        flags.append("unknown_strategy")
    if assignment_exposure_dollars:
        flags.append("assignment_exposure")
    if days_to_nearest_expiration is not None and days_to_nearest_expiration <= 21:
        flags.append("watch_front_expiration")
    return flags


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
                quantity, multiplier = _quantity_multiplier(p)
                qty_dir = p.get("quantity-direction")
            except (TypeError, ValueError):
                approximate_pl = 0.0
            else:
                if qty_dir == "Long":
                    approximate_pl = (mark - avg_open) * quantity * multiplier
                else:
                    approximate_pl = (avg_open - mark) * quantity * multiplier

            p["approximate-p-l"] = round(approximate_pl, 2)
            p.update({
                key.replace("_", "-"): value
                for key, value in _position_money_fields(p).items()
                if value is not None
            })

            underlying_sym = p.get("underlying-symbol")
            if underlying_sym in beta_map:
                p["beta"] = beta_map[underlying_sym]
                
            # Parse strike and option type for Equity Options
            inst_type = p.get("instrument-type")
            if inst_type == "Equity Option" and sym:
                strike, option_type = parse_equity_option_symbol(sym)
                if strike is not None:
                    p["strike"] = strike
                if option_type is not None:
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
        account_beta_delta_shares = 0.0
        account_delta_shares = 0.0
        account_theta_dollars_per_day = 0.0
        account_vega_dollars_per_vol_point = 0.0
        account_gamma_display = 0.0
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
            total_open_value_dollars = 0.0
            total_current_value_dollars = 0.0
            total_signed_current_value_dollars = 0.0
            total_unrealized_pl_dollars = 0.0
            total_assignment_exposure_dollars = 0.0
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
                    _, multiplier = _quantity_multiplier(p)

                sign = -1 if qty_dir == "Long" else 1
                total_credit_unrounded += sign * avg_open * qty
                current_price_unrounded += pl_val
                money_fields = _position_money_fields(p)
                total_open_value_dollars += money_fields.get("open_value_dollars") or 0
                total_current_value_dollars += money_fields.get("current_value_dollars") or 0
                total_signed_current_value_dollars += money_fields.get("net_current_value_dollars") or 0
                total_unrealized_pl_dollars += money_fields.get("unrealized_pl_dollars") or 0
                total_assignment_exposure_dollars += _assignment_exposure(p) or 0

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
            delta_shares = round(position_delta_sum_unrounded, 2)
            theta_dollars_per_day = round(theta_sum_unrounded, 2)
            vega_dollars_per_vol_point = round(vega_sum_unrounded, 2)
            gamma_display = round(gamma_sum_unrounded, 4)
            total_position_delta = _brokerage_greek_total(position_delta_sum_unrounded)
            total_theta = _brokerage_greek_total(theta_sum_unrounded)
            total_vega = _brokerage_greek_total(vega_sum_unrounded)
            total_gamma = _brokerage_greek_total(gamma_sum_unrounded)
            total_rho = _brokerage_greek_total(rho_sum_unrounded)
            account_delta_shares += delta_shares
            account_theta_dollars_per_day += theta_dollars_per_day
            account_vega_dollars_per_vol_point += vega_dollars_per_vol_point
            account_gamma_display += gamma_display
            account_position_delta += total_position_delta
            account_theta += total_theta
            account_vega += total_vega
            account_gamma += total_gamma
            account_rho += total_rho

            beta_val = beta_map.get(underlying)
            beta_delta = None
            beta_delta_shares = None
            if beta_val is not None:
                beta_delta = round(beta_val * total_delta, 2)
                beta_delta_shares = round(beta_val * delta_shares, 2)
                account_beta_delta += beta_delta
                account_beta_delta_shares += beta_delta_shares

            groups_list.append({
                "underlying_symbol": underlying,
                "expires_at": first_expires,  # Use the full timestamp from first position
                "total_credit_received": total_credit_received,
                "total_credit_points": round(total_credit_unrounded, 2),
                "total_credit_dollars": total_credit_received,
                "net_open_credit_or_debit_dollars": total_credit_received,
                "open_value_dollars": round(total_open_value_dollars, 2),
                "current_value_dollars": round(total_signed_current_value_dollars, 2),
                "gross_current_value_dollars": round(total_current_value_dollars, 2),
                "unrealized_pl_dollars": round(total_unrealized_pl_dollars, 2),
                "days_to_nearest_expiration": days_to_expiration(first_expires),
                "assignment_exposure_dollars": round(total_assignment_exposure_dollars, 2),
                "max_loss_dollars": None,
                "buying_power_effect_dollars": None,
                "current_group_p_l": current_group_p_l,
                "percent_credit_received": percent_credit_received,
                "percent_credit_captured": (
                    round((total_unrealized_pl_dollars / total_credit_received) * 100, 1)
                    if total_credit_received > 0
                    else None
                ),
                "percent_max_profit_or_target": None,
                "total_delta": total_delta,
                "delta_shares": delta_shares,
                "theta_dollars_per_day": theta_dollars_per_day,
                "vega_dollars_per_vol_point": vega_dollars_per_vol_point,
                "gamma_display": gamma_display,
                "total_position_delta": total_position_delta,
                "total_theta": total_theta,
                "total_vega": total_vega,
                "total_gamma": total_gamma,
                "total_rho": total_rho,
                "beta_delta": beta_delta,
                "beta_delta_raw": beta_delta,
                "beta_delta_shares": beta_delta_shares,
                "positions": plist,
            })

        accounts_data.append({
            "account_number": acct_num,
            "nickname": nickname,
            "groups": groups_list,
            "total_beta_delta": round(account_beta_delta, 2),
            "total_beta_delta_raw": round(account_beta_delta, 2),
            "total_beta_delta_shares": round(account_beta_delta_shares, 2),
            "delta_shares": round(account_delta_shares, 2),
            "theta_dollars_per_day": round(account_theta_dollars_per_day, 2),
            "vega_dollars_per_vol_point": round(account_vega_dollars_per_vol_point, 2),
            "gamma_display": round(account_gamma_display, 4),
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
        "strategy_group_count": 0,
        "position_count": 0,
        "percent_used_bp": None,
        "total_beta_delta": 0.0,
        "total_beta_delta_raw": 0.0,
        "total_beta_delta_shares": 0.0,
        "total_position_delta": 0,
        "delta_shares": 0,
        "theta_dollars_per_day": 0,
        "vega_dollars_per_vol_point": 0,
        "gamma_display": 0,
        "theta": 0,
        "vega": 0,
        "gamma": 0,
        "rho": 0,
        "unrealized_pl_dollars": 0.0,
        "assignment_exposure_dollars": 0.0,
        "max_loss_dollars": None,
        "buying_power_effect_dollars": None,
    }
    percent_used_values = []

    for account in accounts_data:
        portfolio["account_count"] += 1
        if account.get("percent_used_bp") is not None:
            percent_used_values.append(account["percent_used_bp"])
        portfolio["total_beta_delta"] += account.get("total_beta_delta") or 0
        portfolio["total_beta_delta_raw"] += account.get("total_beta_delta_raw") or account.get("total_beta_delta") or 0
        portfolio["total_beta_delta_shares"] += account.get("total_beta_delta_shares") or 0
        portfolio["total_position_delta"] += account.get("total_position_delta") or 0
        portfolio["delta_shares"] += account.get("delta_shares") or account.get("total_position_delta") or 0
        portfolio["theta_dollars_per_day"] += account.get("theta_dollars_per_day") or account.get("total_theta") or 0
        portfolio["vega_dollars_per_vol_point"] += account.get("vega_dollars_per_vol_point") or account.get("total_vega") or 0
        portfolio["gamma_display"] += account.get("gamma_display") or account.get("total_gamma") or 0
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
                money_fields = _position_money_fields(position)
                assignment_exposure_dollars = _assignment_exposure(position)
                positions.append(_compact_dict({
                    "symbol": position.get("symbol") or position.get("instrument-symbol"),
                    "instrument_type": position.get("instrument-type"),
                    "underlying_symbol": position.get("underlying-symbol") or underlying,
                    "expiration_date": extract_expiration_date(position.get("expires-at", "")),
                    "days_to_expiration": days_to_expiration(position.get("expires-at", "")),
                    "quantity": _optional_int(position.get("quantity")),
                    "quantity_direction": position.get("quantity-direction"),
                    "multiplier": _quantity_multiplier(position)[1],
                    "average_open_price": _numeric_field(position, "average-open-price"),
                    "mark": _numeric_field(market_data, "mark"),
                    **money_fields,
                    "approximate_pl": _numeric_field(position, "approximate-p-l"),
                    "strike": _numeric_field(position, "strike"),
                    "option_type": position.get("option-type"),
                    "delta_shares": _numeric_field(market_data, "computed_position_delta", "delta"),
                    "theta_dollars_per_day": _numeric_field(market_data, "computed_position_theta", "theta"),
                    "vega_dollars_per_vol_point": _numeric_field(market_data, "computed_position_vega", "vega"),
                    "gamma_display": _numeric_field(market_data, "computed_position_gamma", "gamma"),
                    "delta": _numeric_field(market_data, "computed_position_delta", "delta"),
                    "theta": _numeric_field(market_data, "computed_position_theta", "theta"),
                    "vega": _numeric_field(market_data, "computed_position_vega", "vega"),
                    "gamma": _numeric_field(market_data, "computed_position_gamma", "gamma"),
                    "rho": _numeric_field(market_data, "computed_position_rho", "rho"),
                    "assignment_exposure_dollars": assignment_exposure_dollars,
                    "max_loss_dollars": _numeric_field(position, "max-loss", "max_loss"),
                    "buying_power_effect_dollars": _numeric_field(
                        position,
                        "buying-power-effect",
                        "buying_power_effect",
                        "buying-power-effect-dollars",
                    ),
                }))

            strategy = classify_strategy(group.get("positions", []))
            management_flags = _management_flags(
                strategy_label=strategy["label"],
                days_to_nearest_expiration=group.get("days_to_nearest_expiration"),
                percent_credit_captured=group.get("percent_credit_captured"),
                beta_delta_shares=group.get("beta_delta_shares"),
                theta_dollars_per_day=group.get("theta_dollars_per_day", group.get("total_theta")),
                vega_dollars_per_vol_point=group.get("vega_dollars_per_vol_point", group.get("total_vega")),
                assignment_exposure_dollars=group.get("assignment_exposure_dollars"),
                positions=group.get("positions", []),
            )
            portfolio["unrealized_pl_dollars"] += group.get("unrealized_pl_dollars") or 0
            portfolio["assignment_exposure_dollars"] += group.get("assignment_exposure_dollars") or 0
            groups.append(_compact_dict({
                "underlying_symbol": group.get("underlying_symbol", ""),
                "expiration_date": extract_expiration_date(group.get("expires_at", "")),
                "total_credit_received": group.get("total_credit_received", 0),
                "total_credit_points": group.get("total_credit_points"),
                "total_credit_dollars": group.get("total_credit_dollars"),
                "net_open_credit_or_debit_dollars": group.get("net_open_credit_or_debit_dollars"),
                "open_value_dollars": group.get("open_value_dollars"),
                "current_value_dollars": group.get("current_value_dollars"),
                "gross_current_value_dollars": group.get("gross_current_value_dollars"),
                "unrealized_pl_dollars": group.get("unrealized_pl_dollars"),
                "days_to_nearest_expiration": group.get("days_to_nearest_expiration"),
                "assignment_exposure_dollars": group.get("assignment_exposure_dollars"),
                "max_loss_dollars": group.get("max_loss_dollars"),
                "buying_power_effect_dollars": group.get("buying_power_effect_dollars"),
                "current_pl": group.get("current_group_p_l", 0),
                "percent_credit_received": group.get("percent_credit_received"),
                "percent_credit_captured": group.get("percent_credit_captured"),
                "percent_max_profit_or_target": group.get("percent_max_profit_or_target"),
                "total_delta": group.get("total_delta"),
                "total_position_delta": group.get("total_position_delta"),
                "beta_delta": group.get("beta_delta"),
                "beta_delta_raw": group.get("beta_delta_raw"),
                "beta_delta_shares": group.get("beta_delta_shares"),
                "delta_shares": group.get("delta_shares", group.get("total_position_delta")),
                "theta_dollars_per_day": group.get("theta_dollars_per_day", group.get("total_theta")),
                "vega_dollars_per_vol_point": group.get("vega_dollars_per_vol_point", group.get("total_vega")),
                "gamma_display": group.get("gamma_display", group.get("total_gamma")),
                "theta": group.get("total_theta"),
                "vega": group.get("total_vega"),
                "gamma": group.get("total_gamma"),
                "rho": group.get("total_rho"),
                "iv_rank_percent": group.get("iv_rank"),
                "iv_5d_change_percent": group.get("iv_5d_change"),
                "strategy": strategy,
                "management_flags": management_flags,
                "positions": positions,
            }))

        underlying_strategies = []
        strategy_groups = []
        for underlying_symbol, underlying_positions in sorted(positions_by_underlying.items()):
            strategy = classify_strategy(underlying_positions)
            expiration_dates = sorted({
                extract_expiration_date(position.get("expires-at", ""))
                for position in underlying_positions
                if position.get("expires-at")
            })
            nearest_dte_values = [
                dte
                for dte in (days_to_expiration(position.get("expires-at", "")) for position in underlying_positions)
                if dte is not None
            ]
            total_open = round(sum(
                _position_money_fields(position).get("net_open_credit_or_debit_dollars") or 0
                for position in underlying_positions
            ), 2)
            total_current = round(sum(
                _position_money_fields(position).get("net_current_value_dollars") or 0
                for position in underlying_positions
            ), 2)
            total_unrealized = round(sum(
                _position_money_fields(position).get("unrealized_pl_dollars") or 0
                for position in underlying_positions
            ), 2)
            assignment_exposure = round(sum(
                _assignment_exposure(position) or 0 for position in underlying_positions
            ), 2)
            theta = int(round(sum(
                _numeric_field(position.get("market_data", {}), "computed_position_theta") or 0
                for position in underlying_positions
            )))
            vega = int(round(sum(
                _numeric_field(position.get("market_data", {}), "computed_position_vega") or 0
                for position in underlying_positions
            )))
            delta_shares = int(round(sum(
                _numeric_field(position.get("market_data", {}), "computed_position_delta") or 0
                for position in underlying_positions
            )))
            gamma = int(round(sum(
                _numeric_field(position.get("market_data", {}), "computed_position_gamma") or 0
                for position in underlying_positions
            )))
            beta = _numeric_field(underlying_positions[0], "beta") if underlying_positions else None
            beta_delta_shares = round(delta_shares * beta, 2) if beta is not None else None
            percent_credit_captured = (
                round((total_unrealized / total_open) * 100, 1) if total_open > 0 else None
            )
            nearest_dte = min(nearest_dte_values) if nearest_dte_values else None
            legs = []
            for position in underlying_positions:
                market_data = position.get("market_data", {})
                legs.append(_compact_dict({
                    "symbol": position.get("symbol") or position.get("instrument-symbol"),
                    "instrument_type": position.get("instrument-type"),
                    "underlying_symbol": position.get("underlying-symbol") or underlying_symbol,
                    "expiration_date": extract_expiration_date(position.get("expires-at", "")),
                    "days_to_expiration": days_to_expiration(position.get("expires-at", "")),
                    "quantity": _optional_int(position.get("quantity")),
                    "quantity_direction": position.get("quantity-direction"),
                    "multiplier": _quantity_multiplier(position)[1],
                    "strike": _numeric_field(position, "strike"),
                    "option_type": position.get("option-type"),
                    "average_open_price": _numeric_field(position, "average-open-price"),
                    "mark": _numeric_field(market_data, "mark"),
                    **_position_money_fields(position),
                    "approximate_pl": _numeric_field(position, "approximate-p-l"),
                    "delta_shares": _numeric_field(market_data, "computed_position_delta", "delta"),
                    "theta_dollars_per_day": _numeric_field(market_data, "computed_position_theta", "theta"),
                    "vega_dollars_per_vol_point": _numeric_field(market_data, "computed_position_vega", "vega"),
                    "gamma_display": _numeric_field(market_data, "computed_position_gamma", "gamma"),
                    "delta": _numeric_field(market_data, "computed_position_delta", "delta"),
                    "theta": _numeric_field(market_data, "computed_position_theta", "theta"),
                    "vega": _numeric_field(market_data, "computed_position_vega", "vega"),
                    "gamma": _numeric_field(market_data, "computed_position_gamma", "gamma"),
                    "rho": _numeric_field(market_data, "computed_position_rho", "rho"),
                    "assignment_exposure_dollars": _assignment_exposure(position),
                }))
            strategy_group = _compact_dict({
                "underlying_symbol": underlying_symbol,
                "strategy": strategy,
                "leg_count": len(underlying_positions),
                "expiration_dates": expiration_dates,
                "legs": legs,
                "net_open_credit_or_debit_dollars": total_open,
                "current_value_dollars": total_current,
                "unrealized_pl_dollars": total_unrealized,
                "percent_credit_captured": percent_credit_captured,
                "percent_max_profit_or_target": None,
                "days_to_nearest_expiration": nearest_dte,
                "theta_dollars_per_day": theta,
                "vega_dollars_per_vol_point": vega,
                "delta_shares": delta_shares,
                "gamma_display": gamma,
                "beta_delta_raw": None,
                "beta_delta_shares": beta_delta_shares,
                "assignment_exposure_dollars": assignment_exposure,
                "max_loss_dollars": None,
                "buying_power_effect_dollars": None,
                "management_flags": _management_flags(
                    strategy_label=strategy["label"],
                    days_to_nearest_expiration=nearest_dte,
                    percent_credit_captured=percent_credit_captured,
                    beta_delta_shares=beta_delta_shares,
                    theta_dollars_per_day=theta,
                    vega_dollars_per_vol_point=vega,
                    assignment_exposure_dollars=assignment_exposure,
                    positions=underlying_positions,
                ),
            })
            strategy_groups.append(strategy_group)
            portfolio["strategy_group_count"] += 1
            if strategy["label"] != "unknown":
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
            "total_beta_delta_raw": account.get("total_beta_delta_raw"),
            "total_beta_delta_shares": account.get("total_beta_delta_shares"),
            "total_position_delta": account.get("total_position_delta"),
            "delta_shares": account.get("delta_shares", account.get("total_position_delta")),
            "theta_dollars_per_day": account.get("theta_dollars_per_day", account.get("total_theta")),
            "vega_dollars_per_vol_point": account.get("vega_dollars_per_vol_point", account.get("total_vega")),
            "gamma_display": account.get("gamma_display", account.get("total_gamma")),
            "theta": account.get("total_theta"),
            "vega": account.get("total_vega"),
            "gamma": account.get("total_gamma"),
            "rho": account.get("total_rho"),
            "underlying_strategies": underlying_strategies,
            "strategy_groups": strategy_groups,
            "groups": groups,
        }))

    if percent_used_values:
        portfolio["percent_used_bp"] = max(percent_used_values)
    portfolio["total_beta_delta"] = round(portfolio["total_beta_delta"], 2)
    portfolio["total_beta_delta_raw"] = round(portfolio["total_beta_delta_raw"], 2)
    portfolio["total_beta_delta_shares"] = round(portfolio["total_beta_delta_shares"], 2)
    portfolio["unrealized_pl_dollars"] = round(portfolio["unrealized_pl_dollars"], 2)
    portfolio["assignment_exposure_dollars"] = round(portfolio["assignment_exposure_dollars"], 2)

    units = {
        "mark": "price",
        "close": "price",
        "average_open_price": "price",
        "total_credit_received": "legacy dollars; use total_credit_points/total_credit_dollars",
        "total_credit_points": "option points, signed credit positive and debit negative",
        "total_credit_dollars": "dollars, signed credit positive and debit negative",
        "net_open_credit_or_debit_dollars": "dollars, credit positive and debit negative",
        "open_value_dollars": "absolute dollars per leg or gross group dollars",
        "current_value_dollars": "absolute dollars per leg; signed net dollars for groups",
        "unrealized_pl_dollars": "dollars",
        "assignment_exposure_dollars": "dollars",
        "max_loss_dollars": "dollars or null when unknown",
        "buying_power_effect_dollars": "dollars or null when unknown",
        "current_pl": "dollars",
        "approximate_pl": "dollars",
        "percent_used_bp": "percent",
        "percent_credit_received": "legacy percent; use percent_credit_captured for credit trades",
        "percent_credit_captured": "percent of opening credit captured for net credit trades; null otherwise",
        "percent_max_profit_or_target": "percent or null when not available",
        "iv_rank_percent": "percent",
        "iv_5d_change_percent": "percent",
        "days_to_expiration": "calendar days",
        "days_to_nearest_expiration": "calendar days",
        "total_delta": "raw option delta sum",
        "total_position_delta": "legacy delta shares integer; use delta_shares",
        "delta_shares": "share-equivalent delta",
        "theta_dollars_per_day": "dollars per day",
        "vega_dollars_per_vol_point": "dollars per 1 volatility point",
        "gamma_display": "brokerage display integer",
        "theta": "brokerage display integer",
        "vega": "brokerage display integer",
        "gamma": "brokerage display integer",
        "rho": "brokerage display integer",
        "beta_delta": "legacy raw option beta-weighted delta",
        "beta_delta_raw": "raw option beta-weighted delta",
        "beta_delta_shares": "share-equivalent beta-weighted delta",
    }

    return {
        "portfolio": _compact_dict(portfolio),
        "units": units,
        "accounts": accounts,
    }
