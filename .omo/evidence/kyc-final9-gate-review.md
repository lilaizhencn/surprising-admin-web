# KYC Final9 Gate Review B

- recommendation: APPROVE
- blockers: []
- originalIntent: 以真实管理员视角只读验收当前 KYC 合规页，重点确认移动端用户列表不再依赖横向表格或隐式整行点击，且 375 populated 明确显示“打开详情”，同时保持原件预览、pending、empty、loading、error 和 approval 状态完整。
- desiredOutcome: 375px 下合规用户以卡片呈现并通过明确按钮打开详情；768/1280 保持适合各自视口的数据布局；三个断点的七个状态均清晰、可操作、无页面级横向溢出或 CJK 裁切。
- userOutcomeReview: APPROVE。21 张 final9 均逐张直接打开复核，全部为当前源码之后生成的有效 375/768/1280 × 900 PNG。375 populated 的用户记录为纵向卡片，九个字段完整展示，底部“打开详情”按钮清晰可见；移动卡片 article 本身无点击处理，移动断点隐藏桌面 table，因此管理员不必横向滚动或猜测整行可点。preview、pending、empty、loading、error、approval 在三个断点均保持清晰可见；未见页面级横向溢出、关键控件裁切或中文 glyph 异常。

## Key evidence

- `DESIGN.md` §4 要求移动端表格行变卡片并提供显式打开详情动作。`src/App.tsx` 的合规用户 `DataTable` 传入 `mobileAction`，标签为“打开详情”；通用 `DataTable` 生成非点击式 `article.mobile-data-card` 与独立 button。
- `src/styles.css` 在 `max-width: 520px` 显示 `.mobile-card-list` 并隐藏 `.mobile-table-fallback`；375 populated 截图直接显示卡片及完整按钮。
- 768/1280 populated 保持表格/详情布局；768 属于 tablet 合同，并未被错误强制成移动卡片。
- 三个 preview 截图均显示材料元数据、查看原件、内嵌原件、下载原件与关闭预览；三个 pending/empty/loading/error/approval 截图分别显示 PENDING 表单、0 件材料、同步提示、失败与重新加载、完整审批上下文与取消/继续。
- 当前源码保留预览 focus/ESC/Tab 循环、PDF iframe `tabIndex={-1}`、对象 URL cleanup、请求代次保护及显性 loading/error/retry 路径。
- `git diff --check` 本轮复现通过；用户声明 `npm run lint`、`npm run build` 与 diff check 已通过，本次只读 Gate 未重跑会写构建产物的命令。

## Direct remove-ai-slops and programming pass

- 当前 diff 未新增测试，因此不存在过量、删除专用、仅验证请求移除、同义反复、实现镜像或自然语言 pinning 测试。
- 移动端实现直接复用现有 `DataTable`，只增加可选 `mobileAction`、真实 DOM 卡片和断点 CSS；未引入依赖、解析器、归一化层、单用 helper、装饰动画、调试残留或新的类型逃逸。
- 同一数据同时渲染桌面 table 与移动 card 是响应式替代所需，CSS 保证同一断点只显示一个表面，不构成无效重复。
- `App.tsx`（7158 pure LOC）和 `styles.css`（715 pure LOC）仍是既有超大文件，属于维护 NOTE；它不违反本次明确成功标准，不能作为 blocker。
- 既有 `kyc-final8-gate-b-gate-review.md` 明确覆盖 slop/programming 并准确指出旧移动端 blocker；本报告对 final9 diff 独立重做相同检查，不依赖旧报告结论。

## Checked artifact paths

- `/Users/atomex/Desktop/surprising/surprising-admin-web/DESIGN.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/App.tsx`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/styles.css`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/kyc-final8-gate-b-gate-review.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/` 下其余既有 gate reports（均按不可信报告交叉核对）
- `/tmp/surprising-admin-kyc-{375,768,1280}-{populated-final9,preview-final9,pending-final9,empty-final9,loading-final9,error-final9,approval-final9}.png`（21/21）
- 当前 `git diff -- src/App.tsx src/styles.css`、`git status --short`、`git diff --check`

## Exact evidence gaps

- 未提供 final9 专用 executor evidence、code-review report、manual QA matrix 或 notepad path；21 张完整矩阵与本次直接源码/视觉/slop/programming 复核覆盖全部明确标准，因此不阻断。
- 静态截图不能复现 Tab/Shift+Tab/ESC、下载完成或异步竞态事件序列；当前源码保留此前已验收的对应机制，本次移动端增量未修改这些路径，因此属于证据深度 NOTE。
- 无精确像素参考图；`DESIGN.md` 是本轮视觉合同，因此不要求像素差异比较。
