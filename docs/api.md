# LifeOS API reference

[← Project overview](../README.md)

The private `/api/v1/*` API uses a dedicated bearer token, independent of browser sign-in. Generate at least 32 random bytes (for example `php -r 'echo bin2hex(random_bytes(32));'`) and place the result in the ignored `config.php` as `api_token`, or set `LIFEOS_API_TOKEN` on the PHP process. The environment takes precedence, including an empty value that disables access. Placeholder tokens and tokens shorter than 32 characters are rejected. Keep `api_allow_secret_notes` false unless secret-note API access is intended.

```sh
curl -H "Authorization: Bearer $LIFEOS_API_TOKEN" \
  https://example.com/api/v1/dashboard

curl -X POST -H "Authorization: Bearer $LIFEOS_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Build dream home studio","specific":"Turn a 3x3m room into a studio","priority":"high","startDate":"2026-10-07","deadline":"2027-01-07","measures":[{"metric":"Studio Readiness Score","target":8,"unit":"/10","current":0}],"tasks":[{"title":"Repair walls"},{"title":"Install carpet"}]}' \
  https://example.com/api/v1/goals

curl -X POST -H "Authorization: Bearer $LIFEOS_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"category_id":"food","description":"Dinner","amount":450000,"date":"2026-10-07"}' \
  https://example.com/api/v1/finance/expenses
```

Use HTTPS outside localhost: the token grants read/write access to the domains below. Never put it in URLs, Git, screenshots, logs or frontend JavaScript. Rotate it by changing the server setting and client environment. No endpoint returns config or credentials. This is a single-owner API, without token scopes or a rate limiter. Configure host-level request limits and omit Authorization headers from access logs. Errors contain no stack traces or SQL parameters.

## Routes and response formats

Success is `{ "data": ... }`; errors are `{ "error": { "code": "...", "message": "...", "details": {} } }`. Creation/upsert POSTs return 201; completion returns 200. Deletion returns `{ "data": { "deleted": true } }`. Responses are JSON with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Request bodies are limited to 1 MB; saved documents to 2 MB. Statuses: malformed JSON 400, unauthorized 401, forbidden secret access 403, absent resource 404, wrong method 405, conflict 409, oversized 413, validation 422, internal failure 500 and database failure 503.

| Domain | Routes relative to `/api/v1` | Behavior |
| --- | --- | --- |
| Context | `GET /health`, `GET /dashboard` | Authenticated health and compact Tehran dashboard |
| Goals | `GET/POST /goals`, `GET/PATCH/DELETE /goals/{id}` | SMART goals with nested tasks/measures |
| Tasks | `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/{id}`, `POST /tasks/{id}/complete` | Goal checklists and Kanban cards |
| Habits | `GET /habits`, `GET /habits/today`, `POST/DELETE /habits/{id}/complete` | Existing SQL tables, idempotent completion |
| Finance | `GET /finance`, `GET/POST /finance/expenses`, `GET/POST /finance/incomes` | Existing period map, amounts in the display currency (default Toman, set in Settings) |
| Notes | `GET/POST /notes`, `GET/PATCH/DELETE /notes/{id}` | Sticky notes and connection cleanup |

Unsupported request fields are rejected; existing unknown fields are preserved. PATCH merges supported fields; supplied `tasks`/`measures` lists replace their lists, preserving extra fields on entries with matching IDs. Missing IDs are UUIDs. Goal status follows the UI: all tasks done means completed; editable status is active or archived. Numeric measure values can be null. Dates must be real ISO dates; startDate cannot follow deadline.

Tasks require `source: "goal"` with `goal_id`, or `source: "kanban"` with `board_id` and `column_id`. Lists accept source/container filters. Individual routes accept `source`, `goal_id`, `board_id` when an ID is ambiguous (otherwise 409). Goal tasks inherit the goal deadline unless they have their own dueDate. Goal tasks do not support descriptions. Kanban completion uses normalized column names Done, Completed or Complete; completing moves to an existing such column, otherwise 409. Reopening requires `done: false` with a non-complete column_id. Card labels, attachments, comments and checklists survive updates.

Habit completion accepts optional `{ "date": "YYYY-MM-DD" }`, defaulting to today in Asia/Tehran. Two completes leave one completed row; two uncompletes leave none. Archived habits cannot be completed. The browser retains its existing toggle behavior.

Finance accepts an existing `period` (query for GET, body for POST), defaulting to active or the first saved period like the UI. Expenses require an existing category_id and positive amount; description and ISO date are optional. Stored expenses retain `{id, categoryId, desc, amount, date}` and an English month/day label like the UI; the year is identified by the period. Incomes require name and positive amount; the lowercased name with whitespace replaced by underscores generates the ID. Repeating that ID updates its amount. Active-period writes synchronize the legacy daramd_v1 mirror, retaining other periods. An uninitialized account gets the same default categories as the browser.

Secret notes are excluded from default reads and dashboard. Hidden IDs return 404 for get/update/delete. `include_secret=1` requires `api_allow_secret_notes => true`, otherwise 403. Creating or making a note secret returns only ID and secret flag unless access was explicitly enabled/requested. Notes use UI geometry/font defaults. Delete removes related `{a,b}` connections.

## Concurrency

API mutations lock app_state rows in key order within a transaction (`SELECT ... FOR UPDATE`), including absent-row initialization. Habit writes use the existing unique habit/date key and transactions. No schema migration is required.

Browser saves send a SHA-256 revision from their last load/successful write. Stale saves return 409, stop queued saves for that document and ask the user to copy unsaved edits and reload. This prevents a stale whole-document save from overwriting API changes; it does not merge edits. Reload after external updates. Deploy state.php, lib/ and assets/storage.js together; reload already-open clients. Old clients without revisions are rejected rather than overwriting newer data.

The PHP development router and Apache router.php/.htaccess route API requests before session authentication. Apache must preserve Authorization; the supplied rewrite does this. Keep public_html as document root for standard Apache hosting. For flattened shared hosting, put API PHP files/lib alongside the backend and adapt server.php's public root, router.php and Habittify's helper paths to that layout. Never expose config.php, mcp/, tests or private storage as downloadable assets.
