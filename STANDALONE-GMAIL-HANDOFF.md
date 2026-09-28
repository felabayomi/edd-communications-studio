# Standalone Gmail handoff

Implemented locally. No commit, push, deployment, or live database migration. Migrations 001, 002, and 003 are unchanged; no new migration or npm dependency was added.

## What the distributor receives

Both review and distribution ZIPs now contain four files:

- **OPEN-TO-COPY.html** — open this extracted file in Chrome or Edge to review and copy the formatted email.
- The existing web HTML — visual review/archive/reference.
- The existing email-safe HTML — reference or import into an institutionally approved platform that accepts HTML source.
- **HANDOFF.txt** — step-by-step Gmail distribution instructions and limitations.

The new page embeds the exact existing email fragment from the same email document included in the ZIP. It does not render an alternate email. Its embedded JavaScript contains the existing `plainText` and `copyRendered` function implementations from `handoff.js`, plus a small local-file adapter. The renderer and the Studio clipboard module are unchanged.

## Copy strategy

1. **Clipboard API:** attempts a single write containing `text/html` and `text/plain`, using the proven Studio helper.
2. **Rich copy-event fallback:** if that API is missing or rejects the write, temporarily selects only the publication and uses the browser's `copy` event with `clipboardData.setData` for both MIME types. It invokes the legacy `document.execCommand('copy')`, then removes the temporary listener and restores the prior selection. This deprecated API is best-effort and may be unavailable in some browsers.
3. **Plain-text fallback:** the existing helper attempts `writeText` if rich copying fails. The page explicitly says formatting was not preserved.
4. **Manual selection:** a separate **Select publication** button selects only the publication. The user presses Ctrl+C, or Command+C on a Mac, then pastes into Gmail. Clear instructions are shown when automatic copying is blocked; the page does not silently claim success.

The clipboard excludes the page heading, instructions, buttons, scripts, document-level markup, and hidden email preheader. Draft and Ready for Review warnings remain part of the publication and copied content. Approved/Distributed retain their existing warning-free publication output. Distribution eligibility remains gated by editorial approval and readiness. Package generation never changes status or sends a message.

The core copy code is entirely in the file and needs no server, login, API or internet connection. Remote publication images and clicked links can still require internet access. Gmail may alter formatting; a successful clipboard write is not a guarantee of identical Gmail rendering.

## Security and privacy checks

- No credentials, database configuration, private API endpoints, unused destination records, form metadata, other editions, browser storage, or editor controls are serialized into the copy page.
- Publication text continues through the unchanged escaping renderer; tests confirm script-like editorial text cannot escape into executable script.
- Only the required copy functions are embedded; no external script/library or dynamic code fetching is needed.
- The copy page adds a restrictive Content Security Policy: no network connections, external scripts, forms, or base URL changes. Inline copy code/styles and publication images are allowed.
- No public URL, reviewer account, Gmail navigation, recipient prefill, email sending, or Studio access is created. Recipients/subject are entered manually by the distributor.
- Artifacts remain ordinary files, not encrypted or remotely revocable. Transfer them only through an institutionally approved private channel.

## Files added

- `standalone-copy.js` — standalone page generator and local-file clipboard adapter.
- `tests/standalone-copy.test.js` — generation, privacy, status and clipboard fallback tests.
- `STANDALONE-GMAIL-HANDOFF.md` — this report and manual test.

## Files changed

- `private-handoff.js` — adds `OPEN-TO-COPY.html`, updates HANDOFF.txt instructions and handoff UI descriptions.
- `index.html` — loads the new generator before the private handoff module.
- `build-site.js` — includes the generator in the browser build allowlist.
- `tests/private-handoff.test.js` — expects four files and permits copy-page script only in OPEN-TO-COPY.html; existing publication-only HTML remains script-free.

`core.js`, `handoff.js`, all three migrations, edition/destination/form stores, and publication models were not edited for this milestone.

## Verification results and limit

- Complete automated suite: **85 passed, 0 failed**.
- Production build: **passed**.
- `git diff --check`: **passed**.
- Tests cover both publication types and all four statuses, exact email-fragment inclusion, preheader/control exclusion, private-data exclusion, injection escaping, native rich clipboard writes, rich fallback after missing/denied APIs, plain-text messages, manual selection, and HANDOFF.txt instructions.
- A real handoff ZIP was generated and extracted locally for inspection. Browser automation refused to open its `file://` page because its URL policy only allows HTTP/HTTPS. No policy workaround or alternate browser surface was attempted. Therefore **actual Chrome/Edge clipboard behavior from a local file still needs the manual check below**; the automated clipboard tests use controlled browser-interface substitutes.
- The existing full suite executes SQL only in disposable in-memory test databases. No Neon or persistent database was touched.

## Exact manual test

1. In the local Studio, open a test Newsletter with valid content. Choose Approved and confirm readiness passes. Open **Review / Distribution Handoff → Download distribution package**.
2. **Extract** the ZIP into a folder. Do not open the copy page from inside the ZIP preview. Confirm all four files are present.
3. Open **OPEN-TO-COPY.html** in Chrome or Edge. Confirm the address begins with `file://` and the complete publication is visible. You should not need Studio access or a sign-in.
4. Click **Copy for Gmail**. Note whether the message reports formatted copy, plain text, or blocked copying. If blocked or plain text, click **Select publication**, then press Ctrl+C (Command+C on Mac).
5. Manually open your Antioch Gmail, create a new message with plain text mode off, and paste into the body. **Do not send the test.** Confirm publication text, colors, spacing, tables, buttons and destination URLs. Check hosted images when online. Confirm the copy-page controls/instructions and hidden preheader are absent.
6. Repeat in the other browser. For the offline-core check, open the extracted page with the network disconnected, copy/select the publication, then reconnect before opening Gmail. Remote images may be unavailable offline; copying should not require an API or server.
7. Generate review packages for Draft and Ready for Review. Confirm their respective warnings appear on the page and remain in the pasted content. Confirm Approved has neither warning.
8. Repeat with a Program Letter. Confirm generating or copying a package does not change its status to Distributed.
9. If neither automatic nor manual rich copying works in your browser, follow the page instructions and ask the editor for a review copy or use the approved HTML-capable distribution platform. Do not change browser security settings or install extensions to force copying.

Only add actual recipients and send after institutional review/approval through the department's established distribution process.
