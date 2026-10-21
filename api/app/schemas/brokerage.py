from datetime import date, datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class DataStatus(str, Enum):
    OK = "ok"
    PARTIAL = "partial"
    STALE = "stale"
    UNAVAILABLE = "unavailable"


class SourceMetadataV1(BaseModel):
    source: str
    endpoint: str | None = None
    fetched_at: datetime
    observed_at: datetime | None = None
    status: DataStatus = DataStatus.OK
    missing_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class AssetClass(str, Enum):
    EQUITY = "equity"
    EQUITY_OPTION = "equity_option"
    FUTURE = "future"
    FUTURE_OPTION = "future_option"
    CRYPTOCURRENCY = "cryptocurrency"
    FIXED_INCOME = "fixed_income"
    OTHER = "other"


class HoldingV1(BaseModel):
    holding_id: str
    account_number: str
    symbol: str
    underlying_symbol: str
    asset_class: AssetClass
    instrument_type: str
    quantity: float
    quantity_direction: Literal["long", "short", "unknown"]
    signed_quantity: float
    multiplier: float = 1.0
    average_open_price: float | None = None
    mark: float | None = None
    close_price: float | None = None
    market_value_dollars: float | None = None
    signed_cost_basis_dollars: float | None = None
    unrealized_pl_dollars: float | None = None
    expires_at: datetime | None = None
    missing_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class AccountHoldingSnapshotV1(BaseModel):
    account_number: str
    nickname: str = ""
    account_type: str | None = None
    holdings: list[HoldingV1] = Field(default_factory=list)
    source: SourceMetadataV1

    model_config = {"extra": "forbid"}


class HoldingSnapshotV1(BaseModel):
    schema_version: Literal["holding-snapshot.v1"] = "holding-snapshot.v1"
    generated_at: datetime
    accounts: list[AccountHoldingSnapshotV1]
    source_status: list[SourceMetadataV1]

    model_config = {"extra": "forbid"}


class BrokerActivityKind(str, Enum):
    ORDER = "order"
    FILL = "fill"
    ASSIGNMENT = "assignment"
    EXPIRATION = "expiration"
    FEE = "fee"
    DIVIDEND = "dividend"
    TRANSFER = "transfer"
    OTHER = "other"


class BrokerActivityEventV1(BaseModel):
    schema_version: Literal["broker-activity-event.v1"] = (
        "broker-activity-event.v1"
    )
    activity_id: str
    account_number: str
    kind: BrokerActivityKind
    occurred_at: datetime
    transaction_type: str | None = None
    transaction_sub_type: str | None = None
    order_id: str | None = None
    broker_transaction_id: str | None = None
    group_fill_id: str | None = None
    symbol: str | None = None
    underlying_symbol: str | None = None
    instrument_type: str | None = None
    action: str | None = None
    quantity: float | None = None
    price: float | None = None
    value_dollars: float | None = None
    net_value_dollars: float | None = None
    fees_dollars: float | None = None
    description: str | None = None
    grouping_status: Literal["explicit", "ungrouped", "ambiguous"] = "ungrouped"
    source: SourceMetadataV1
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class BrokerActivityReviewKind(str, Enum):
    OPENING = "opening"
    CLOSING = "closing"
    ROLL = "roll"
    FILL = "fill"
    ASSIGNMENT = "assignment"
    EXPIRATION = "expiration"
    CASH = "cash"
    OTHER = "other"


class BrokerActivityDispositionStatus(str, Enum):
    REVIEWED = "reviewed"
    SKIPPED = "skipped"


