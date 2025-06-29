# trade-journal
A trading journal for your tastytrade account with tastytrade rules analysis of your positions.  Work in Progress

## Running the project

```
docker compose up --build
```

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
SPOTGAMMA_USERNAME=your_spotgamma_username
SPOTGAMMA_PASSWORD=your_spotgamma_password

docker compose up --build -d  # The '-d' flag runs containers in detached mode (in the background)
```

Subsequent updates
```
cd trade-journal
git pull
docker compose down
docker compose up --build -d
```
