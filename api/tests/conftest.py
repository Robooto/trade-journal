import os
import pytest
import pytest_asyncio
from httpx import AsyncClient

# Use a temporary SQLite database for tests
TEST_DB_PATH = os.path.abspath("test.db")
# If DATABASE_URL isn't already set, point it to our temp file
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB_PATH}")

# Remove any leftover test database before importing the app so that each test
# run starts with a clean slate.
if os.path.exists(TEST_DB_PATH):
    os.remove(TEST_DB_PATH)

from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def no_real_tastytrade(monkeypatch):
    """Tests must stub tastytrade; a real HTTP call fails loudly instead of reaching the network."""
    from app import tastytrade

    class RefusingSession:
        def request(self, method, url, **kwargs):
            raise AssertionError(f"test attempted a real tastytrade request: {method} {url}")

    monkeypatch.setattr(tastytrade, "_session", RefusingSession)


@pytest.fixture(autouse=True)
def reset_tastytrade_caches():
    """The client caches the access token and account list in-process; keep tests independent."""
    from app import tastytrade

    tastytrade.reset_caches()
    yield
    tastytrade.reset_caches()


@pytest.fixture(scope="session", autouse=True)
def cleanup_db():
    """Delete the temporary test database once the test session is over."""
    yield
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

