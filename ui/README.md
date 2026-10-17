# Trade Journal UI

Angular 21 single-page app with Angular Material (dark M3 theme, azure palette),
Tailwind utilities, `lightweight-charts` for price charts, and Vitest for unit tests.

## Sections

| Route | Folder | What it shows |
|---|---|---|
| `/dashboard` | `dashboard/` | Desk strip (paper arms, research status), daily checklist, recent journal entries |
| `/journal` | `journal/` | Journal entries, latest-session broker activity |
| `/trace` | `trace/` | TRACE session workspace, research summary, paper experiments |
| `/positions` | `positions/` | Option positions by account with risk context and bracket exits |
| `/charts` | `charts/` | Price charts and the equity analysis package |
| `/pivot-tracker` | `pivot-tracker/` | SpotGamma pivot levels with age and change |
| `/research/flow-ideas`, `/research/watchlists` | `research/` | FlowPatrol ideas, contract flow ledger, watchlist research |

`/v1` calls go to the Trade Journal API; `/research-api` calls go to the
market-data pipeline API (`/api/...`). In production both are same-origin and the UI
container's Nginx proxies them.

## Development

From the repository root, `make setup` once, then `make dev` (Angular dev server on
`http://localhost:4200`). It sends `/v1` calls to a local API on `localhost:8876`
(`src/environments/environment.ts`) and proxies `/research-api` to the pipeline on
mini (`proxy.conf.json`). `make test-ui` type-checks specs and runs Vitest once;
`make smoke` checks the deployed TRACE and paper views in a browser.

`make test-ui` can leave a running dev server unable to resolve `zone.js`; restart
it if that happens. Commands, contract generation and component ownership are in
[`../docs/development.md`](../docs/development.md).
