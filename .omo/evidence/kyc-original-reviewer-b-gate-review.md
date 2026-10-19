# KYC Original Review Gate Reviewer B

- recommendation: APPROVE
- blockers: []
- originalIntent: 以真实管理员视角验收合规风控页的 KYC 原件审核，覆盖 375/768/1280 三断点、材料元数据、当前页原件、下载/关闭、显性状态、审批弹窗键盘焦点、PDF iframe 的 Tab 隔离，以及跨用户和异步迟到响应的旧预览隔离。
- desiredOutcome: 管理员能在当前用户上下文中识别 KYC 状态和材料信息，在当前页查看、下载并关闭原件，以键盘完成或退出审批/预览，且任何迟到请求都不会把上一用户或上一材料的原件重新挂载到当前上下文。
- userOutcomeReview: PASS。全部 21 张 final6 截图在三个断点形成 populated、preview、pending、empty、loading、error、approval 完整矩阵；移动端主内容无页面级横向溢出，原件和动作保持可达。源码将预览绑定到当前请求代次，用户切换或后发请求会使旧 Blob 失效并立即 revoke；两个 dialog 均有初始焦点、Tab/Shift+Tab 首尾循环、Escape 关闭与焦点恢复，PDF iframe 明确退出 Tab 序列。

## Reproduced evidence

- 三断点与溢出：逐一以原始细节打开 `/tmp/surprising-admin-kyc-{375,768,1280}-{populated-final6,preview-final6,pending-final6,empty-final6,loading-final6,error-final6,approval-final6}.png`；用 `sips` 复核全部尺寸分别为 375x900、768x900、1280x900。375px 下表单、材料卡、预览动作及审批框均在视口内；导航自身为设计允许的横向滚动条，不造成页面级横向溢出。
- 材料元数据：材料卡显示 `passport.svg`、`PASSPORT`、`image/svg+xml`、`677 bytes`、`UPLOADED` 与 SHA-256 摘要，状态不只依赖颜色。
- 当前页原件：三个 preview 截图均显示原件嵌入“材料证据”面板；合成 QA 图仅证明布局与渲染，未作为真实性问题。
- 下载与关闭：三个 preview 截图均显示原生“下载原件”“关闭预览”按钮；`src/App.tsx:3907-3915` 使用当前 object URL 和原始文件名下载，`src/App.tsx:3656-3658` 在替换、关闭及卸载时 revoke。
- 显性状态：pending 显示 `PENDING`；empty 显示“当前用户尚未上传材料”；loading 显示“正在同步数据，请稍候…”；error 显示 `Failed to fetch` 与“重新加载”；approval 显示请求上下文、审批 ID、原因、取消和继续。
- 移动端：`src/styles.css:705-790` 在 900px 折叠侧栏并允许导航自身滚动，在 520px 将两列、指标、表单改为单列；375 截图与这些规则一致。
- 审批 dialog：`src/App.tsx:478-560` 提供 `role=dialog`、`aria-modal=true`、标题关联、初始聚焦审批 ID、Escape、首尾 Tab/Shift+Tab 循环及关闭后焦点恢复。
- 原件预览键盘：`src/App.tsx:3660-3690` 打开后聚焦关闭按钮并在下载/关闭间循环，Escape 关闭并恢复焦点；`src/App.tsx:4091-4092` 的 PDF iframe 使用 `tabIndex={-1}`，不进入 Tab 序列。
- 异步隔离：`src/App.tsx:3781-3790` 在用户详情请求发起前递增请求代次并清空预览；`src/App.tsx:3876-3904` 为原件请求捕获同一代次，任何后发用户/原件请求都会使旧响应失效，旧 Blob URL 会 revoke 而不会 set 到预览。

## Direct remove-ai-slops / programming pass

- 当前 diff 未新增测试，因此不存在过量测试、删除专用测试、仅验证请求移除、同义反复、实现镜像或自然语言 pinning 测试。
- 新增路径直接使用 React state/effect、Blob URL、原生按钮及 iframe `tabIndex`；没有新依赖、无用抽象、手写解析层、调试代码、装饰动画或类型逃逸。MIME 参数规范化位于 Blob 边界并直接决定 PDF 渲染分支，不是过度 normalization。
- 请求代次同时覆盖用户详情和原件请求，是满足迟到响应隔离的最小共享机制；无重复 guard 或投机层。
- `App.tsx` 为既有超大模块，新增逻辑继续落在该文件构成维护 NOTE，但不违反本次任何明确验收标准，不阻塞。
- 既有 gate 报告显式包含 remove-ai-slops/programming 检查；本次已对 current diff 独立复核，未把旧报告结论当作证明。

## Checked artifact paths

- `/Users/atomex/Desktop/surprising/surprising-admin-web/DESIGN.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/App.tsx`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/styles.css`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/kyc-material-evidence-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/kyc-material-evidence-final-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/kyc-material-evidence-final-a-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/compliance-cjk-precision-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/compliance-visual-fidelity-gate-review.md`
- 全部 21 张用户指定 final6 PNG。
- 当前 `src/App.tsx`、`src/styles.css` diff。

## Exact evidence gaps

- 未提供独立浏览器事件录屏或自动化 trace 来重复 active/Tab/Shift+Tab/Escape、下载完成和失败切换；用户报告已人工验证，当前 DOM/源码机制直接支持所述边界，因此这是证据深度 NOTE，不是验收失败。
- 未提供独立 manual-QA matrix、executor evidence、code-review report 或 notepad 路径；21 张 final6 截图本身覆盖 DESIGN.md 的完整状态/断点矩阵，且本报告完成直接源码与 slop/programming 复核，因此不阻塞。
- 本轮遵守只读审查，未重跑会改写构建产物的 build；用户提供 lint/build/diff-check 已通过，源码与截图审查未发现反证。
