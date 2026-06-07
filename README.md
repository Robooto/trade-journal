# trade-journal
A trading journal for your tastytrade account with tastytrade rules analysis of your positions.  Work in Progress

## Running the project

```
docker compose up --build
```

## Equity analysis package

The chart API exposes one versioned package for the Angular chart page,
OpenClaw, and portable ChatGPT handoffs:

```text
GET /v1/charts/analysis-package/NVDA
GET /v1/charts/analysis-package/NVDA?format=markdown
```

The package combines chart bars and features, normalized Tastytrade quote and
volatility context, portfolio exposure, a dated SpotGamma Equity Hub link, and
explicit source warnings. The chart page can add manually entered SpotGamma
levels to the same package and download JSON or copy the complete Markdown
handoff.

## Pi deployment
Initial
```
git clone https://github.com/Robooto/trade-journal.git

cd trade-journal

# setup env
> **Warning:** Storing plain text passwords in `.env` files can be a security risk.  
> Consider using a secrets manager or restricting file permissions to protect sensitive credentials.

nano .env
TASTYTRADE_USERNAME=your_username_here
TASTYTRADE_PASSWORD=your_super_secret_password
TASTYTRADE_URL=https://api.tastytrade.com

docker compose up --build -d  # The '-d' flag runs containers in detached mode (in the background)
```

Subsequent updates
```
cd trade-journal
git pull
docker compose down
docker compose up --build -d
```
