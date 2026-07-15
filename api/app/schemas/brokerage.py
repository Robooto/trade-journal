from datetime import date, datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class DataStatus(str, Enum):
    OK = "ok"
    PARTIAL = "partial"
    STALE = "stale"
    UNAVAILABLE = "unavailable"


class SourceMetadataV1(BaseModel):
    source: str
    endpoint: Optional[str] = None
    fetched_at: datetime
    observed_at: Optional[datetime] = None
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
    average_open_price: Optional[float] = None
    mark: Optional[float] = None
    close_price: Optional[float] = None
    market_value_dollars: Optional[float] = None
    signed_cost_basis_dollars: Optional[float] = None
    unrealized_pl_dollars: Optional[float] = None
    expires_at: Optional[datetime] = None
    missing_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class AccountHoldingSnapshotV1(BaseModel):
    account_number: str
    nickname: str = ""
    account_type: Optional[str] = None
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
    transaction_type: Optional[str] = None
    transaction_sub_type: Optional[str] = None
    order_id: Optional[str] = None
    broker_transaction_id: Optional[str] = None
    group_fill_id: Optional[str] = None
    symbol: Optional[str] = None
    underlying_symbol: Optional[str] = None
    instrument_type: Optional[str] = None
    action: Optional[str] = None
    quantity: Optional[float] = None
    price: Optional[float] = None
    value_dollars: Optional[float] = None
    net_value_dollars: Optional[float] = None
    fees_dollars: Optional[float] = None
    description: Optional[str] = None
    grouping_status: Literal["explicit", "ungrouped", "ambiguous"] = "ungrouped"
    source: SourceMetadataV1
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class WatchlistMembershipV1(BaseModel):
    name: str
    group_name: Optional[str] = None
    source: Literal["private", "public"] = "private"


class PriceContextV1(BaseModel):
    mark: Optional[float] = None
    previous_close: Optional[float] = None
    day_change_percent: Optional[float] = None
    five_session_change_percent: Optional[float] = None
    as_of: Optional[datetime] = None


class VolatilityContextV1(BaseModel):
    iv_index_percent: Optional[float] = None
    iv_rank_percent: Optional[float] = None
    iv_percentile_percent: Optional[float] = None
    iv_index_5_day_change_percent: Optional[float] = None
    iv_rank_5_day_change_percent: Optional[float] = None
    liquidity_rating: Optional[float] = None
    as_of: Optional[datetime] = None


class EarningsContextV1(BaseModel):
    status: Literal["confirmed", "estimated", "unavailable"] = "unavailable"
    earnings_date: Optional[date] = None
    earnings_time: Optional[str] = None
    source: Optional[str] = None
    detail: Optional[str] = None


class ExposureContextV1(BaseModel):
    is_held: bool = False
    account_numbers: list[str] = Field(default_factory=list)
    asset_classes: list[AssetClass] = Field(default_factory=list)
    net_underlying_quantity: Optional[float] = None
    option_position_count: int = 0


class ResearchSymbolItemV1(BaseModel):
    symbol: str
    watchlists: list[WatchlistMembershipV1] = Field(default_factory=list)
    price: PriceContextV1 = Field(default_factory=PriceContextV1)
    volatility: VolatilityContextV1 = Field(default_factory=VolatilityContextV1)
    earnings: EarningsContextV1 = Field(default_factory=EarningsContextV1)
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
