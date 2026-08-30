# Container runtime

## API image

The API uses a multi-stage Python image:

- The `builder` stage contains compilers and Python development headers and
  installs the hash-locked production dependencies.
- The `runtime` stage receives only installed Python packages and application
  source. Build tools are not present in the shipped image.
- Uvicorn normally runs as the non-root `app` user with UID/GID 1000. On the
  mini, `docker-compose.mini.yml` uses container UID/GID 0 with the host's
  rootless Docker daemon; that maps to the unprivileged `roost` account and
  permits access to its owner-only SQLite bind mount.
- An image healthcheck calls `GET /v1/` with Python's standard library, avoiding
  an extra curl package.

The July 2026 baseline fell from approximately 764 MB to 374 MB. The root
`.dockerignore` also reduced the API build context from hundreds of megabytes to
roughly 228 KB by excluding Git state, secrets, databases, virtual environments,
Node dependencies, and generated output.

Do not use `docker-compose.mini.yml` with a rootful Docker daemon. Before
changing its runtime identity or the ownership of `api/journal.db`, take an
online backup and verify a database write through the rebuilt container.

The image healthcheck verifies that the HTTP process responds. Database-aware
readiness remains a separate follow-up and should use a dedicated endpoint
rather than expanding the greeting route.
