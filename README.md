# trade-journal

The personal trading operations app for journal notes, Tastytrade-backed
positions and account context, trading-rule review, charts, and portable data
packs for OpenClaw or other LLMs.

See [docs/product-roadmap.md](docs/product-roadmap.md) for the current capability
map and next priorities. Brokerage routes remain owned by this project; other
workspace projects should use documented local APIs instead of creating another
Tastytrade client.

## Current capabilities

- A morning dashboard that preserves the daily research links and hands off directly to the journal.
- Journal entry API and Angular journal views with automatic local drafts, optional
  ticker tags, note/symbol search, context links to positions/research, and a fast
  today-entry workflow.
- Recent journal activity on the morning dashboard, immediately after research.
- Tastytrade authentication, account discovery, balances, positions, quote
  snapshots, and volatility metrics.
- Option positions grouped by account, underlying, and expiration with marks,
  approximate P/L, credit progress, delta/beta-delta, IV rank, and IV change.
- Visible management checks for 21 DTE, 50% profit, 2x loss, and low IV rank.
- A position attention queue with explicit Greek units, refresh/error states, charts, and leg detail.
- A single-leg bracket-order workflow that previews by default and requires explicit live confirmation.
- Historical price charts and a versioned equity analysis package.
- LLM-friendly position, market-data, volatility, and equity-analysis responses.

## Equity analysis package

```text
GET /v1/charts/analysis-package/NVDA
GET /v1/charts/analysis-package/NVDA?format=markdown
```

The package combines chart bars and features, normalized Tastytrade quote and
volatility context, portfolio exposure, a dated SpotGamma EquityHub
link, and explicit source warnings. The chart page can add manually entered
SpotGamma levels and download JSON or copy the complete Markdown handoff.

The package does not replace current option-chain, quote, Greek, liquidity,
catalyst, portfolio-risk, or trading-plan checks before exact contracts are
considered.

## Running the project

```bash
docker compose up --build
```

## Safety configuration

Live bracket-order submission is disabled by default. The UI always creates a
server preview first and requires an explicit acknowledgement before sending.
To permit the confirmed submission on a trusted host, set:

```dotenv
LIVE_TRADING_ENABLED=true
```

Leave the value false or unset anywhere that should remain read-only. Production
UI requests use same-origin `/v1` routing through Nginx. `CORS_ORIGINS` is only
needed for separately hosted development clients and accepts a comma-separated
list of allowed origins.
## Pi deployment

Initial setup:

```bash
git clone https://github.com/Robooto/trade-journal.git
cd trade-journal
cp .env.example .env
nano .env
# Add broker credentials and deliberately choose whether live trading is enabled.
docker compose up --build -d
```

Subsequent updates:

```bash
cd trade-journal
git pull
docker compose down
docker compose up --build -d
```

Keep credentials out of Git and restrict access to local environment files.
