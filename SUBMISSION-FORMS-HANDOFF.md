# Submission Forms & Private Handoff milestone

## Deploy Preview 503 follow-up

### Confirmed findings

- GitHub's `netlify/eddcomstudio/deploy-preview` status for **`ce4a70f80af90922de0c2bdff9e86f58017ca761`** reported **“Deploy Preview ready!”** at **2026-10-20 19:51:36 UTC**, linking to `https://deploy-preview-1--eddcomstudio.netlify.app`. The associated Netlify deployment ID is **`6ad7c6357eb5f011a2d24c55`**. This confirms the preview status belongs to the repair commit, not just the earlier baseline. It does not independently verify served function bytes or runtime health.
- The user observed HTTP 503 for both function routes. Direct retrieval of their response bodies from this task environment failed DNS resolution; browser tooling was also unavailable. GitHub Actions shows agent/review runs, not the Netlify build/function logs. Thus the deployed response `code`, actual preview environment values, database schema, and Netlify runtime logs remain unverified. No Grammarly/tracking message is evidence of the storage cause.
- Both checked-in functions exist at `netlify/functions/{submission-forms,destinations}.js`; `netlify.toml` configures that directory with esbuild bundling, Node 22, build `npm run build`, and public directory `dist`. Runtime dependencies include `@neondatabase/serverless`. Function files intentionally are **not** copied to public `dist`; Netlify bundles them separately. The same-origin `/.netlify/functions/<name>` routes need no redirect.
- Both functions lazily read the **same runtime `DATABASE_URL`**, initialize the Neon driver, and query the database on GET. They also share `server/editions-store.js` UUID/version validation and its `core.js` dependency; these are local bundle dependencies, not separate services. Missing configuration or connection/permission failures can therefore fail both managers. Module-load/bundle failures occur before the handler catch and may instead produce platform errors; distinguish those using the Netlify logs, not HTTP status alone.
- Submission Forms GET runs `SELECT * FROM submission_forms`. Destinations GET first queries `destinations`, then projects exposed forms from `submission_forms`. **A completely absent migration 003 table alone does not explain both 503s:** Destinations explicitly tolerates `42P01` from that second query. Missing migration 002, a shared connection/configuration issue, or an existing but incompatible Forms table can affect Destinations. Deletion checks in both stores also query `editions` from migration 001.
- **Save gating is not field validation:** the button is disabled when `!state.loaded || state.busy`. `loaded` starts false and becomes true only after successful `api.list()`. Opening the Submission Forms view already calls `forms.refresh()` in `app.js`; no extra startup request is needed. A 503 on the first load leaves Save disabled intentionally. The blank URL, Program Letter-only selection, and unchecked options are valid. Removing this gate would not restore database access.

### Application defects repaired in this follow-up

Approved Destinations still collapsed every infrastructure exception into a generic 503 without safe diagnostics, unlike Submission Forms. Both functions now share server-only storage initialization/error classification. Missing runtime configuration, adapter initialization, incomplete schema, database permissions, connectivity, and unexpected failures have distinct safe diagnostic codes. Unexpected server errors return 500; known dependency/configuration failures return 503. Logs contain only the function, operation, category, and SQLSTATE where available. Exception text, SQL, and environment values are never printed or returned.

The form manager now explicitly explains why Save is disabled after an initial load failure and points to the existing **Refresh forms** retry button. Refresh retains typed input; Save stays disabled until a real backend load succeeds. No offline success, browser-only persistence, or validation/security bypass was added. An adapter initialization failure is distinguished from a database query failure.

### Likely preview configuration issue — confirm, do not assume

If the deployed JSON response has **`code: "DATABASE_NOT_CONFIGURED"`**, the cause is confirmed: that deployed Function cannot read `DATABASE_URL`. A production-only value or a Builds-only scope does **not** configure Deploy Preview Functions. If the response instead has `SCHEMA_NOT_READY`, `DATABASE_UNAVAILABLE`, or `DATABASE_PERMISSION_DENIED`, use the corresponding database checks below; merely setting the variable again will not fix an absent table or unreachable database.

### Exact manual actions (preview only)

