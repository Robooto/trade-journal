# API Notes

## Running the API

```
docker-compose build api
docker-compose up api
docker-compose build api && docker-compose up api
```

## Running tests

Install the dependencies and run `pytest` from the repository root:

```
pip install --require-hashes -r api/requirements-dev.txt
pytest
```

## Running the API locally on pycharm community edition
## make sure to create your virtual environment first and .env file is set up
```
# cd into the api directory
source .venv/bin/activate
uvicorn app.main:app \
  --reload \
  --host 0.0.0.0 \
  --port 8876 \
  --env-file /home/boots/code/trade-journal/.env
```

```
http://localhost:8876/docs
```


## Completed spread history

POST /v1/broker/imported-spread-trades/sync accepts a start_date and end_date,
loads paginated Tastytrade orders and transactions for every account, pairs
completed positions by exact leg exposure, and persists vertical round trips
idempotently. The request window is limited to 181 calendar days.

POST /v1/broker/activity-imports/tastytrade-csv remains available for historical
backfills when brokerage history is unavailable. GET
/v1/broker/imported-spread-trades provides the normalized
