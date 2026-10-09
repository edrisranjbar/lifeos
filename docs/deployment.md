# Deployment guide

[← Project overview](../README.md)

## Docker

`docker-compose.yml` runs the app (PHP 8.3 + Apache) with MySQL 8.4:

```sh
cp .env.example .env    # set LIFEOS_USERNAME, LIFEOS_PASSWORD and both database passwords
docker compose up -d
```

The app listens on `LIFEOS_PORT` (default 8080). Configuration comes from environment variables through `docker/config.php`, so no `config.php` is needed. Set `LIFEOS_API_TOKEN` to enable the HTTP API and MCP server; leave it empty to disable the API.

Data lives in two named volumes: `mysql` (the database) and `attachments` (Kanban files). Back up both. To upgrade, `git pull` and run `docker compose up -d --build`.

The `app` service has a healthcheck that requests `/login.php`, so `docker compose ps` reports `healthy`/`unhealthy` once Apache and PHP are actually serving pages, and `docker compose up --wait` (used in CI) waits for that instead of just the container starting.

Put a TLS-terminating reverse proxy (Caddy, Traefik, nginx) in front of the container before exposing it to the internet.

## Shared hosting release zip

Each tagged release publishes `lifeos-<version>.zip` on GitHub Releases, built with `git archive` (development files are excluded via `.gitattributes`). Its layout matches typical cPanel hosting:

1. Extract the zip into your hosting **home directory**. `public_html/` becomes the web root; `config.php`, `lib/` and the PHP backend stay above it, out of public reach.
2. Copy `config.example.php` to `config.php` and enter your MySQL details and initial sign-in.
3. Open your site and sign in. Tables are created on first use.

If your host already has a `public_html` with other content, back it up first. To build the zip yourself: `git archive --format=zip -o lifeos.zip HEAD`.

To publish a release, push a version tag: `git tag v1.0.0 && git push origin v1.0.0`.

## Standard Apache hosting

1. Install the [required PHP extensions](../README.md#requirements) and configure MySQL.
2. Set the site's document root to `public_html`.
3. Enable Apache rewrite support and allow the supplied `.htaccess` rules.
4. Create the ignored `config.php` with deployment-specific database and initial sign-in settings.
5. Ensure the database account has the privileges needed to initialize the database and tables.
6. Enable HTTPS before using the site externally.

The Apache entry point routes through `router.php` and the root `server.php`. API requests are routed before browser session authentication and use their own bearer token.

Apache must preserve the Authorization header. The supplied rewrite rules forward it; the backend also supports the redirected header form.

## Flattened shared hosting

Some hosts require the entire deployed bundle inside a single `public_html` directory. This differs from the repository's standard document-root layout.

Adapt the backend's public root, the `router.php` entry point, and Habittify helper imports to match the flattened layout. Place API entry points and `lib/` alongside the deployed backend. Do not upload the local router unchanged when its paths differ from the deployed structure.

Prevent direct downloads of configuration, tests, MCP files, and private storage.

### Coordinated updates

Deploy `state.php`, `lib/`, and `assets/storage.js` together. Browser saves carry revisions; clients without revisions are rejected to protect newer data. Reload already-open clients after deployment.

Cross-project card moves also require the Kanban browser changes, `kanban.php`, and its router entry together. The mutation transfers the complete card and updates attachment board associations transactionally.

## Configuration

| Setting | Purpose |
| --- | --- |
| `db_host`, `db_port`, `db_name` | Database connection location |
| `db_user`, `db_password` | Database account |
| `username`, `password` | Initial browser sign-in credentials |
| `api_token` | Dedicated bearer token for external clients |
| `api_allow_secret_notes` | Explicitly allow secret-note API access; default is false |

`LIFEOS_API_TOKEN` on the PHP process takes precedence over the configured API token. An empty environment value disables API access. See the [API reference](api.md) for token requirements.

After initial setup, manage the browser username and password through **Settings → Sign-in credentials**. Editing the seed credentials in the configuration does not replace an existing database login.

## Backups and recovery

Back up these resources together:

- The MySQL database, including `app_state`, habit tables, sign-in credentials, and attachment metadata.
- Private attachment files.
- Deployment configuration, stored securely outside the repository.

Attachment files are stored outside the public directory in a `.lifeos-files-*` directory derived from the backend location. Moving the backend can change that derived path; restore the uploaded files into the directory used by the new deployment.

Existing browser data is imported once. Conflicting older snapshots are retained as `legacy_backup_*` rows in `app_state`. Preserve these records when backing up or migrating.

## Migrating Habittify from SQLite

Run the migration **before opening Habittify** against the new MySQL database:

```sh
php migrate-sqlite.php /absolute/path/to/habits.db
```

The migration requires PHP `pdo_sqlite` and empty target categories, habits, and habit-log tables. It refuses a populated target and leaves the SQLite source unchanged. Opening Habittify first can seed defaults, so migration order matters.

## External services

The weather endpoint requires PHP cURL and outbound verified HTTPS access to Open-Meteo.

The optional MCP server runs separately as a Node.js stdio process. It communicates with the application over HTTPS and needs only the application URL and API token. See the [MCP guide](../mcp/README.md).
