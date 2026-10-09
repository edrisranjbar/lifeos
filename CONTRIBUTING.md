# Contributing to Edi Life OS

Thanks for helping! Bug reports, ideas, docs fixes and code are all welcome. New here? Look for issues labelled [`good first issue`](https://github.com/edrisranjbar/lifeos/labels/good%20first%20issue).

## Before you start

- **Small fixes** (typos, docs, an obvious bug): open a pull request directly.
- **Bigger changes** (a new feature, a new workspace, changes to how data is stored): open an issue first so we can agree on the approach before you spend time on it.
- **Security problems:** please don't open a public issue. Use GitHub's **Report a vulnerability** button on the [Security tab](https://github.com/edrisranjbar/lifeos/security).

## Run it locally

The quickest way is Docker:

```sh
cp .env.example .env    # set a sign-in and passwords
docker compose up -d --build
```

Then open [localhost:8080](http://localhost:8080). If you prefer plain PHP 8.1+ and MySQL, follow [Quick start](README.md#quick-start) and run:

```sh
php -S localhost:8000 -t public_html server.php
```

## Run the checks

```sh
node --test tests/timer.test.mjs
php tests/api_test.php
php tests/obligations_test.php
npm ci --prefix mcp && npm test --prefix mcp
```

These same checks also run automatically in GitHub Actions on every pull request and every push to `main`.

The PHP tests use an in-memory SQLite database (PHP `pdo_sqlite` and `mbstring` are required) and never touch your `config.php`. See the [development guide](docs/development.md) for MySQL integration tests.

## How the code is organised

| Path | What lives there |
| --- | --- |
| `public_html/` | One folder per workspace (Goals, Kanban, Finance…) plus shared `assets/`. Plain HTML, CSS and JavaScript modules. |
| `lib/` | PHP: API domains, the state store and finance commitments. |
| `server.php`, `*.php` | Routing, auth and session endpoints. |
| `mcp/` | The optional Node.js MCP server. |
| `tests/` | PHP and Node test suites. |
| `docs/` | Guides for the API, deployment, Growth and finance. |

## Conventions

- **No build step and no framework.** Keep it vanilla JavaScript and plain PHP, and avoid adding dependencies to the browser app.
- **Match the surrounding code**: its naming, comment style and density. Prefer small, focused changes over large refactors.
- **Bump the cache version when you change a browser file.** Assets are loaded with `?v=` query strings (for example `app.js?v=compact-cards-1`). Change the version where the file is referenced, or users will keep the old copy.
- **Saves are revision-checked.** Browser saves and API writes send the revision they last saw, and the server answers `409 Conflict` if the data changed. Keep that behaviour when you touch saving code.
- **Never commit secrets.** `config.php` and `.env` are gitignored; keep it that way, and don't put real tokens in tests, screenshots or issues.
- **Keep behaviour and docs together.** If you change how something works, update the relevant file in `docs/` in the same pull request.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Make your change, and add or update tests where it makes sense.
3. Run the checks above.
4. Open a pull request that explains **what** changed and **why**, and how you tested it. Include before/after screenshots for UI changes (dark and light theme if you can).

Keep each pull request to one change; small PRs get reviewed and merged much faster.

AI-assisted contributions are welcome. This project is built with a lot of help from Claude Code. Please review and test what you submit as carefully as if you'd written every line yourself.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
