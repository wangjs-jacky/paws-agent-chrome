# Paws Agent Chrome

## v0.0.8

Markdown rendering with Streamdown, grouped execution details and skill names, preserved history scroll, Mermaid PNG previews with a dedicated image viewer, and encrypted image input via file selection, paste and drop.

Codex launches now obtain a fresh session grant. The pinned beta.2 SDK uses a checked-in pnpm patch for grants and image messages; these changes have not yet been migrated to the upstream Happy SDK source. The extension adds permission for its specific OSS attachment host. Replies remain complete-message updates, not token streaming. Unsent image drafts do not survive page refresh.


Version 0.0.7 adds Agentation page annotations, previewed batch questions,
collapsed settings and current-session navigation. Agentation 3.0.2 uses
PolyForm Shield; see [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES). The project's MIT
license does not replace dependency licenses.

The maintainer confirmed authorization to publish this integration on 2026-09-13.
This does not grant downstream users an exception to the dependency license.

To build and try the synthetic fixture without installing into your usual browser:

For fast local iteration, run `pnpm verify:fast` (typecheck, unit tests with two
workers, and build). It runs neither Playwright nor Ego. Existing `pnpm verify`
and GitHub CI/Release browser checks are unchanged; fast verification is not
browser acceptance.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
node scripts/startAnnotationFixture.mjs
```

Open the printed local URL in Ego. The fixture supplies a fake linked account,
simulated extension runtime/storage, and encrypted synthetic SDK replies. It is
not an installed MV3 test and never uses production credentials. It includes
article/conversation passages, duplicate text, hidden/input secrets, SPA route
controls, and send/storage-failure controls.

Use **开启批注** at bottom-left, select visible text within a paragraph (including
inline formatting) or click an element, then save a question in the real
Agentation popup. Use the list/markers to edit, delete or locate it; Esc exits
capture. Open the paw bubble to preview; only **确认发送** submits the frozen prompt
to its displayed target. New/edited drafts survive earlier acknowledgement.
Unknown send results retain drafts and require inspecting the conversation
before a manual retry. A history failure after acceptance reports that the
message was already sent. Settings start collapsed; target, status, new-session
control and current-session link stay visible.

Drafts use extension storage and a tab-lifecycle namespace plus full URL identity.
Refresh restores within that tab; browser-restart recovery is not guaranteed.
Closing a tab abandons its namespace. The panel offers **清空当前页面批注**.
Query/hash are omitted from batch prompts unless the full-link checkbox is
enabled. Limits: 20 questions/page, 2,000 characters/question, 6,000 quoted
characters, 2,000 neighbor characters, 40,000 prompt characters. Truncation is
marked; excessive questions/prompts are blocked.

The adapter bundles public `AnnotationPopupCSS` and `getElementPath`, not the
storage-backed toolbar. Only its exact popup stylesheet is extracted into Shadow
DOM; component logic and node_modules are unchanged. The public import also
installs upstream timer wrappers in its JavaScript world. MV3 content-script
isolation separates those from page JavaScript; the synthetic fixture shares its
page world. Freeze mode is never enabled. The visible overlay is not secret from
the host website. Cross-block selections, browser internal/PDF pages, cross-origin
frames, arbitrary Shadow DOM and virtualized missing text are outside this first
version. Relocation validates visible quote/context with a bounded fallback; it
may report a changed location instead of guessing. Browser verification coverage
is recorded separately in `docs/evidence/agentation-local.md`.

Version 0.0.6 replaces the temporary vendored SDK with the published npm package
`@wangjs-jacky/paws-agent`, pinned to `0.1.0-beta.2`. The startup snapshot and
point-session lookup fixes are now maintained upstream in the SDK.

Version 0.0.5 fixes switching conversations while sending. Each send captures its
target and text; late completions cannot overwrite a new conversation or its
draft. Messages already submitted can still complete in the original session.
Session reads and realtime updates now fetch only the affected session through
`GET /v2/sessions/:sessionId`, eliminating full-list downloads on the send path.

Version 0.0.4 fixes stalled startup: the panel reuses the SDK's initial snapshot,
shows connection/synchronization/history progress, and offers a retry after a
45-second deadline. Failed attempts are disposed without discarding the account
binding or target preferences. The recovery screen also provides access to
account linking and server settings.

[中文说明](README_CN.md)

A Manifest V3 extension that adds a small Paws Agent conversation bubble to Chromium pages. It connects the browser to an existing Paws account, starts a remote Agent session on a selected machine, optionally attaches current-page context, and keeps privileged approvals inside the trusted Paws client.

## Why this repository exists

The extension originally lived at `packages/paws-agent-chrome` in [`wangjs-jacky/happy`](https://github.com/wangjs-jacky/happy). It was extracted from commit [`42a6773e`](https://github.com/wangjs-jacky/happy/commit/42a6773e38e3ea919ec75cc9286d447b14de2e79) so the browser surface can evolve, test, and release independently.

The extension uses the published [`@wangjs-jacky/paws-agent`](https://www.npmjs.com/package/@wangjs-jacky/paws-agent/v/0.1.0-beta.2) SDK, pinned to `0.1.0-beta.2` in `package.json` and integrity-locked in `pnpm-lock.yaml`. There is no vendored SDK copy. The SDK is built and published through GitHub Actions in the upstream repository; the browser bundle includes its browser entry point, so installation of the extension does not require npm.

## Build

Requirements: Node.js 20.19+ and pnpm 10.11.

```bash
pnpm install
pnpm verify
```

The unpacked extension is written to `dist/`.

### Development mode

Run `pnpm dev` once, then load this repository's `dist/` in `chrome://extensions`.
It watches `src/`, `static/`, and `scripts/`, rebuilds after each save, and reloads
both the extension and open ordinary pages. Keep a page open after loading the
development `dist/` to receive subsequent save-triggered reloads. The development build adds permission
for its local reload service, so it must never be packaged or released. After
stopping it, run `pnpm build` and reload the extension from the extensions page to
restore the production permission set.