1. In **Netlify → eddcomstudio → Deploys**, open deployment **`6ad7c6357eb5f011a2d24c55`** or the latest preview for this branch. Verify **deploy context: Deploy Preview**, branch, and source commit. For the original repair it should be `ce4a70f`; after this follow-up, verify the newer branch commit. In deploy details, confirm both `submission-forms` and `destinations` Functions are included. Inspect build/function logs there; GitHub's successful preview status alone only means the deploy completed.
2. In **Project configuration → Environment variables → DATABASE_URL**, check that a value exists for the **Deploy Previews** context and its scope includes **Functions** (or all scopes). The more specific context value, if set, must target the intended preview database. A value configured only for **Production** or **Builds** is insufficient. Do not paste the value into code, browser tools, tickets, or logs.
3. Use a **dedicated Neon preview branch/database**, not an assumed production connection. Obtain its connection string from Neon Connect, retaining SSL parameters, and enter it privately in the setting above. Leave production settings and data unchanged. Confirm the preview database is available and the configured role can use the schema and perform the required CRUD.
4. In that **preview** database's SQL Editor, check `SELECT current_database();` and, if useful, `SELECT to_regclass('public.editions'), to_regclass('public.destinations'), to_regclass('public.submission_forms');`. Confirm the selected Neon branch independently in the dashboard; database names may be identical across branches. Review the table columns and migration history. Apply only outstanding `db/001_editions.sql`, then `db/002_destinations.sql`, then `db/003_submission_forms.sql` in order. Do not drop/reset/truncate tables or apply changes to production. A null `to_regclass` confirms a missing table; a non-null result does not prove every expected column exists.
5. After reviewing changes and updating settings, **manually redeploy the Deploy Preview** from the intended branch commit. Environment changes need a new deploy to take effect; a browser reload does not rebuild Functions. Do not merge or publish a production deploy for this check.
6. With administrator access through the existing protected preview, open DevTools → Network, then **Submission Forms → Refresh forms** and **Approved Destinations → Refresh**. Expect both GETs to return **200 JSON**. If not, record only the HTTP status, safe `code`/message, and time; inspect the matching Function logs. Check `DATABASE_INITIALIZATION_FAILED` against connection-string format and packaged dependencies. Do not bypass access controls or share raw logs containing unrelated sensitive information.
7. While a failed initial load keeps Save disabled, type the draft metadata and keep the tab open. After restoring storage, click **Refresh forms**; input must remain and Save must enable. Save the inactive Program Letter-only record with no URL and destination exposure unchecked; expect a real 201 response. Reload, refresh, and reopen it. Verify Approved Destinations and existing editions remain unchanged.

Tests added cover actual exported handlers with absent runtime configuration (GET/POST for both), lazy adapter initialization and recovery, safe initialization/query diagnostics, and initial-load disabled Save → failed retry → successful refresh → real save, preserving draft and edition content. Preview settings, live Neon connectivity, and deployed function logs still require the manual checks above. No migration, merge, manual deploy trigger, or production mutation was performed.

Follow-up verification: all **118 tests** passed, including recovery after missing migration 002; `npm run build` and `git diff --check` passed. Changed-file secret scanning found no secrets. No lint command is configured. Existing dependencies and migration files are unchanged.

## Submission Forms save repair

### Diagnosis and request trace

Draft validation and migration 003 already permit an empty URL with `active: false` and `expose_as_destination: false`. `publication_targets: ["Program Letter"]` is valid on its own. The Google integration notice is informational; no Google service is contacted.

Saving creates a JSON `POST /.netlify/functions/submission-forms` with `{id, form, version: null}`. `form` contains `name`, `url`, `description`, `audience`, `form_type`, `active`, `notes`, `publication_targets`, `content_categories`, and `expose_as_destination`. Updating uses `PUT /.netlify/functions/submission-forms?id=<saved UUID>` and the saved integer `version`. Loading uses `GET` on the same function. Creation returns 201, updates/loads 200, validation errors 400, and conflicting versions or different metadata at an existing ID 409.

