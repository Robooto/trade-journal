"""Lenient conversions for broker payload values."""
from typing import Any, Optional


def to_float(value: Any) -> Optional[float]:
    """Return ``value`` as a float, or None when it is missing or not numeric."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fraction_to_percent(value: Any) -> Optional[float]:
    """Convert a broker fraction (0.197) to a percent rounded to 2 places (19.7)."""
    number = to_float(value)
    return round(number * 100, 2) if number is not None else None
