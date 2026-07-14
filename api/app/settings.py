import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./journal.db")
    tastytrade_url: str = os.getenv("TASTYTRADE_URL", "https://api.tastyworks.com")
    tastytrade_timeout_seconds: float = float(os.getenv("TASTYTRADE_TIMEOUT_SECONDS", "20"))
    tastytrade_user_agent: str = "trade-journal/0.1"
    live_trading_enabled: bool = _env_bool("LIVE_TRADING_ENABLED", False)
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:4200,http://127.0.0.1:4200"
        ).split(",")
        if origin.strip()
    )


settings = Settings()
