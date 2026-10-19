# KYC final6 Gate Review A

- recommendation: REJECT
- reviewMode: read-only source and supplied final6 artifact review

## originalIntent

对最终源码中的 KYC 原件预览与请求代次修复做交付前 Gate：确认真实 Blob 取件、401 刷新、对象 URL 生命周期、PDF/图片分支、下载、详情与原件过期响应防护、旧预览清理、显性状态和审批/预览键盘语义，并只使用 375/768/1280 的 21 张 `final6` 截图判断响应式视觉与 CJK 完整性。

## desiredOutcome

合规审核员切换用户或材料时只能看到当前请求对应的原件；任何旧请求的成功或失败都不能污染新请求的预览、错误或 loading 状态。三个断点的 populated/preview/pending/empty/loading/error/approval 状态均清晰、无页面级横向溢出或 CJK 截断，审批和预览可完整键盘操作。

## userOutcomeReview

21 张 final6 均为有效 PNG，尺寸严格分为 375×900、768×900、1280×900，且晚于当前 `App.tsx`；逐张可视检查未见页面级横向溢出或控件内 CJK 截断。源码确认了真实 Blob、Bearer、401 刷新重试、URL 替换/关闭/卸载撤销、图片/PDF 分支、下载、详情成功响应及 Blob 成功响应代次校验、旧预览在详情请求开始时清理、显性 loading/error/retry，以及 dialog 初始焦点/Tab 环/Escape/焦点恢复。不能批准的唯一原因是原件旧请求的失败与 finally 路径未做代次校验：它仍可覆盖当前错误并提前清除当前 loading。

## blockers

1. violatedCriterion: `KYC-ORIGINAL-STALE-RESPONSE-GUARD`
   - observation: `openKycDocument()` 只在 Blob 成功后检查 `requestVersion`。旧请求若在新详情/新原件请求开始后失败，旧请求的 `catch` 仍执行 `setError(...)`，其 `finally` 仍执行 `setLoading(false)`。可复现：A 原件请求保持 pending；切换到 B（或启动 B 原件请求，使 version 增加且 loading=true）；令 A 随后 reject；页面显示 A 的错误并在 B 尚未完成时取消 loading。该旧响应污染当前用户状态，未满足“原件请求过期响应防护”。
   - evidencePointer: `src/App.tsx:3880-3903`，尤其成功分支校验 `3887-3890` 与无条件 `catch/finally` 的 `3900-3903`。

## nonBlockingNotes

- 详情成功响应在写入 detail/form 前有代次校验（`src/App.tsx:3781-3790`）；旧详情失败不会在 `loadDetail` 内写 UI，但直接行点击调用仍可能产生未处理 rejection。这不是本轮已证明的旧内容覆盖，作为 NOTE。
- `requestBlob` 使用 Authorization Bearer，401 后刷新 session 并以新 token 重试；路径中的 user/document ID 均编码。
- `useEffect([kycPreview])` cleanup 会在替换、关闭和卸载时撤销已进入 state 的 object URL；过期成功 Blob 创建的 URL 会立即撤销。
- PDF iframe 设为 `tabIndex={-1}`，与用户给出的人工键盘验证一致；未把缺少实际 PDF 截图列为 blocker。合成文档仅为 fixture，不影响结论。
- `App.tsx` 是既有超大模块，属于 programming/remove-ai-slops 维护债务，但未违反本次明确成功标准，故不阻断。

## direct remove-ai-slops / programming pass

- 当前 diff 未增加测试，因此不存在 excessive、deletion-only、requested-removal、tautological、implementation-mirroring 或 prose-pinning 测试；也没有测试为该竞态提供自动回归保护。
- 新增代次 ref、预览 state 与直接分支均为任务所需，没有不必要 extraction、parser、normalizer、新依赖或装饰动画。
- 发现的无条件 stale `catch/finally` 会产生错误状态污染和 false loading，属于实际成功标准缺陷，而非架构偏好。
- 既有证据报告包含 slop/programming 视角；本报告直接复核 final6 与当前 diff，未以旧报告结论替代直接审查。

## checkedArtifactPaths

- `/Users/atomex/Desktop/surprising/surprising-admin-web/DESIGN.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/App.tsx`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/styles.css`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/client.ts`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/admin.ts`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/*gate-review.md`
- `/tmp/surprising-admin-kyc-{375,768,1280}-{populated-final6,preview-final6,pending-final6,empty-final6,loading-final6,error-final6,approval-final6}.png`（全部 21 张）

## exactEvidenceGaps

- 没有旧原件 reject × 新详情/新原件 pending 的自动化竞态轨迹；源码控制流已足以复现 blocker。
- 没有独立 code-review report、manual QA matrix 或 notepad path；用户提供了明确的人工键盘结果，直接源码与 21 张视觉证据覆盖其余判定。
- 没有实际 PDF 渲染截图；按用户要求不阻断，源码已覆盖 PDF 分支。
