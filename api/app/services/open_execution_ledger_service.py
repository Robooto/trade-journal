from collections import defaultdict
from datetime import date, datetime, timezone
from hashlib import sha256

from app import tastytrade
from app.schemas.brokerage import (
    DataStatus,
    OpenExecutionGroupCollectionV1,
    OpenExecutionGroupV1,
    OpenExecutionLegV1,
    SourceMetadataV1,
)
from app.services.cache_service import InMemoryCache, get_cache


MAX_TRANSACTION_PAGES = 20
TRANSACTION_PAGE_SIZE = 2000
EXECUTION_HISTORY_TTL_SECONDS = 900


def load_open_execution_groups(
    token: str,
    account_number: str,
    start_date: date,
    end_date: date,
    *,
    fetched_at: datetime | None = None,
    cache: InMemoryCache | None = None,
) -> OpenExecutionGroupCollectionV1:
    fetched_at = fetched_at or datetime.now(timezone.utc)
    cache = cache or get_cache()
    cache_key = (
        f"open-executions:{account_number}:{start_date.isoformat()}:"
        f"{end_date.isoformat()}"
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    transactions = []
    truncated = False
    try:
        for page_offset in range(MAX_TRANSACTION_PAGES):
            page = tastytrade.fetch_transactions(
                token,
                account_number,
                start_date=start_date.isoformat(),
                end_date=end_date.isoformat(),
                page_offset=page_offset,
                per_page=TRANSACTION_PAGE_SIZE,
            )
            transactions.extend(page.items)
            if not page.has_more:
                break
        else:
            truncated = True
    except Exception:
        warning = "Brokerage transaction history is unavailable."
        return OpenExecutionGroupCollectionV1(
            account_number=account_number,
            start_date=start_date,
            end_date=end_date,
            generated_at=fetched_at,
            source=SourceMetadataV1(
                source="tastytrade",
                endpoint=f"/accounts/{account_number}/transactions",
                fetched_at=fetched_at,
                status=DataStatus.UNAVAILABLE,
                warnings=[warning],
            ),
            warnings=[warning],
        )

    grouped = defaultdict(list)
    unmatched = []
    for transaction in transactions:
        action = str(
            transaction.action or transaction.transaction_sub_type or ""
        ).lower()
        if "open" not in action or not transaction.symbol:
            continue
        if transaction.ext_group_fill_id:
            key = ("group_fill", str(transaction.ext_group_fill_id))
        elif transaction.order_id is not None:
            key = ("order", str(transaction.order_id))
        else:
            key = ("unmatched", str(transaction.id))
            unmatched.append(str(transaction.id))
        grouped[key].append(transaction)

    groups = [
        _execution_group(account_number, key, items)
        for key, items in grouped.items()
    ]
    groups.sort(key=lambda group: (group.opened_at, group.execution_group_id))
    warnings = []
    if truncated:
        warnings.append(
            f"Transaction history exceeded {MAX_TRANSACTION_PAGES} pages."
        )
    if unmatched:
        warnings.append(
            f"{len(unmatched)} opening transactions lacked group-fill and order IDs."
        )
    result = OpenExecutionGroupCollectionV1(
        account_number=account_number,
        start_date=start_date,
        end_date=end_date,
        generated_at=fetched_at,
        groups=groups,
        source=SourceMetadataV1(
            source="tastytrade",
            endpoint=f"/accounts/{account_number}/transactions",
            fetched_at=fetched_at,
            status=DataStatus.PARTIAL if truncated or unmatched else DataStatus.OK,
            warnings=warnings,
        ),
        truncated=truncated,
        warnings=warnings,
    )
    cache.set(cache_key, result, ttl=EXECUTION_HISTORY_TTL_SECONDS)
    return result


def _execution_group(
    account_number: str,
    key: tuple[str, str],
    transactions: list,
) -> OpenExecutionGroupV1:
    provenance_source, broker_key = key
    opened_at = min(_occurred_at(transaction) for transaction in transactions)
    raw_id = f"{account_number}:{provenance_source}:{broker_key}"
    return OpenExecutionGroupV1(
        execution_group_id=sha256(raw_id.encode()).hexdigest()[:24],
        account_number=account_number,
        broker_group_fill_id=(
            broker_key if provenance_source == "group_fill" else None
        ),
        broker_order_id=broker_key if provenance_source == "order" else None,
        underlying_symbol=next(
            (
                transaction.underlying_symbol
                for transaction in transactions
                if transaction.underlying_symbol
            ),
            None,
        ),
        opened_at=opened_at,
        provenance_source=provenance_source,
        legs=[
            OpenExecutionLegV1(
                broker_transaction_id=str(transaction.id),
                symbol=str(transaction.symbol),
                underlying_symbol=transaction.underlying_symbol,
                action=transaction.action or transaction.transaction_sub_type,
                quantity=_number(transaction.quantity),
                price=_number(transaction.price),
                executed_at=_occurred_at(transaction),
            )
            for transaction in transactions
        ],
        warnings=(
            ["Opening transaction has no broker grouping provenance."]
            if provenance_source == "unmatched"
            else []
        ),
    )


def _occurred_at(transaction) -> datetime:
    value = (
        transaction.executed_at
        or transaction.created_at
        or transaction.transaction_date
    )
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _number(value) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None
