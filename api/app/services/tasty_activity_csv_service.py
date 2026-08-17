from __future__ import annotations

import csv
import io
import re
from collections import defaultdict, deque
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import ImportedSpreadTradeORM


LEG_RE = re.compile(
    r"^(?P<qty>-?\d+) (?P<month>[A-Z][a-z]{2}) (?P<day>\d{1,2}) "
    r"(?:(?P<dte>\d+)d|Exp) (?P<strike>\d+(?:\.\d+)?) "
    r"(?P<right>Put|Call) (?P<action>STO|BTO|STC|BTC)$"
)
FILL_RE = re.compile(r"^(?P<price>\d+(?:\.\d+)?) (?P<side>cr|db)$")
TIME_RE = re.compile(r"^(?P<month>\d{1,2})/(?P<day>\d{1,2}), (?P<hour>\d{1,2}):(?P<minute>\d{2})(?P<meridiem>[ap])$")
MONTHS = {name: number for number, name in enumerate(
    ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), 1
)}
PACIFIC = ZoneInfo("America/Los_Angeles")
REQUIRED_COLUMNS = {"Symbol", "Status", "MarketOrFill", "Time", "Order #", "Description"}


class TastyActivityCsvError(ValueError):
    pass


def import_tasty_activity_csv(db: Session, csv_text: str, *, as_of_date: date) -> dict[str, Any]:
    reader = csv.DictReader(io.StringIO(csv_text.lstrip("\ufeff")))
    if not reader.fieldnames or not REQUIRED_COLUMNS.issubset(reader.fieldnames):
        missing = sorted(REQUIRED_COLUMNS - set(reader.fieldnames or []))
        raise TastyActivityCsvError(f"Missing required Tastytrade activity columns: {', '.join(missing)}")
    source_rows = list(reader)
    orders = [
        _parse_order(row, as_of_date=as_of_date)
        for row in source_rows
        if (row.get("Status") or "").strip().lower() == "filled"
    ]
    orders.sort(key=lambda row: row["fill_ts"])
    open_positions: dict[tuple[Any, ...], deque[dict[str, Any]]] = defaultdict(deque)
    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    unmatched_closes = 0
    for order in orders:
        signature = _position_signature(order)
        if signature is None:
            continue
        if order["lifecycle"] == "open":
            open_positions[signature].append(order)
        elif open_positions[signature]:
            pairs.append((open_positions[signature].popleft(), order))
        else:
            unmatched_closes += 1

    imported = existing = ignored = 0
    imported_rows: list[ImportedSpreadTradeORM] = []
    for opened, closed in pairs:
        normalized = _normalize_vertical(opened, closed)
        if normalized is None:
            ignored += 1
            continue
        row = db.query(ImportedSpreadTradeORM).filter(
            ImportedSpreadTradeORM.source == normalized["source"],
            ImportedSpreadTradeORM.account_number == normalized["account_number"],
            ImportedSpreadTradeORM.entry_order_id == normalized["entry_order_id"],
            ImportedSpreadTradeORM.exit_order_id == normalized["exit_order_id"],
        ).one_or_none()
        if row is None:
            row = ImportedSpreadTradeORM(**normalized)
            db.add(row)
            db.flush()
            imported += 1
        else:
            existing += 1
        imported_rows.append(row)
    db.commit()
    for row in imported_rows:
        db.refresh(row)
    return {
        "source_rows": len(source_rows), "filled_orders": len(orders), "paired_positions": len(pairs),
        "imported": imported, "existing": existing,
        "unmatched_open_orders": sum(len(queue) for queue in open_positions.values()),
        "unmatched_close_orders": unmatched_closes, "ignored_non_vertical_pairs": ignored,
        "trades": imported_rows,
    }


