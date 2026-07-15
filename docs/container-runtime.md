# Container runtime

## API image

The API uses a multi-stage Python image:

- The `builder` stage contains compilers and Python development headers and
  installs the hash-locked production dependencies.
- The `runtime` stage receives only installed Python packages and application
  source. Build tools are not present in the shipped image.
- Uvicorn runs as the non-root `app` user with UID/GID 1000, matching the
  Raspberry Pi `roost` deployment account and its bind-mounted SQLite file.
- An image healthcheck calls `GET /v1/` with Python's standard library, avoiding
  an extra curl package.

The July 2026 baseline fell from approximately 764 MB to 374 MB. The root
`.dockerignore` also reduced the API build context from hundreds of megabytes to
roughly 228 KB by excluding Git state, secrets, databases, virtual environments,
Node dependencies, and generated output.

Do not change `APP_UID` or `APP_GID` on the Pi without first migrating ownership
of `api/journal.db` and verifying a database write through the container. The
current deployment intentionally uses UID/GID 1000.

The image healthcheck verifies that the HTTP process responds. Database-aware
readiness remains a separate follow-up and should use a dedicated endpoint
rather than expanding the greeting route.
