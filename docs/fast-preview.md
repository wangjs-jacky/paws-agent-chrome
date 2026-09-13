# Fast preview / 快速预发布

Approved default: local iteration and daily delivery use fast previews; stable releases retain the existing main/tag/full-verification workflow. One minute is a target with installed dependencies and working authentication/network, not a hard deadline. Setup, failures and GitHub queuing are excluded; never skip a failed check to meet the target.

## One command after selecting the scope

On a feature branch, stage only approved files (`git add path/to/file`). No blanket auto-add: untracked, unstaged and conflicted changes block publication. Then:

```bash
pnpm preview:publish --message "feat: describe the approved change"
```

Typecheck → related unit tests (full unit fallback for infrastructure changes or no changed paths) → build once → package/checksum → commit staged files if any → atomic branch/unique preview tag push → upload GitHub prerelease → return download and CI links. No PR merge, local browser run, CI polling, automatic retry, force push or stable release promotion. Existing commits on the branch are also pushed: review the branch scope before invoking.

Full Node 20/24 tests and Chromium/MV3 checks run asynchronously on `preview-*` tag pushes. The preview remains unverified by full CI until that run succeeds; a failure does not silently turn green or auto-delete the download. Read its linked Actions result. Stable `v*.*.*` releases still run full checks and require main ancestry; previews are never promoted automatically. Stable artifact reuse is intentionally not implemented: locally built preview assets are not trusted CI artifacts.

Local-only rehearsal (no commit/push/tag/upload):

```bash
pnpm preview:publish --check
```

For immediate local iteration use `pnpm build` then reload the unpacked `dist/` extension. `pnpm verify:fast` still runs all unit tests plus typecheck/build without browsers. Preview ZIPs use the existing numeric manifest version; timestamp/SHA in the GitHub tag distinguish builds. Install unpacked; this is not a Chrome Store auto-update channel.

Failures stop the command immediately. Commits, tags, temporary packages or a partially uploaded release may remain; inspect the printed tag and GitHub before retrying. Nothing is overwritten, rolled back or cleaned up destructively. Final delivery should only contain version, download, verification scope and any failure; do not wait for background CI before handing over a clearly labeled preview.