def _parse_order(row: dict[str, str], *, as_of_date: date) -> dict[str, Any]:
    fill = FILL_RE.fullmatch((row.get("MarketOrFill") or "").strip())
    time_match = TIME_RE.fullmatch((row.get("Time") or "").strip())
    if not fill or not time_match:
        raise TastyActivityCsvError(f"Unsupported filled order format for order {row.get('Order #')}")
    values = time_match.groupdict()
    fill_date = date(as_of_date.year, int(values["month"]), int(values["day"]))
    if fill_date > as_of_date:
        fill_date = fill_date.replace(year=as_of_date.year - 1)
    hour = int(values["hour"]) % 12 + (12 if values["meridiem"] == "p" else 0)
    fill_ts = datetime(fill_date.year, fill_date.month, fill_date.day, hour, int(values["minute"]), tzinfo=PACIFIC)
    legs = []
    for raw_leg in (row.get("Description") or "").splitlines():
        match = LEG_RE.fullmatch(raw_leg.strip())
        if not match:
            raise TastyActivityCsvError(f"Unsupported option leg for order {row.get('Order #')}: {raw_leg}")
        leg = match.groupdict()
        expiry = date(fill_date.year, MONTHS[leg["month"]], int(leg["day"]))
        if expiry < fill_date:
            expiry = expiry.replace(year=fill_date.year + 1)
        legs.append({
            "qty": int(leg["qty"]), "expiry": expiry, "strike": float(leg["strike"]),
            "right": leg["right"].lower(), "action": leg["action"],
        })
    suffixes = {leg["action"][-1] for leg in legs}
    lifecycle = "open" if suffixes == {"O"} else "close" if suffixes == {"C"} else "mixed"
    price = float(fill.group("price"))
    return {
        "symbol": (row.get("Symbol") or "").strip().upper(), "fill_ts": fill_ts,
        "order_id": (row.get("Order #") or "").strip().lstrip("#"), "price": price,
        "side": fill.group("side"), "cashflow": price if fill.group("side") == "cr" else -price,
        "legs": legs, "lifecycle": lifecycle,
    }


def _position_signature(order: dict[str, Any]) -> tuple[Any, ...] | None:
    if order["lifecycle"] not in {"open", "close"}:
        return None
    signature = []
    for leg in sorted(order["legs"], key=lambda item: (item["expiry"], item["right"], item["strike"])):
        exposure = (1 if leg["action"] == "BTO" else -1) if order["lifecycle"] == "open" else (1 if leg["action"] == "STC" else -1)
        signature.append((leg["expiry"], leg["right"], leg["strike"], exposure, abs(leg["qty"])))
    return tuple(signature)


def _normalize_vertical(opened: dict[str, Any], closed: dict[str, Any]) -> dict[str, Any] | None:
    legs = sorted(opened["legs"], key=lambda item: item["strike"])
    if len(legs) != 2 or len({leg["expiry"] for leg in legs}) != 1 or len({leg["right"] for leg in legs}) != 1:
        return None
    low, high = legs
    exposure = {leg["strike"]: 1 if leg["action"] == "BTO" else -1 for leg in legs}
    if low["right"] == "call":
        strategy = "bull_call_debit" if exposure[low["strike"]] > 0 else "bear_call_credit"
    else:
        strategy = "bull_put_credit" if exposure[high["strike"]] < 0 else "bear_put_debit"
    quantity = min(abs(leg["qty"]) for leg in legs)
    width = high["strike"] - low["strike"]
    pnl = round((opened["cashflow"] + closed["cashflow"]) * 100 * quantity, 2)
    max_risk = (width - opened["price"] if opened["side"] == "cr" else opened["price"]) * 100 * quantity
    return {
        "source": opened.get("source", "tastytrade_activity_csv"), "account_number": opened.get("account_number", "csv"), "symbol": opened["symbol"],
        "entry_order_id": opened["order_id"], "exit_order_id": closed["order_id"],
        "entry_ts": opened["fill_ts"], "exit_ts": closed["fill_ts"],
        "expiration_date": low["expiry"], "zero_dte": low["expiry"] == opened["fill_ts"].date(),
        "strategy": strategy, "option_right": low["right"], "low_strike": low["strike"],
        "high_strike": high["strike"],
        "short_strike": next((leg["strike"] for leg in legs if leg["action"] == "STO"), None),
        "long_strike": next((leg["strike"] for leg in legs if leg["action"] == "BTO"), None),
        "width": width, "quantity": quantity, "entry_price": opened["price"], "entry_side": opened["side"],
        "exit_price": closed["price"], "exit_side": closed["side"], "gross_pnl_dollars": pnl,
        "max_risk_dollars": round(max_risk, 2) if max_risk > 0 else None,
        "holding_minutes": round((closed["fill_ts"] - opened["fill_ts"]).total_seconds() / 60, 2),
    }
