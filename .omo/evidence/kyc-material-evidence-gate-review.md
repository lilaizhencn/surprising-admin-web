# KYC Material Evidence Second Gate Review

- recommendation: REJECT
- reviewType: DESIGN-SYSTEM AND FUNCTIONAL INTEGRITY (read-only)
- reviewedState: commit `083f4ac` plus current uncommitted `src/App.tsx` and `src/styles.css`

## originalIntent

An administrator selects a compliance user, sees real KYC document metadata, activates a native control, fetches the authenticated original binary with 401 refresh support, and views the original in an in-app panel that cannot be popup-blocked. The page must remain responsive at 375/768/1280 and visibly cover loading, error, empty, pending, and approval states under `DESIGN.md`.

## desiredOutcome

The material evidence path is real React DOM backed by the selected user's detail response; binary retrieval is authenticated and refreshes once after 401; image/PDF originals render reliably in-app; keyboard users can operate and leave the preview predictably; all required states and breakpoints have fresh visible evidence.

## userOutcomeReview

The prior popup blocker is fixed: the current source creates an object URL and renders an `img` or `iframe` inline, with cleanup on replacement, close, and unmount. Metadata comes from `detail.kycDocuments`; the download route URL-encodes both identifiers; `requestBlob` applies Bearer auth and retries with the refreshed session after 401. Native buttons provide Enter/Space activation, and the supplied populated/preview captures show no page-level overflow or CJK clipping at 375, 768, or 1280. However, the preview is declared a dialog without dialog keyboard/focus behavior, PDF dispatch is brittle for valid parameterized media types, and the required state-by-breakpoint evidence matrix remains incomplete.

## blockers

1. **violatedCriterion:** `DS-A11Y-DIALOG-FOCUS`
   - **observation:** `[product] [major]` The inline preview uses `role="dialog"`, but opening it does not move focus into the dialog, focus is not kept inside it, Escape is not handled, and closing does not explicitly restore focus. This violates DESIGN.md's explicit requirement that focus remain inside dialogs.
   - **evidencePointer:** `DESIGN.md:69`; `src/App.tsx:3987-3996`.

2. **violatedCriterion:** `ORIGINAL-PREVIEW-RELIABILITY`
   - **observation:** `[product] [major]` PDF selection uses exact equality with `application/pdf`. A valid value such as `application/pdf; charset=binary` follows the image branch and produces a broken preview. The code also prefers metadata over the fetched Blob's actual type, so stale/mismatched metadata can select the wrong renderer.
   - **evidencePointer:** `src/App.tsx:3812-3815,3992-3996`.

3. **violatedCriterion:** `DS-STATE-MATRIX-375-768-1280`
   - **observation:** `[evidence] [major]` DESIGN.md explicitly requires visual QA of empty/loading/error/pending/approval states at 375/768/1280. Empty, loading, error, and approval were supplied only at 375; no pending-specific state matrix exists. Moreover, the loading and error screenshots do not visibly contain `正在同步数据，请稍候…` or `合规服务暂不可用`, so those two named artifacts do not independently prove their claimed states.
   - **evidencePointer:** `DESIGN.md:73`; `/tmp/surprising-admin-kyc-empty-375.png`; `/tmp/surprising-admin-kyc-loading-375.png`; `/tmp/surprising-admin-kyc-error-375.png`; `/tmp/surprising-admin-kyc-approval-375.png`; absent corresponding 768/1280 state captures.

## findings

- `[product] [major]` Dialog focus/keyboard contract failure. See blocker 1.
- `[product] [major]` Parameterized PDF media types and metadata/Blob mismatches can select the wrong renderer. See blocker 2.
- `[evidence] [major]` Required state/breakpoint matrix is incomplete and two state captures do not show the claimed messages. See blocker 3.
- `[product] [note]` The preview screenshot's one-pixel image is consistent with the reported 1x1 test Blob and proves an image element loaded, but it does not visually demonstrate a useful real-world KYC image or PDF. This is not independently blocking because the source and browser measurements prove the basic image path.

