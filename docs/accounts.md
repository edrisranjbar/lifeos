# Accounts and private workspaces

[← Project overview](../README.md)

## Using Settings

Accounts are either **members** or **administrators**. Each signs in with its own username and password, and has its own Finance, Focus, Goals, Growth, Kanban, calendar-derived tasks, habits, notes, uploaded attachments, themes and currency preferences.

Settings has four sections:

- **Preferences:** appearance and display currency. Currency changes labels without converting amounts.
- **My account:** change your own username or password after confirming your current password; sign out of this browser.
- **Accounts** (administrators only): create members or administrators, change another account's username, role or password, deactivate or reactivate access. Members do not see this section, and `/users.php` refuses them. All changes require the acting administrator's current password. New passwords must be 12–72 bytes. Duplicate usernames are rejected.
- **About:** project and issue links.

Deactivation preserves records and rejects both login and existing sessions. Password or username changes invalidate that account's other sessions. Your own account is edited through My account; it cannot be deactivated through account management. No permanent account deletion is provided.

New accounts are members by default. A member can only use their own workspace and change their own sign-in details. Administrators can reset other accounts' passwords, which lets them sign in as that person, so give the administrator role only to people you trust. LifeOS always keeps at least one active administrator: the last one cannot be deactivated or demoted. The account list exposes usernames, role, active status and creation time, never password hashes or personal records. There is no public sign-up.

## Migration and storage

Schema version 3 runs under the existing MySQL migration lock:

1. Creates `app_users` and copies the original username/password hash to administrator `id=1`. Existing sign-in details are retained.
2. Adds `user_id` to `app_state`, `habits`, `habit_logs`, `categories` and `card_attachments`. Existing rows belong to `id=1`.
3. Changes state-document uniqueness to `(user_id, state_key)` and category-name uniqueness to `(user_id, name)`. Globally unique habit and attachment IDs remain unchanged.

DDL steps check existing columns/indexes so a partially applied migration can resume. MySQL DDL is not one atomic transaction. Coordinate application uploads and use your normal database migration/recovery process. Older application versions must not run against this schema: their unscoped reads would expose every user's rows. Do not roll back code alone after migrating.

`app_credentials` remains for historical bootstrap compatibility. Restore `app_users` and the ownership columns with a database backup when recovering a version 3 installation. No account deletion or data-copy step runs during migration. SQLite import is an operator maintenance command for the original account; it is not an account-management endpoint.

All browser and API personal-data queries filter by the authenticated account. A guessed habit, category, board or attachment ID cannot access another account's data. Attachment deletion checks ownership before removing the underlying file.

Browser synchronization channels are separated by account ID. A storage refresh that detects a different signed-in account clears its cache and reloads. Unscoped legacy localStorage import runs only for the original account; new accounts never inherit old browser records.

## API and deployment

The existing operator API/MCP bearer token is bound to `config.php`'s `api_user_id`, default `1`. It never aggregates accounts. An inactive or invalid API account is rejected. New browser accounts do not receive API tokens automatically.

The browser account-management endpoint is `/users.php`: GET lists account metadata, POST accepts `create` or `update`, a username, optional target `id`, password/confirmation, optional boolean `active`, and the administrator's `current_password`. POST requires the session CSRF header. POST also accepts an optional `role` of `admin` or `user` (member); new accounts default to `user`. The self-service `/credentials.php` endpoint updates only the signed-in account and returns its username, user ID, role and CSRF token on GET.

For the flattened shared host, include `users.php`, `lib/user_context.php`, the changed backend helpers, `assets/storage.js`, Settings assets and updated browser entry pages in the release. The local router serves `users.php` through `server.php`; keep the hosting layout adaptation used by the deployment script. Settings uses the existing theme tokens and a layout that stacks on mobile.

## Implementation validation

The account/schema changes need functional validation on a disposable database before production deployment, including separate-user reads/writes, account creation, deactivation, password changes and legacy-owner migration. Automated tests are not added or run as part of this implementation request. Existing SQLite fixtures still represent the old single-owner schema and need updating before using that suite to validate version 3.
