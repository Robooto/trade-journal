"""Lenient conversions for broker payload values."""
from collections.abc import Mapping
from typing import Any

from pydantic import BaseModel


def to_float(value: Any) -> float | None:
    """Return ``value`` as a float, or None when it is missing or not numeric."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fraction_to_percent(value: Any) -> float | None:
    """Convert a broker fraction (0.197) to a percent rounded to 2 places (19.7)."""
    number = to_float(value)
    return round(number * 100, 2) if number is not None else None


def tasty_dict(value: Any, *, by_alias: bool = True) -> dict:
    """Return a broker model or mapping as a plain dict (tastytrade's kebab-case keys by default)."""
    if value is None:
        return {}
    if isinstance(value, BaseModel):
        return value.model_dump(by_alias=by_alias, exclude_none=True)
    if isinstance(value, Mapping):
        return dict(value)
    raise TypeError(f"Unsupported broker value: {type(value)!r}")
