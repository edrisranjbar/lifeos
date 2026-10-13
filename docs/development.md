# Development guide

[← Project overview](../README.md)

## Local application

Configure the application following [Quick start](../README.md#quick-start), then run:

```sh
php -S localhost:8000 -t public_html server.php
```

The browser application uses vanilla JavaScript without a frontend build step. Install the optional MCP server dependencies before running its checks:

```sh
npm ci --prefix mcp
```

## Verification

Account ownership and schema version 3 are described in the [accounts guide](accounts.md). Personal data helpers require the authenticated request identity; operator CLI commands default to the original account. Existing pre-version-3 SQLite fixtures do not include ownership columns and must be updated before they can exercise the current schema.

Session write endpoints share `life_os_require_csrf()` in `auth.php`. Its optional failure callback preserves an endpoint's existing error response or API exception; returning from that callback still rejects the request with HTTP `403`. It validates the session token with `hash_equals` and does not create a missing token.

The browser Habittify endpoint (`GET /habittify/api.php?route=logs&start=YYYY-MM-DD&end=YYYY-MM-DD`) requires both dates to be real, zero-padded ISO calendar dates and `start <= end`. Missing, malformed, impossible or reversed dates return HTTP `400` with the existing `{ "error": "..." }` shape before querying logs. Valid ranges remain inclusive; a single-day range is allowed. This session-authenticated endpoint is separate from the bearer-token API.

Authentication backend failures return an unauthenticated result and write a `LifeOS authentication failed:` diagnostic to PHP's error log with the exception type, code and source location. Exception messages and traces are omitted because they can contain credentials. Ordinary expired or invalid sessions do not produce this diagnostic.

Settings includes a **Sign out** button that sends `POST /logout.php` with the session's `X-CSRF-Token`. Other methods return `405` with `Allow: POST`; a missing or invalid token returns `403` without ending the session. A valid request destroys the session and expires its cookie, returning `{ "ok": true }` when `Accept: application/json` is sent, or a `303` redirect to `/login.php` otherwise. The logout HTTP tests use a temporary PHP server and disposable sessions without loading application configuration or connecting to MySQL.

Tests never load the repository config.php or production credentials:

```sh
node --test tests/*.test.mjs
composer install
vendor/bin/phpunit
php tests/proxy_test.php
php tests/api_test.php
php tests/obligations_test.php
php tests/logout_test.php
php tests/credentials_test.php
php tests/habittify_logs_test.php
php tests/habittify_rollback_test.php
cd mcp && npm test
```

PHP tests require PDO SQLite and mbstring. They exercise auth, JSON validation, rollback/revisions, goals CRUD, both task sources, habits, finance totals and secret notes. Node tests cover schemas, mocked errors, malformed responses, timeout, credential redaction and a real SDK stdio handshake. Optional API integration is skipped unless LIFEOS_TEST_BASE_URL is set.

For actual MySQL verification, start a disposable localhost MySQL/MariaDB instance on port 3308 with a test-only root account and empty password:

```sh
php tests/mysql_fixture.php 3308
php tests/api_mysql_test.php
# In the temporary app directory printed by the fixture command:
php -S localhost:8000 -t public_html server.php
# From the repository, with LIFEOS_TEST_BASE_URL=http://localhost:8000:
cd mcp && npm test
```

The fixture creates a random lifeos_api_test_* database and an app copy in system temp, synthetic sign-in (`api-fixture` / `fixture-only-password`), and a random token saved only in ignored .secrets/api-test-context.json. MySQL tests run concurrent workers. Integration verifies HTTP CRUD, habits, finance persistence through browser state, stale-write conflict and a real MCP process against local API. Stop test processes afterward and remove the disposable database/app copy. Do not run fixtures against a shared or production instance.

PHP syntax checks (POSIX shell):

```sh
php -l api.php
php -l api_auth.php
for file in lib/*.php; do php -l "$file"; done
```


### PowerShell syntax checks

```powershell
php -l api.php
php -l api_auth.php
Get-ChildItem lib/*.php | ForEach-Object { php -l $_.FullName }
```

### Integration environment on Windows

Set the test URL in the repository shell before running the MCP integration checks:

```powershell
$env:LIFEOS_TEST_BASE_URL = "http://localhost:8000"
npm test --prefix mcp
Remove-Item Env:LIFEOS_TEST_BASE_URL
```

Use the disposable fixture server described above. These checks do not verify production Apache configuration or every supported PHP version.

## Implementation boundaries

### Migrations and operator settings

Run `php migrate.php` before serving an upgrade (in Docker, use
`docker compose exec web php migrate.php`). Requests also apply pending versions
under a database advisory lock for shared-host compatibility; current installs
only read the schema version. Migration history is in `schema_migrations`.
Migrations preserve existing state, IDs and credentials, and seed default habits
only when creating the habits table. Deleting every habit never reseeds it.
Back up the database before deployment; MySQL DDL is not transactionally reversible.

After first setup, remove `username`/`password` from config.php or clear
`LIFEOS_USERNAME`/`LIFEOS_PASSWORD` in Docker. Existing sessions with the old
plaintext fingerprint must sign in again. Credentials are stored in MySQL.

`timezone`, `weather_latitude`, `weather_longitude`, and `weather_location` can
be configured in config.php; the `LIFEOS_TIMEZONE`, `LIFEOS_WEATHER_LATITUDE`,
`LIFEOS_WEATHER_LONGITUDE`, and `LIFEOS_WEATHER_LOCATION` environment variables
override them. The timezone controls server `api_today()` and weather forecasts.
Existing browser calendar views still use Tehran dates.

Run `php tests/migrations_test.php 3308` against an isolated local MySQL server
(set `LIFEOS_TEST_DB_PASSWORD` if required) to verify upgrade preservation and
one-time seeding. It creates and removes only randomly named test databases.

See [ownership.md](ownership.md) for the single-owner design decision and the
prerequisites for per-user OAuth integrations.

### Browser scripts

`assets/html-escape.js` supplies the shared text encoder. Classic scripts load it
before application scripts; ES modules import it. Kanban loads its state,
rendering, editing, drag/drop and card modules in the explicit HTML order, then
initializes in app.js. Finance loads state, UI, import, actions, modals and render
scripts sequentially after storage is ready, then initializes in script.js.
Public action handlers retain their names for existing HTML event handlers.

Authenticated HTML/API responses are not cached. Static assets use private
one-hour caching, or one-year immutable caching with a version query. Always
change the version when changing an asset or its imported modules.

- Keep browser and API representations compatible; preserve existing metadata when updating records.
- Deploy revision-aware state handling and its browser client together.
- Keep real configuration, tokens, fixtures, and private uploads out of Git.
- Use a disposable database for destructive integration checks.

## Focus soundtrack

`public_html/assets/focus-audio.js` owns the Focus playlist and audio lifecycle. Users select built-in tracks in a collapsed checkbox picker; selections play in the order they were chosen, advance on `ended`, and repeat the queue. A single selected track repeats itself. Play/Pause resumes the same track position; Next advances without starting playback when paused. Removing the current track advances during playback; removing all tracks stops it.

Built-in selection order and volume are saved as `soundtrack: {tracks: string[], volume: number}` within the existing `edi_focus_v1` document, preserving timer/history fields. New users keep the original first-track default. Multiple local files can be appended via the file picker. Blob URLs remain session-only and are revoked when the page is unloaded, so file bytes and temporary URLs are never sent to the state API. Failed tracks are skipped once per playback attempt; if every selected track fails, playback pauses with a retry message. Autoplay restrictions require a user Play action.
