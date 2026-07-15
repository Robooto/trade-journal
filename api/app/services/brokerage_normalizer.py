from datetime import datetime, timezone
from typing import Iterable, Mapping, Sequence

from app.schemas.brokerage import (
    AccountHoldingSnapshotV1,
    AssetClass,
    BrokerActivityEventV1,
    BrokerActivityKind,
    DataStatus,
    HoldingSnapshotV1,
    HoldingV1,
    SourceMetadataV1,
)
from app.tastytrade_schema import TastyAccount, TastyPosition, TastyTransaction


INSTRUMENT_ASSET_CLASSES = {
    "Equity": AssetClass.EQUITY,
    "Equity Option": AssetClass.EQUITY_OPTION,
    "Future": AssetClass.FUTURE,
    "Future Option": AssetClass.FUTURE_OPTION,
    "Cryptocurrency": AssetClass.CRYPTOCURRENCY,
    "Bond": AssetClass.FIXED_INCOME,
    "Fixed Income Security": AssetClass.FIXED_INCOME,
}


def _as_dict(value) -> dict:
    if hasattr(value, "to_tasty_dict"):
        return value.to_tasty_dict()
    if isinstance(value, Mapping):
        return dict(value)
    raise TypeError(f"Unsupported broker value: {type(value)!r}")


