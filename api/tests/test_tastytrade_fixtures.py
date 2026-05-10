import json
from pathlib import Path

from app.schemas.trades import LlmPositionsSummaryResponse, MarketDataSummaryResponse
from app.services import trades_service
from app.services.trades_service import (
    apply_balance,
    apply_volatility,
    augment_positions_with_market_data,
    build_llm_positions_summary,
    build_market_data_summary,
    collect_positions_and_symbols,
    fetch_accounts,
    fetch_market_and_beta_data,
    group_positions_and_compute_totals,
)
from app.tastytrade_schema import (
    TastyAccount,
    TastyAccountBalance,
    TastyMarketData,
    TastyPosition,
    TastyVolatilityMetric,
)


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "tastytrade"


def load_fixture(name: str) -> dict:
    with (FIXTURE_DIR / name).open() as fixture:
        return json.load(fixture)


def fixture_items(name: str) -> list[dict]:
    return load_fixture(name)["data"]["items"]


def test_tastytrade_response_fixtures_parse_into_typed_models():
    accounts = [
        TastyAccount.model_validate(item["account"])
        for item in fixture_items("accounts.json")
    ]
    positions = [
        TastyPosition.model_validate(item)
        for item in fixture_items("positions_SIM123.json")
    ]
    market_data = [
        TastyMarketData.model_validate(item)
        for item in fixture_items("market_data.json")
    ]
    volatility = [
        TastyVolatilityMetric.model_validate(item)
        for item in fixture_items("volatility.json")
    ]
    balance = TastyAccountBalance.model_validate(load_fixture("balance_SIM123.json")["data"])

    assert accounts[0].account_number == "SIM123"
    assert positions[0].instrument_type == "Equity Option"
    assert market_data[0].theta == "-0.04"
    assert volatility[0].implied_volatility_index_rank == "0.191"
    assert balance.margin_equity == "10000"


def test_market_data_summary_from_fixture_is_compact():
    market_data = [
        TastyMarketData.model_validate(item)
        for item in fixture_items("market_data.json")
    ]
    summary = build_market_data_summary(market_data, ["SPY", "QQQ", "/ESM6"])
    parsed = MarketDataSummaryResponse.model_validate(summary)

    spy = next(item for item in summary["items"] if item["symbol"] == "SPY")
    assert "theta" not in spy
    assert "vega" not in spy
    assert parsed.missing_symbols == ["/ESM6"]


def test_llm_positions_summary_from_sanitized_tastytrade_fixtures(monkeypatch):
    accounts = [
        TastyAccount.model_validate(item["account"])
        for item in fixture_items("accounts.json")
    ]
    positions = [
        TastyPosition.model_validate(item)
        for item in fixture_items("positions_SIM123.json")
    ]
    market_data = [
        TastyMarketData.model_validate(item)
        for item in fixture_items("market_data.json")
    ]
    volatility = [
        TastyVolatilityMetric.model_validate(item)
        for item in fixture_items("volatility.json")
    ]
    balance = TastyAccountBalance.model_validate(load_fixture("balance_SIM123.json")["data"])

    monkeypatch.setattr(trades_service.tastytrade, "fetch_accounts", lambda token: accounts)
    monkeypatch.setattr(trades_service.tastytrade, "fetch_positions", lambda token, account: positions)
    monkeypatch.setattr(trades_service.tastytrade, "fetch_market_data", lambda *args: market_data)
    monkeypatch.setattr(trades_service.tastytrade, "fetch_volatility_data", lambda *args: volatility)
    monkeypatch.setattr(trades_service.tastytrade, "fetch_account_balance", lambda *args: balance)

    account_dicts = fetch_accounts("FAKE")
    (
        positions_by_account,
        equity_option_syms,
        future_option_syms,
        equity_underlyings,
        future_underlyings,
    ) = collect_positions_and_symbols("FAKE", account_dicts)
    market_map, beta_map = fetch_market_and_beta_data(
        "FAKE",
        equity_option_syms,
        future_option_syms,
        equity_underlyings,
        future_underlyings,
    )
    augment_positions_with_market_data(positions_by_account, market_map, beta_map)
    accounts_data = group_positions_and_compute_totals(positions_by_account, beta_map)
    apply_volatility("FAKE", accounts_data)
    apply_balance("FAKE", accounts_data)

    summary = build_llm_positions_summary(accounts_data)
    parsed = LlmPositionsSummaryResponse.model_validate(summary)
    account = parsed.accounts[0]

    assert parsed.portfolio.account_count == 1
    assert parsed.portfolio.position_count == 5
    assert parsed.portfolio.percent_used_bp == 8
    assert account.groups[0].strategy is not None
    assert account.groups[0].strategy.label == "jade_lizard"
    assert any(strategy.label == "calendar" for strategy in account.underlying_strategies)
    assert any(group.iv_rank_percent == 19.1 for group in account.groups)
