# Raspberry Pi operations

The Raspberry Pi at `192.168.50.245` runs Trade Journal under the `roost` user.
Local tests are the deployment gate; CI is intentionally deferred. SSH keys,
brokerage credentials, databases, and other machine state stay outside Git.

## One-time SSH setup

The WSL environment already has `~/.ssh/id_ed25519`. Install its public key on
the Pi if key authentication is not already enabled:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub roost@192.168.50.245
ssh roost@192.168.50.245
```

After verifying the Pi's host-key fingerprint and key login, create
`~/.ssh/config` in WSL:

```sshconfig
Host trading-pi
  HostName 192.168.50.245
  User roost
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

Protect and test the configuration:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config ~/.ssh/id_ed25519
ssh trading-pi
```

Only disable SSH password authentication after key login has been verified in a
second terminal. Do not expose port 22 directly to the internet; use a private
VPN such as Tailscale when off-LAN access is needed.

## Pi prerequisites

The deployment user needs Git, Docker with the Compose plugin, curl, and
Python 3. The checkout defaults to `~/trade-journal`. To use a different path,
set `TRADE_JOURNAL_REMOTE_DIR` on the workstation.

The production `.env` deliberately controls `LIVE_TRADING_ENABLED`. It must
never be committed or copied into backups intended for sharing.

From WSL, validate the host before the first managed deployment:

```bash
scripts/pi-ops.sh preflight
```

## Routine commands

```bash
# Run backend tests, dependency consistency, a clean UI install/build,
# spec type-checking, and Compose validation locally.
scripts/pi-ops.sh check

# Run local checks, back up SQLite, deploy origin/main, and verify health.
scripts/pi-ops.sh deploy

# Deploy an exact tag, branch, or commit after local checks.
scripts/pi-ops.sh deploy v0.2.0

# Inspect revision, containers, health, disk space, and recent backups.
scripts/pi-ops.sh status

# Inspect all logs or one service.
scripts/pi-ops.sh logs
scripts/pi-ops.sh logs api

# Create an online SQLite backup without stopping the application.
scripts/pi-ops.sh backup

# Return to the revision recorded before the most recent deployment.
scripts/pi-ops.sh rollback
```

Backups default to `~/backups/trade-journal` on the Pi and are retained for 30
days. Deployment state is stored in `~/.local/state/trade-journal`. Both are
outside the Git checkout.

For an emergency only, `SKIP_LOCAL_CHECK=1 scripts/pi-ops.sh deploy` bypasses
the local gate. The remote dirty-checkout, database backup, container rebuild,
and health verification still run.

## Recovery notes

If health verification fails, inspect `scripts/pi-ops.sh logs` before deciding
whether to roll back. A rollback rebuilds the recorded prior Git revision and
does not restore an older database automatically. Database restoration remains
an explicit operation so a code rollback cannot silently discard journal data.

Before restoring a database, stop the API and make another copy of the current
database. Record the exact backup selected and verify the journal after restart.
