# Development and maintenance

Run `make` from this repository to list the supported commands. Node must meet
`ui/package.json`'s engine requirement; Python development dependencies are pinned
in `api/requirements-dev.txt`. The commands use GNU Make, Bash, npm, and Python.

## Daily workflow

Run `make setup` once after cloning, or after dependency lockfiles change. It
creates `api/.venv`, installs the locked API development dependencies, and runs
`npm ci` for the UI. Then use:

| Command | Purpose |
| --- | --- |
| `make test-ui` | Type-check specs and run UI tests with installed dependencies |
| `make test-api` | Run the API suite with installed dependencies |
| `make test` | Run API, UI, and deployment guard suites |
| `make test-ops` | Test deployment guards with isolated Git repos and fake services |
| `make smoke` | Read-only browser check of the deployed TRACE and paper views |
| `make test-api ARGS="-k journal"` | Limit API tests during a change |
| `make test-ui ARGS="--include=src/app/trace/**/*.spec.ts"` | Limit UI tests during a change |
| `make dev` | Start the Angular development server |
| `make contracts` | Check generated research schema and TypeScript types |
| `make contracts-update` | Regenerate both after changing pipeline contracts |
| `make check` | Full deployment gate, including clean dependency installs and production build |

`make dev` uses the existing development environment: brokerage/journal requests
go to localhost:8876 and `/research-api` is proxied to the mini pipeline by
`ui/proxy.conf.json`. It does not start either backend. See
[API setup](../api/README.md) for the local backend. To work on a local pipeline,
run its `make dev` in another terminal and change the development research proxy
target to localhost:8765; restore that local configuration before committing.

Research contract commands require the sibling `../market-data-pipeline`
checkout and its `.venv` (`make setup` there). They fail if that dependency is
missing. A standalone Trade Journal checkout can build from committed generated
types; the existing full gate checks drift when the pipeline virtualenv exists.

## Deploying to mini

After reviewing, committing, and pushing changes, run `make deploy`. It deploys
the current local commit by default, keeping the tested revision explicit.
`make deploy REF=<pushed-commit-or-tag>` selects another revision; check out that
revision locally first. Both entry points reject a ref that does not resolve to
local HEAD. Deployment requires committed tracked files and no untracked files
under `api/app`, `api/tests`, `ui`, or `scripts`; unrelated local notes are left
alone. HEAD and the checkout are checked again after testing. The remote receives
the full commit ID, verifies it before backup/rebuild, and serializes deployments
and rollbacks with `flock`. The successful revision is recorded only after both
health checks pass. `SKIP_LOCAL_CHECK=1` is an explicit emergency test override;
it does not bypass revision or checkout checks and reports that tests were skipped.

This delegates to `scripts/mini-ops.sh`: the complete local gate, remote database
backup, revision tracking, container rebuild, and application/research health
checks are preserved. `make status` shows the deployed revision and health.
See [mini operations](mini-operations.md) for preflight, logs, and rollback.

## Browser smoke check

`make smoke` uses pinned `@playwright/cli` 0.1.21 through `npx` and defaults to
`http://192.168.50.248:8877/trace`. It exercises TRACE loading, paper history,
date-range persistence across tabs, a recorded replay, and the contract ledger.
It reads evidence and changes only browser form state. It does not submit a
historical range or any trading action. Browser errors fail the check.

The workstation needs Node/npm and Chrome available to Playwright. Set
`PLAYWRIGHT_CONFIG=/absolute/path/config.json` to use an installed Chromium
instead, for example:

```json
{"browser":{"browserName":"chromium","launchOptions":{"executablePath":"/absolute/path/to/chromium","headless":true}}}
```

```bash
PLAYWRIGHT_CONFIG=/absolute/path/config.json make smoke
SMOKE_URL=http://localhost:4200/trace make smoke
```

The check intentionally requires a latest session with a recorded replay path.
Missing replay evidence fails as an incomplete smoke check, rather than silently
passing. Logs and a screenshot are saved under ignored
`output/playwright/smoke-*/`; inspect `result.log` when a check fails. Smoke checks
are separate from `make check` and deployment so an unavailable browser or a
new session without trades does not prevent a needed service deployment.

## TRACE component boundaries

- `TracePageComponent`: tabs, session/capture navigation, refresh scheduling,
  marked price levels and proximity alerts.
- `PaperWorkspaceComponent`: paper date range, historical scorecard, replay
  selection, and research/ledger disclosure state. It uses the same
  `TraceFacade` as the page and stays mounted across tab changes so selections
  persist. Current paper requests and ledger rendering remain gated by the
  active tab.
- `PaperReplayChartComponent`: renders an input replay, preserving recorded
  timestamp spacing and gaps. It does not inject the facade or fetch data.
- `data-access/paper.models.ts`: shared ledger/leg response types used by the
  API client and both paper views; generated summary contracts remain pipeline-owned.
- `TraceFacade`: session data, API requests, cancellation and response state.
- `PaperNowComponent` and `PaperLedgerComponent`: catalog-driven current paper
  presentation and exact contract evidence, respectively.

Scoped styles live with their components. `_workspace-common.scss` contains
only the presentation rules shared by the page and paper workspace. Add future
paper controls to the paper workspace rather than the TRACE navigation page;
keep trading calculations and research policy in the pipeline.
