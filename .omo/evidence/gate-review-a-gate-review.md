# Gate Review A

- recommendation: APPROVE
- blockers: []
- originalIntent: 对最终源码及唯一指定的 21 张 final8 截图执行只读最终验收，确认三断点视觉、KYC 材料/预览/状态/审批完整，并核实 Blob、401、URL 生命周期、竞态与键盘可访问性。
- desiredOutcome: 375/768/1280 各 7 个状态均无页面级横向溢出或 CJK 裁切；材料元数据、内嵌预览、下载/关闭、状态矩阵及 approval dialog 完整；异步竞态不会让过期请求污染当前用户；PDF iframe 不进入 Tab 顺序。

## userOutcomeReview

APPROVE。21 张 final8 均逐张打开复核，全部为对应宽度 x 900。三断点下 populated、preview、pending、empty、loading、error、approval 均有明确且一致的可见状态；未见页面级横向溢出或 CJK 字符裁切。移动端/平板导航为源码明确设计的内部横向滚动容器，不构成页面溢出。

KYC 材料卡显示原始文件名、证件类型、content type、字节数、上传状态及 SHA-256 摘要；preview 显示 user-b.svg、内嵌图像以及下载/关闭按钮。empty 显示 0 件材料，loading 显示同步提示，error 显示失败与重新加载，pending 显示 PENDING 表单，approval dialog 显示 service/method/path/query/body hash、审批 ID、原因、取消和继续。

源码复核确认：`requestBlob` 对 401 刷新会话并重试，且只在 `response.ok` 后读取 Blob；预览 Blob URL 在替换、关闭及卸载时撤销，过期成功分支即时撤销刚创建的 URL；PDF/图片按规范化 content type 分支；打开预览和切换详情共享请求代次，成功、失败、finally 均校验代次；详情切换先清预览与错误并保持最新请求 loading；PDF iframe 为 `tabIndex={-1}`。用户提供的人工并发序列与源码状态机一致：A 的过期拒绝不会清 B 的 loading/error/preview，B resolve 后仅能提交 user-b.svg 且关闭 loading。

## checkedArtifactPaths

- `/Users/atomex/Desktop/surprising/surprising-admin-web/DESIGN.md`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/App.tsx`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/styles.css`
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/client.ts`（仅为复现 Blob/401 要求而读取）
- `/Users/atomex/Desktop/surprising/surprising-admin-web/src/api/admin.ts`（仅为追踪 KYC Blob 调用而读取）
- `/tmp/surprising-admin-kyc-{375,768,1280}-{populated-final8,preview-final8,pending-final8,empty-final8,loading-final8,error-final8,approval-final8}.png`（21/21）
- `/Users/atomex/Desktop/surprising/surprising-admin-web/.omo/evidence/` 下既有 gate reports（作为不可信报告交叉核对，未替代直接复核）

## exactEvidence

- 图片尺寸：`sips -g pixelWidth -g pixelHeight` 对 21 张逐一返回 375/768/1280 x 900。
- 视觉证据：21 张均通过图像查看器逐张检查；preview 三断点均显示 `user-b.svg`、`USER B DOCUMENT`、下载与关闭；approval 三断点完整显示审批上下文与操作。
- `src/App.tsx`: `ApprovalRequestDialog` 的 dialog 语义、初始焦点、Tab/Shift+Tab 陷阱、Escape 与焦点恢复；`CompliancePage` 的 `kycRequestVersionRef`、URL cleanup、`loadDetail`、`openKycDocument`、下载逻辑、PDF/image 分支及 iframe `tabIndex={-1}`。
- `src/styles.css`: KYC 元数据/预览的 `min-width: 0`、ellipsis 局部约束、iframe/img 自适应，以及 900/520 响应式规则；未发现造成 body/page 横向溢出的宽度声明。
- `src/api/client.ts`: `requestBlob` 在 401 时 refresh + retry，非 OK 转 `ApiError`，成功才 `response.blob()`。
- `git diff --check`: 通过。

## removeAiSlopsAndProgrammingDirectPass

- 未新增测试，因此没有删除型、仅验证移除、同义反复、实现镜像或过量测试造成的虚假信心。
- 生产 diff 未引入自定义解析器/归一化层、单用 pass-through helper、无效抽象、调试残留、宽泛空 catch 或类型逃逸；content type 规范化直接服务 PDF/image 边界。
- 请求代次与 URL cleanup 均为竞态和资源正确性所必需，不是过度防御；成功/失败/finally 的对称代次校验覆盖用户明确要求。
- `App.tsx` 约 7,134 pure LOC，属于既有超大模块维护债务；本次继续在其中增加局部实现是 NOTE，但没有违反本次任何明确验收标准，不能据此阻断。
- 既有 gate reports 显式包含 slop/programming 视角；本报告再次直接完成同一检查，不依赖报告结论。

## evidenceGaps

- 未提供独立 executor evidence、code-review report、manual QA matrix 文件或 notepad path；用户在请求中直接给出了人工并发及键盘验证结果。截图与本次直接源码复核覆盖全部明确成功标准，因此这些缺失不是 blocker。
- 本次按用户要求只读，未重新启动应用或重放人工并发脚本；不把该缺口升级为 blocker，因为用户明确声明该人工验证已完成，且当前源码逐分支支持该结果。
