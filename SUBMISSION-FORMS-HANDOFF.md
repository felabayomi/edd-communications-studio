# Submission Forms & Private Handoff milestone

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
