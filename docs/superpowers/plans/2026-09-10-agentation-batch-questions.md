# Agentation Batch Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver a locally built Chrome extension with real Agentation-based page annotations, private extension drafts, and previewed batch questions sent via the existing Paws SDK.

**Architecture:** Reuse Agentation's publicly exported AnnotationPopupCSS and element-identification utilities, not its localStorage-backed full toolbar. The content script captures explicit user-selected context; extension-owned storage and runtime messaging coordinate drafts with the existing iframe panel. The panel retains credentials, target configuration, send confirmation, SDK connection and session link.

**Tech Stack:** TypeScript, esbuild, Vitest/happy-dom, Agentation 3.0.2, React 19, Chrome MV3, pinned Paws SDK beta.2.

**Spec:** docs/superpowers/specs/2026-09-10-agentation-batch-questions-design.md

## Global Constraints

- Local evaluation only. No push, release, npm publish, Chrome installation, production writes or contacting the author. Agentation licensing remains unresolved; preserve attribution and actual license.
- Preserve every pre-existing session-link change. Main checkout stays untouched. The existing linked worktree is `/Users/jacky/jacky-github/paws-agent-chrome--npm-sdk`, branch `feat/session-link`.
- Per page: 20 annotations; comment 2,000 characters; quote 6,000; nearby text total 2,000; complete batch prompt 40,000. Explicitly display truncation and reject oversized comments/batches.
- No host localStorage writes, automatic page-content transmission, credential access from page messages, remote code, screenshot capture, full-page scraping, file execution or model-selection claims.
- Browser automation is Ego only, never Playwright (including existing verify/smoke/e2e scripts). Every meaningful verified round requires the Happy screenshot reporting flow.
- TDD: add focused behavioral tests, observe RED, implement, observe GREEN. Safe baseline commands: `pnpm test`, `pnpm typecheck`, `pnpm build`.
- Baseline: 55 tests passed and typecheck passed before implementation.

## File map

- `src/annotations.ts`: validated serializable annotation model, page identity, caps, prompt and batch snapshots.
- `src/annotationStore.ts`: extension-storage draft repository, per-owner/page isolation, revisions and compare-and-remove after success.
- `src/annotationBridge.ts`: typed runtime protocol and minimal sender authorization; background coordinator if needed in `src/background.ts`.
- `src/annotationCapture.ts`: safe selection/element text capture and unambiguous best-effort relocation.
- `src/annotationOverlay.ts`: minimal React root using real Agentation popup, mode/markers and explicit capture handling; no full toolbar import.
- `src/annotationPanel.ts`: draft list, preview and batch UI helpers; keep additions to the existing large panel focused.
- `src/content.ts`, `src/panel.ts`, `src/styles.css`, `src/chrome.d.ts`: integrate lifecycle, gear settings, SDK send and source context.
- `package.json`, `pnpm-lock.yaml`, `scripts/build.mjs`, `static/manifest.json`, `tsconfig.json`: local bundle and required runtime typings only.
- `test/annotations.test.ts`, `test/annotationStore.test.ts`, `test/annotationCapture.test.ts`, `test/annotationOverlay.test.ts`, `test/annotationBridge.test.ts`, `test/panelConnection.test.ts`: core behavior and integration tests.
- `test/e2eFixtureServer.mjs`: synthetic fixture enhancements only, no browser runner.
- `docs/evidence/agentation-local.md`, `THIRD_PARTY_NOTICES.md`, README files: results, provenance and local-use instructions.

### Task 1: Implement the local annotation-to-session workflow

**Files:** All files in the map above, excluding the controller's browser evidence edits. Use additional small focused modules only when they remove concrete coupling, and report them.

**Interfaces:** Define and export `PageAnnotation` (id, revision, pageKey, title, url, quote, prefix, suffix, elementPath, comment, createdAt, truncated), `AnnotationBatch` (id, pageKey, annotations snapshot, prompt), and pure `composeAnnotationPrompt(message, annotations, includeFullUrl): string`. Store operations must expose `list(owner, pageKey)`, `upsert(owner, annotation)`, `remove(owner, pageKey, id)`, and `acknowledge(owner, batch)` (names may be encapsulated by a repository, but semantics stay exact). All stored data is validated on restore, and runtime errors are explicit.

