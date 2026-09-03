# Paws Agent Chrome

[中文说明](README_CN.md)

A Manifest V3 extension that adds a small Paws Agent conversation bubble to Chromium pages. It connects the browser to an existing Paws account, starts a remote Agent session on a selected machine, optionally attaches current-page context, and keeps privileged approvals inside the trusted Paws client.

## Why this repository exists

The extension originally lived at `packages/paws-agent-chrome` in [`wangjs-jacky/happy`](https://github.com/wangjs-jacky/happy). It was extracted from commit [`42a6773e`](https://github.com/wangjs-jacky/happy/commit/42a6773e38e3ea919ec75cc9286d447b14de2e79) so the browser surface can evolve, test, and release independently.

The browser subset of the Paws Agent SDK is temporarily pinned under [`vendor/sdk`](vendor/sdk/UPSTREAM.md) because `@wangjs-jacky/paws-agent` is not yet published to npm. This is a minimal source dependency, not a second product surface. Once npm bootstrap is complete, the repository is designed to switch to the registry package without changing extension code.

## Build

Requirements: Node.js 20.19+ and pnpm 10.11.

```bash
pnpm install
pnpm verify
```

The unpacked extension is written to `dist/`.

## Load in Chromium or Ego Lite

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this repository's `dist/` directory.
4. Open a normal HTTP or HTTPS page. The paw button appears at the bottom-right.
5. Open the bubble, link the browser by QR code, choose an online machine and directory, then send a message.

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

`PAWS-CHROME-BUBBLE-01` exercises the built extension UI against a temporary local protocol server. It covers QR linking, encrypted credentials, machine selection, directory approval, page context, session creation, remote replies, reset, reconnect after reload, and the trusted-client-only approval boundary.

`PAWS-CHROME-HTTPS-01` loads the real Manifest V3 extension inside an HTTPS host page. It protects the trusted `https://47.115.228.20:8443` default, host permission, account-link request, and QR rendering against mixed-content regressions.

`pnpm test:production:https` is a release-time live check for the trusted TLS certificate, health route, account-link route, and `/v1/updates` Engine.IO handshake. It upserts one fixed unauthenticated sentinel link record instead of creating unbounded probe rows, and is intentionally not part of CI.

`PAWS-EGO-LITE-HOST-01` launches Ego Lite with a disposable profile and the unpacked extension. It verifies a real `chrome-extension://` iframe, real `chrome.storage`, the encrypted SDK flow, and reconnect after a full browser restart. It never modifies the regular Ego Lite profile or connects to production.

Historical acceptance evidence is retained in [`docs/evidence`](docs/evidence).

## Security boundary

The host page is untrusted. High-privilege Agent requests are visible but cannot be approved in the embedded bubble; approval or rejection stays in the first-party Paws client. See [SECURITY.md](SECURITY.md).

## License

MIT
