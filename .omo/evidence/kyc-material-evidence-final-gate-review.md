# KYC Material Evidence Final Gate Review A

- recommendation: REJECT
- reviewMode: read-only product/source and supplied-artifact review

## originalIntent

Verify the current uncommitted “合规风控 / KYC 材料证据” increment from the administrator’s perspective: authenticated Blob retrieval, reliable PDF/image preview and download, correct object-URL lifecycle and stale-preview cleanup, responsive 375/768/1280 presentation, explicit empty/loading/error states, and semantically correct keyboard-accessible approval/preview dialogs.

## desiredOutcome

A compliance reviewer can inspect the selected user’s actual KYC original without popup dependence or stale-user confusion, download it, close it predictably with keyboard focus restored, distinguish operational states at every required breakpoint, and complete approval interaction without focus escaping.

## userOutcomeReview

The supplied fresh captures show a coherent responsive shell, readable CJK, a useful populated image preview, explicit empty/loading/error states, and a clear approval modal at 375/768/1280. The authenticated Blob route, content-type normalization, download action, and object-URL revocation on replacement/close/unmount are present, and the production build succeeds. The gate still fails because stale preview content survives while a replacement or user-detail request is pending and remains after a failed request; the PDF iframe breaks the stated dialog focus-containment contract; and the required pending-state visual matrix is absent.

## blockers

1. **violatedCriterion:** `KYC-OLD-PREVIEW-CLEANUP`
   - **kind:** product defect
   - **observation:** `openKycDocument` leaves the current preview mounted while fetching a different original and leaves it mounted if that fetch fails. `loadDetail` clears the preview only after the next user detail request succeeds. A reviewer can therefore see/download the previous document under a new loading/error context, contrary to the requested old-preview cleanup and DESIGN’s current-state principle.
   - **evidencePointer:** `src/App.tsx:3780-3783`; `src/App.tsx:3872-3894`; `src/App.tsx:4069-4085`.

2. **violatedCriterion:** `DS-A11Y-DIALOG-FOCUS` (`DESIGN.md:69`)
   - **kind:** product defect
   - **observation:** The preview is exposed as `role="dialog"` and includes a focusable PDF `iframe`. Parent-document keydown handling can cycle the two buttons, but once focus enters the iframe, Tab/Escape events occur in the iframe document and are not trapped by the parent listener. Focus is therefore not guaranteed to remain inside or leave the dialog predictably for the PDF branch.
   - **evidencePointer:** `DESIGN.md:67-69`; `src/App.tsx:3659-3689`; `src/App.tsx:4069-4084`.

3. **violatedCriterion:** `DS-STATE-MATRIX-375-768-1280` (`DESIGN.md:73`)
   - **kind:** evidence gap
   - **observation:** Fresh empty/loading/error/approval captures exist at all three breakpoints, but no pending-state capture or equivalent artifact was supplied. The explicit visual-QA matrix is incomplete.
   - **evidencePointer:** `DESIGN.md:71-73`; supplied `/tmp/surprising-admin-kyc-{375,768,1280}-{empty,loading,error,approval}-final*.png`; no pending artifact in the supplied list or evidence directory.

## nonBlockingNotes

- The renderer normalizes Blob/metadata content type by removing parameters and prefers `blob.type`, so parameterized PDF types now reach the PDF branch. However, every non-PDF type is treated as an image; an explicit unsupported-type state is not evidenced. This is a residual risk, not a blocker because the stated artifact set proves the image path and the brief does not name unsupported media.
- Static screenshots do not prove download completion, object-URL revocation calls, Escape behavior, Tab containment, or focus restoration. Source inspection proves most paths, but no browser interaction trace exists.
- `App.tsx` has 7,108 pure LOC and remains a large pre-existing module. This is maintenance burden under the programming rubric, but not a blocker tied to the stated KYC acceptance criteria.

## checkedArtifactPaths

- `/Users/atomex/Desktop/surprising/surprising-admin-web/DESIGN.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/App.tsx`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/styles.css`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/admin.ts`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/client.ts`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/kyc-material-evidence-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/compliance-cjk-precision-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/compliance-visual-fidelity-gate-review.md`
- All 16 screenshot paths explicitly supplied in the Gate A request.
- Current `git diff` for `src/App.tsx`, `src/styles.css`, and `DESIGN.md`.

## reproducedEvidence

- All 16 supplied captures were opened at original detail. Signatures are valid RGB PNG; dimensions match 375x900, 768x900, and 1280x900; every supplied final capture postdates current `App.tsx` and `styles.css`.
- `npm run build`: PASS; TypeScript build and Vite production build completed, 1,774 modules transformed.
- `git diff --check`: PASS.
- Responsive captures show no page-level horizontal overflow, clipped CJK, tofu, or hidden KYC action. Mobile evidence card/actions stack; tablet uses the collapsed horizontal navigation; desktop retains the fixed sidebar.
- Empty/loading/error notices and retry affordance are visibly distinct in their supplied matrices. Approval layout is readable and source provides `role="dialog"`, `aria-modal`, labelled title, initial focus, Escape close, button/input Tab cycling, and focus restoration.
- Blob retrieval uses Bearer authentication, one 401 refresh retry, URL-encoded user/document identifiers, and `response.blob()`.

## removeAiSlopsAndProgrammingDirectPass

- No tests were added, so there are no excessive, deletion-only, requested-removal, tautological, implementation-mirroring, or prose-pinning tests.
- No unnecessary extraction, parser, normalization layer, new dependency, debug logging, decorative animation, dead helper, or type escape hatch appears in the reviewed diff. Content-type normalization is necessary at the Blob boundary.
- The global loading/error alert is broader than KYC but directly serves the stated explicit-state criterion; it is not scope drift.
- The prior code-review artifacts explicitly include slop/programming coverage. Direct inspection independently reproduces that coverage; their prose was not trusted as proof.

## exactEvidenceGaps

- No pending-state screenshot at 375, 768, or 1280, despite `DESIGN.md:73` requiring pending coverage at all three.
- No browser keyboard trace for either dialog; source inspection identifies the PDF iframe focus-containment failure.
- No runtime trace proving old preview removal before replacement fetch/user switch and after replacement failure; source proves it is not currently cleared at those boundaries.
- No PDF screenshot/runtime artifact, although source proves normalized PDF dispatch.
- No separate manual QA matrix, executor evidence directory, or notepad path was supplied. These absences are non-blocking except for the pending-state criterion above.
