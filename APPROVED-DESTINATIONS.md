# Approved Destinations milestone

Implemented and tested locally. No commit, push, deployment, or Neon migration was performed.

## Behavior

- The Issue date field is now **Issue date (planned distribution date)** with **“Set or confirm during final review before distribution.”** Database `created_at`/`updated_at` do not populate or overwrite it. The existing new-edition calendar-date default remains; the editor should confirm it before distribution. Existing saved Issue dates are preserved.
- Content-card Date fields are optional, including event cards. Changing a card date does not alter Issue date; database writes and metadata timestamps do not alter either date.
- **Approved Destinations** is available in the header and workspace navigation. Editors can create, rename, change URL/category, deactivate/reactivate, and delete safe destinations after confirmation. The manager shows last-updated timestamps.
- The registry is read on startup and can be refreshed manually. Reads never upload or rewrite an edition. New selections show active registry destinations. If the registry has never loaded, the seven user-approved starting choices are available as an explicitly described offline fallback. After a successful read, even an empty registry replaces the starting choices. If a later refresh fails, the last loaded list is retained and the manager reports the failure. Use Refresh to pick up another editor's changes.
- Selecting a destination copies its display name and URL into `edition.links`, with its registry ID/version. Existing snapshots are never overwritten when the registry changes. A card's existing selection remains available as **saved in this edition**, including after deactivation. Web/email previews, Gmail copy, exports, imported JSON, and reopened editions use these portable snapshots, not a live registry lookup.
- To deliberately use a revised URL in an existing card, select its current active registry entry again. Other cards that use the older snapshot remain unchanged.
- Edition-specific link editing is retained under **Links saved in this edition (portable snapshots)**. Changes there intentionally affect only that edition, not the shared registry.
- Registry writes require a valid HTTPS URL, clear display name, optional category, and active state. Updates/deletes use versions to reject stale writes. No connection strings are placed in browser files, exports, or logs.
- Deletion is rejected if the current browser edition uses the destination, or a saved online edition references its registry ID, known legacy ID, or URL. Disabled sections/cards are included. The manager offers deactivation instead. Separate offline devices cannot be enumerated by the API, but their complete snapshots continue rendering even if an unreferenced registry record is deleted.

## Migration — run this yourself

File: **`db/002_destinations.sql`**. **`db/001_editions.sql` is unchanged.**

1. Open Neon and select the intended production branch and the dedicated **`edd_communications_studio`** database.
2. In the SQL Editor, run `SELECT current_database();` and confirm the result is `edd_communications_studio`.
3. Paste and run the complete `db/002_destinations.sql` file. It creates the `destinations` table/index and inserts the seven supplied URLs. It does not change rows in `editions` or run browser-data migration.
4. Confirm `SELECT name, url, category, active, updated_at FROM destinations ORDER BY name;` returns the seven approved destinations.
5. Keep Netlify's existing **server-only `DATABASE_URL`** pointing to this same database. No new secret is needed. Existing build command, `dist` publish folder, and functions folder remain unchanged. This milestone does not deploy the new function; include these local changes in your normal deployment only when you decide to do so.

The migration uses `ON CONFLICT DO NOTHING`, so re-running it does not overwrite edited/deactivated seed rows. Re-running can recreate a seed row you intentionally deleted; normally run this numbered migration once.

The new table stores UUID, name, URL, category, active state, legacy ID, version, and creation/update timestamps. It uses the existing Netlify Functions → Neon architecture. There is no new client database driver or database credential access.

## Access boundary

This application previously had no authentication or role checks. That scope is unchanged: authorized-editor access must be supplied by deployment-level protection covering the Studio **and its function endpoints**. Existing protection has not been verified in this local task. A private GitHub repository and cross-origin request checks do not enforce editor authorization. Do not consider the new manager an authentication system.

## Files added

- `db/002_destinations.sql` — new schema and seven approved seed destinations.
- `destinations.js` — shared validation, offline choices, registry client, dropdown options, portable snapshots.
- `destinations-manager.js` — manager UI and actions with safe failure handling.
- `server/destinations-store.js` — parameterized SQL, version checks, reference-aware deletion.
- `netlify/functions/destinations.js` — server-only registry API.
- `tests/destinations.test.js` — 11 new tests, including real local Postgres SQL execution.
- `APPROVED-DESTINATIONS.md` — this report and verification instructions.

## Files changed

- `app.js` — date label/help, registry integration, snapshot selection, edition-specific link-view clarification.
- `index.html` — manager navigation and browser scripts.
- `build-site.js` — includes the two new browser modules in the public build.
- `core.js` — removes only the event-card required-date check; rendering is unchanged.
- `tests/core.test.js` — reflects optional card dates.
- `tests/editions-ui.test.js` — includes registry modules in the existing editor test environment.
- `package.json`, `package-lock.json` — adds **`@electric-sql/pglite` `^0.5.8` as a development-only dependency** for SQL tests. Runtime dependencies remain unchanged.
- `README.md` — links to this milestone and updates optional-date guidance.

`handoff.js`, `publications.js`, `001_editions.sql`, the edition persistence API/store, fixtures, and sample-generation code are unchanged.

## Verification results

- Complete automated suite: **57 passed, 0 failed**.
- Production build: **passed**.
- SQL tests use [PGlite's in-memory Postgres](https://pglite.dev/docs/) on this computer. No Neon credentials or network database are used.
- SQL tests cover seed migration/re-run behavior, create/list/update/deactivate/reactivate/delete, persistence, version conflicts, HTTPS validation, referenced deletion, HTTP API errors, and timestamp independence.
- Snapshot tests cover active dropdown filtering, preserved historical links, explicit new revisions, Content JSON round trips, and unchanged email/Gmail content for both publication types.
- Browser verification against a temporary local database confirmed the manager, all seven destinations, creation of a new destination, dropdown population, deactivation with the existing selected link retained, the preserved rendered URL, and the Issue date label/helper. The temporary QA server was stopped afterward.
- `git diff --check` passed. The public `dist/` build contains no `DATABASE_URL`, `process.env`, or Postgres connection strings. `npm audit --omit=dev` found zero vulnerabilities. The existing development dependency tree still reports four moderate findings; unrelated upgrades were not made.

## Manual verification after your migration and eventual deployment

1. Open **Approved Destinations → Refresh destinations**. Confirm all seven approved names/URLs and last-updated timestamps.
2. Create a temporary destination with a display name, HTTPS URL, and optional category. Confirm an HTTP URL is rejected. Edit the name and URL, save, refresh, and verify persistence.
3. In a Newsletter, choose the destination on a card and set a button label. Save the edition online and download Content JSON. Repeat with a Program Letter.
4. Rename/change the registry URL, then deactivate it. Reopen each saved edition: its old button URL must still render, while the inactive record is absent from new choices. Reactivate and deliberately select the revised entry on one card; another card retaining the old snapshot must remain unchanged.
5. Try deleting the referenced destination: expect a message recommending deactivation. Create an unreferenced destination, cancel deletion, then confirm deletion and verify it disappears.
6. Set Issue date to a future distribution date. Save and reopen the edition. Confirm Issue date stays fixed while database update timestamps change. Leave an event-card Date blank and confirm that alone does not block readiness.
7. Import the downloaded JSON without database access. Verify historical links, preview/export, and Gmail rich/plain copy still work. Browser saving and JSON download remain available when registry/network requests fail.
8. Verify your site access restrictions also protect direct `/.netlify/functions/destinations` and `/.netlify/functions/editions` requests from unauthorized visitors.
