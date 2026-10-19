# Interface languages

Choose the interface language in **Settings → Preferences → Language**. The choice is saved with the signed-in account and reloads the workspace and its embedded apps. English uses the original interface text; Persian uses `public_html/assets/i18n/fa.json`, right-to-left layout, Persian digits, and localized dates.

The shared helper `public_html/assets/i18n.js` loads the selected dictionary before `appStorageReady` resolves. Static page text and accessible labels are translated during initialization. Dynamic labels, dialogs, notifications, and summaries must use `lifeOsI18n.t(text, variables)` when they render. Finance's `__t` delegates to the same helper. `markup()` is only for static application-owned HTML; do not pass saved user content to it.

Names, notes, descriptions, amounts, record identifiers, and stored dates are not translated or rewritten. Variable values such as usernames and task titles remain unchanged inside translated messages. Existing built-in Kanban workflow column names are translated for display while their stored names remain intact.

For interface changes, keep dictionary placeholders identical to their English keys and bump the changed browser assets' query versions. `tests/i18n-keys.mjs` collects markup, translation calls, and explicitly listed runtime keys. Run Persian coverage with `node --test --test-name-pattern="fa:|Persian|t\(" tests/i18n.test.mjs`, plus the affected browser tests. Arabic remains unfinished: its translation dictionary has not been supplied, so the Arabic-specific coverage tests still fail.
