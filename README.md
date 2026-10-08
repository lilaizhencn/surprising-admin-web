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

## 合约编辑与热上线

合约页面集中配置交易规则、费率、资金费、风险档位、行情来源和做市设置，保存前显示变更并要求原因。已有合约的价格单位、数量单位及结算资产不可变更；保存携带期望版本，冲突时要求重新读取。草稿、上线展示、开启交易与暂停交易分别对应后台状态，页面跟踪 Core 应用版本。

做市参数使用结构化表单，数值保留整数文本以避免大整数精度丢失；公共设置按产品线保存，修改影响该产品线的所有策略。策略账户和合约绑定创建后固定，停用后后端撤销所属挂单。风险扫描页展示基础预算及动态增长含义，不要求操作员维护 JSON。

2026-10-05 验证：TypeScript 检查及生产构建通过；使用线上 BTC 合约的只读回放，在本机浏览器检查不可变字段、超界参数拦截、保存版本、桌面与 390px 手机布局。所有测试写请求均本地拦截，没有对线上执行表单写入。本次验证不代替线上热上线验收。


## 产品线接入

“产品市场”页面的“产品线接入”区域通过 `/api/v1/admin/product-lines` 读取六产品设置和本机连接状态。
填写启用原因并确认后，带配置版本调用 `POST /api/v1/admin/product-lines/{productLine}/enable`。
后台设置持久化到数据库，Gateway 自动初始化并重试失败连接，不依赖产品列表环境变量或重启。
接入后保留资金查询和对账连接；停止交易使用下方合约的交易开关，产品接入状态与合约上市/交易状态分别管理。

本次独立导出待提交源码后 lint、build 通过；Chromium 使用真实本机管理员和后端 API 验证桌面/窄屏展示、
原因校验、启用确认和热接入。后端部署前需要应用 `deployment/migrations/20261008-gateway-product-lines.sql`。
