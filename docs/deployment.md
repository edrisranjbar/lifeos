# Deployment guide

[← Project overview](../README.md)

## Docker

`docker-compose.yml` runs the app (PHP 8.3 + Apache) with MySQL 8.4:

```sh
cp .env.example .env    # set LIFEOS_USERNAME, LIFEOS_PASSWORD and both database passwords
docker compose up -d
```

### Prebuilt image (no clone, no build)

Every release is also published as a multi-architecture image (`linux/amd64` and `linux/arm64`, so it runs on a Raspberry Pi) at `ghcr.io/edrisranjbar/lifeos`. `docker-compose.image.yml` is the same stack as `docker-compose.yml`, except that the app service pulls that image:

```sh
curl -fsSLO https://raw.githubusercontent.com/edrisranjbar/lifeos/main/docker-compose.image.yml
curl -fsSL https://raw.githubusercontent.com/edrisranjbar/lifeos/main/.env.example -o .env    # then edit it
docker compose -f docker-compose.image.yml up -d
```

- **Tags:** `edge` is the current `main` and is what you get by default. Each release tag also publishes fixed versions (`1.2.0`, `1.2`) and `latest`; pin one with `LIFEOS_VERSION=1.2.0` in `.env` once that release exists.
- **Upgrade:** `docker compose -f docker-compose.image.yml pull && docker compose -f docker-compose.image.yml up -d`. Data lives in the same named volumes, so nothing is lost.
- **Backups** below work the same way. Add `-f docker-compose.image.yml` to the compose commands if you started the stack from that file.

The app listens on `LIFEOS_PORT` (default 8080). Configuration comes from environment variables through `docker/config.php`, so no `config.php` is needed. Set `LIFEOS_API_TOKEN` to enable the HTTP API and MCP server; leave it empty to disable the API.

Data lives in two named volumes: `mysql` (the database) and `attachments` (Kanban files). Back up both. To upgrade, `git pull` and run `docker compose up -d --build`.

The `app` service has a healthcheck that requests `/login.php`, so `docker compose ps` reports `healthy`/`unhealthy` once Apache and PHP are actually serving pages, and `docker compose up --wait` (used in CI) waits for that instead of just the container starting.

Put a TLS-terminating reverse proxy (Caddy, Traefik, nginx) in front of the container before exposing it to the internet, and set `LIFEOS_TRUST_PROXY=true`. The app then marks the session cookie `Secure` based on `X-Forwarded-Proto` and rate-limits sign-in per client using the last `X-Forwarded-For` address. Leave it `false` when the container is reachable directly, because those headers could otherwise be spoofed.

The app uses the **last** `X-Forwarded-For` IP entry as the client address. When your reverse proxy is the only proxy directly in front of the app container, it appends the actual remote client IP to the end of the chain, preventing untrusted clients from spoofing client addresses via preset upstream headers.

### Reverse proxy examples

Both examples assume the Docker container is listening on the host on port `8080` (the default `LIFEOS_PORT`). Change `example.com` to your domain and `8080` if you configured a different `LIFEOS_PORT`.

With `LIFEOS_TRUST_PROXY=true`, the container must be reachable only through the proxy. Otherwise anyone could connect to port 8080 directly and send their own `X-Forwarded-For`. Docker publishes the port on every interface by default, so bind it to localhost in `.env`:

```sh
LIFEOS_PORT=127.0.0.1:8080
```

#### Caddy (`Caddyfile`)

Caddy automatically provisions and renews TLS certificates and forwards standard proxy headers:

```caddy
example.com {
    reverse_proxy 127.0.0.1:8080
}
```

#### Nginx (`/etc/nginx/conf.d/lifeos.conf`)

An nginx virtual host block with TLS termination:

```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Sign-in credentials after setup

Schema version 3 adds multiple administrator accounts and assigns all existing personal records to the original account (`id=1`). Login and credential changes then use `app_users`; `app_credentials` is retained as a legacy bootstrap table. New accounts start without personal records. See [account management and migration](accounts.md) before upgrading an existing host. Deploy the backend, storage helper and versioned browser entry pages together; the migration runs on the first database connection.

The configured sign-in `username` and `password` (Docker: `LIFEOS_USERNAME` and `LIFEOS_PASSWORD`) are required only when creating the initial `app_credentials` row. After setup, you can remove these bootstrap values from `config.php` or `.env`; keep all database connection credentials. For Docker, recreate the app container to remove the old values from its environment. Login and session validation use the username and password hash stored in MySQL; changing bootstrap values does not reset an existing account. Manage sign-in credentials in Settings.

An empty credentials table still requires non-empty bootstrap values and fails with an explicit setup error if either is missing. Restore the credentials row with your database backup when recovering an installation. Sessions from the old plaintext configuration fingerprint are no longer upgraded and must sign in again; sessions already using the stored credential hash continue to work.

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
- Deployment configuration (`.env` or `config.php`), stored securely outside the repository.

> **Note**: Backups contain private notes, credentials, and attachments. Store backup files securely with restricted file permissions.

### Docker backup commands

From the directory containing your `docker-compose.yml` and `.env`:

1. **Dump the MySQL database**:
   ```sh
   docker compose exec -T db sh -c 'exec mysqldump -u lifeos -p"$MYSQL_PASSWORD" lifeos' > lifeos-db-backup.sql
   ```
   *(Or using root credentials: `docker compose exec -T db sh -c 'exec mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" lifeos' > lifeos-db-backup.sql`)*

2. **Back up the attachments volume**:
   ```sh
   docker run --rm -v lifeos_attachments:/data/attachments -v "$(pwd)":/backup alpine tar czf /backup/lifeos-attachments-backup.tar.gz -C /data/attachments .
   ```
   *(If your Compose project name differs from `lifeos`, use `docker volume ls` to find your `<project>_attachments` volume name).*

3. **Back up configuration**:
   ```sh
   cp .env lifeos-env-backup
   ```

### Docker restore commands

To restore into a fresh installation:

1. **Restore configuration and start database container**:
   ```sh
   cp lifeos-env-backup .env
   docker compose up -d db
   ```

2. **Restore MySQL database**:
   ```sh
   docker compose exec -T db sh -c 'exec mysql -u lifeos -p"$MYSQL_PASSWORD" lifeos' < lifeos-db-backup.sql
   ```

3. **Restore attachments volume**:
   ```sh
   docker run --rm -v lifeos_attachments:/data/attachments -v "$(pwd)":/backup alpine tar xzf /backup/lifeos-attachments-backup.tar.gz -C /data/attachments
   ```

4. **Start all services**:
   ```sh
   docker compose up -d
   ```

### Verify your backup

To verify that the backup is valid and intact:
1. Run `docker compose ps` and confirm both `app` and `db` report `healthy`.
2. Open `http://localhost:8080` (or your configured `LIFEOS_PORT`), sign in with your credentials, and verify existing habits, notes, and boards display as expected.

Attachment files are stored outside the public directory in a `.lifeos-files-*` directory derived from the backend location (or mounted at `/data/attachments` in the container). Moving the backend can change that derived path; restore the uploaded files into the directory used by the new deployment.

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
