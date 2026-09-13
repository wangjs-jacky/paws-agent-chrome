# Current session link acceptance

Implemented on top of v0.0.6; this is local feature acceptance, not a published release.

## Behavior

- Fixed current-session row below the directory picker and above messages.
- Before creation: non-clickable placeholder. After creation/restoration: full
  session ID available in the tooltip and a new-tab Paws Web link.
- New conversation, machine change and directory change clear the old target.
- Late spawn completion cannot restore an abandoned session link.
- Session IDs are URL-encoded; only HTTP(S) destinations without basic-auth
  credentials are allowed, and query/hash data is not forwarded.
- New-tab anchor uses `noopener noreferrer`; Paws Web authentication is separate.

## Verification

- TDD: 9 expected missing-feature failures before implementation.
- Final suite: 55 tests passed, typecheck/build and diff checks passed.
- Independent code review passed after correcting small-text link contrast.
  Link contrast on default/hover surfaces is 15.36/11.48 in light mode and
  15.87/10.37 in dark mode.
- Ego verified placeholder, creation, page-refresh restoration, new-conversation
  reset and recreated link. Both themes fit the existing 390px panel width.
- A trusted mouse click opened the exact session route in a new tab, preserved
  the original host tab and left `window.opener` null. An untrusted DOM `.click()`
  did not open the tab; no product workaround was added for that test-only case.

Browser acceptance used the isolated local protocol fixture and a synthetic
`chrome.runtime`/storage shim. The destination explicitly identifies itself as a
session-navigation fixture; this is not a logged-in production Paws Web session
or a real installed-MV3 acceptance claim. No production credentials or sessions
were used. Screenshots were reported to Happy, and the test browser space and
fixture server were closed. No Playwright browser was launched.
