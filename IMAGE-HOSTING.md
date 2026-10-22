# Hosted email images

Uploaded card images can now be hosted by the Studio, so they work in exported email HTML, not only in local draft previews. The manual **HTTPS image URL** field and local-only previews still work as before.

## How it works

1. In a card's **Image & accessibility** panel, choose **Or upload an image**. The image appears immediately as a local preview, exactly as before.
2. If you are signed in with an editor account and the file is a PNG, JPEG, or WebP under 2 MB, it uploads automatically. A progress bar shows while it uploads, then the Studio checks that the hosted URL loads. Only then does it place a permanent `https://…/email-images/…` URL in the card's **HTTPS image URL** field and drop the local copy.
3. If you are signed out, the image stays **Local preview only · not ready for email**. Choose **Host image for email** to sign in and continue. GIFs and failed uploads also stay local previews. Errors are shown in the card, and the local preview is never lost.
4. Alt text stays editable at all times. Readiness still blocks any image that has no hosted HTTPS URL and still requires alt text.

**Remove image** only clears the card. It never deletes the hosted file, because emails that were already sent may still use it. **Delete hosted file…** appears only for Studio-hosted URLs when you are signed in. It asks for confirmation first, warns that sent emails will show a broken image, and is refused by the server unless you uploaded the file or are an administrator.

## Storage and security

- Files are stored in the site's **Netlify Blobs** store `email-images`. You don't need storage keys or extra accounts, and the browser code holds no credentials.
- Public URLs are `https://<site>/email-images/YYYY/MM/<name>-<random id>.<ext>`. The server generates every filename, so it is unique and safe. Files are served with the correct image type, `nosniff`, and long-lived immutable caching.
- Uploads made from a Deploy Preview or `netlify dev` are stored under `preview/…`. Readiness shows a reminder for them, because those URLs depend on the preview staying available. Upload final images from the production Studio.
- `POST /api/email-images` requires a Netlify Identity session with the `editor` or `admin` role. The server checks the browser-supplied type against the file's actual signature (PNG/JPEG/WebP only), enforces the 2 MB limit, and rejects cross-origin requests. `DELETE` also requires the uploader's account or `admin`.
- A deleted file may stay in browser and CDN caches for a while.

## Required setup before production

1. **Deploy** this change. It turns on Netlify Identity for the project. Blobs needs no setup.
2. In the Netlify dashboard, open **Project configuration → Identity → Registration** and set it to **Invite only**. Signing up alone never grants upload rights, but invite-only keeps the account list tidy.
3. Open **Identity → Invite users** and invite each editor. They accept the emailed invitation in the Studio by choosing a password.
4. For each editor, open their entry in the Identity list and add the role `editor`. Give at least one trusted person `admin`, which can also delete other editors' files. Ask users to sign out and back in after a role change.
5. Test on a Deploy Preview first. Sign in, upload the image, confirm **Hosted by the Studio · ready for email**, run Readiness, and open the exported email on a phone. Then repeat the upload from production before distribution.

Without step 4, signed-in users see that the editor role is required, and their images stay local previews.

## Files

- `server/email-images.js` contains validation, safe keys, and the upload, delete, and serving handlers.
- `netlify/functions/email-images-api.mjs` (`/api/email-images`) and `netlify/functions/email-image-file.mjs` (`/email-images/*`) connect those handlers to Blobs and Identity.
- `image-hosting.js` is the browser upload client: progress, validation, URL check, and delete.
- `studio-identity.src.js` is bundled to `studio-identity.js` by `npm run build`, for editor sign-in.
- `tests/email-images.test.js` tests the voter-guide fixture `tests/fixtures/voter-guide-2026-11-03.png`.

When using `npm start` locally, sign-in is unavailable and images stay local previews. Use a deployed preview to sign in.
