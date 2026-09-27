# EdD Communications Studio

A communications editor with browser autosave and optional online edition storage through Netlify Functions and Neon Postgres. See [Netlify and Neon setup](NETLIFY-NEON-SETUP.md) for migration, configuration, file changes, and verification. No authentication, subscriber list, email delivery, or university API is included.

## Run

With Node.js installed, open a terminal in this folder and run:

```sh
npm start
```

Open http://127.0.0.1:4173. Keep the terminal running while using the application. Alternatively, open `index.html` directly; the editor and downloads work without a server, but browser storage and clipboard behavior for local files varies. The server binds only to the local computer.

## Use

1. The first visit opens an explicitly marked placeholder edition. Choose **New edition** for a blank edition, or replace the demonstration content.
2. Edit issue details, then select any of the 12 sections. Add as many cards as needed. Use arrows to reorder sections or cards, and checkboxes to include or exclude them.
3. Enter plain text, dates, authors, deadlines, quotations, images, and buttons. Choose button destinations from the Link library. A button is optional, including for the Café; no registration URL is required.
4. Confirm link approval in the library. Changing a URL clears its approval. Student and alumni stories require publication approval; changing card content clears that approval.
5. Preview at desktop or mobile width, with separate Web and Email renderers.
6. Open Readiness for checks derived from the current edition. Empty sections are excluded, not blockers. Disabled sections and cards are excluded from validation and rendering.
7. Export a final bundle when blockers are resolved. A labeled draft bundle, editable Content JSON, and Links-used JSON remain available at any time. Copy HTML follows the selected format and includes the draft banner while blocked.
8. Save Content JSON as a backup. Import it to resume an edition or move it to another browser. New edition replaces the current local draft only after confirmation.

The ZIP contains `output/<edition>/edd-newsletter-<edition>.html`, the separate `-email.html`, `content.json`, `links-used.json`, and `README.txt`. Draft HTML filenames also contain `-draft`. ZIPs are created entirely in the browser. The browser downloads them to its configured Downloads location; it does not silently write to an arbitrary filesystem folder.

## Architecture and files

- `index.html`: application shell and accessible navigation.
- `studio.css`: responsive editor presentation and centralized UI tokens.
- `app.js`: visual forms, section/card ordering, local persistence, import, download and clipboard actions.
- `core.js`: edition factories, central link library, validation, independent web/email renderers, export manifests, JSON parsing, and a dependency-free stored ZIP writer. It runs in the browser and Node for tests.
- `schemas/content.schema.json`: portable content model; ordered section and card arrays.
- `schemas/links.schema.json`: central destination record schema; empty URLs represent pending destinations.
- `sample/`: clearly labeled placeholder edition, web/email exports, inventories, README, and sample draft ZIP.
- `server.js`: optional loopback-only static server.
- `tests/core.test.js`: content gating, safe rendering, approval, assets, ordering, JSON and ZIP checks.
- `package.json`: `npm start` and `npm test`; no package installation required.

Edition data is separate from presentation. Each card references a link ID. All newsletter colors are centralized in `core.js` → `tokens`; Studio colors are CSS variables. The two known URLs are user-supplied Community Center and Café destinations; all other library entries are pending. No additional Antioch links are invented.

## Validation and limitations

- Checks detect missing edition fields, placeholder copy, empty cards, event dates, expired deadlines, incomplete buttons, pending/unapproved/unsafe destinations, image alt text, local-only images, and unconfirmed student/alumni approval. Expired deadlines are reminders; missing required content and approvals are blockers.
- Link validation checks approval and HTTPS syntax only. It does **not** assert that links work or that images are publicly accessible. Use **Open to verify** and test images in the intended recipient context. The Community Center may require institutional sign-in.
- Local PNG/JPEG/WebP/GIF uploads are limited to 2 MB each. Browser storage has a total quota; save failures are shown in the header. Download JSON before closing if saving fails. Remote HTTPS URLs are needed for final email export. A remote URL supersedes a local image in rendering.
- HTML is escaped. Arbitrary rich HTML is not accepted. Multiple image cards can represent a gallery; there is no cropper, rich-text editor, or multi-column gallery control.
- Web export is a standalone document without scripts or external stylesheets. Hosted images still need internet access. Draft web exports can embed local images; draft email exports omit them.
- Email uses conservative inline styling and presentation tables, including an Outlook conditional width wrapper. Real Gmail, Outlook, mobile-email and sending-platform rendering has not been tested. The browser's email preview is not an email-client emulator.
- Colors and typography are a prototype identity, not verified Antioch brand standards. No unapproved logos or real people are included.
- Local storage keeps one working edition per browser origin. The online Editions library supports multiple saved editions. Import/export JSON remains available when online storage is unavailable. There is no multi-user review, submission intake, or automatic publication.
- The optional read-only WebMCP readiness tool is feature-detected. Ordinary browser controls work without it.

