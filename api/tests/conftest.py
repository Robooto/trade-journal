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

