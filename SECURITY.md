# Security

Paws Agent Chrome treats every host page as untrusted.

- Credentials are stored in `chrome.storage.local`, not page storage.
- The panel runs in an extension-origin iframe.
- Host pages never receive an approval control for privileged Agent requests.
- Directory creation requires an explicit action inside the extension panel.
- Remote directory browsing uses an encrypted machine RPC, resolves symlinks on
  the daemon, is confined to the machine user's canonical home directory, and
  returns directories only.
- Production host permissions are limited to the configured Paws service origin.

Do not publish credentials, QR payloads, session identifiers, or private server URLs in an issue. Report a vulnerability privately through GitHub Security Advisories for this repository.
