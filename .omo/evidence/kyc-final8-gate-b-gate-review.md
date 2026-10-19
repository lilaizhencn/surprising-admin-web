# KYC Final8 Gate Review B

- recommendation: REJECT
- reviewMode: read-only final gate review

## originalIntent

以真实管理员操作视角验收当前工作区的 KYC 合规页：三断点和移动端可用性、材料元数据、页面内原件预览、下载/关闭、pending/empty/loading/error/approval、dialog 焦点循环与 ESC，以及过期详情/原件响应不能污染当前用户。

## desiredOutcome

管理员在 375/768/1280 下均能明确选择用户并完成 KYC 审核；移动端用户列表按 `DESIGN.md` 提供卡片与显式“打开详情”动作；原件、状态和审批交互清晰，迟到请求不会写入当前上下文。

## userOutcomeReview

原件与状态增量本身通过：21 张 final8 均有效、完整、新鲜，图片预览、元数据、下载/关闭、五种业务状态与审批均可见；源码中的详情/原件请求 success、catch、finally 都受同一请求代次保护，旧 Blob URL 会撤销；审批与预览均实现初始焦点、Tab/Shift+Tab 首尾循环、ESC 与焦点恢复。最终不能批准的唯一原因是明确的移动端表格契约未实现：375px 下仍渲染横向滚动 `<table>`，用户行只有整行隐式点击，没有卡片或显式打开详情动作。

## blockers

1. violatedCriterion: `DS-MOBILE-DATATABLE-ACTION` (`DESIGN.md` §4: “Mobile: table rows become cards with an explicit open detail action”)
   - observation: `DataTable` 在所有断点始终输出 `<table>/<tr>`；移动端 CSS 只限制 `.table-wrap` 宽度并保留 `overflow:auto`，没有卡片重排规则。合规用户行通过 `onRowClick` 隐式选择，未渲染可见“打开详情”按钮。真实 375px 管理员必须横向滚动并猜测整行可点，未满足明确移动端成功标准。
   - evidencePointer: `DESIGN.md:54`; `src/App.tsx:3934-3940`; `src/App.tsx:6934-6966`; `src/styles.css:458-482`; `src/styles.css:769-794`; `/tmp/surprising-admin-kyc-375-populated-final8.png`.

## checkedArtifactPaths

- `/Users/atomex/Desktop/surprising/surprising-admin-web/DESIGN.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/App.tsx`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/styles.css`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/*gate-review.md`
- `/tmp/surprising-admin-kyc-{375,768,1280}-{populated-final8,preview-final8,pending-final8,empty-final8,loading-final8,error-final8,approval-final8}.png` (all 21)
- current `git diff`, `git status --short`, `git diff --check`, `npm run lint`, `npm run build`

## reproducedEvidence

- All 21 final8 files are valid RGB PNGs at exactly 375x900, 768x900, or 1280x900 and postdate `App.tsx`/`styles.css`; every image was opened at original detail.
- Preview shows filename/type/size/status/SHA summary, inline image, download, and close at all three breakpoints.
- Pending, empty, loading, error+retry, and approval are visually distinct at all three breakpoints; no CJK clipping or page-level overflow was observed in the supplied frames.
- `src/App.tsx:3781-3802,3891-3919` guards stale success/failure/finally paths; stale created URLs are revoked.
- `src/App.tsx:483-513,3660-3690` implements initial focus, Tab/Shift+Tab cycle, Escape close, and focus restoration; PDF iframe is excluded from Tab order.
- `git diff --check`: PASS; `npm run lint`: PASS; `npm run build`: PASS (1,774 modules).

## directRemoveAiSlopsAndProgrammingPass

- No tests were added, so there are no excessive, deletion-only, requested-removal, tautological, implementation-mirroring, or prose-pinning tests.
- The request-version ref, MIME normalization, object-URL lifecycle, and direct DOM controls are necessary for named behavior; no speculative parser, helper extraction, dependency, debug code, decorative animation, or type escape hatch was added.
- `App.tsx` and `styles.css` exceed the programming/remove-ai-slops 250-pure-LOC guideline, but this is pre-existing maintenance debt and does not independently block a stated success criterion.
- Existing reports explicitly contain slop/programming perspectives; this review independently repeated both passes.

## exactEvidenceGaps

- No final8-specific manual QA matrix, executor evidence ledger, code-review report, or notepad path was supplied. Direct source/artifact review covers the named behaviors; absence is non-blocking.
- No browser event trace for Tab/Shift+Tab/ESC/download or adversarial stale-response sequencing. Source control flow supports those claims; this is an evidence-depth note.
- No real PDF viewer screenshot. Per user instruction this is non-blocking; source dispatches normalized `application/pdf` to a `tabIndex=-1` iframe.
- The 375 populated capture does not show the user-table region; source and CSS directly prove that the required mobile card/action transformation is absent.
