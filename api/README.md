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