- [x] Step 1: Add RED tests for prompt context, caps, sensitive URL omission, revision-safe acknowledgement and isolation. Example independent expectations:

```ts
expect(composeAnnotationPrompt('', [annotation], false)).toContain('为什么需要桥接？');
expect(composeAnnotationPrompt('', [annotation], false)).toContain('Native Messaging');
expect(composeAnnotationPrompt('', [annotation], false)).not.toContain('token=secret');
await store.upsert('tab-a', { ...annotation, revision: 2, comment: 'edited' });
await store.acknowledge('tab-a', batchWithRevision1);
expect((await store.list('tab-a', annotation.pageKey))[0].comment).toBe('edited');
expect(await store.list('tab-b', annotation.pageKey)).toEqual([]);
```

Run focused `pnpm exec vitest run test/annotations.test.ts test/annotationStore.test.ts`; record the expected missing-feature failures. Implement validation, storage serialization, immutable snapshots and compare-and-remove; rerun to GREEN. Persist draft failures as a visible unsaved state, not swallowed exceptions.

- [x] Step 2: Add RED tests for a legitimate runtime draft update and rejected spoofed/wrong-frame messages; tests must prove no credential response or send action exists at the page boundary. Implement minimal runtime messaging and extension-owned storage coordinator. Use actual runtime sender tab/frame identity; never trust page-supplied ownership. Capture a per-tab lifecycle nonce via extension session storage or equivalent so tab ID reuse after restart cannot leak stale drafts. Validate source URL/page identity at synchronization boundaries. Mutations serialize per draft collection.

```ts
expect(await handleMessage({ type: 'send', text: 'injected' }, pageSender)).toEqual({ ok: false, error: expect.any(String) });
// A fake browser runtime/storage boundary is permitted; assert persisted draft and denial effects.
```

- [x] Step 3: Add RED tests for selection capture rejecting inputs, passwords, contenteditable and hidden elements; ambiguous/missing text relocation returns no match. Capture only selected text plus a bounded visible neighbor context (not ancestor full textContent). Implement pageKey including SPA query/hash identity and best-effort relocation using validated quote/context, never coordinates alone.

```ts
document.body.innerHTML = '<p>Native Messaging</p><input type="password" value="secret">';
expect(captureElement(document.querySelector('input')!)).toBeNull();
document.body.innerHTML = '<p>same</p><p>same</p>';
expect(findAnnotationTarget(quoteOnlySame)).toBeNull();
```

- [x] Step 4: Install exact `agentation@3.0.2`, React and React DOM matching exact installed version, with type dependencies. Preserve SDK pin. Use the public AnnotationPopupCSS and identification exports; verify the shipped popup can be bundled without the whole toolbar's storage effects. Do not edit node_modules or fork upstream. Add real-popup DOM tests proving entered feedback reaches extension draft storage without host localStorage writes. Any unavoidable upstream styling constraints must be disclosed, not silently replaced with an imitation.

- [x] Step 5: Implement minimal original-page overlay: activation control, escape/cancel, text selection or element click, Agentation popup, marker/list editing and deletion, page lifecycle cleanup. Render isolated styles using Shadow DOM where compatible; if the upstream CSS is injected into document head, scope/extract only the required CSS into the overlay build without altering upstream behavior. Avoid click-through, z-index overlap with panel, and stale captures after navigation. Capture mode only intercepts deliberate user input. Add events/DOM tests for mode off, save, edit, cancel and teardown.

- [x] Step 6: Add failing panel tests for collapsed gear, visible target, annotation-only submit and preview cancel/confirm. Implement draft list/preview in `annotationPanel.ts`; settings are collapsed by default but error/connection/target remain visible. Keep current session link and new-conversation control accessible. Preview is extension-origin UI and shows exactly the outgoing prompt/target. Ordinary non-annotation sending remains compatible.

