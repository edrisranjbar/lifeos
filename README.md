# Edi Life OS

A shared-host-ready single-page shell for Focus, EdiFinance and Habittify. The navbar switches views without reloading the shell, so the focus timer and audio continue. Existing apps run in same-origin frames to preserve their CSS, JavaScript and behavior. Their source is bundled, not remotely embedded.

## Upload

Upload the **contents of `public_html`** to your hosting folder, or a subfolder such as `/life/`. Open that folder's URL. No Node runtime, build step or database server is needed. Habittify requires PHP 8.1+ with PDO SQLite, and write access to `habittify/storage`. Apache must allow the supplied `.htaccess` files; the storage directory must not be publicly downloadable.

For an existing Habittify installation, keep its `storage/habits.db` in place. This package intentionally contains no personal database. Back up the existing database before replacing application files. A fresh installation uses Habittify's existing starter habits.

Finance retains its original `daramd_periods_v1` browser storage key. Existing data remains available if the app is served on the same origin (protocol, hostname and port). If the origin changes, export Excel from the old app and import it into this one. Focus history and tasks are local to this browser too. Export finance data before clearing browser storage.

## Focus

Configurable 25/5/15 minute intervals; a long break after four completed focus sessions; pause, reset, skip; task estimates and session counts; local history with Tehran day boundaries. Intervals use absolute deadlines and survive reloads. Finished intervals wait for an explicit start; skips are not counted. Sleeping or closed browsers cannot issue live alerts; completion is reconciled when the page resumes.

Two original synthesized ambient music loops, rain-like noise and brown noise are generated with Web Audio. Users can also choose local audio, which loops without upload. Custom audio must be reselected after reload. Playback starts only after a click.

## Hosting privacy

Habittify retains its existing unauthenticated API. Protect this personal app with your shared host's directory password protection before exposing it on the internet. Do not upload the repository root, `.secrets`, or `.npm-cache`; only the release package or `public_html` contents. Finance uses existing third-party CDN libraries and fonts.

## Local verification

Run `php -S localhost:8080 -t public_html`, then visit localhost:8080. Run timer checks with `node --test tests/timer.test.mjs`.
