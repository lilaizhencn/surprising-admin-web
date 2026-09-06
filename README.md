# Surprising Admin Web

React / TypeScript 管理后台。开发运行 `npm run dev`；提交前执行 `npm run lint` 和 `npm run build`。

## 交易维护

侧栏「交易维护」按当前产品线连接真实后端
`/api/v1/admin/trading/orders/maintenance?productLine=...`，沿用现有登录、权限、审批和审计。

1. 选择产品线，从下拉框选择真实币对（包含暂停等状态，自动读取全部分页），再选择用户范围和操作方式，填写原因并预览 Core 当前订单/持仓。
   下拉框支持输入关键词实时模糊过滤（忽略大小写），点击或方向键/回车选择；不接受未选中的自由文本。
   切换产品线会清除旧币对；列表加载失败可重试，草稿中的币对须在当前列表中才能提交。
2. 可选撤单、市价 IOC 平仓、指定价格的限价 IOC 平仓、固定价格整币对清退。现货只能撤单；
   期权固定清退填写标的结算价格。所有价格为整数 ticks，ID 和数量保留字符串精度。
3. 输入准确币对二次确认，再通过现有审批流程。请求草稿及 UUID 按管理员保存到 localStorage，
   离开页面办理审批后返回仍保持相同审批参数；修改内容会更新请求身份并要求重新预览。
4. 查看任务步骤、实际错误、命令记录和当前残留。列表每 5 秒刷新；预览有分页边界，不能把当前页条数当作总量。
5. 流动性不足时剩余仓位不会消失，可补充对手盘后审批重试，或明确解除维护。
   未知命令结果必须先核对；固定清退已开始后不能改价或恢复交易。保险不足需补足后重试。

维护限制覆盖整个币对，即使只处理一个用户。撤单/撮合平仓完成仍保留限制，必须另行恢复交易。
固定清退完成后 Core 永久停止该币对交易；产品展示下架仍使用原有市场配置。
订单处理范围是普通单和触发单，算法任务不在此页面删除，子单受 Core 门控约束。

部署前需先应用后端 `migrations/20260906_trading_maintenance.sql` 并部署匹配的 Core/Provider。
本次 Core 快照格式变化，已有数据迁移边界见后端根 README。

验证包括 TypeScript 检查、生产构建，以及真实浏览器上的预览、确认、审批请求头、草稿恢复、长整数显示、
现货/期权选项和窄屏交互。浏览器测试使用接口契约桩，实际财务行为由后端真实 PostgreSQL + Core 集成测试验证，
不能将两者合称为已通过生产网络全栈验收。

## English

Trading maintenance supports cancellation, market/limit IOC reduce-only closing and fixed-price whole-instrument clearance.
The page uses real admin APIs and existing approvals. Task drafts retain their request identity across approval navigation.
Inspect Core residuals before considering a task complete; unfilled positions remain visible. Release is explicit, and
started fixed-price clearance is irreversible. Apply the backend SQL migration and matching Core/provider release first.
Run `npm run lint` and `npm run build` to validate this application.
