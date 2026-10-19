# Compliance CJK Precision Gate Review

- recommendation: REJECT
- originalIntent: Read-only visual-fidelity and CJK-precision review of the fresh `#compliance` captures and current source against `DESIGN.md`, covering 375/768/1280 geometry, overflow, document evidence/preview, and empty/loading/error/approval clarity.
- desiredOutcome: A compliance reviewer can distinguish every operational state at the point of work, inspect a visibly meaningful fetched original, and use the page without horizontal overflow or broken CJK wrapping at all supplied breakpoints.
- userOutcomeReview: Desktop, tablet, and mobile geometry is coherent and no page-level horizontal overflow is evidenced. CJK headings, labels, explanatory text, and approval copy are readable without clipping or tofu. The outcome nevertheless fails because the fetched 1x1 image renders as an almost invisible dot in a large blank preview and the fresh loading/error captures are visually indistinguishable from empty at their captured work position.

## blockers

1. violatedCriterion: `DS-STATE-CLARITY` (`DESIGN.md` §5 and §8: loading/error states must be covered and expressed as reusable operational states)
   - observation: The 375 loading and error captures show no visible loading or error message and are effectively identical to empty; pairwise image diff reports 100/100 similarity with only ~0.25% pixels differing, concentrated at scrollbar edges. The global notices are rendered only at the page top (`src/App.tsx:6803-6804`), outside the captured/current work region.
   - evidencePointer: `/tmp/surprising-admin-kyc-loading-375.png`; `/tmp/surprising-admin-kyc-error-375.png`; `/tmp/surprising-admin-kyc-empty-375.png`; `src/App.tsx:6793-6805`; `DESIGN.md` §5, §8.
   - concreteFix: Render contextual loading/error state inside or immediately above the affected material/detail panel (with retry guidance for error), or keep a sticky status region visible while the user is scrolled; then recapture the same scroll position.

2. violatedCriterion: `DOCUMENT-PREVIEW-AFFORDANCE` (requested document card/preview affordance and `DESIGN.md` compliance-review principle)
   - observation: In both preview captures, the fetched image with `naturalWidth=1` appears only as a nearly invisible central dot inside a large blank bordered area, so the settled preview does not communicate successful content rendering or an unusable source image. CSS only caps `max-width`/`max-height` and supplies no preview viewport, minimum rendering scale, checkerboard, dimensions, or invalid/tiny-image fallback.
   - evidencePointer: `/tmp/surprising-admin-kyc-375-preview.png`; `/tmp/surprising-admin-kyc-768-preview.png`; `src/App.tsx:3987-3999`; `src/styles.css:570-606`; supplied browser evidence `naturalWidth=1`.
   - concreteFix: Give image previews an explicit viewport and visible background, show intrinsic dimensions/status, and scale tiny images with pixelated/contained presentation or show a clear “image is 1×1 / cannot preview” fallback plus download/open-original action.

## notes

- `[product]` Approval at `/tmp/surprising-admin-kyc-approval-375.png` is visually clear: hierarchy, dimmed backdrop, wrapped CJK explanation, request context, fields, and primary/secondary actions are distinguishable. Source does not identify the form as a dialog or trap focus (`src/App.tsx:502-530`), contrary to `DESIGN.md` §7; this is an accessibility contract note outside the requested visual-only blocker set.
- `[product]` The 1280 populated composition has strong hierarchy and stable table/detail geometry. The 375 populated/filter stack is readable, and the 768 two-column composition does not overflow.
- `[product]` CJK text wraps cleanly across all captures; no glyph clipping, tofu, awkward single-glyph orphan, or baseline defect was observed.
- `[evidence]` No capture is corrupt, stale, wrongly sized, partially composited, or page-width-overflowing. The loading/error captures are valid screenshots of an insufficiently visible product state, not defective PNGs.

## checkedArtifactPaths

- `/Users/atomex/Desktop/surprising/surprising-admin-web/DESIGN.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/App.tsx`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/admin.ts`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/client.ts`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/styles.css`
- `/tmp/surprising-admin-kyc-375-populated.png`
- `/tmp/surprising-admin-kyc-375-preview.png`
- `/tmp/surprising-admin-kyc-768-preview.png`
- `/tmp/surprising-admin-kyc-1280-populated.png`
- `/tmp/surprising-admin-kyc-empty-375.png`
- `/tmp/surprising-admin-kyc-loading-375.png`
- `/tmp/surprising-admin-kyc-error-375.png`
- `/tmp/surprising-admin-kyc-approval-375.png`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/compliance-visual-fidelity-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/kyc-material-evidence-gate-review.md`

## direct remove-ai-slops / programming pass

- No tests were added, so there are no excessive, deletion-only, removal-verification, tautological, implementation-mirroring, or prose-pinning tests.
- The current diff adds direct preview state and scoped CSS; it does not add speculative parsing/normalization, decorative animation, a one-use helper extraction, or a new dependency.
- `App.tsx` remains an oversized pre-existing module and the preview is added locally. This is maintenance debt but not a blocker for the stated visual criteria.
- The preview `role="dialog"` is used for inline panel content without modal behavior, while the actual approval modal lacks dialog semantics/focus containment. This creates semantic inconsistency; it is a note unless accessibility is included in the acceptance gate.
- Existing review reports include their own slop/programming passes, but neither evaluates all fresh captures from this round. Direct inspection above supplies the required coverage.

## exactEvidenceGaps

- No manual QA matrix, executor evidence directory, code-review report dedicated to this fresh capture set, or notepad path was supplied.
- No pixel-reference packet exists; exact pixel fidelity cannot be measured and `DESIGN.md` is therefore the visual contract.
- No valid-content preview capture (for example a normal-resolution image or PDF) proves scale/readability beyond the supplied 1x1 image response.
- Static screenshots do not prove keyboard focus containment or retry interaction behavior.
