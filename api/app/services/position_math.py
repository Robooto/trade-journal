"""Per-position arithmetic on tastytrade position dicts: quantities, money, expirations, flags."""
import re
from datetime import date, datetime
from typing import Any

from app.services.values import to_float


def quantity_multiplier(position: dict) -> tuple[int, int]:
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


def direction_sign(quantity_direction: str | None) -> int:
    return -1 if (quantity_direction or "").strip().lower() == "short" else 1


def brokerage_greek_total(value: float) -> int:
    return int(round(value))


def optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def numeric_field(data: dict, *keys: str) -> float | None:
    for key in keys:
        value = to_float(data.get(key))
        if value is not None:
            return value
    return None


def compact_dict(data: dict) -> dict:
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


def days_to_expiration(expires_at: str, today: date | None = None) -> int | None:
    expiration_date = extract_expiration_date(expires_at)
    if not expiration_date:
        return None
    try:
        expires_on = date.fromisoformat(expiration_date)
    except ValueError:
        return None
    today = today or datetime.now().date()
    return (expires_on - today).days


def _signed_credit_value(position: dict, price: float | None) -> float | None:
    if price is None:
        return None
    quantity, multiplier = quantity_multiplier(position)
    value = price * quantity * multiplier
    return value if (position.get("quantity-direction") or "").strip().lower() == "short" else -value


def position_money_fields(position: dict) -> dict[str, float | None]:
    avg_open = numeric_field(position, "average-open-price")
    mark = numeric_field(position.get("market_data", {}), "mark")
    quantity, multiplier = quantity_multiplier(position)
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


def assignment_exposure(position: dict) -> float | None:
    if (
        position.get("option-type") != "P"
        or (position.get("quantity-direction") or "").strip().lower() != "short"
    ):
        return None
    strike = numeric_field(position, "strike")
    if strike is None:
        return None
    quantity, multiplier = quantity_multiplier(position)
    return round(strike * quantity * multiplier, 2)


def _spread_percent(position: dict) -> float | None:
    market_data = position.get("market_data", {})
    bid = numeric_field(market_data, "bid")
    ask = numeric_field(market_data, "ask")
    mark = numeric_field(market_data, "mark")
    if bid is None or ask is None or mark is None or mark == 0:
        return None
    return abs(ask - bid) / abs(mark) * 100


def management_flags(
    *,
    strategy_label: str,
    days_to_nearest_expiration: int | None,
    percent_credit_captured: float | None,
    beta_delta_shares: float | None,
    theta_dollars_per_day: float | None,
    vega_dollars_per_vol_point: float | None,
    assignment_exposure_dollars: float | None,
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


def parse_equity_option_symbol(symbol: str) -> tuple[float | None, str | None]:
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


def root_symbol(sym: str) -> str:
    if sym and sym.startswith("/"):
        return re.sub(r"[FGHJKMNQUVXZ]\d+$", "", sym)
    return sym
