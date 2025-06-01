# trade-journal
Building out a trade journal and some analysis tools


## Running the project

``docker compose up --build``

## Pie deployment
Initial
```
git clone
docker-compose up --build -d
```
Subsequent updates
```
cd trade-journal
git pull
docker compose down
docker-compose up --build -d