Previously, `netlify/functions/submission-forms.js` converted **every non-validation exception** into the same 503 “Submission Forms unavailable” message. `submission-forms.js` also used that message for network failures and JSON parsing failures, including HTML 404/access-denied responses. Neither path identified the failed dependency. The function did not log diagnostics.

The earlier milestone below records that migration 003 had **not been applied**. Automated reproduction confirms that an absent `submission_forms` table produces PostgreSQL `42P01`, preventing both listing and saving; applying the existing 003 migration restores draft CRUD without modifying editions. The static `npm start` server also has no function route and returns 404 for API calls. The checked-in Netlify function and functions directory configuration are present and consistent; no redirect or new migration is needed. Production Netlify deployment state, function logs, environment values, and Neon schema were **not accessible or verified in this repair**, so the actual production cause must be confirmed using the diagnostics below rather than assumed.

### Repair and diagnostics

- The function distinguishes missing configuration (`DATABASE_NOT_CONFIGURED`), incomplete schema (`SCHEMA_NOT_READY`), database role permissions (`DATABASE_PERMISSION_DENIED`), connection failures (`DATABASE_UNAVAILABLE`), and unexpected server failures (`SERVER_ERROR`). Validation messages still identify invalid fields.
- Netlify Function logs contain the operation, a safe diagnostic category, and PostgreSQL SQLSTATE when available. They deliberately exclude exception messages, stack traces, SQL, request bodies, notes, and connection strings.
- The browser separately identifies 401/403 access denial, 404/405 missing function routing, malformed responses, and network/timeout failures. Failed saves retain unsaved form input and never modify the current edition. Keep the tab open until the problem is resolved; unsaved form metadata is not persisted across a browser reload.
- A new draft keeps the same UUID across failed save retries. Replaying the same create request returns the existing identical record without inserting a duplicate or incrementing its version. Changed metadata with that UUID returns a conflict; refresh and open the saved record before editing it. Concurrent Save clicks are ignored while a save is in flight.
- URL security rules, inactive visibility, destination opt-in, version checks, migration contents, and Google integration notice are unchanged. No Google API, OAuth, import, or new dependency was added.

### Required deployment and access checks

1. **Protect both the Studio and its `/.netlify/functions/*` endpoints with the existing deployment-level administrator-only access restriction.** There is no application login or administrator-role system in this repository. Same-origin validation is not authentication. Do not deploy privately intended metadata to an unrestricted site. With an unauthenticated browser and a direct HTTP client, verify reads and writes cannot reach the function; a protected page alone is insufficient. If your hosting access gate does not cover Functions or cannot restrict access to administrators, an authentication project is required before private use.
2. In Netlify, confirm Base directory points to this repository, build command is `npm run build`, publish directory is `dist`, and Functions directory is `netlify/functions`. Deploy this revision and verify the `submission-forms` function appears in the deployment. For local API work use Netlify Dev; `npm start` is static-only.
3. Confirm server-only `DATABASE_URL` is set for **Functions** in the intended deploy context and points to the intended Neon branch/database. Never copy it into browser code or logs. Redeploy after changing environment settings.
4. In the matching Neon SQL Editor, confirm `SELECT current_database();` identifies the intended Studio database. Review existing tables/migration history. Apply only outstanding migrations in order: `db/001_editions.sql`, `db/002_destinations.sql`, then `db/003_submission_forms.sql`. Do not reset/drop/truncate existing tables. There is no automatic startup migration. Existing migration 003 is additive and its seeds do not overwrite edited rows; rerunning can recreate a deliberately deleted seed, so apply only if outstanding.
5. Open Submission Forms → Refresh forms. If it fails, inspect the browser Network request's status and safe JSON `code`, then the Netlify `submission-forms` function log at the same time. A 404/HTML response suggests routing or an access gate; 401/403 requires administrator access; 503 plus `SCHEMA_NOT_READY` requires the outstanding migrations; `DATABASE_NOT_CONFIGURED` requires the Functions environment setting; `DATABASE_UNAVAILABLE` requires checking Neon connectivity/availability; `DATABASE_PERMISSION_DENIED` requires checking the configured database role. Do not disable access protection to troubleshoot.