class BrokerActivityMarketBarV1(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: int = 0

    model_config = {"extra": "forbid"}


class BrokerActivitySymbolContextV1(BaseModel):
    symbol: str
    source_symbol: str
    source: Literal["yahoo_chart"] = "yahoo_chart"
    status: DataStatus
    resolution: Literal["5m"] = "5m"
    activity_price: float | None = None
    matched_at: datetime | None = None
    match_quality: Literal[
        "nearest_5m_close",
        "session_only",
        "unavailable",
    ] = "unavailable"
    minutes_from_activity: float | None = None
    session_open: float | None = None
    session_high: float | None = None
    session_low: float | None = None
    session_close: float | None = None
    session_change_percent: float | None = None
    activity_from_open_percent: float | None = None
    bars: list[BrokerActivityMarketBarV1] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class BrokerActivityMarketContextV1(BaseModel):
    schema_version: Literal["broker-activity-market-context.v1"] = (
        "broker-activity-market-context.v1"
    )
    underlying: BrokerActivitySymbolContextV1 | None = None
    benchmark: BrokerActivitySymbolContextV1 | None = None
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class BrokerActivityReviewEventV1(BaseModel):
    schema_version: Literal["broker-activity-review-event.v1"] = (
        "broker-activity-review-event.v1"
    )
    activity_group_id: str
    session_date: date
    account_number: str
    review_kind: BrokerActivityReviewKind
    occurred_at: datetime
    underlying_symbol: str | None = None
    group_fill_id: str | None = None
    grouping_status: Literal["explicit", "ungrouped", "ambiguous"]
    order_ids: list[str] = Field(default_factory=list)
    order_status: str | None = None
    order_type: str | None = None
    order_price: float | None = None
    order_price_effect: str | None = None
    leg_count: int
    legs: list[BrokerActivityEventV1]
    net_value_dollars: float | None = None
    fees_dollars: float | None = None
    summary: str
    review_status: Literal["pending", "reviewed", "skipped"] = "pending"
    journal_entry_id: str | None = None
    market_context: BrokerActivityMarketContextV1 | None = None
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class BrokerActivityInboxV1(BaseModel):
    schema_version: Literal["broker-activity-inbox.v1"] = "broker-activity-inbox.v1"
    session_date: date
    generated_at: datetime
    events: list[BrokerActivityReviewEventV1]
    source_status: list[SourceMetadataV1]
    pending_count: int = 0
    reviewed_count: int = 0
    skipped_count: int = 0
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class BrokerActivityDispositionRequestV1(BaseModel):
    activity_group_id: str = Field(min_length=1, max_length=512)
    session_date: date
    status: BrokerActivityDispositionStatus
    journal_entry_id: str | None = Field(default=None, max_length=36)

    model_config = {"extra": "forbid"}


class BrokerActivityDispositionV1(BaseModel):
    schema_version: Literal["broker-activity-disposition.v1"] = (
        "broker-activity-disposition.v1"
    )
    activity_group_id: str
    session_date: date
    status: BrokerActivityDispositionStatus
    journal_entry_id: str | None = None
    updated_at: datetime

    model_config = {"extra": "forbid"}

class OpenExecutionLegV1(BaseModel):
    broker_transaction_id: str
    symbol: str
    underlying_symbol: str | None = None
    action: str | None = None
    quantity: float | None = None
    price: float | None = None
    executed_at: datetime

    model_config = {"extra": "forbid"}


class OpenExecutionGroupV1(BaseModel):
    schema_version: Literal["open-execution-group.v1"] = "open-execution-group.v1"
    execution_group_id: str
    account_number: str
    broker_group_fill_id: str | None = None
    broker_order_id: str | None = None
    underlying_symbol: str | None = None
    opened_at: datetime
    provenance_source: Literal["group_fill", "order", "unmatched"]
    match_status: Literal["exact", "partial", "ambiguous", "unmatched"] = "unmatched"
    legs: list[OpenExecutionLegV1] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class OpenExecutionGroupCollectionV1(BaseModel):
    schema_version: Literal["open-execution-group-collection.v1"] = (
        "open-execution-group-collection.v1"
    )
    account_number: str
    start_date: date
    end_date: date
    generated_at: datetime
    groups: list[OpenExecutionGroupV1] = Field(default_factory=list)
    source: SourceMetadataV1
    truncated: bool = False
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}



