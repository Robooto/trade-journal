import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./journal.db")
    tastytrade_url: str = os.getenv("TASTYTRADE_URL", "https://api.tastyworks.com")
    tastytrade_timeout_seconds: float = float(os.getenv("TASTYTRADE_TIMEOUT_SECONDS", "20"))
    tastytrade_user_agent: str = "trade-journal/0.1"


settings = Settings()
