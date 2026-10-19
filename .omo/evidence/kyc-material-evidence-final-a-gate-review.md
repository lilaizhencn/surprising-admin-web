# KYC Material Evidence Final Independent Visual QA Gate Reviewer A

- recommendation: REJECT
- reviewMode: read-only source, diff, screenshot, build, and evidence review

## originalIntent

复核当前未提交的后台 KYC 材料证据增量，确认真实 Blob 鉴权取件与 401 刷新、对象 URL 生命周期、PDF/图片预览与下载、切换用户/详情失败后的旧预览清理、375/768/1280 响应式壳层、empty/loading/error/pending/approval 状态，以及审批与预览 dialog 的焦点、Tab、Shift+Tab、Escape 行为。

## desiredOutcome

合规审核员在任何断点和状态下都能明确知道当前用户与请求状态，安全查看或下载正确用户的 KYC 原件；切换用户或请求失败后旧材料不会残留或重新出现；键盘焦点不会逃离 dialog，且所有视觉证据对应当前源码。

## userOutcomeReview

当前实现已具备真实 DOM 预览、Bearer Blob 请求、401 刷新后重试、Blob content-type 优先及参数归一化、PDF/图片分支、下载、对象 URL 在预览替换/关闭/卸载时撤销，以及两个 dialog 的初始焦点、Tab 环、Escape 和焦点恢复。供应截图显示 375 单列、768 双列/横向导航、1280 固定侧栏；empty/loading/error/pending/approval 均清晰，未见 CJK 截断或页面级横向溢出。不能批准的原因是旧 Blob 请求可在用户切换后晚返回并重新注入旧用户预览；此外除 pending 三张外，指定视觉证据均早于当前 App.tsx，不能证明当前最终源码。

## blockers

1. violatedCriterion: `KYC-OLD-PREVIEW-CLEANUP`
   - observation: `loadDetail()` 会立即 `setKycPreview(null)`，但 `openKycDocument()` 的在途请求没有 AbortController、请求代次或 user/document 身份校验。复现：用户 A 点击“查看原件”并延迟 Blob 响应；在响应前点击用户 B；B 的详情请求开始时预览被清空；随后 A 的 Blob 返回，`setKycPreview(...)` 会把 A 的原件重新显示在 B 的详情下。
   - evidencePointer: `src/App.tsx:3780-3786`; `src/App.tsx:3872-3894`; `src/App.tsx:4069-4086`.

2. violatedCriterion: `DS-VISUAL-QA-FRESHNESS-375-768-1280` (`DESIGN.md` §8 visual QA matrix, plus visual-qa freshness rule)
   - observation: 当前 `src/App.tsx` mtime 为 1785872949；populated/preview/empty/loading/error/approval 指定截图 mtime 均为 1785872688 或更早。只有 pending 三张（1785873001/3002）晚于当前源码。因此 16 张中的 13 张是最终源码修改前的证据，不能支撑当前轮 PASS。
   - evidencePointer: `src/App.tsx`; `/tmp/surprising-admin-kyc-375-populated-final5.png`; `/tmp/surprising-admin-kyc-{375,768,1280}-{empty-final2,loading-final3,error-final3,approval-final3}.png`; `/tmp/surprising-admin-kyc-{375,768}-preview-final5.png`; `/tmp/surprising-admin-kyc-1280-preview-final4.png`.

## nonBlockingNotes

- `requestBlob` 设置 Bearer，401 时调用 refresh 并用新 session 重试；URL 中 user/document ID 均编码。
- `useEffect` cleanup 可撤销已进入 state 的 URL；但 Blob 在组件卸载后才返回时仍可能创建无法进入 cleanup 的 URL。该风险与 blocker 1 同源，建议通过取消/代次检查一起解决。
- 非 PDF 类型统一走 `<img>`，不支持的 MIME 可能显示破图；brief 只明确 PDF/图片，故不单独阻断。
- `App.tsx` 约 7,108 pure LOC，属维护债务；这是既有超大模块且不违反本次明确验收条件，仅记录 NOTE。
- 当前未添加测试，因此没有 excessive、deletion-only、requested-removal、tautological、implementation-mirroring 或实现镜像测试；同时这意味着竞态与 URL 生命周期没有自动回归保护。
- 无多代理审查工具可用；本报告直接完成 visual/CJK、programming 与 remove-ai-slops 三个视角的独立复核。

## reproducedEvidence

- `npm run lint`: PASS (`tsc -b --pretty false`).
- `npm run build`: PASS；Vite 8.1.2，1,774 modules transformed.
- `git diff --check`: PASS.
- Blob/401：`src/api/client.ts:82-117` 直接确认。
- PDF/图片/下载：`src/App.tsx:3872-3905,4081-4085` 直接确认。
- URL cleanup：`src/App.tsx:3655-3657` 直接确认。
- 用户详情开始时清理：`src/App.tsx:3780-3782` 直接确认；并通过异步控制流复现晚返回竞态。
- dialog：审批 `src/App.tsx:484-513,536-563`；预览 `src/App.tsx:3659-3689,4069-4086`。iframe 为 `tabIndex={-1}`。
- 所有 16 张用户指定截图均直接打开；PNG 签名与 375x900、768x900、1280x900 尺寸正确。

## checkedArtifactPaths

- `/Users/atomex/Desktop/surprising/surprising-admin-web/DESIGN.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/App.tsx`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/styles.css`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/admin.ts`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/client.ts`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/compliance-cjk-precision-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/compliance-visual-fidelity-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/kyc-material-evidence-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/kyc-material-evidence-final-gate-review.md`
- 用户列出的全部 16 张 `/tmp/surprising-admin-kyc-*.png` 最终证据。

## exactEvidenceGaps

- 没有晚返回 Blob × 用户切换的浏览器竞态测试或运行轨迹。
- 没有晚返回 Blob × 组件卸载的 URL revoke 轨迹。
- 没有晚于当前 `App.tsx` 的 populated、preview、empty、loading、error、approval 完整三断点矩阵。
- 没有 PDF 实际渲染截图/运行轨迹；源码证明分支选择，但未证明浏览器内 PDF 展示结果。
- 没有独立 manual QA matrix、executor evidence 目录或 notepad path。用户提供的键盘验证结论与源码一致，但没有可审计交互 trace。
