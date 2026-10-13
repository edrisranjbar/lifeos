# Troubleshooting guide

[← Project overview](../README.md) · [Deployment guide](deployment.md)

Common first-run issues and how to fix them.

---

### 1. "Too many sign-in attempts" (HTTP 429)

- **Symptom**: Trying to log in returns a message stating "Too many sign-in attempts" or HTTP status code 429.
- **Cause**: The application limits failed authentication attempts. After 5 failed password attempts from a single client IP address within a 15-minute window, subsequent attempts are temporarily locked out until the 15-minute window expires.
- **Fix**:
  1. Wait for the 15-minute lockout period to elapse.
  2. Verify credentials in your configuration (`.env` for Docker or `config.php` for standard hosting). Note that editing seed credentials in configuration after initial setup does not update existing database credentials. To update your password, use **Settings → Sign-in credentials** while authenticated or update the password hash directly in the database.

---

### 2. Everyone locked out together behind a reverse proxy

- **Symptom**: Multiple users or attempts from different devices share rate-limit exhaustion, locking out all visitors simultaneously after any single device fails sign-in.
- **Cause**: `LIFEOS_TRUST_PROXY` is not enabled (`false` by default). The application sees the reverse proxy's internal IP address (e.g., `127.0.0.1` or the Docker bridge IP) as the remote address for all inbound requests.
- **Fix**:
  1. Set `LIFEOS_TRUST_PROXY=true` in your `.env` file (or `trust_proxy => true` in `config.php`).
  2. Ensure your reverse proxy (Caddy, nginx, Traefik) passes `X-Forwarded-For` and `X-Forwarded-Proto`. The backend will then extract the client IP address from the last `X-Forwarded-For` entry.
  3. Ensure the backend container is only reachable through your trusted proxy to prevent header spoofing.

---

### 3. Port 8080 is already in use

- **Symptom**: Running `docker compose up -d` fails with an error such as `bind: address already in use` on port 8080.
- **Cause**: Another service or container on the host machine is already listening on port 8080.
- **Fix**:
  1. Open your `.env` file and change `LIFEOS_PORT` to an unused host port (e.g., `LIFEOS_PORT=8888`).
  2. Run `docker compose up -d` again.
  3. Access the web app at `http://localhost:<PORT>`.

---

### 4. App container is not ready / healthcheck failing

- **Symptom**: `docker compose ps` shows the `app` container as `unhealthy`, or `docker compose up --wait` times out.
- **Cause**: The web container failed to start Apache/PHP, or cannot connect to the database container `db`.
- **Fix**:
  1. Inspect the container logs:
     ```sh
     docker compose logs app
     ```
  2. Check whether the `db` service is healthy:
     ```sh
     docker compose ps db
     docker compose logs db
     ```
  3. Verify that `LIFEOS_DB_PASSWORD` in `.env` matches the database password configured for MySQL.

---

### 5. Database connection refused on initial startup

- **Symptom**: Opening the application in a browser shows a database error or 500 status stating `Connection refused` or `Access denied`.
- **Cause**: In Docker, the database service needs a few seconds to run initial MySQL initialization scripts on the first startup before accepting client connections. On shared hosting, MySQL credentials or privileges may be incorrect.
- **Fix**:
  1. In Docker, wait for the `db` healthcheck to pass. The `app` service depends on `condition: service_healthy` for `db`.
  2. On shared hosting, verify in `config.php` that `db_host`, `db_user`, `db_password`, and `db_name` match the MySQL database details created in your hosting control panel.
  3. Ensure the database user has permissions to create tables and insert records.

---

### 6. Session cookie not secure over HTTPS

- **Symptom**: The browser warns about insecure cookies or does not persist session logins over HTTPS behind a reverse proxy.
- **Cause**: The application terminates behind a proxy on plain HTTP and does not know the original connection was HTTPS because `X-Forwarded-Proto` is missing or `LIFEOS_TRUST_PROXY` is `false`.
- **Fix**:
  1. Set `LIFEOS_TRUST_PROXY=true` in `.env`.
  2. Ensure your reverse proxy configuration includes `proxy_set_header X-Forwarded-Proto $scheme;` (nginx) or equivalent so the application marks session cookies with the `Secure` flag.