Run core checks with `npm test`.

## Email handoff and Gmail testing

Export has three distinct areas:

1. **Email HTML source** — Download Email HTML or Copy Email HTML Source for a platform that accepts source. Blocked editions retain an explicit draft marker.
2. **Rendered email preview** — shows the exact generated email document in an embedded preview. Open Email Preview in New Tab opens the same document independently.
3. **Copy for Gmail** — copies visible email content using a ClipboardItem with text/html and text/plain representations. Paste normally into Gmail Compose, with plain-text mode disabled. Document elements and the hidden preheader are excluded. A draft warning remains when readiness checks fail.

Copy for Gmail is intended for draft/testing workflows. Gmail may modify some formatting. Use the exported email-safe HTML with the institutionally approved email distribution platform when available.

If rich clipboard copying is unsupported or denied, the Studio attempts plain-text copying and explicitly reports the loss of formatting. If clipboard access is entirely unavailable, it selects plain text for manual copying. No Gmail APIs or email-sending functionality are involved. Clipboard functionality is in `handoff.js`, independently tested with simulated supported, rejected, and missing browser clipboard APIs. Actual Gmail paste fidelity requires manual testing.


## Communications Studio milestone (September 26, 2026)

The application now offers two publication types through **Create New → Program Letter / Newsletter**. A fresh browser opens the creation chooser. A browser with saved work opens that work directly; Create New is always available. The existing full director newsletter remains accessible through the header link and uses its separate storage area.

- Program Letter: nine default modules, beginning with Chair’s Message and ending with Closing Message.
- Newsletter: the original newsletter defaults plus Faculty/Staff Spotlight and an initially disabled CPED module. Legacy editions retain their exact module list and order.
- Add modules from **Add a module** in the sidebar, including custom modules. Remove a module in its editor, or disable it to retain content. Arrows continue to reorder modules and cards.
- Both types use the original renderers and `handoff.js`. A Program Letter receives a small EDD PROGRAM LETTER label in the shared masthead. Existing newsletter rendering remains unchanged.
- Publication title, edition, semester, academic year, audience and status are editorial metadata. Existing Program name, Period, Year, Issue date, Preheader and Footer note continue to control the rendered identity. This retains older newsletter appearance.
- Status is manual tracking only. Approved does not bypass readiness. Distributed does not send an email or record a delivery event.
- External submission checkboxes flag entered stories/photos for review; no submissions are fetched automatically. Student, alumni and faculty/staff spotlights require publication approval. Edits continue to clear card approval.

### Data and compatibility

`publicationType` is a top-level field with values `program-letter` or `newsletter`. The `publication` object contains `title`, `edition`, `semester`, `academicYear`, `status`, `audience`, `createdAt`, and `updatedAt`. Date and preheader retain their existing canonical locations: `issue.issueDate` and `issue.preheader`. Schema version remains 1 with additive fields. Old JSON is accepted and normalized as a Newsletter without replacing its issue, links, cards, approval flags, section order, or optional logo/review fields. For old files, timestamps indicate when migration occurred because historic creation times were never stored.

Working storage uses `edd-communications-studio-v2`; the director mockup uses `edd-communications-director-review-v2`. The app checks these first, then falls back to the original `edd-newsletter-studio-v1` or `edd-newsletter-director-review-v1`. Original entries are never overwritten by the new app. Nothing is written merely by opening or closing an unchanged migrated edition. Edits and explicit creation/import save to the new key. Imported invalid data is rejected before replacing the working edition.

Each browser origin holds one working edition and one director mockup. The Editions library supports multiple online editions through explicit saves; Content JSON remains portable. The original working project was backed up before edits in `../newsletter-studio-working-backup-2026-09-26.zip`.

### Filenames

- Program Letter: `edd-program-letter-2026-09-25-email.html`
- Newsletter: `edd-newsletter-fall-2026-email.html`
- Draft variants include `-draft`; standalone versions omit `-email`. The ZIP name also includes the publication type. Content JSON and Links-used JSON keep their existing names.

### Changed files and verification

New `publications.js` owns module defaults, publication metadata normalization, type labels, review predicates, and filename bases. `app.js`, `index.html`, and `studio.css` supply the chooser, metadata editor, module controls, type context, and storage compatibility. `core.js` adds normalization, filenames, shared approval checks, and the minimal Program Letter masthead label. `handoff.js` is byte-for-byte unchanged from the backup.

`tests/publications.test.js` covers migration, preservation of exact legacy web/email output against hashes generated from the backup, defaults, filenames, review behavior, and both publication types through the existing rich-clipboard function. These tests use simulated clipboard APIs; the user's earlier successful Antioch Gmail paste test remains the real-client verification. No new Gmail API connection or sending integration has been added.
