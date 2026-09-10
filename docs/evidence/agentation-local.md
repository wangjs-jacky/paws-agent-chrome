# Agentation local evaluation evidence

## Delivery boundary

This is a local evaluation build, not a published release or a statement that Agentation's license permits a competing product. No production Paws messages, extension installation into the user's normal browser, GitHub push, or public distribution is part of this verification.

The integration uses the real public `AnnotationPopupCSS` and element-identification exports from Agentation. It does not embed the full Toolbar or fork upstream core. Extension-owned state and storage replace the full Toolbar workflow.

## Baseline

- Existing linked worktree: `paws-agent-chrome--npm-sdk`, branch `feat/session-link`.
- Before feature implementation: 55 tests passed; TypeScript check passed.
- Existing session-link changes are preserved; this feature is not the already-published v0.0.6 ZIP.

## Verification status

| Area | State |
|---|---|
| Core annotation/state tests | Final controller rerun on 30881cf: full 90-test suite passed |
| Runtime authorization | Covered by final unit suite; native MV3 not exercised |
| Real Agentation popup DOM tests | Focused RED/GREEN reported; actual popup used in Ego |
| Batch/session integration tests | Synthetic two-question batch, failure retention and repeat-click behavior verified in Ego |
| Ego synthetic browser acceptance | Main workflow and final-build native selection/storage/privacy/light-theme checks passed |
| Installed MV3 extension acceptance | Not performed |
| Authenticated production Paws session | Not performed |

Synthetic browser acceptance will use only generated article/conversation text and a local fixture service. Such results exercise the built UI and SDK fixture interaction but do not prove native MV3 sender identity, worker lifecycle, or the production service.

## Browser evidence contract

Browser operations use Ego only. Each meaningful verified round records its unique run ID, explicit expected URL, observed success assertions and a private PNG captured with `captureVerifiedBrowserStep`. A default shared Ego screenshot path is never evidence. Final screenshot delivery uses Happy's image tool.

## Verified synthetic browser rounds

Task space 107, exact target `516B00A0E9DFD80DA64C8A1112436232`, fixture `http://127.0.0.1:56201/`. All completed rounds below were reported to Happy with their fresh private screenshot and unique run ID.

| Run ID | Observed result |
|---|---|
| `66d474f6-4cdf-4552-89b1-b7f1c3826375` | Settings collapsed, target visible, host localStorage empty |
| `458985bd-f74c-4a7b-bb63-dfbd24004f86` | Real Agentation popup saved a Chinese question with the exact article quote; panel synchronized |
| `f75e3803-38ed-45c2-a654-36c67152d76e` | Preview contained quote/question but no hidden/input secret; cancelling produced zero sends |
| `b371437a-fcd9-47d6-b13f-d4e974d5ee73` | Confirm + synthetic directory approval produced exactly one SDK request; reply/session link appeared and sent draft cleared |
| `9266d2c1-4d3c-4829-ae30-965e33391162` | Long-question controls remained within the 320px toolbar; trusted edit/save worked; second element annotation saved |
| `bfaf40f2-e1dd-49e5-8a4a-5424c186cc35` | Reload restored two drafts; SPA route change isolated them; returning restored them; no host localStorage writes |
| `4d7e3d78-8a74-41d5-9b18-d7851b61cfe0` | Synthetic HTTP 503 retained both drafts, showed unknown-result warning, and did not auto-retry |
| `25298ca4-df5b-405c-aa82-a4d074f98438` | Explicit retry double-click produced one prompt containing both numbered questions; successful acknowledgement cleared both |
| `d51ed1a2-d83e-4843-ae08-6d9c6883a70d` | Native mouse drag selected a partial phrase; the real popup preserved exactly that quote and accepted Chinese question input |
| `e8579334-31e7-45ec-a89b-6e67b953c628` | Synthetic storage 507 kept the typed popup question; recovery saved it, and trusted Delete removed it from both views |
| `d4b738e7-ee91-43ce-8d4e-1cc619323c0c` | Final build: password click did not capture; light-theme popup and panel worked; host localStorage empty; final screenshot sent to Happy |
| `9cef7e6e-d7db-4d99-a0ea-3b96f96b12c6` | Fix build b40f4cb: defer save A, Cancel, type B, settle A preserves B; both edits save; trusted mode-off SPA buttons work after scrolling clear of fixed toolbar; returning restores drafts; host localStorage empty |
| `e59c2b16-68f8-47a4-9c2f-4faf84e0b7e3` | Final build 30881cf: generic-container cross-paragraph range rejected; native mouse drag preserves partial quote; CDP IME composition/commit preserves Chinese input; host localStorage empty |

