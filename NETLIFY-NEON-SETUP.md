# Production cleanup and online editions

Implemented locally; nothing was pushed or deployed. No database credentials were requested, stored, or added to Git. Existing unpublished draft-marker changes remain intact.

## What changed

The header now has **Editions** instead of **Full director mockup**. Sample factories, fixtures, generator and tests remain available.

The Editions screen supports creating a Program Letter or Newsletter, explicitly saving the current edition online, updating a linked edition, listing and reopening saved editions, saving a new independent online copy, duplicating a saved edition, and deleting after confirmation. Duplicates start in Draft with a new ID and timestamps. Duplicating does not replace the working editor copy.

Browser autosave remains the fallback. Opening another edition, creating a new edition, or importing JSON asks before replacing the working copy. Existing local content is never uploaded automatically. Open **Editions → Save online** to upload it deliberately. Refreshing the library only reads online records.

Online updates and deletes use version checks to avoid overwriting another editor's newer save. A conflict retains local work: download Content JSON or choose **Save as new online edition**, then reopen the latest online edition. If a connection fails after a save request, check **Refresh online editions** before retrying: the server may already have completed it.

Online payloads are limited to 4 MB to fit within the function request budget. For larger editions, keep Content JSON backups or use hosted images. Local JSON imports retain their existing 15 MB limit.

## Files

Added:

- `editions-client.js`: same-origin API client, timeout and safe error handling.
- `netlify/functions/editions.js`: GET/POST/PUT/DELETE API; reads `DATABASE_URL` exclusively at function runtime.
- `server/editions-store.js`: validation, parameterized SQL and optimistic concurrency.
- `db/001_editions.sql`: idempotent schema migration.
- `build-site.js`: copies an explicit public-file allowlist into `dist/`.
- `netlify.toml`: build, public directory, functions directory and Node configuration.
- `tests/persistence.test.js`: data/API/client tests.
- `tests/editions-ui.test.js`: editor integration and failure/recovery tests.
- `NETLIFY-NEON-SETUP.md`: this handoff.

Changed:

- `index.html`: removes mockup navigation; adds Editions navigation and the client script.
- `app.js`: Editions interface/actions and a separate local online-record reference; keeps existing Content JSON and Gmail handlers.
- `.gitignore`: adds `.netlify/` and `dist/`; existing `.env` and `.env.*` exclusions remain.
- `package.json` and `package-lock.json`: adds runtime dependency `@neondatabase/serverless` (`^1.1.0`), `npm run build`, and Node >=22.
- `README.md`: current storage/setup guidance.

`handoff.js`, content architecture, migration logic, renderers and readiness rules are unchanged by this milestone. Earlier draft-marker work in `core.js`, `tests/core.test.js`, and `tests/draft-marker.test.js` was already present and is preserved.

Existing development dependencies (Drizzle and esbuild) are unchanged; this migration uses plain SQL and does not require Drizzle.

## Database schema

One shared `editions` table holds UUID `id`, `publication_type`, `title`, `edition`, `semester`, `academic_year`, `audience`, `editorial_status`, complete JSONB `content`, integer `version`, and database-generated `created_at` / `updated_at`. Publication type/status have check constraints. An index orders the library by most recent update.

The portable content JSON retains its own publication metadata timestamps; database timestamps describe creation/update of the online record. There are no student, subscriber, user-account, or authentication tables. No migration runs automatically at application startup.

## Exact Neon steps

1. In your Neon dashboard, create or choose a project for the Studio. Select the intended database and branch (for example, the project's production branch and `neondb`).
2. Open **SQL Editor** for that same branch/database. Paste the entire contents of `db/001_editions.sql` and run it once. It creates the table and index without deleting existing rows; rerunning this initial migration is safe.
3. Open **Connect** for the same branch/database. Select the database role you intend the application to use, enable connection pooling, and copy its Postgres connection string, retaining its SSL parameters.
4. Enter that string only into Netlify's secret environment variable UI below. Do not paste it into source files, HTML, Content JSON, chat, or a Git commit.

## Exact Netlify steps (for your later deployment)

1. Open your existing Netlify project's **Project configuration → Environment variables**. Add `DATABASE_URL` and paste the Neon connection string as its secret value. If scope controls are available, enable **Functions** only. Set the production value for the production deploy context. Use a separate Neon branch/database for Deploy Previews or leave preview storage unconfigured.
2. Use the directory containing `package.json` and `netlify.toml` as the Netlify **Base directory**. If that directory is the Git repository root, leave Base directory empty. If you copy this project under another repository folder, set Base directory to that folder.
3. The checked-in `netlify.toml` supplies **Build command: `npm run build`**, **Publish directory: `dist`**, **Functions directory: `netlify/functions`**, and Node **22**. Remove conflicting dashboard overrides if present. Never set the publish directory to the repository root.
4. When you are ready, review/commit/push these local files through your normal GitHub workflow, then trigger a new Netlify deployment. This implementation task did not perform those steps. Redeploy after setting/changing function environment variables.
5. On the deployed Studio, select **Editions → Refresh online editions**. A new database should show zero editions rather than an unavailable message.
6. Create a test Program Letter, add content, and choose **Save online**. Reopen it from another browser/device, change its title, save, refresh the first browser's list, and reopen it to verify the change.
7. Verify **Duplicate edition**, confirm/cancel **Delete edition**, and repeat with a Newsletter. Verify Content JSON download/import and Gmail copy as before. Test unavailable storage against a separate preview database/configuration, not by disrupting production.

Important access boundary: this milestone deliberately adds no authentication, as requested. All clients able to reach the function share the same edition library and can read/write/delete it. A private GitHub repository does not make a Netlify site or its API private. Cross-origin write rejection is not an access-control system. Apply any existing deployment-level access restrictions to both the site and functions before storing material intended to be private.

Netlify documents function directories and environment-variable scopes in [Function configuration](https://docs.netlify.com/build/functions/configuration/). The database adapter uses the [official Neon serverless driver](https://github.com/neondatabase/serverless).

## Local development and verification

Run `npm ci`, `npm test`, and `npm run build` with Node 22 or newer. `npm start` continues to serve the local editor without an API; online actions show an unavailable message and preserve work. For a real local API connection, run `npx netlify dev` using your Netlify-linked project and environment settings. Do not commit `.netlify/` or `.env*`.

The build publishes only application browser files and assets. It does not copy `.env*`, Git files, database migrations, server/function sources, tests, or dependencies into `dist/`. Database error details are neither logged nor returned to the client.

Automated coverage includes both publication types, all editorial statuses, parameterized SQL, invalid inputs, payload limits, CRUD, version conflicts, deletion, failure masking, no automatic uploads, and editor work preservation. Tests use in-memory database substitutes; live Neon/Netlify verification remains pending your configuration.

Results: **46 tests passed, 0 failed** across the complete suite. `npm run build` passed. Browser checks confirmed the new header/library and that failed online refresh/save actions preserve the editor. `handoff.js` has no changes. The production output contains no `DATABASE_URL`, `process.env`, or Postgres connection strings. `npm audit --omit=dev` reported zero vulnerabilities; npm reports four moderate findings in the existing development dependency tree, which this milestone did not upgrade.
