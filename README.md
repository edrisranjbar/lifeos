<div align="center">

# Edi Life OS

**One self-hosted home for your focus, habits, goals, money and projects — with an MCP server so your AI assistant can work alongside you.**

[![PHP 8.1+](https://img.shields.io/badge/PHP-8.1%2B-777bb4?logo=php&logoColor=white)](#requirements) [![MySQL 8](https://img.shields.io/badge/MySQL-8-4479a1?logo=mysql&logoColor=white)](#requirements) [![MCP server](https://img.shields.io/badge/MCP-15_tools-39e6ad)](#talk-to-your-life-os-with-ai) [![Docker](https://img.shields.io/badge/docker-compose_up-2496ed?logo=docker&logoColor=white)](#with-docker-recommended) [![Self-hosted](https://img.shields.io/badge/data-self--hosted-e9918c)](#your-data-stays-yours) [![MIT license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Quick start](#quick-start) · [Tour](#a-quick-tour) · [AI / MCP](#talk-to-your-life-os-with-ai) · [Deploy](docs/deployment.md) · [API](docs/api.md)

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/dashboard.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/dashboard-light.webp">
  <img src="docs/media/dashboard.webp" alt="Edi Life OS overview: a daily productivity score with focus, habit, goal and work progress, and six life dimensions" width="100%">
</picture>

</div>

<br>

Most of us run our lives across a to-do app, a habit tracker, a budgeting spreadsheet, a Pomodoro timer and a notes app — and none of them know about each other. **Edi Life OS puts all of it in one calm, private dashboard** and connects the small things you do today to the direction you want your life to take.

- **Everything in one place.** Ten workspaces share one design, one sign-in and one database.
- **Connected, not just collected.** Habits drive goal progress, Kanban cards show up in the calendar, and the Overview turns it all into one daily score.
- **Yours.** Runs on any PHP + MySQL host, even cheap shared hosting. No subscription, no tracking, no vendor lock-in.
- **AI-ready.** A built-in MCP server lets Claude and other assistants read your dashboard, plan goals, log habits and track expenses for you.

## A quick tour

<table>
<tr>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/growth.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/growth-light.webp">
  <img src="docs/media/growth.webp" alt="Growth workspace with six life dimensions and SMART progress">
</picture>
<p><b>Growth</b> — Six life dimensions, each linked to long-term goals, SMART goals, habits and tasks. Guided weekly, monthly and quarterly reviews.</p>
</td>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/focus.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/focus-light.webp">
  <img src="docs/media/focus.webp" alt="Focus timer over an illustrated landscape with a soundtrack panel">
</picture>
<p><b>Focus</b> — Pomodoro sessions with breaks, a built-in focus soundtrack and a landscape that follows the time of day.</p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/habittify.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/habittify-light.webp">
  <img src="docs/media/habittify.webp" alt="Habit checklist with a seven-day completion chart">
</picture>
<p><b>Habittify</b> — Small daily habits, streaks and a seven-day picture of your consistency.</p>
</td>
<td width="50%" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/kanban.webp">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/kanban-light.webp">
  <img src="docs/media/kanban.webp" alt="Kanban board with backlog, in progress, review and done columns">
</picture>
<p><b>Kanban</b> — Boards with labels, priorities, due dates, checklists, comments and attachments.</p>
</td>
</tr>
</table>

<details>
<summary><b>All ten workspaces</b></summary>

<br>

| Workspace | What you can do |
| --- | --- |
| **Overview** | A live productivity score, focus and habit trends, goals, finances and a seven-day weather forecast. |
| **Growth** | Connect six life dimensions to long-term goals, SMART goals, habits and tasks. Run weekly, monthly or quarterly reviews. [Guide](docs/growth.md) |
| **Focus** | Timed sessions with short and long breaks, session history and a focus soundtrack. |
| **Finance** | Expenses, income and budgets in Toman. Debts you owe and credits owed to you, one-time or recurring, recorded straight into the ledger. [Guide](docs/financial-commitments.md) |
| **Habittify** | Daily habits with completion, streaks and monthly progress. |
| **Kanban** | Draggable cards and lists with priorities, labels, dates, checklists, comments and file attachments. |
| **Calendar** | Due cards and financial dues across all boards in Month or Schedule view. |
| **Goals** | SMART goals with measures, deadlines, priorities, checklists — or progress driven by a habit. |
| **Notepad** | Markdown notes with preview and export. |
| **Notes** | Sticky notes with colors, fonts and connections. |

Dates follow **Asia/Tehran**. The weather card shows Qeshm Island via Open-Meteo; its tide figure is a modeled estimate, not for navigation.

</details>

## Talk to your Life OS with AI

Edi Life OS ships with an optional [MCP](https://modelcontextprotocol.io) server that exposes **15 tools** across your dashboard, goals, tasks, habits, finances and notes. Connect it to Claude Desktop, Claude Code or any MCP client and ask in plain language:

> *"Show me my LifeOS dashboard."*
>
> *"Create a SMART goal called Build a home studio, due in three months, and add Buy acoustic panels as a task."*
>
> *"Mark Reading complete for today."*
>
> *"Log a 450,000 Toman food expense and show my balance."*

The MCP server talks to your app only through its token-protected HTTP API. It never touches your database or credentials. Setup takes a minute — see [MCP server](#mcp-server) below.

## Quick start

### With Docker (recommended)

```sh
git clone https://github.com/edrisranjbar/lifeos.git && cd lifeos
cp .env.example .env    # set your sign-in and passwords
docker compose up -d
```

Open [localhost:8080](http://localhost:8080) and sign in. MySQL, the app and your attachments each live in their own volume, so `docker compose up -d --build` after a `git pull` upgrades without losing data.

### On shared hosting

Download `lifeos-<version>.zip` from the [latest release](https://github.com/edrisranjbar/lifeos/releases/latest) and extract it into your hosting **home directory**, so `public_html/` becomes your web root and the backend sits safely above it. Copy `config.example.php` to `config.php`, fill in your MySQL details, and open your site. See the [deployment guide](docs/deployment.md) for details.

### With PHP locally

You need **PHP 8.1+** (with `pdo_mysql` and `mbstring`) and **MySQL 8+** (or MariaDB 10.4+).

```sh
git clone https://github.com/edrisranjbar/lifeos.git
cd lifeos
cp config.example.php config.php   # PowerShell: Copy-Item config.example.php config.php
```

Edit `config.php` with your database connection and the username and password you want to sign in with, then start the server:

```sh
php -S localhost:8000 -t public_html server.php
```

Open [localhost:8000](http://localhost:8000) and sign in. The database and tables are created on first use. You can change your sign-in later in **Settings**.

> [!IMPORTANT]
> `config.php` and `.env` hold real credentials and are gitignored. Never commit them.

### Requirements

| Component | Requirement |
| --- | --- |
| PHP | **8.1+** with `pdo_mysql` and `mbstring` |
| Database | **MySQL 8+**; also tested with MariaDB 10.4 |
| Web server | PHP's built-in server locally; Apache with rewrites for hosting |
| Weather | PHP `curl` and outbound HTTPS |
| MCP server | Optional: **Node.js 22.9+** |
| API tests | Optional: `pdo_sqlite` |

## API and integrations

### HTTP API

A private `/api/v1` API covers the dashboard, goals, tasks, habits, finances and sticky notes. It uses its own bearer token, separate from your browser sign-in.

```sh
php -r "echo bin2hex(random_bytes(32));"
```

Set the result as `api_token` in `config.php` (or the `LIFEOS_API_TOKEN` environment variable), then:

```sh
curl -H "Authorization: Bearer $LIFEOS_API_TOKEN" https://your-host/api/v1/dashboard
```

See the [API reference](docs/api.md) for endpoints, payloads and errors.

### MCP server

```sh
cd mcp
npm ci
cp .env.example .env   # set LIFEOS_BASE_URL and LIFEOS_API_TOKEN
npm start
```

The server runs over **stdio**; there is no hosted MCP endpoint. The [MCP guide](mcp/README.md) lists every tool and shows client configuration for Claude and Codex.

## Your data stays yours

- Everything lives in **your** MySQL database. Habits use dedicated tables; other workspaces store JSON documents in `app_state`.
- Saves use revision checks, so a stale tab can't silently overwrite newer changes. API writes use transactions and row locks.
- Data from older browser-only versions is imported once; conflicting copies are archived as `legacy_backup_*` records.
- Back up the database, attachment files and your configuration together.

Moving from the old Habittify SQLite database? See [migrating Habittify](docs/deployment.md#migrating-habittify-from-sqlite).

## Security

Edi Life OS is built for a **single owner**.

- The API token grants read and write access to every supported domain. Token scopes and app-level rate limiting are not implemented, so set request limits at the hosting layer.
- Use HTTPS anywhere other than localhost, and keep tokens out of URLs, frontend code, screenshots and logs.
- Secret notes are hidden from API reads by default. The secret flag controls visibility; it is not separate encryption.

## Project structure

```text
public_html/          Browser workspaces, shared assets and Apache entry points
lib/                  API domains, response helpers and state transactions
mcp/                  Optional Node.js stdio MCP server
tests/                Timer, API, MySQL and integration checks
docs/                 Guides, plus README screenshots in docs/media
config.example.php    Configuration template (no real credentials)
server.php            Development router and application routing
api.php               HTTP API entry point
```

Built with PHP, MySQL and vanilla JavaScript — no frontend build step, no framework.

`Dockerfile`, `docker-compose.yml` and `docker/config.php` run the app with configuration from environment variables.

## Documentation

- [API reference](docs/api.md) — authentication, routes, data formats and concurrency
- [MCP guide](mcp/README.md) — tools, environment settings and client setup
- [Deployment guide](docs/deployment.md) — Apache, shared hosting, backups and migration
- [Development guide](docs/development.md) — local checks and disposable integration fixtures
- [Growth workspace](docs/growth.md) · [Debts and credits](docs/financial-commitments.md)

## License

[MIT](LICENSE) © 2026 Edris Ranjbar. Use it, fork it and build on it.

## Contributing

Ideas, bug reports and pull requests are welcome. Read the [contributing guide](CONTRIBUTING.md) to get set up, and look for [`good first issue`](https://github.com/edrisranjbar/lifeos/labels/good%20first%20issue) if you want somewhere to start.

<div align="center">
<br>

**If Edi Life OS helps you run your days, consider giving it a ⭐ — it helps others find it.**

</div>