No production deployment or database migration was performed by this repair. No new environment variable is required. Administrator-only access is an existing deployment prerequisite, not something these function changes implement. Automated tests cover untrusted-origin rejection and handling upstream 401/403 responses, **not** the live hosting access gate.

### Exact draft verification

1. Sign in through the administrator-only protected Studio deployment. Open an existing Program Letter edition and note its title, status, content cards, and online version.
2. Open **Submission Forms → Refresh forms → New form** (the editor is headed **Create a form record**).
3. Enter the EdD Program Letter form name, description, audience, type, categories, and internal notes. Select **Program Letter** only. Leave **Active** and **Also offer as an Approved Destination** unchecked and the institutional URL blank.
4. Click **Save form**. Expect “Form saved” and a `POST` response of 201. Repeated clicks must not add another record. Confirm the form is inactive and absent from new publication destination choices.
5. Reload the page, reopen Submission Forms, refresh, and select **Edit form** on the saved record. Confirm all metadata persists. Change its notes, save, reload, and confirm the change.
6. Activate without a URL and expect the field-specific HTTPS validation message. Enter the real university-owned Google Form's HTTPS URL (not a fabricated URL), save, activate, then deactivate. Keep destination exposure unchecked and confirm Approved Destinations is unchanged. URL validation cannot establish university ownership; verify ownership institutionally.
7. Return to the Program Letter and confirm its title, status, cards, preview, and online version are unchanged. Repeat the access-denial check from step 1 of deployment checks in an unauthenticated session.

Regression tests use disposable in-memory PostgreSQL-compatible storage and cover the full manager/client/function/store draft flow, a newly loaded manager, editing, activation/deactivation, missing schema recovery, safe diagnostics, lost-response retries, denied origins/upstream access responses, unchanged editions/destinations, and retained unsaved input. Live Neon, Netlify deployment, and administrator access checks remain manual.

Repair verification: `npm test` passed **113 tests**, including 15 Submission Forms tests; `npm run build` and `git diff --check` passed. No dedicated lint command is configured. Installing the existing lockfile reported four moderate development-dependency advisories; this repair does not change dependencies.

## Historical milestone handoff

Local implementation only. Nothing was committed, pushed, deployed, or migrated in Neon. SQL verification used disposable, in-memory test databases only; no persistent database was changed.

## Implemented workflow

Contributors use institutional submission forms outside the Studio. The editor manages form links and publication content privately, prepares an external artifact, and passes that artifact through an approved private channel to an authorized reviewer/distributor. Reviewers do not need a Studio account, edition link, or API access.

### Submission Forms

The header now includes **Submission Forms**. Records support ID, name, institutional HTTPS URL, purpose/description, intended contributors/audience, type, active state, editor notes, creation/update timestamps, publication choices, configurable content categories, and optional exposure as a publication destination. Editors can create, edit, activate/deactivate, and confirm deletion where safe.

The three initial records are named exactly as requested. All have **blank URLs**, are **inactive**, and are **not exposed** as publication destinations. No Google Form URLs have been invented. A URL can remain blank while a record is inactive and unexposed; a valid HTTPS URL is required before activation or exposure. Deactivation retains the record and its history. Invalid URLs and stale record versions are rejected server-side as well as in the manager.

The Communications Content Submission record documents all four suggested publication choices and all sixteen suggested categories. Categories can be edited one per line; publication choices are checkboxes. These fields document the institutional form's intended options. They do not create or modify the external form, collect responses, or automatically import content. Google integration remains optional and subject to institutional approval.

### Reuse with Approved Destinations

**Also offer as an Approved Destination** opts in a form record. The destinations API projects exposed form records into its list using the same ID, name, URL, version, and timestamps. There is **no second destination row and no synchronized duplicate URL**. Form-backed entries show **Manage in Submission Forms** in Approved Destinations; maintain the URL at its source.

Only active entries are offered for new card selections. Deactivation or removing exposure removes future choices without changing saved edition snapshots. The existing Student Support page is untouched. Any future support-form replacement remains an explicit editor decision on individual cards.

Referenced form deletion is blocked for the current working edition and saved online editions, including disabled cards. The UI recommends deactivation. Offline copies cannot be enumerated, but their portable name/URL snapshots survive removal of an otherwise unreferenced form record. Form description, audience, notes, and category configuration are not copied into editions or handoff files.

