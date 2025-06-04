import os
import pytest_asyncio
from httpx import AsyncClient

# Use a temporary SQLite database for tests
TEST_DB_PATH = os.path.abspath("test.db")
# If DATABASE_URL isn't already set, point it to our temp file
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB_PATH}")

from app.main import app  # noqa: E402

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

