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
pip install -r api/requirements.txt
pytest
```

## Running the API locally on pycharm community edition
## make sure to create your virtual environment first and .env file is set up
```aiignore
# cd into the api directory
source .venv/bin/activate
uvicorn app.main:app \
  --reload \
  --host 0.0.0.0 \
  --port 8876 \
  --env-file /home/boots/code/trade-journal/.env
```


```http://localhost:8876/docs```