If migration 003 is not installed yet, the existing destinations list continues to work from migration 002. Submission Forms reports unavailable until its table exists. No automatic schema migration runs in the application.

### Review / Distribution Handoff

The workspace navigation now includes **Review / Distribution Handoff**. It offers:

- **Download review package**: a ZIP containing rendered standalone web HTML, email-safe HTML, and `HANDOFF.txt`, named for review. Available while reviewing incomplete editions.
- **Download distribution package**: the same three artifact types, available only when status is Approved or Distributed **and** existing readiness checks have no blockers.
- **Open editor export / Copy for Gmail**: returns to the existing editor export interface. The clipboard mechanism in `handoff.js` is unchanged.

The handoff bundle deliberately excludes editable Content JSON, unused destinations, form records/notes, database details, and editor controls. It contains the enabled rendered publication and written instructions. Existing full editor backups and exports remain available separately.

The safest supported visual-review artifact is the standalone rendered HTML file: it needs no Studio session and has no scripts or forms. Email-safe HTML remains suitable for an institutionally approved platform that accepts HTML source. Both may load remote images, and their publication links remain external. Some institutional mail systems block HTML/ZIP attachments, so use an approved private transfer channel. Downloaded artifacts are not encrypted, expiring, or access-controlled by the Studio.

### Gmail limitation

Raw HTML pasted into Gmail Compose is not a rendered newsletter, and this implementation does not promise a reliable, lossless HTML-file import for an external distributor. No extension, injected compose code, Google API, automatic Gmail opening, recipient prefill, or fragile import workaround was added.

The editor can still use **Copy for Gmail**, paste into their own Gmail with plain text mode off, inspect formatting, and manually send a review copy. Gmail can alter formatting; review the pasted result. Google's [message-formatting help](https://support.google.com/mail/answer/8260?hl=en-ie) documents Compose formatting and plain text mode. Review comments and authorization remain outside the Studio.

### Status and date safeguards

- Draft retains `DRAFT PREVIEW · NOT FOR DISTRIBUTION`.
- Ready for Review now consistently renders `READY FOR REVIEW · NOT APPROVED FOR DISTRIBUTION`, including email/Gmail output. It is visibly different from Approved.
- Approved and Distributed render no draft marker.
- Status never suppresses readiness checks. The new distribution handoff checks both status and readiness in its implementation, not only with a disabled button. Existing approval, HTTPS/link, alt-text, required-content, and other blockers remain enforced.
- Downloading a package never changes status to Distributed and never sends email.
- Database timestamps remain separate from Issue date; optional card dates remain independent. No date field was changed in this milestone.

No handoff table, recipient field, student record, subscriber list, reviewer account, public edition URL, tokenized sharing, or authentication system was added. The existing deployment-level protection remains responsible for keeping the editor workspace and its APIs private; artifacts do not grant or link to that access.

## Exact migration order — manual execution later

In the dedicated Neon **`edd_communications_studio`** database:

1. **`001_editions.sql`** — already applied according to the existing setup. Do not rerun it just for this milestone.
2. **`002_destinations.sql`** — exists and has not yet been applied. Run this next.
3. **`003_submission_forms.sql`** — newly added; run it after 002.

Neither 001 nor 002 was modified. The new 003 table holds form/link metadata only; no handoff schema is needed.

When you decide to apply the migrations, choose the correct Neon branch/database in SQL Editor, run `SELECT current_database();`, and confirm the result is `edd_communications_studio`. Then paste the complete contents of 002, followed by 003. Check:

```sql
SELECT name, url, active FROM destinations ORDER BY name;
SELECT name, url, active, expose_as_destination FROM submission_forms ORDER BY name;
```

Expect seven destinations and three inactive, unexposed forms with empty URLs. Seeds use `ON CONFLICT DO NOTHING`; re-running does not overwrite edited records, but can recreate a seed record deliberately deleted earlier. Application startup never runs these files.

Keep the existing **server-only `DATABASE_URL`** configured in Netlify Functions for that database. No new environment variable or credential is required. No deployment was performed. Build command remains `npm run build`, publish directory `dist`, functions directory `netlify/functions`.