```ts
expect(document.querySelector('[aria-label="远端工作目录"]')?.closest('[hidden]')).not.toBeNull();
// Existing helpers may open settings before changing machine/directory.
expect(sentMessages).toHaveLength(0); // before explicit preview confirmation
click('确认发送');
await flush();
expect(sentMessages).toHaveLength(1);
expect(sentMessages[0].text).toContain('Native Messaging');
```

- [x] Step 7: Extend send-state RED tests for frozen previews, simultaneous new/edit drafts, failures, timeout ambiguity, duplicate clicks, navigation and target/session changes. Implement immutable batch submission through existing SDK, awaiting definitive acceptance before acknowledgement. No auto retry. If send completion is unknown, retain drafts and visibly warn to inspect the conversation before retry. History-fetch failure after accepted send is distinct from send failure and must not invite duplicate submission. A stale async completion must not clear new drafts or populate a new session. Directory approval must retain/validate the exact previewed batch and target.

- [x] Step 8: Add fixture controls/data for a synthetic article and conversation with unique and duplicate passages, a hidden secret, input field and SPA route change. Do not use production credentials/content. Build fixture support for the new extension runtime protocol while clearly labelling it simulated, not installed MV3.

- [x] Step 9: Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `git diff --check`; inspect bundle/storage/license output. Write THIRD_PARTY_NOTICES and README local evaluation instructions, preserving earlier session-link docs. Commit only explicit feature files (including earlier overlapping session-link edits only with clear commit description); never stage unrelated files or the controller's plan/evidence edits. No version bump or publication. Report red/green commands, changed files, constraints and test output.

### Task 2: Ego browser acceptance and final handoff

**Files:** `docs/evidence/agentation-local.md`, safe fixture refinements if a verified failure needs a regression fix.

**Interfaces:** Consume the built extension and Task 1 fixture. No live Paws message is needed for synthetic UI acceptance. Any actual production check requires separate authority.

- [x] Read browser-control, ego-ops and ego-browser skills/references; launch only Ego and isolate a numeric task space/tab.
- [x] Validate fixture state for initial gear, explicit text and element annotation, real popup, edit/delete, refresh restore, two page identities, safe URL preview, one confirmed batch and response/session link.
- [x] Verify spoofed page messages cannot trigger sends; failed/unknown submission retains drafts; original page interaction works outside annotation mode; dark/light fit and keyboard/IME behavior.
- [x] Capture each meaningful verified round with captureVerifiedBrowserStep and send the private screenshot path to Happy report_browser_step once per round. Show final screenshot via Happy send_image. Record exact run IDs, URLs and whether the runtime is synthetic or actually installed MV3.
- [x] Request a final independent code review, fix confirmed Important findings with focused regression tests, rerun unit/type/build checks. Leave the local feature available without push/release and report any unverified MV3 or production behavior explicitly.

## Execution note

Task 1 and Task 2 are complete for local evaluation. Three task-review findings and one whole-branch capture-boundary finding were fixed and passed scoped re-review. Final controller checks passed 90 tests, typecheck, build and diff-check at 30881cf. Synthetic browser workflows and final-build screenshots are recorded in `docs/evidence/agentation-local.md`. Keyboard coverage includes Escape, Chinese text entry and CDP IME composition/commit, not OS candidate-window testing. Runtime spoof denial is covered by unit tests, not an installed-MV3 browser run. Actual installation, native BFCache eligibility, production sends and publication remain outside this local-evaluation scope. The local branch/worktree is preserved; no merge or push was performed.

## Plan self-review

Task 1 owns production code and pure/DOM tests; Task 2 owns real browser verification and evidence. Both share fixture output only after Task 1 reports completion. Data caps, storage privacy, target binding, batch acknowledgement, upstream reuse and license limits are covered in Task 1; actual DOM behavior and reporting are Task 2. No server idempotency, full Toolbar integration or cloud configuration is assumed.
