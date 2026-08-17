from __future__ import annotations

import re
from collections import defaultdict, deque
from datetime import date, datetime, timezone
from typing import Any, Callable

from sqlalchemy.orm import Session

from app import tastytrade
from app.models import ImportedSpreadTradeORM
from app.services.tasty_activity_csv_service import _normalize_vertical, _position_signature
from app.tastytrade_schema import TastyOrder, TastyTransaction


OPTION_SYMBOL_RE = re.compile(r"(?P<expiry>\d{6})(?P<right>[CP])(?P<strike>\d{8})$")
ACTION_CODES = {
    "sell to open": "STO",
    "buy to open": "BTO",
    "sell to close": "STC",
    "buy to close": "BTC",
}
MAX_PAGES = 20


class TastyActivityHistoryError(RuntimeError):
    pass


def sync_tastytrade_activity_history(
    db: Session,
    token: str,
    *,
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    if start_date > end_date:
        raise ValueError("start_date must be on or before end_date.")
    if (end_date - start_date).days > 180:
        raise ValueError("Broker history synchronization is limited to 181 calendar days per request.")
    try:
        accounts = tastytrade.fetch_accounts(token)
    except Exception as exc:
        raise TastyActivityHistoryError("Unable to fetch brokerage accounts for history synchronization.") from exc

    normalized_orders: list[dict[str, Any]] = []
    source_rows = 0
    warnings: list[str] = []
    for account in accounts:
        account_number = account.account_number
        try:
            orders, orders_truncated = _fetch_pages(
                tastytrade.fetch_orders, token, account_number,
                start_date=start_date.isoformat(), end_date=end_date.isoformat(), per_page=100,
            )
            transactions, transactions_truncated = _fetch_pages(
                tastytrade.fetch_transactions, token, account_number,
                start_date=start_date.isoformat(), end_date=end_date.isoformat(), per_page=2000,
            )
        except Exception as exc:
            warnings.append(f"Broker history was unavailable for account {account_number}.")
            continue
        if orders_truncated or transactions_truncated:
            warnings.append(f"Broker history pagination was truncated for account {account_number}.")
        source_rows += len(transactions)
        normalized_orders.extend(_broker_fill_orders(account_number, transactions, orders))

    normalized_orders.sort(key=lambda row: row["fill_ts"])
    open_positions: dict[tuple[Any, ...], deque[dict[str, Any]]] = defaultdict(deque)
    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    unmatched_closes = 0
    for order in normalized_orders:
        signature = (order["account_number"], *_position_signature(order))
        if order["lifecycle"] == "open":
            open_positions[signature].append(order)
        elif open_positions[signature]:
            pairs.append((open_positions[signature].popleft(), order))
        else:
            unmatched_closes += 1

    imported = existing = ignored = 0
    rows: list[ImportedSpreadTradeORM] = []
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
        rows.append(row)
    db.commit()
    for row in rows:
        db.refresh(row)
    if not normalized_orders and not warnings:
        warnings.append("No filled option orders were returned for the requested window.")
    return {
        "source_rows": source_rows,
        "filled_orders": len(normalized_orders),
        "paired_positions": len(pairs),
        "imported": imported,
        "existing": existing,
        "unmatched_open_orders": sum(len(queue) for queue in open_positions.values()),
        "unmatched_close_orders": unmatched_closes,
        "ignored_non_vertical_pairs": ignored,
        "trades": rows,
        "accounts": len(accounts),
        "warnings": warnings,
    }


def _broker_fill_orders(
    account_number: str,
    transactions: list[TastyTransaction],
    orders: list[TastyOrder],
) -> list[dict[str, Any]]:
    order_lookup = {str(order.id): order for order in orders}
    groups: dict[str, list[TastyTransaction]] = defaultdict(list)
    for transaction in transactions:
        if not _is_option_fill(transaction):
            continue
        key = (
            f"group:{transaction.ext_group_fill_id}"
            if transaction.ext_group_fill_id
            else f"order:{transaction.order_id}"
            if transaction.order_id is not None
            else f"transaction:{transaction.id}"
        )
        groups[key].append(transaction)

    output = []
    for key, fill_rows in groups.items():
        actions = {_action_code(row.action or row.transaction_sub_type) for row in fill_rows}
        if None in actions:
            continue
        suffixes = {str(action)[-1] for action in actions}
        lifecycle = "open" if suffixes == {"O"} else "close" if suffixes == {"C"} else "mixed"
        if lifecycle == "mixed":
            continue
        grouped_legs: dict[tuple[str, str], dict[str, Any]] = {}
        for transaction in fill_rows:
            action = _action_code(transaction.action or transaction.transaction_sub_type)
            parsed = _parse_option_symbol(transaction.symbol)
            if action is None or parsed is None:
                continue
            leg_key = (str(transaction.symbol), action)
            leg = grouped_legs.setdefault(leg_key, {**parsed, "action": action, "qty": 0})
            leg["qty"] += int(round(abs(_number(transaction.quantity) or 0)))
        legs = list(grouped_legs.values())
        if not legs:
            continue
        quantity = min(abs(leg["qty"]) for leg in legs)
        gross_value = sum(
            _signed_value(transaction.value, transaction.value_effect)
            for transaction in fill_rows
        )
        order_id = next((str(row.order_id) for row in fill_rows if row.order_id is not None), key)
        broker_order = order_lookup.get(order_id)
        if quantity > 0 and gross_value:
            cashflow = gross_value / 100 / quantity
            price = abs(cashflow)
            side = "cr" if cashflow > 0 else "db"
        elif broker_order is not None and _number(broker_order.price) is not None:
            price = abs(_number(broker_order.price) or 0)
            side = "cr" if str(broker_order.price_effect or "").lower() == "credit" else "db"
            cashflow = price if side == "cr" else -price
        else:
            continue
        occurred = [_timestamp(row.executed_at or row.created_at or row.transaction_date) for row in fill_rows]
        occurred = [value for value in occurred if value is not None]
        output.append({
            "source": "tastytrade_history",
            "account_number": account_number,
            "symbol": next((str(row.underlying_symbol) for row in fill_rows if row.underlying_symbol), ""),
            "fill_ts": min(occurred) if occurred else datetime.now(timezone.utc),
            "order_id": order_id,
            "price": round(price, 6),
            "side": side,
            "cashflow": round(cashflow, 6),
            "legs": legs,
            "lifecycle": lifecycle,
        })
    return output


def _fetch_pages(
    fetcher: Callable,
    token: str,
    account_number: str,
    *,
    start_date: str,
    end_date: str,
    per_page: int,
) -> tuple[list, bool]:
    items = []
    for page_offset in range(MAX_PAGES):
        page = fetcher(
            token, account_number, start_date=start_date, end_date=end_date,
            page_offset=page_offset, per_page=per_page,
        )
        items.extend(page.items)
        if not page.has_more:
            return items, False
    return items, True


def _is_option_fill(transaction: TastyTransaction) -> bool:
    return (
        str(transaction.transaction_type or "").lower() == "trade"
        and "option" in str(transaction.instrument_type or "").lower()
        and bool(transaction.symbol)
        and _action_code(transaction.action or transaction.transaction_sub_type) is not None
    )


def _parse_option_symbol(symbol: str | None) -> dict[str, Any] | None:
    match = OPTION_SYMBOL_RE.search(str(symbol or "").strip())
    if not match:
        return None
    expiry = datetime.strptime(match.group("expiry"), "%y%m%d").date()
    return {
        "expiry": expiry,
        "strike": int(match.group("strike")) / 1000,
        "right": "call" if match.group("right") == "C" else "put",
    }


def _action_code(value: str | None) -> str | None:
    return ACTION_CODES.get(str(value or "").strip().lower())


def _number(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _signed_value(value: Any, effect: str | None) -> float:
    number = abs(_number(value) or 0)
    normalized_effect = str(effect or "").lower()
    if normalized_effect == "credit":
        return number
    if normalized_effect == "debit":
        return -number
    return 0


def _timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    except ValueError:
        return None
