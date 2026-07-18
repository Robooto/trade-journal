# Research proxy operations

Last reviewed: 2026-07-18

The Trade Journal UI exposes market-data research through the same browser
origin while leaving the backend on the mini:

```text
/research-api/api/flowpatrol/*
  -> UI Nginx
  -> RESEARCH_BACKEND_URL/api/flowpatrol/*
```

The Raspberry Pi deployment defaults to
`RESEARCH_BACKEND_URL=http://192.168.50.248:8765`. Override it in the Pi
`.env` when the mini address or port changes. Do not include a trailing slash.

## Failure isolation

The UI service does not depend on the mini container and the application's
health check remains `/v1/`, which is served by the Trade Journal API. If the
mini is stopped or unreachable, only `/research-api/*` requests return an
upstream error; journal, positions, and the Angular shell remain available.

The proxy uses a three-second connection timeout. Report processing may take
longer, so its read timeout is 180 seconds. Nginx accepts a 21 MB multipart
request so the FlowPatrol API can enforce its 20 MB PDF-content limit.

## Local Angular development

`npm start` uses `ui/proxy.conf.json`, which targets the mini at
`http://192.168.50.248:8765` and strips the `/research-api` prefix. Change
that development-only target when running market-data-pipeline locally. Angular
source code should always call the relative `/research-api/` path.

## Checks

Render and validate the Compose model:

```bash
docker compose config --quiet
```

Build the UI image to render the Nginx template:

```bash
docker compose build ui
```

After starting the stack, verify the independent paths:

```bash
curl --fail http://127.0.0.1:8877/v1/
curl --fail http://127.0.0.1:8877/research-api/api/health
curl --fail http://127.0.0.1:8877/research-api/api/flowpatrol/dates
```

Stopping or blocking the mini should make the latter two fail without changing
the first result. Research availability is intentionally not part of the
Trade Journal container health check.
