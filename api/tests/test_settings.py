from app.settings import settings


def test_settings_defaults():
    assert settings.database_url
    assert settings.tastytrade_url == "https://api.tastyworks.com"
    assert settings.tastytrade_timeout_seconds == 20
    assert settings.tastytrade_user_agent == "trade-journal/0.1"
