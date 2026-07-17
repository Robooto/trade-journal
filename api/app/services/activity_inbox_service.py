import logging
from collections.abc import Callable, Sequence
from datetime import date, datetime, timezone

from app import tastytrade
from app.schemas.brokerage import (
    BrokerActivityEventV1,
    BrokerActivityInboxV1,
    BrokerActivityKind,
    BrokerActivityReviewEventV1,
    BrokerActivityReviewKind,
    DataStatus,
    SourceMetadataV1,
)
from app.services.brokerage_normalizer import normalize_activity_event
from app.services.trades_errors import TastytradeFetchError
from app.tastytrade_schema import TastyOrder, TastyTransaction


MAX_PAGES_PER_SOURCE = 20


def fetch_activity_inbox(
    token: str,
    session_date: date,
    *,
    fetched_at: datetime | None = None,
) -> BrokerActivityInboxV1:
    fetched_at = fetched_at or datetime.now(timezone.utc)
    date_text = session_date.isoformat()
    try:
        accounts = tastytrade.fetch_accounts(token)
    except Exception as exc:
        logging.exception("Failed to fetch brokerage accounts for activity inbox.")
        raise TastytradeFetchError(
            "Unable to fetch brokerage accounts for activity review."
        ) from exc

    source_status = [
        SourceMetadataV1(
            source="tastytrade",
            endpoint="/customers/me/accounts",
            fetched_at=fetched_at,
            status=DataStatus.OK,
        )
    ]
    warnings: list[str] = []
    review_events: list[BrokerActivityReviewEventV1] = []

    for account in accounts:
        account_number = account.account_number
        orders: list[TastyOrder] = []
        transactions: list[TastyTransaction] = []

        try:
            orders, truncated = _fetch_pages(
                tastytrade.fetch_orders,
                token,
                account_number,
                date_text,
                per_page=100,
            )
            source_status.append(
                _source_status(
                    account_number,
                    "orders",
                    fetched_at,
                    truncated=truncated,
                )
            )
            if truncated:
                warnings.append(
                    f"Order history was truncated for account {account_number}."
                )
        except Exception as exc:
            logging.exception(
                "Failed to fetch orders for activity account %s.",
                account_number,
            )
            source_status.append(
                _unavailable_source(account_number, "orders", fetched_at)
            )
            warnings.append(
                f"Orders are unavailable for account {account_number}."
            )

        try:
            transactions, truncated = _fetch_pages(
                tastytrade.fetch_transactions,
                token,
                account_number,
                date_text,
                per_page=2000,
            )
            source_status.append(
                _source_status(
                    account_number,
                    "transactions",
                    fetched_at,
                    truncated=truncated,
                )
            )
            if truncated:
                warnings.append(
                    "Transaction history was truncated for account "
                    f"{account_number}."
                )
        except Exception as exc:
            logging.exception(
                "Failed to fetch transactions for activity account %s.",
                account_number,
            )
            source_status.append(
                _unavailable_source(
                    account_number,
                    "transactions",
                    fetched_at,
                )
            )
            warnings.append(
                f"Transactions are unavailable for account {account_number}."
            )

        normalized = [
            normalize_activity_event(
                account_number,
                transaction,
                fetched_at=fetched_at,
            )
            for transaction in transactions
        ]
        review_events.extend(
            build_activity_review_events(
                session_date,
                normalized,
                orders,
            )
        )

    review_events.sort(
        key=lambda event: (
            event.occurred_at,
            event.account_number,
            event.activity_group_id,
        )
    )
    return BrokerActivityInboxV1(
        session_date=session_date,
        generated_at=fetched_at,
        events=review_events,
        source_status=source_status,
        warnings=list(dict.fromkeys(warnings)),
    )


def build_activity_review_events(
    session_date: date,
    events: Sequence[BrokerActivityEventV1],
    orders: Sequence[TastyOrder],
) -> list[BrokerActivityReviewEventV1]:
    ordered_events = sorted(events, key=lambda event: event.occurred_at)
    groups: dict[str, list[BrokerActivityEventV1]] = {}
    for event in ordered_events:
        key = (
            f"group-fill:{event.group_fill_id}"
            if event.group_fill_id
            else f"order:{event.order_id}"
            if event.order_id
            else event.activity_id
        )
        groups.setdefault(key, []).append(event)

    orders_by_id = {str(order.id): order for order in orders}
    return [
        _review_event(session_date, legs, orders_by_id)
        for legs in groups.values()
    ]