## Files added in this milestone

- `db/003_submission_forms.sql`
- `submission-forms.js`
- `submission-forms-manager.js`
- `server/submission-forms-store.js`
- `netlify/functions/submission-forms.js`
- `private-handoff.js`
- `tests/submission-forms.test.js`
- `tests/private-handoff.test.js`
- `SUBMISSION-FORMS-HANDOFF.md`

## Files changed in this milestone

- `app.js`: form manager integration, field handlers, handoff navigation/download actions.
- `index.html`: Submission Forms and handoff navigation; browser module loading.
- `build-site.js`: adds the three new browser modules to the explicit public-file allowlist.
- `core.js`: distinct Ready for Review notice; existing Draft/Approved/Distributed behavior retained.
- `destinations-manager.js`: routes form-backed entry management to Submission Forms.
- `server/destinations-store.js`: combines normal destinations with exposed form records; tolerates 003 not yet installed.
- `tests/draft-marker.test.js`: verifies the distinct Ready for Review notice.
- `tests/editions-ui.test.js`: loads new modules and tests multiline category handling without edition mutation.
- `README.md`: links to this report.

No npm dependency was added in this milestone. SQL tests reuse the development-only PGlite dependency introduced previously. Earlier Approved Destinations changes are still present in the local working tree and are not new work from this milestone.

## Verification

Final results: **73 tests passed, 0 failed**. **Production build passed**. Browser checks passed. `git diff --check`, public-build secret checks, and SHA-256 checks for unchanged `001_editions.sql`, `002_destinations.sql`, and `handoff.js` all passed.

Automated coverage includes complete form CRUD, blank/HTTPS URL rules, activate/deactivate, metadata persistence, version conflicts, destination reuse without duplicate records, no invented seed URLs, reference-aware deletion, preserved historical snapshots, request errors, handoff contents, status/readiness gates, Gmail markers, date preservation, and category UI handling.

Browser checks used a temporary local in-memory database, not Neon. They verified initial blank/inactive records, form creation and persistence, destination exposure with management routed back to the form, review handoff while Ready for Review, distribution gating, successful review/distribution downloads, and Approved status remaining unchanged after download. The QA server and tab were closed afterward.

`handoff.js`, `001_editions.sql`, and `002_destinations.sql` are unchanged. The public build contains no `DATABASE_URL`, `process.env`, or Postgres connection string.

## Manual verification after your eventual migration/deployment

1. Open **Submission Forms → Refresh forms**. Check the three expected records, blank URLs, inactive state, timestamps, and no publication exposure.
2. Try activating a form without its URL: expect rejection. Enter the actual institutional HTTPS URL, configure its name/purpose/audience/type/notes/targets/categories, save, refresh, and reopen it.
3. Check **Also offer as an Approved Destination** and Active. Confirm one entry appears in Approved Destinations with **Manage in Submission Forms**, and it appears in a card dropdown. Confirm Student Support is unchanged.
4. Select that form on a card, save the edition, and download Content JSON. Rename/change/deactivate the form, then reopen the edition: the saved name/URL must remain unchanged. Deliberately select the revised active entry to update an individual card.
5. Try deleting a referenced form: expect deactivation guidance. Test cancel/confirm deletion on an unreferenced temporary record. Verify no institutional form itself is deleted.
6. In both Program Letter and Newsletter, test Draft, Ready for Review, Approved, and Distributed. Confirm markers and that Approved with a readiness blocker cannot produce a distribution handoff.
7. Download review and distribution ZIPs. Confirm exactly web HTML, email HTML, and `HANDOFF.txt`; no Content JSON, form notes, API links, or editor controls. Open the HTML locally without Studio access. Status must not change on download.
8. Use the existing Copy for Gmail workflow to prepare a manual review copy, checking the pasted appearance. Do not expect raw HTML source or an HTML attachment to import directly as a formatted Gmail draft.
9. Confirm Issue date remains your planned date after online save/reopen. Leave a card Date blank. Test browser saving, Content JSON portability, and graceful unavailable-storage messages.
