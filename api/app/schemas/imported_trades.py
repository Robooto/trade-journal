from datetime import date, datetime, timezone

from pydantic import BaseModel, Field, field_validator


class TastyActivityCsvImportRequestV1(BaseModel):
    csv_text: str = Field(min_length=1)
    as_of_date: date | None = None


class ImportedSpreadTradeV1(BaseModel):
    id: int
    source: str
    symbol: str
    account_number: str
    entry_order_id: str
    exit_order_id: str
    entry_ts: datetime
    exit_ts: datetime
    expiration_date: date
    zero_dte: bool
    strategy: str
    option_right: str
    low_strike: float
    high_strike: float
    short_strike: float | None = None
    long_strike: float | None = None
    width: float
    quantity: int
    entry_price: float
    entry_side: str
    exit_price: float
    exit_side: str
    gross_pnl_dollars: float
    max_risk_dollars: float | None = None
    holding_minutes: float

    @field_validator("entry_ts", "exit_ts")
    @classmethod
    def ensure_utc_offset(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

    model_config = {"from_attributes": True}


class TastyActivityCsvImportResultV1(BaseModel):
    schema_version: str = "imported-spread-trades.v1"
    source_rows: int
    filled_orders: int
    paired_positions: int
    imported: int
    existing: int
    unmatched_open_orders: int
    unmatched_close_orders: int
    ignored_non_vertical_pairs: int
    trades: list[ImportedSpreadTradeV1]


class BrokerHistorySyncRequestV1(BaseModel):
    start_date: date
    end_date: date


class BrokerHistorySyncResultV1(TastyActivityCsvImportResultV1):
    accounts: int
    warnings: list[str] = Field(default_factory=list)


class ImportedSpreadTradeListV1(BaseModel):
    schema_version: str = "imported-spread-trades.v1"
    total: int
    rows: list[ImportedSpreadTradeV1]