def _review_event(
    session_date: date,
    legs: list[BrokerActivityEventV1],
    orders_by_id: dict[str, TastyOrder],
) -> BrokerActivityReviewEventV1:
    first = legs[0]
    group_fill_id = next(
        (leg.group_fill_id for leg in legs if leg.group_fill_id),
        None,
    )
    order_ids = list(
        dict.fromkeys(leg.order_id for leg in legs if leg.order_id)
    )
    grouping_status = (
        "explicit"
        if group_fill_id or len(order_ids) == 1
        else (
            "ambiguous"
            if any(leg.grouping_status == "ambiguous" for leg in legs)
            else "ungrouped"
        )
    )
    order = (
        orders_by_id.get(order_ids[0])
        if len(order_ids) == 1
        else None
    )
    warnings = [
        warning
        for leg in legs
        for warning in leg.warnings
    ]
    if len(order_ids) > 1:
        warnings.append(
            "Explicit fill group references more than one broker order."
        )
    if order_ids and order is None:
        warnings.append("Matching broker order details are unavailable.")

    review_kind = _review_kind(legs)
    net_value = _sum_optional(
        leg.net_value_dollars for leg in legs
    )
    fees = _sum_optional(leg.fees_dollars for leg in legs)
    underlying = next(
        (leg.underlying_symbol for leg in legs if leg.underlying_symbol),
        None,
    )
    activity_group_id = (
        f"tastytrade:{first.account_number}:group-fill:{group_fill_id}"
        if group_fill_id
        else (
            f"tastytrade:{first.account_number}:order:{order_ids[0]}"
            if len(order_ids) == 1
            else first.activity_id
        )
    )
    return BrokerActivityReviewEventV1(
        activity_group_id=activity_group_id,
        session_date=session_date,
        account_number=first.account_number,
        review_kind=review_kind,
        occurred_at=min(leg.occurred_at for leg in legs),
        underlying_symbol=underlying,
        group_fill_id=group_fill_id,
        grouping_status=grouping_status,
        order_ids=order_ids,
        order_status=order.status if order else None,
        order_type=order.order_type if order else None,
        order_price=_number(order.price) if order else None,
        order_price_effect=order.price_effect if order else None,
        leg_count=len(legs),
        legs=legs,
        net_value_dollars=net_value,
        fees_dollars=fees,
        summary=_summary(
            underlying,
            review_kind,
            len(legs),
            net_value,
        ),
        warnings=list(dict.fromkeys(warnings)),
    )


def _review_kind(
    legs: Sequence[BrokerActivityEventV1],
) -> BrokerActivityReviewKind:
    kinds = {leg.kind for leg in legs}
    if BrokerActivityKind.ASSIGNMENT in kinds:
        return BrokerActivityReviewKind.ASSIGNMENT
    if BrokerActivityKind.EXPIRATION in kinds:
        return BrokerActivityReviewKind.EXPIRATION
    if kinds <= {
        BrokerActivityKind.FEE,
        BrokerActivityKind.DIVIDEND,
        BrokerActivityKind.TRANSFER,
    }:
        return BrokerActivityReviewKind.CASH
    if BrokerActivityKind.FILL in kinds:
        actions = {
            str(leg.action or leg.transaction_sub_type or "").lower()
            for leg in legs
        }
        has_open = any("open" in action for action in actions)
        has_close = any("close" in action for action in actions)
        if has_open and has_close:
            return BrokerActivityReviewKind.ROLL
        if has_open:
            return BrokerActivityReviewKind.OPENING
        if has_close:
            return BrokerActivityReviewKind.CLOSING
        return BrokerActivityReviewKind.FILL
    return BrokerActivityReviewKind.OTHER


def _summary(
    symbol: str | None,
    review_kind: BrokerActivityReviewKind,
    leg_count: int,
    net_value: float | None,
) -> str:
    parts = [
        symbol or "Account",
        f"{review_kind.value} activity",
        f"{leg_count} leg" + ("" if leg_count == 1 else "s"),
    ]
    if net_value is not None:
        effect = "credit" if net_value >= 0 else "debit"
        parts.append(f"${abs(net_value):,.2f} net {effect}")
    return " - ".join(parts)


def _fetch_pages(
    fetcher: Callable,
    token: str,
    account_number: str,
    date_text: str,
    *,
    per_page: int,
) -> tuple[list, bool]:
    items = []
    page_offset = 0
    for _ in range(MAX_PAGES_PER_SOURCE):
        page = fetcher(
            token,
            account_number,
            start_date=date_text,
            end_date=date_text,
            page_offset=page_offset,
            per_page=per_page,
        )
        items.extend(page.items)
        if not page.has_more:
            return items, False
        page_offset += 1
    return items, True


def _source_status(
    account_number: str,
    source_name: str,
    fetched_at: datetime,
    *,
    truncated: bool,
) -> SourceMetadataV1:
    warning = (
        [f"Pagination exceeded {MAX_PAGES_PER_SOURCE} pages."]
        if truncated
        else []
    )
    return SourceMetadataV1(
        source="tastytrade",
        endpoint=f"/accounts/{account_number}/{source_name}",
        fetched_at=fetched_at,
        status=DataStatus.PARTIAL if truncated else DataStatus.OK,
        warnings=warning,
    )


def _unavailable_source(
    account_number: str,
    source_name: str,
    fetched_at: datetime,
) -> SourceMetadataV1:
    return SourceMetadataV1(
        source="tastytrade",
        endpoint=f"/accounts/{account_number}/{source_name}",
        fetched_at=fetched_at,
        status=DataStatus.UNAVAILABLE,
        warnings=[f"Brokerage {source_name} source is unavailable."],
    )


def _sum_optional(values) -> float | None:
    numbers = [value for value in values if value is not None]
    return round(sum(numbers), 4) if numbers else None


def _number(value) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None
