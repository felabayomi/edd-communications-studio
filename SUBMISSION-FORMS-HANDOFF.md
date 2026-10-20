# Submission Forms & Private Handoff milestone

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