First selection test prepared a DOM Range and dispatched its capture click, then used trusted pointer/text input for the real popup. The later native mouse-drag test selected `Payment failed wit` from the longer paragraph; popup quote inspection confirmed it was the partial selection, not an element-capture fallback. Popup autofocus clears the live document selection, so inspecting the preserved quote is the correct acceptance assertion.

## Defects found during browser acceptance

- Long question text initially forced Edit/Delete outside the toolbar clip. A failed trusted click and measured rectangles proved this; min-width/shrink rules were fixed and the actual controls were retested successfully.
- First screenshot capture failed because the local evidence helper changed to require explicit session/run/task/target context. No success frame was reported for that attempt. Subsequent captures used the new signature and were accepted by Happy.
- A raw iframe CSS locator initially failed; subsequent interactions compute the current iframe/control rectangles and use trusted pointer actions. No product change was made for the locator failure.
- An initial native-selection test incorrectly expected the document Selection to survive popup autofocus; the live range was empty but the popup held the exact partial quote. The corrected assertion was rerun and passed; this was a test expectation error, not a product fix.
- A fix-build round verified deferred-save preservation but ended before capture because its page-button center was beneath the fixed annotation toolbar. This round (`612e9ed4-cd67-4950-a5dd-2c69bd00a741`) was not reported as a successful visual step. Scrolling the page control clear of the overlay and repeating the complete case passed in the subsequent recorded round; no product fix was made for this test positioning error.

## Controller verification on feature commit efd5520

Fresh `pnpm test` passed all 81 tests in 15 files. `pnpm typecheck`, `pnpm build`, and `git diff --check` exited successfully. Local unpacked output is `dist/`; build reports content 733.9 kB, panel 503.5 kB and background 8.6 kB before minification.

Final screenshot delivered through Happy:
`/var/folders/45/t5wb73212hvf82tchdvfdfhw0000gn/T/paws-browser-step-v79r3p/screenshot.png`.

## Independent-review fixes and final validation

Task review identified three Important defects: stale acknowledgement results/errors could replace a new page's state; an older save could dismiss a newer popup; and cached-page restoration did not restart annotation resources. Commit `b40f4cb` fixes all three with source/generation ownership checks and idempotent content/panel lifecycle restoration. Tests cover acknowledgement and save success/failure, repeated persisted lifecycle events, draft polling and SDK restoration without replaying messages.

The controller freshly ran `pnpm test && pnpm typecheck && pnpm build && git diff --check` on the final code: 87 tests in 15 files passed, and every command exited 0. Output is `dist/` (content 735.0 kB, panel 504.6 kB, background 8.6 kB unminified).

Scoped fix review passed: all three findings addressed, no new Critical/Important defects. Whole-branch review found one additional capture-boundary defect: cross-paragraph selection inside a generic container used the broad ancestor. Commit `30881cf` requires matching local blocks, starts traversal at the selected node, limits examination to 2,000 nodes plus at most two one-step lookaheads, and bounds retained quote/neighbors. Focused RED/GREEN reproduced the leak and 4,001-step traversal, then passed eight capture tests. Final scoped review passed with no remaining findings.

Final controller verification on `30881cf`: `pnpm test && pnpm typecheck && pnpm build && git diff --check` exited 0; 90 tests in 15 files passed. Content 737.1 kB, panel 504.6 kB, background 8.6 kB unminified. Final browser run uses that rebuilt output. Cross-paragraph rejection used an explicitly constructed DOM Range and synthetic capture click; positive partial selection used native mouse drag. Chinese composition used CDP IME/commit events, not an OS input-method candidate window.

BFCache evidence is based on simulated persisted lifecycle events in DOM tests, not verified native browser cache eligibility. Installed MV3 and authenticated production behavior remain unverified; synthetic success does not close those gaps. No public release or user-browser installation has occurred.

Final fix-build screenshot delivered through Happy:
`/var/folders/45/t5wb73212hvf82tchdvfdfhw0000gn/T/paws-browser-step-Pr0J3w/screenshot.png`.

After the final verified screenshot/report, the dedicated cleanup invocation returned `done: true` for task space 107. The task-owned synthetic server was stopped; no user browser tab or installed extension was changed.

## Coverage boundaries

- Real browser: actual upstream popup, native partial-text drag, Chinese text entry, edit/delete/cancel, light/dark layout, storage recovery, batch preview and synthetic SDK acceptance/failure, passive page buttons, SPA isolation, delayed-save popup ownership.
- Pure/DOM tests: caps and truncation, ambiguous relocation, spoofed runtime sender denial, tab-owner isolation, acknowledgement revisions and stale results, repeated persisted lifecycle restoration.
- Not exercised: installed MV3 worker/sender identity, actual native BFCache eligibility, production account/session, simultaneous native multi-tab use, OS IME candidate-window/full composition matrix and arbitrary virtualized pages. Unsupported page/context types remain documented in README.