## whatIsGood

- Real DOM and selected-user data path: `detail.kycDocuments` renders metadata cards and native buttons in `src/App.tsx:3826-3829,3971-3982`.
- Authenticated binary path: URL-encoded route in `src/api/admin.ts:387-391`; Bearer header, 401 refresh, retry, and Blob response in `src/api/client.ts:82-102`.
- Popup immunity and lifecycle: stateful inline preview plus `URL.revokeObjectURL` cleanup in `src/App.tsx:3617-3622,3803-3818,3986-3997`.
- Responsive/CJK: all supplied captures are valid fresh PNGs; populated/preview frames at 375/768/1280 show no page-width overflow, clipped CJK glyphs, or hidden material action.
- Empty and approval UI are visibly demonstrated at 375; approval includes service, method, and request path.
- Reproduced `npm run lint` and `npm run build` both exit 0.

## remove-ai-slopsAndProgrammingDirectPass

- No tests were added, so there are no excessive, deletion-only, requested-removal, tautological, implementation-mirroring, or prose-string tests.
- The binary request helper is necessary at the response boundary and preserves typed `Promise<Blob>` behavior; it is not an unnecessary parser or normalization layer.
- No `any`, `@ts-ignore`, `@ts-expect-error`, speculative abstraction, dead helper, decorative animation, or new dependency appears in the reviewed diff.
- `App.tsx` is an oversized pre-existing module; adding local preview state increases maintenance burden slightly, but that is a NOTE and not a stated-criterion blocker.
- The global Page loading alert is a broad production change but directly supports the required visible loading state; it is not scope drift.
- The previous gate report explicitly covered slop/programming criteria, but no fresh independent code-review report was provided for this second gate. This direct pass supplies coverage; report absence is not itself a blocker.

## checkedArtifactPaths

- `/Users/atomex/Desktop/surprising/surprising-admin-web/DESIGN.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/App.tsx`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/admin.ts`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/client.ts`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/styles.css`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/kyc-material-evidence-gate-review.md` (prior gate, then replaced by this second-gate report)
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/compliance-visual-fidelity-gate-review.md`
- `/tmp/surprising-admin-kyc-375-populated.png`
- `/tmp/surprising-admin-kyc-375-preview.png`
- `/tmp/surprising-admin-kyc-768-preview.png`
- `/tmp/surprising-admin-kyc-1280-populated.png`
- `/tmp/surprising-admin-kyc-empty-375.png`
- `/tmp/surprising-admin-kyc-loading-375.png`
- `/tmp/surprising-admin-kyc-error-375.png`
- `/tmp/surprising-admin-kyc-approval-375.png`
- Git diff `083f4ac^` through current working tree.

## reproducedEvidence

- All eight requested images were opened directly at original detail and inspected.
- PNG signatures/dimensions: 375x900, 768x900, and 1280x1100 as named.
- Capture mtimes postdate the current `App.tsx` and `styles.css` mtimes.
- `npm run lint`: exit 0 (`tsc -b --pretty false`).
- `npm run build`: exit 0; Vite transformed 1774 modules and emitted the production bundle.
- TypeScript LSP was unavailable because installation was previously declined; the compiler-backed lint/build provide static validation instead.

## exactEvidenceGaps

- No fresh loading/error/empty/pending/approval captures at 768 and 1280, despite `DESIGN.md:73` requiring those states at all three breakpoints.
- The supplied 375 loading and error captures do not visibly show their claimed status/error messages.
- No keyboard-focus trace proving focus entry, containment, Escape close, or restoration for the element declared as a dialog.
- No parameterized-PDF or PDF screenshot/runtime artifact proving the PDF branch across valid content-type variations.
- No fresh code-review report, manual QA matrix artifact, executor evidence directory, or notepad path was supplied. Direct inspection covers code/slop completion; only the gaps tied above to explicit criteria block approval.