```bash
pnpm dev
# Optional, if the default local port is occupied
PAWS_EXTENSION_DEV_PORT=37652 pnpm dev
```

The current-session row below the target picker shows the session ID (hover for
the full ID) and **Open in Paws**. It opens the configured Paws Web session in a
new tab without replacing the host page. New conversations show a placeholder
until creation succeeds; changing the machine or directory clears the old link.
Paws Web must be signed in separately; the extension does not transfer credentials.

## Install a release

1. Download `paws-agent-chrome-vX.Y.Z.zip` and its matching `.sha256` file
   from [GitHub Releases](https://github.com/wangjs-jacky/paws-agent-chrome/releases).
2. Put both files in the same directory and verify the download:

   ```bash
   shasum -a 256 -c paws-agent-chrome-vX.Y.Z.sha256
   ```

3. Extract the ZIP into a permanent directory. The extension files are at the
   ZIP root; Chrome cannot load the ZIP directly.
4. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
   and select that extracted directory.

For an upgrade, replace the files inside the existing extracted directory so
its path stays unchanged, then click **Reload** on the extension card in
`chrome://extensions`. Keeping the same path preserves the unpacked extension
identity and its linked-account storage.

## Load in Chromium or Ego Lite

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this repository's `dist/` directory.
4. Open a normal HTTP or HTTPS page. The paw button appears at the bottom-right.
5. Open the bubble, link the browser by QR code, choose an online machine, then type, reuse, or remotely browse for a working directory before sending a message.

The target picker lists all bound machines with online state, uses
`displayName` or `host` as the device name, syncs recent directories from Paws
session history, and remembers the last directory separately for each machine.
Machine availability and newly used directories update in realtime. Changing a
machine or directory always starts a clean conversation target, so a saved
session can never be resumed against a different machine/path pair.

## Test

```bash
pnpm typecheck
pnpm test
pnpm test:smoke
pnpm test:production:https
pnpm test:e2e
pnpm test:e2e:record
pnpm test:e2e:mv3
pnpm test:e2e:mv3:record
pnpm test:e2e:ego
pnpm test:e2e:ego:record
```

`PAWS-CHROME-BUBBLE-01` exercises the built extension UI against a temporary local protocol server. It covers QR linking, encrypted credentials, display-name/host fallback, realtime online/offline changes, initial and realtime recent-session directories, home-scoped remote directory browsing, per-machine persistence, directory approval, page context, session creation, remote replies, target-safe reset/reconnect, and the trusted-client-only approval boundary.

`PAWS-CHROME-HTTPS-01` loads the real Manifest V3 extension inside an HTTPS host page. It protects the trusted `https://47.115.228.20:8443` default, host permission, account-link request, and QR rendering against mixed-content regressions.

`pnpm test:production:https` is a release-time live check for the trusted TLS certificate, health route, account-link route, and `/v1/updates` Engine.IO handshake. It upserts one fixed unauthenticated sentinel link record instead of creating unbounded probe rows, and is intentionally not part of CI.

`PAWS-EGO-LITE-HOST-01` launches Ego Lite with a disposable profile and the unpacked extension. It verifies a real `chrome-extension://` iframe, real `chrome.storage`, the encrypted SDK flow, and reconnect after a full browser restart. It never modifies the regular Ego Lite profile or connects to production.

Historical acceptance evidence is retained in [`docs/evidence`](docs/evidence).

## Release automation

Maintainers bump `package.json` through a pull request. After it is merged, a
tag matching that version (for example `v0.0.3`) triggers the Release workflow.
The workflow reruns unit, browser, real-MV3 HTTPS, and live-production checks,
rebuilds the production extension, validates the version and exact permission
allowlist, creates the root-level ZIP and SHA256 file, then creates or safely
updates the matching GitHub Release. Build and test steps have read-only
repository access; write access exists only in the final publish job.

The same packaging contract can be checked locally:

```bash
pnpm run package:release -- --tag v0.0.3
cd release-artifacts
shasum -a 256 -c paws-agent-chrome-v0.0.3.sha256
```

## Security boundary

The host page is untrusted. High-privilege Agent requests are visible but cannot be approved in the embedded bubble; approval or rejection stays in the first-party Paws client. See [SECURITY.md](SECURITY.md).

## License

MIT
