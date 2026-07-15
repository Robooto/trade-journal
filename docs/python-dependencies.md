# Python dependency ownership

The API uses two small input files and two generated, hash-locked install files:

- `api/requirements.in` lists direct production dependencies.
- `api/requirements-dev.in` adds direct test dependencies.
- `api/requirements.txt` is the generated production lock used by Docker.
- `api/requirements-dev.txt` is the generated local test lock.

## Audited direct dependencies

Production:

- FastAPI: API framework.
- Uvicorn: container application server entrypoint.
- Pydantic: request, response, and brokerage data models.
- SQLAlchemy: SQLite models and sessions.
- Requests: Tastytrade HTTP client.
- pandas and yfinance: chart history and market-data analysis.

Development only:

- pytest and pytest-asyncio: backend test runner and async fixtures.
- HTTPX: in-process API test client.
- NumPy: imported directly by chart tests; production receives it transitively
  through pandas/yfinance.

## Removed experimental dependencies

The July 2026 audit found these packages installed in the historical virtual
environment but unused by all repository Python source and tests:

- opencv-python-headless
- Playwright
- pytesseract
- Selenium
- python-multipart
- python-dotenv
- PySocks

They are intentionally absent from both direct dependency inputs and from the
production lock unless required transitively in the future. A clean Python 3.11
environment created only from the development lock passes the complete backend
test suite.

## Regenerating locks

Run lock generation from the repository root after deliberately changing an
input file:

```bash
uv pip compile --generate-hashes --python-version 3.11 \
  --output-file api/requirements.txt api/requirements.in
uv pip compile --generate-hashes --python-version 3.11 \
  --output-file api/requirements-dev.txt api/requirements-dev.in
```

Review the resolved-version diff and run `scripts/check-local.sh`. Do not edit a
generated lock by hand or combine framework major upgrades with unrelated
dependency cleanup.