class WatchlistMembershipV1(BaseModel):
    name: str
    group_name: str | None = None
    source: Literal["private", "public"] = "private"


class PriceContextV1(BaseModel):
    mark: float | None = None
    previous_close: float | None = None
    day_change_percent: float | None = None
    five_session_change_percent: float | None = None
    as_of: datetime | None = None


class VolatilityContextV1(BaseModel):
    iv_index_percent: float | None = None
    iv_rank_percent: float | None = None
    iv_percentile_percent: float | None = None
    iv_index_5_day_change_percent: float | None = None
    iv_rank_5_day_change_percent: float | None = None
    iv_rank_source: str | None = None
    iv_index_15_day_percent: float | None = None
    iv_30_day_percent: float | None = None
    hv_30_day_percent: float | None = None
    hv_60_day_percent: float | None = None
    hv_90_day_percent: float | None = None
    iv_hv_30_day_difference_points: float | None = None
    liquidity_rating: float | None = None
    liquidity_rank: float | None = None
    as_of: datetime | None = None


class ProfileContextV1(BaseModel):
    sector: str | None = None
    industry: str | None = None
    market_cap: float | None = None
    beta: float | None = None
    dividend_yield_percent: float | None = None
    dividend_ex_date: date | None = None
    lendability: str | None = None


class EarningsContextV1(BaseModel):
    status: Literal["confirmed", "estimated", "unavailable"] = "unavailable"
    earnings_date: date | None = None
    earnings_time: str | None = None
    source: str | None = None
    detail: str | None = None


class ExposureContextV1(BaseModel):
    is_held: bool = False
    account_numbers: list[str] = Field(default_factory=list)
    asset_classes: list[AssetClass] = Field(default_factory=list)
    net_underlying_quantity: float | None = None
    option_position_count: int = 0


class ResearchSymbolItemV1(BaseModel):
    symbol: str
    watchlists: list[WatchlistMembershipV1] = Field(default_factory=list)
    price: PriceContextV1 = Field(default_factory=PriceContextV1)
    volatility: VolatilityContextV1 = Field(default_factory=VolatilityContextV1)
    earnings: EarningsContextV1 = Field(default_factory=EarningsContextV1)
    profile: ProfileContextV1 = Field(default_factory=ProfileContextV1)
    exposure: ExposureContextV1 = Field(default_factory=ExposureContextV1)
    source_status: list[SourceMetadataV1] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class ResearchSymbolContextV1(BaseModel):
    schema_version: Literal["research-symbol-context.v1"] = (
        "research-symbol-context.v1"
    )
    generated_at: datetime
    requested_symbols: list[str]
    items: list[ResearchSymbolItemV1]
    missing_symbols: list[str] = Field(default_factory=list)
    source_status: list[SourceMetadataV1] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class ResearchMetricObservationV1(BaseModel):
    schema_version: Literal["research-metric-observation.v1"] = (
        "research-metric-observation.v1"
    )
    symbol: str
    observation_date: date
    observed_at: datetime
    fetched_at: datetime
    source: str = "tastytrade"
    mark: float | None = None
    previous_close: float | None = None
    iv_index_percent: float | None = None
    iv_rank_percent: float | None = None
    iv_percentile_percent: float | None = None
    iv_index_5_day_change_percent: float | None = None
    liquidity_rating: float | None = None

    model_config = {"extra": "forbid"}


class ResearchSymbolContextRequestV1(BaseModel):
    symbols: list[str] = Field(min_length=1, max_length=100)

    model_config = {"extra": "forbid"}


class BrokerWatchlistSummaryV1(BaseModel):
    name: str
    group_name: str | None = None
    order_index: int | None = None
    symbols: list[str] = Field(default_factory=list)
    symbol_count: int

    model_config = {"extra": "forbid"}


class BrokerWatchlistListV1(BaseModel):
    schema_version: Literal["broker-watchlists.v1"] = "broker-watchlists.v1"
    writes_enabled: bool
    watchlists: list[BrokerWatchlistSummaryV1]

    model_config = {"extra": "forbid"}