def _number(value) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _datetime(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _quantity_direction(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value in {"long", "short"}:
        return value
    return "unknown"


def _signed_quantity(quantity: float, direction: str) -> float:
    if direction == "short":
        return -abs(quantity)
    if direction == "long":
        return abs(quantity)
    return quantity


def _asset_class(instrument_type: str) -> AssetClass:
    return INSTRUMENT_ASSET_CLASSES.get(instrument_type, AssetClass.OTHER)


def normalize_holding(
    account_number: str,
    position: TastyPosition | Mapping,
) -> HoldingV1:
    raw = _as_dict(position)
    instrument_type = str(raw.get("instrument-type") or "Unknown")
    symbol = str(raw.get("symbol") or "").strip()
    underlying = str(raw.get("underlying-symbol") or symbol).strip()
    quantity = abs(_number(raw.get("quantity")) or 0.0)
    direction = _quantity_direction(raw.get("quantity-direction"))
    signed_quantity = _signed_quantity(quantity, direction)
    multiplier = _number(raw.get("multiplier")) or 1.0
    average_open = _number(raw.get("average-open-price"))
    mark = _number(raw.get("mark"))
    close_price = _number(raw.get("close-price"))
    if mark is None:
        mark = close_price

    missing_fields: list[str] = []
    warnings: list[str] = []
    if not symbol:
        missing_fields.append("symbol")
    if direction == "unknown":
        missing_fields.append("quantity_direction")
    if mark is None:
        missing_fields.append("mark")

    market_value = (
        round(signed_quantity * mark * multiplier, 4)
        if mark is not None
        else None
    )
    signed_cost_basis = (
        round(signed_quantity * average_open * multiplier, 4)
        if average_open is not None
        else None
    )
    unrealized_pl = None
    if average_open is not None and mark is not None:
        if direction == "short":
            unrealized_pl = (average_open - mark) * quantity * multiplier
        elif direction == "long":
            unrealized_pl = (mark - average_open) * quantity * multiplier
        unrealized_pl = (
            round(unrealized_pl, 4) if unrealized_pl is not None else None
        )

    if not symbol:
        warnings.append("Broker position has no symbol; holding_id is incomplete.")

    holding_key = symbol or "missing-symbol"
    holding_id = (
        f"tastytrade:{account_number}:{instrument_type}:{holding_key}"
    )

    return HoldingV1(
        holding_id=holding_id,
        account_number=account_number,
        symbol=symbol,
        underlying_symbol=underlying,
        asset_class=_asset_class(instrument_type),
        instrument_type=instrument_type,
        quantity=quantity,
        quantity_direction=direction,
        signed_quantity=signed_quantity,
        multiplier=multiplier,
        average_open_price=average_open,
        mark=mark,
        close_price=close_price,
        market_value_dollars=market_value,
        signed_cost_basis_dollars=signed_cost_basis,
        unrealized_pl_dollars=unrealized_pl,
        expires_at=_datetime(raw.get("expires-at")),
        missing_fields=missing_fields,
        warnings=warnings,
    )


def build_holding_snapshot(
    accounts: Sequence[TastyAccount | Mapping],
    positions_by_account: Mapping[str, Iterable[TastyPosition | Mapping]],
    *,
    fetched_at: datetime,
) -> HoldingSnapshotV1:
    account_snapshots: list[AccountHoldingSnapshotV1] = []
    source_status: list[SourceMetadataV1] = []

    for account_value in accounts:
        account = _as_dict(account_value)
        account_number = str(account.get("account-number") or "")
        raw_positions = list(positions_by_account.get(account_number, []))
        holdings = [
            normalize_holding(account_number, position)
            for position in raw_positions
        ]
        missing = sorted(
            {
                field
                for holding in holdings
                for field in holding.missing_fields
            }
        )
        status = DataStatus.PARTIAL if missing else DataStatus.OK
        source = SourceMetadataV1(
            source="tastytrade",
            endpoint=f"/accounts/{account_number}/positions",
            fetched_at=fetched_at,
            status=status,
            missing_fields=missing,
        )
        account_snapshots.append(
            AccountHoldingSnapshotV1(
                account_number=account_number,
                nickname=str(account.get("nickname") or ""),
                account_type=account.get("account-type-name"),
                holdings=holdings,
                source=source,
            )
        )
        source_status.append(source)

    return HoldingSnapshotV1(
        generated_at=fetched_at,
        accounts=account_snapshots,
        source_status=source_status,
    )


def _signed_money(value, effect: str | None) -> float | None:
    number = _number(value)
    if number is None:
        return None
    normalized_effect = (effect or "").strip().lower()
    if normalized_effect == "debit":
        return -abs(number)
    if normalized_effect == "credit":
        return abs(number)
    return number


def _activity_kind(raw: Mapping) -> BrokerActivityKind:
    transaction_type = str(raw.get("transaction-type") or "").lower()
    sub_type = str(raw.get("transaction-sub-type") or "").lower()
    if "assign" in sub_type:
        return BrokerActivityKind.ASSIGNMENT
    if "expir" in sub_type:
        return BrokerActivityKind.EXPIRATION
    if "dividend" in transaction_type or "dividend" in sub_type:
        return BrokerActivityKind.DIVIDEND
    if "fee" in transaction_type or "fee" in sub_type:
        return BrokerActivityKind.FEE
    if "transfer" in transaction_type or "money movement" in transaction_type:
        return BrokerActivityKind.TRANSFER
    if transaction_type == "trade" or raw.get("executed-at"):
        return BrokerActivityKind.FILL
    return BrokerActivityKind.OTHER


def normalize_activity_event(
    account_number: str,
    transaction: TastyTransaction | Mapping,
    *,
    fetched_at: datetime,
) -> BrokerActivityEventV1:
    raw = _as_dict(transaction)
    transaction_id = str(raw.get("id") or "missing-id")
    occurred_at = (
        _datetime(raw.get("executed-at"))
        or _datetime(raw.get("created-at"))
        or _datetime(raw.get("transaction-date"))
        or fetched_at
    )
    missing_fields = []
    if not raw.get("id"):
        missing_fields.append("id")
    if not raw.get("executed-at") and not raw.get("transaction-date"):
        missing_fields.append("occurred_at")

    fees = [
        _number(raw.get("commission")),
        _number(raw.get("clearing-fees")),
        _number(raw.get("regulatory-fees")),
        _number(raw.get("proprietary-index-option-fees")),
        _number(raw.get("other-charge")),
    ]
    fee_total = round(sum(abs(value) for value in fees if value is not None), 4)
    group_fill_id = raw.get("ext-group-fill-id")
    leg_count = int(_number(raw.get("leg-count")) or 0)
    if group_fill_id:
        grouping_status = "explicit"
    elif leg_count > 1:
        grouping_status = "ambiguous"
    else:
        grouping_status = "ungrouped"

    warnings = []
    if grouping_status == "ambiguous":
        warnings.append(
            "Multi-leg transaction has no broker group-fill identifier."
        )

    source = SourceMetadataV1(
        source="tastytrade",
        endpoint=f"/accounts/{account_number}/transactions",
        fetched_at=fetched_at,
        observed_at=occurred_at,
        status=DataStatus.PARTIAL if missing_fields else DataStatus.OK,
        missing_fields=missing_fields,
    )
    return BrokerActivityEventV1(
        activity_id=(
            f"tastytrade:{account_number}:transaction:{transaction_id}"
        ),
        account_number=account_number,
        kind=_activity_kind(raw),
        occurred_at=occurred_at,
        transaction_type=raw.get("transaction-type"),
        transaction_sub_type=raw.get("transaction-sub-type"),
        order_id=(
            str(raw["order-id"]) if raw.get("order-id") is not None else None
        ),
        broker_transaction_id=transaction_id,
        group_fill_id=group_fill_id,
        symbol=raw.get("symbol"),
        underlying_symbol=raw.get("underlying-symbol"),
        instrument_type=raw.get("instrument-type"),
        action=raw.get("action"),
        quantity=_number(raw.get("quantity")),
        price=_number(raw.get("price")),
        value_dollars=_signed_money(
            raw.get("value"), raw.get("value-effect")
        ),
        net_value_dollars=_signed_money(
            raw.get("net-value"), raw.get("net-value-effect")
        ),
        fees_dollars=fee_total or None,
        description=raw.get("description"),
        grouping_status=grouping_status,
        source=source,
        warnings=warnings,
    )
