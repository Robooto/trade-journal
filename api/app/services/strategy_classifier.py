from collections import Counter
from typing import Any, Optional


def _get(position: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = position.get(key)
        if value is not None:
            return value
    return None


def _float_value(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalized_leg(position: dict[str, Any]) -> dict[str, Any]:
    return {
        "symbol": _get(position, "symbol", "instrument-symbol"),
        "option_type": _get(position, "option_type", "option-type"),
        "strike": _float_value(_get(position, "strike")),
        "expiration_date": _get(position, "expiration_date", "expires_at", "expires-at"),
        "direction": _get(position, "quantity_direction", "quantity-direction"),
    }


def classify_strategy(positions: list[dict[str, Any]]) -> dict[str, str]:
    legs = [
        leg
        for leg in (_normalized_leg(position) for position in positions)
        if leg["option_type"] in {"C", "P"}
    ]
    leg_count = len(legs)

    if leg_count == 0:
        return {
            "label": "unknown",
            "confidence": "low",
            "reason": "No option legs with type, strike, expiration, and direction were available.",
        }

    short_puts = [leg for leg in legs if leg["option_type"] == "P" and leg["direction"] == "Short"]
    short_calls = [leg for leg in legs if leg["option_type"] == "C" and leg["direction"] == "Short"]
    long_calls = [leg for leg in legs if leg["option_type"] == "C" and leg["direction"] == "Long"]
    long_puts = [leg for leg in legs if leg["option_type"] == "P" and leg["direction"] == "Long"]
    expirations = {leg["expiration_date"] for leg in legs}
    option_types = {leg["option_type"] for leg in legs}
    strikes = {leg["strike"] for leg in legs}

    if leg_count == 1 and short_puts:
        return {
            "label": "short_put",
            "confidence": "high",
            "reason": "Single short put leg.",
        }

    if leg_count == 3 and len(expirations) == 1 and len(short_puts) == 1 and len(short_calls) == 1 and len(long_calls) == 1:
        short_call_strike = short_calls[0]["strike"]
        long_call_strike = long_calls[0]["strike"]
        if short_call_strike is not None and long_call_strike is not None and short_call_strike < long_call_strike:
            return {
                "label": "jade_lizard",
                "confidence": "high",
                "reason": "Short put plus short call spread at the same expiration.",
            }

    if leg_count == 2 and len(option_types) == 1 and len(strikes) == 1 and len(expirations) == 2:
        directions = Counter(leg["direction"] for leg in legs)
        if directions["Long"] == 1 and directions["Short"] == 1:
            return {
                "label": "calendar",
                "confidence": "high",
                "reason": "Long and short option with same type and strike across different expirations.",
            }

    if leg_count == 2 and len(option_types) == 1 and len(strikes) == 2 and len(expirations) == 2:
        directions = Counter(leg["direction"] for leg in legs)
        if directions["Long"] == 1 and directions["Short"] == 1:
            return {
                "label": "diagonal",
                "confidence": "high",
                "reason": "Long and short option with same type across different strikes and expirations.",
            }

    if leg_count == 2 and len(option_types) == 1 and len(expirations) == 1:
        directions = Counter(leg["direction"] for leg in legs)
        if directions["Long"] == 1 and directions["Short"] == 1:
            label = "put_vertical" if "P" in option_types else "call_vertical"
            return {
                "label": label,
                "confidence": "high",
                "reason": "Long and short option with same type and expiration across different strikes.",
            }

    if leg_count == 2 and len(expirations) == 1 and len(short_puts) == 1 and len(short_calls) == 1:
        return {
            "label": "short_strangle",
            "confidence": "high",
            "reason": "Short put and short call at the same expiration.",
        }

    return {
        "label": "unknown",
        "confidence": "low",
        "reason": "Position legs did not match the initial deterministic strategy rules.",
    }