class BrokerWatchlistResearchV1(BaseModel):
    schema_version: Literal["broker-watchlist-research.v1"] = (
        "broker-watchlist-research.v1"
    )
    generated_at: datetime
    writes_enabled: bool
    watchlists: list[BrokerWatchlistSummaryV1]
    items: list[ResearchSymbolItemV1]
    missing_symbols: list[str] = Field(default_factory=list)
    source_status: list[SourceMetadataV1] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class AddWatchlistSymbolRequestV1(BaseModel):
    symbol: str = Field(
        min_length=1,
        max_length=32,
        pattern=r"^[A-Za-z0-9.^/-]+$",
    )
    instrument_type: Literal["Equity"] = "Equity"

    model_config = {"extra": "forbid"}


class AddWatchlistSymbolResultV1(BaseModel):
    schema_version: Literal["watchlist-symbol-write.v1"] = (
        "watchlist-symbol-write.v1"
    )
    watchlist: BrokerWatchlistSummaryV1
    symbol: str
    added: bool

    model_config = {"extra": "forbid"}


class OptionChainMetadataV1(BaseModel):
    schema_version: Literal["option-chain-metadata.v1"] = "option-chain-metadata.v1"
    generated_at: datetime
    underlying_symbol: str
    expirations: list[dict[str, Any]]
    source: SourceMetadataV1

    model_config = {"extra": "forbid"}


class OptionQuoteSnapshotRequestV1(BaseModel):
    underlying_symbol: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9.^/-]+$")
    option_symbols: list[str] = Field(min_length=1, max_length=100)
    include_model_values: bool = False

    model_config = {"extra": "forbid"}


class OptionQuoteObservationV1(BaseModel):
    symbol: str
    quoted_at: datetime | None = None
    mark: float | None = None
    bid: float | None = None
    ask: float | None = None
    bid_size: float | None = None
    ask_size: float | None = None
    volume: float | None = None
    open_interest: float | None = None
    delta: float | None = None
    gamma: float | None = None
    theta: float | None = None
    vega: float | None = None
    rho: float | None = None
    implied_volatility: float | None = None
    theo_price: float | None = None

    model_config = {"extra": "forbid"}


class OptionQuoteSnapshotV1(BaseModel):
    schema_version: Literal["option-quote-snapshot.v1"] = "option-quote-snapshot.v1"
    generated_at: datetime
    underlying_symbol: str
    requested_option_symbols: list[str]
    observations: list[OptionQuoteObservationV1]
    missing_option_symbols: list[str] = Field(default_factory=list)
    source: SourceMetadataV1
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class ExpirationImpliedVolatilityV1(BaseModel):
    expiration_date: date
    settlement_type: str | None = None
    option_chain_type: str | None = None
    implied_volatility: float | None = None

    model_config = {"extra": "forbid"}


class MarketMetricV1(BaseModel):
    symbol: str
    implied_volatility_index: float | None = None
    implied_volatility_index_rank: float | None = None
    implied_volatility_percentile: float | None = None
    implied_volatility_index_5_day_change: float | None = None
    implied_volatility_30_day: float | None = None
    historical_volatility_30_day: float | None = None
    historical_volatility_60_day: float | None = None
    historical_volatility_90_day: float | None = None
    iv_hv_30_day_difference: float | None = None
    implied_volatility_updated_at: datetime | None = None
    expiration_implied_volatilities: list[ExpirationImpliedVolatilityV1] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class MarketMetricsV1(BaseModel):
    schema_version: Literal["market-metrics.v1"] = "market-metrics.v1"
    generated_at: datetime
    requested_symbols: list[str]
    metrics: list[MarketMetricV1]
    missing_symbols: list[str] = Field(default_factory=list)
    source: SourceMetadataV1
    cached: bool = False

    model_config = {"extra": "forbid"}
