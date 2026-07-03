# Surprising Admin Web 后台管理系统需求分析报告

生成日期：2026-07-03  
目标仓库：`/Users/atomex/Desktop/surprising-admin-web`  
关联后端：`/Users/atomex/Desktop/surprising-ex`  
关联交易前端：`/Users/atomex/Desktop/surprising-ex-web`
关联钱包服务：`/Users/atomex/Desktop/surprising-wallet`

## 1. 结论

`surprising-admin-web` 初始状态是一个刚初始化的空仓库，只包含 `LICENSE`，没有 React 工程、README、接口封装、页面或构建配置。因此本次实现按新的交易所后台管理前端从零搭建。

现有 `surprising-ex` 后端已经具备较完整的合约交易核心：产品配置、行情、撮合、订单、条件单、账户、持仓、风控、强平、资金费、保险基金、ADL、做市和统一 gateway。后台管理系统的第一阶段可以直接基于这些接口做“可观测 + 可配置 + 可运营”的管理台。

生产级交易所后台不能只复用普通用户 gateway。本次已经补齐后台安全域、用户/角色、权限点 RBAC、客服只读视图、客服工单和备注时间线、用户详情聚合、合规风控、导出中心、受控长查询任务、订单审计专用长查询、查询任务配额和结果归档、订单/账户导出数据源、交易运营指标聚合、市场健康监控、告警中心、通知渠道和投递 worker、系统指标聚合、后台 API 延迟分位、系统可观测性聚合、TraceId 全链路查询、管理员 TOTP 2FA、审计、审批、订单、账户、资产估值报表、钱包、系统巡检、管理员 IP 白名单和关键运行时开关的第一批接口；外部渠道服务商回执适配仍属于后续增强项。

### 1.1 当前已实现状态

截至 2026-07-03，本仓库已经从空仓库生成 React + TypeScript + Vite 后台系统，并完成以下后端配套改造：

- `surprising-admin-web` 已包含登录、SUPPORT/ADMIN/SUPER_ADMIN 角色守卫、统一 gateway API client、仪表盘、客服只读视图、客服工单和备注时间线、用户权限与用户详情聚合、权限治理、合规风控、导出中心、查询任务、告警中心、产品市场、订单审计、账户资产、钱包运营、风控强平、资金费/保险基金、费率配置、做市管理和审计日志页面；客服工单和备注时间线均已接入独立游标分页。
- `surprising-admin-web` 的“产品市场”页已接入 `GET /api/v1/admin/market/health`，展示行情源状态、源延迟、index/mark 新鲜度、mark-index 偏离和 K 线新鲜度。
- `surprising-admin-web` 的“订单审计”页已接入 gateway 本地 `GET /api/v1/admin/trading/metrics`，展示订单流、成交量、撮合拒绝率、条件单积压、持仓集中度和 Symbol 运营排名；订单、条件单和成交三张明细列表已接入独立游标分页和排序控件。
- `surprising-admin-web` 的“账户资产”页已为账户流水、产品账户流水、产品划转、人工调整追溯、资产估值报表和日终资产快照接入独立游标分页和排序控件，避免大账户历史数据使用 offset 扫表。
- `surprising-admin-web` 已新增系统监控页面，用于查看 gateway 路由配置、后端 `/actuator/health` 巡检结果、UP/DOWN 汇总、延迟、outbox backlog、后台 API 错误率、登录失败和审批积压。
- `surprising-admin-web` 系统监控页已接入 gateway `/api/v1/admin/system/observability`，展示 Kafka consumer lag、WebSocket 连接/订阅统计和 Prometheus 抓取状态。
- `surprising-admin-web` 审计日志页已接入 gateway `/api/v1/admin/traces/{traceId}`，支持 TraceId 全链路排障时间线。
- `surprising-ex` gateway 已新增后台安全域 `/api/v1/admin/gateway/{service}/...`，后台代理只接受 Bearer Token 后台角色，不使用普通前端的 `X-User-Id` fallback。
- `surprising-ex` gateway 已新增 `/api/v1/admin/system/routes`、`/api/v1/admin/system/health` 和 `/api/v1/admin/system/metrics`，由 gateway 统一对业务服务做健康巡检，并聚合 outbox backlog、后台 API 错误率、登录失败和审批积压。
- gateway 已新增管理员用户/角色管理、SUPPORT 客服只读角色、普通用户列表/状态限制、用户详情聚合、refresh session 会话治理/强制下线、登录日志、管理员操作日志、后台代理审计落库、wallet 服务路由、wallet-admin 服务端 Basic Auth 注入。
- gateway 已新增敏感操作审批流：审批申请、查询、批准、驳回、消费；高风险后台写操作默认必须携带匹配的已批准审批单，且申请人与审批人不能是同一个管理员。
- gateway 已新增管理员 TOTP 2FA：绑定、确认、关闭、本地加密存储和登录校验；生产可通过 `surprising.gateway.security.require-admin-mfa=true` 强制管理员登录必须完成 2FA。
- gateway 已新增权限点 RBAC：`gateway_permissions`、`gateway_role_permissions`、角色权限查询/替换 API、本地 admin filter 和 admin gateway service/read-write 权限拦截；`SUPER_ADMIN` 默认拥有 `admin.*`，`ADMIN` 默认拥有当前运营权限但不能修改权限点，`SUPPORT` 默认只拥有 `admin.support.read` 和自助 MFA 权限。
- gateway 已新增客服只读聚合接口 `GET /api/v1/admin/support/users/{userId}/overview`，通过 `admin.support.read` 权限点聚合用户基础状态、KYC 摘要、资产、持仓、订单、成交、条件单和风险快照，不暴露会话治理、角色编辑或登录审计；并新增 `admin.support.write` 权限点、客服工单和备注时间线接口。
- gateway 已新增合规风控后台域：KYC 档案、风险标签、AML case、合规用户汇总查询，数据落在 `gateway_user_kyc_profiles`、`gateway_user_risk_tags`、`gateway_user_aml_cases`，并通过 `admin.compliance.read/write` 权限点与敏感操作审批流保护写操作。
- gateway 已新增本地后台导出任务：`gateway_admin_export_jobs` 保存 CSV 导出任务、结果、过期时间和失败原因；当前覆盖用户、登录日志、管理员操作日志、合规用户汇总、订单、条件单、成交、账户余额、产品余额、持仓、基础流水、产品流水、产品划转和账户人工调整记录，使用 `admin.exports.read/write` 权限点，创建任务需要审批。
- gateway 已新增受控长查询任务：`/api/v1/admin/query-tasks` 使用 `admin.queries.read/write` 权限点，白名单支持后台 API 延迟、outbox backlog、审批积压、告警投递失败、订单审计、条件单审计和成交审计查询，结果落在 `gateway_admin_query_tasks`；`/limits` 和 `/archive-expired` 已补齐单管理员/全局配额、窗口创建配额、保留结果字节统计和结果归档。
- gateway 本地核心后台列表已补齐统一游标分页和排序协议：导出任务、查询任务、审批中心、登录日志和管理员操作日志均支持 `limit/cursor/sort`，返回 `nextCursor/hasMore/sort/limit`，admin-web 已接入下一页/首页和排序切换。
- gateway 已新增交易运营聚合接口 `GET /api/v1/admin/trading/metrics`，使用 `admin.trading.read` 权限点聚合订单、撮合、成交、条件单、持仓和 Symbol 维度指标，避免后台前端跨服务扫明细。
- trading 下游后台明细列表已补齐统一游标分页：`/api/v1/admin/trading/orders`、`/api/v1/admin/trading/trigger-orders` 和 `/api/v1/admin/trading/orders/trades` 支持 `limit/cursor/sort`，保留原 `orders/trades/count` 字段并额外返回 `nextCursor/hasMore/sort/limit`。
- account 下游后台明细列表已补齐统一游标分页：`/api/v1/admin/accounts/ledger`、`/api/v1/admin/accounts/product-ledger`、`/api/v1/admin/accounts/transfers` 和 `/api/v1/admin/accounts/adjustments` 支持 `limit/cursor/sort`，保留原 `entries/transfers/adjustments/count` 字段并额外返回 `nextCursor/hasMore/sort/limit`。
- funding/insurance 财务类明细列表已补齐统一游标分页：资金费历史、资金费付款、保险基金流水和亏损覆盖支持 `limit/cursor/sort`，后台页面已改走 funding/insurance 的 admin namespace。
- risk/liquidation/ADL 后台列表已补齐统一游标分页和 admin namespace：高风险账户、爆仓候选、强平订单、ADL 队列和 ADL 事件均支持 `limit/cursor/sort` 或实时排名 cursor，admin-web 已改走 `risk-admin`、`liquidation-admin` 与 `adl/admin` 路径。
- gateway 已新增账户资产报表接口 `/api/v1/admin/reports/account-assets`，使用 `admin.reports.read/write` 权限点提供当前跨币种估值、日终快照生成和快照查询；快照落在 `gateway_admin_account_asset_snapshots`，并已补齐日终自动调度、上一日差异检测和 `SYSTEM:ACCOUNT_ASSET_SNAPSHOT_DIFF_PPM` 告警。
- gateway 已新增系统可观测性接口 `GET /api/v1/admin/system/observability`，使用 `admin.system.read` 权限点聚合 Kafka consumer lag、WebSocket admin metrics 和各后端 `/actuator/prometheus` 抓取状态。
- gateway 已新增 TraceId 全链路查询接口 `GET /api/v1/admin/traces/{traceId}`，使用 `admin.traces.read` 权限点聚合交易、outbox、后台操作和审批消费记录。
- gateway 已新增市场健康聚合接口 `GET /api/v1/admin/market/health`，使用 `admin.market.read` 权限点聚合 index price、mark price、行情源 component、K 线更新时间、延迟和偏离指标。
- gateway 已新增告警中心接口 `/api/v1/admin/alerts`，使用 `admin.alerts.read/write` 管理告警规则、通知渠道、告警事件、投递记录、手动评估和事件确认；规则/渠道/事件/投递列表均支持独立游标分页；规则新增、更新、启停默认接入敏感操作审批流；数据落在 `gateway_admin_alert_rules`、`gateway_admin_alert_channels`、`gateway_admin_alert_events` 和 `gateway_admin_alert_deliveries`。
- gateway 已新增告警通知发送 worker，使用 `FOR UPDATE SKIP LOCKED` 领取 `gateway_admin_alert_deliveries` 投递任务，支持 WEBHOOK/SLACK/PAGERDUTY HTTP POST、失败重试、最大次数终止、禁用/未适配渠道 SKIPPED 和手动 retry。
- gateway 已将 `FROZEN`、`TRADE_DISABLED`、`WITHDRAW_DISABLED` 用户状态接入普通用户 gateway 鉴权和写路由拦截：冻结阻断登录/刷新/鉴权，禁交易阻断交易写入但保留撤单，禁提现阻断钱包提现。
- 订单服务已新增后台全量订单、订单事件、撮合结果、成交、订单时间线、后台单笔撤单和批量撤单 API。
- 账户服务已新增后台余额/持仓查询、基础账户流水、产品账户流水、产品划转记录、基础/产品余额人工调整 API 和人工调整追溯接口。
- 风控、强平、资金费、保险基金、ADL 服务已新增 `/admin/runtime-config` 运行时配置 API，用于后台临时暂停/恢复关键任务。
- `surprising-wallet` 已通过 gateway 集成到后台钱包运营页，支持钱包总览、链/RPC/资产/余额/流水查看、后台链上运营聚合、扫描高度、热钱包余额、地址账本、非零余额账户、充值/提现/归集异常队列、wallet-server 白名单配置表更新、财务汇总、充值/提现列表、可选提现后台审核和提现审核审计记录；operations/finance 大列表已接入 `limit/cursor/sort` 游标分页。
- `surprising-websocket` 已新增 `/api/v1/admin/websocket/metrics` 后台指标接口和 Micrometer Gauge，gateway 通过 `websocket-admin` 后台路由聚合 WebSocket 连接数、认证连接、订阅数和频道分布。

当前验证结果：

- `pnpm build` 通过。
- `mvn -pl :surprising-gateway-provider,:surprising-order-provider,:surprising-account-provider,:surprising-risk-provider,:surprising-liquidation-provider,:surprising-funding-provider,:surprising-insurance-provider,:surprising-adl-provider -am test` 通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增审批流、系统监控接口、用户状态网关拦截和会话治理后再次通过。
- `mvn -pl :surprising-order-provider,:surprising-gateway-provider -am test` 在新增后台撤单/批量撤单后通过。
- `mvn -pl :surprising-trigger-provider,:surprising-gateway-provider -am test` 在新增条件单后台审计和 gateway admin 路由后通过。
- `mvn -pl :surprising-order-provider,:surprising-gateway-provider -am test` 在新增撤单影响预览和 symbol 级取消后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增管理员 IP 白名单过滤器后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增用户详情聚合接口和触发单 admin 路由配置修正后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增管理员 TOTP 2FA 后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增权限点 RBAC 后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增 KYC/AML 和风险标签后台接口后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增导出任务 API 后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增订单/账户导出数据源后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增 SUPPORT 客服只读视图后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增系统指标聚合接口后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增交易运营指标聚合接口后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增市场健康聚合接口后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增告警规则和事件接口后通过。
- `mvn -pl backendservices/wallet-parent/wallet-server -am test` 在 `surprising-wallet` 新增 wallet finance 和提现审核后通过。
- `mvn -pl :surprising-account-provider -am test` 在新增 account admin 人工调整追溯后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增账户人工调整记录 CSV 导出数据源后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增账户资产估值和日终快照报表后通过。
- `pnpm build` 在 admin-web 接入账户人工调整追溯、`ACCOUNT_ADJUSTMENTS` 导出类型、资产估值和日终快照报表后通过。
- `mvn -pl :surprising-gateway-provider,:surprising-websocket-provider -am test` 在新增系统可观测性聚合和 WebSocket admin metrics 后通过。
- `pnpm build` 在 admin-web 系统监控页接入 Kafka/WebSocket/Prometheus 可观测性后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增 TraceId 全链路查询后通过。
- `pnpm build` 在 admin-web 审计页接入 TraceId 查询后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增后台 API 延迟分位、操作日志耗时导出和告警通知发送 worker 后通过，当前 gateway-provider 测试数为 75。
- `pnpm build` 在 admin-web 系统监控页展示后台 API p50/p95/p99 延迟后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增受控长查询任务 API 后通过，当前 gateway-provider 测试数为 78。
- `pnpm build` 在 admin-web 新增“查询任务”页面后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增查询任务配额和归档接口后通过，当前 gateway-provider 测试数为 84。
- `pnpm build` 在 admin-web 查询任务页接入配额和归档操作后通过。
- `mvn -pl :surprising-gateway-provider -am test` 在新增日终资产快照自动调度和差异告警后通过，当前 gateway-provider 测试数为 87。
- `pnpm build` 在 admin-web 账户资产页展示快照差异告警后通过。
- `mvn -pl :surprising-gateway-provider -Dtest=AdminQueryTaskServiceTest,AdminQueryTaskControllerTest -am test` 在新增订单审计专用长查询 queryType 后通过。
- `mvn -pl :surprising-market-maker-provider -am test` 在新增做市收益归因和策略运行日志后通过，当前 market-maker-provider 测试数为 17。
- `pnpm build` 在 admin-web 做市页接入收益归因和策略运行日志后通过。
- `mvn -pl :surprising-gateway-provider -Dtest=AdminCursorPageTest,AdminQueryTaskControllerTest,AdminExportControllerTest -am test` 在新增统一游标分页 helper 和控制器委托测试后通过，新增/相关测试 9 个。
- `mvn -pl :surprising-gateway-provider -am test` 在 gateway 本地核心后台列表接入游标分页和排序后通过，当前 gateway-provider 测试数为 93。
- `pnpm build` 在 admin-web 审批中心、导出中心、查询任务和审计日志接入游标分页/排序控件后通过。
- `mvn -pl :surprising-order-provider,:surprising-trigger-provider -Dtest=OrderServiceTest,TriggerOrderServiceTest -Dsurefire.failIfNoSpecifiedTests=false -am test` 在订单、条件单和成交后台明细接入游标分页后通过，定向服务测试 25 个。
- `mvn -pl :surprising-order-provider,:surprising-trigger-provider,:surprising-gateway-provider -am test` 在交易明细游标分页接入后通过，覆盖 order-provider 87、trigger-provider 16、gateway-provider 93 个测试。
- `pnpm build` 在 admin-web 订单审计页接入订单/条件单/成交独立游标分页后通过。
- `mvn -pl :surprising-account-provider -am test` 在账户后台流水、产品流水、划转和人工调整记录接入游标分页后通过，当前 account-provider 测试数为 81。
- `mvn -pl :surprising-account-provider,:surprising-gateway-provider -am test` 在账户后台游标分页和 gateway 后台代理联测后通过。
- `pnpm build` 在 admin-web 账户资产页接入四张明细列表独立游标分页后通过。
- `mvn -pl backendservices/wallet-parent/wallet-server -am test` 在 wallet operations/finance 大列表接入游标分页后通过。
- `pnpm build` 在 admin-web 钱包运营页接入地址、余额、异常、充值、提现和审核记录独立游标分页后通过。
- `mvn -pl :surprising-funding-provider,:surprising-insurance-provider -am test` 在资金费和保险基金后台明细接入游标分页后通过。
- `pnpm build` 在 admin-web 资金费与保险基金页接入资金费历史、资金费付款、保险基金流水和亏损覆盖独立游标分页后通过。
- `mvn -pl :surprising-risk-provider,:surprising-liquidation-provider,:surprising-adl-provider -am test` 在风控、强平和 ADL 后台列表接入 admin 路径与游标分页后通过。
- `pnpm build` 在 admin-web 风控强分页接入高风险账户、爆仓候选、强平订单、ADL 队列和 ADL 事件独立游标分页后通过。

## 2. 主流交易所参考方向

公开资料显示，主流交易所通常把能力拆分为：公开市场数据、认证后的交易/账户数据、实时 WebSocket、资金账户、子账户、API 权限和安全控制。

- Coinbase Exchange 文档把 API 分为 Trading 和 Market Data，两者权限模型不同；同时提供 REST、FIX、WebSocket 等接入方式。
- Binance.US REST/API 能力覆盖 exchange data、market/trade price data、user account data、trade order management、wallet management，并有用户数据流。
- OKX API 明确区分 Public Data、Market Data、Trading Account、Funding Account、Sub-account，并提供 Read/Trade/Withdraw 权限。
- Kraken 把 Spot 和 Derivatives 分为不同交易引擎，并把 REST 用于账户/资金/查询，WebSocket 用于实时市场、订单和余额更新，FIX 面向机构/HFT。

对后台管理系统的设计启示：

- 后台首页应是高密度运营工作台，而不是营销页。
- 市场、订单、账户、风险、资金、做市、系统监控必须分区明确。
- 所有写操作必须有权限、二次确认、审计记录；高风险操作需要审批流。
- 列表页要支持强过滤、排序、分页、导出、复制 ID、追踪 traceId。
- 风控、强平、保险基金、ADL、资金费应是实时状态优先展示。
- 产品/交易规则配置要版本化、可回滚、可查看变更历史。

参考链接：

- Coinbase Exchange APIs: https://docs.cdp.coinbase.com/exchange/introduction/welcome
- Binance.US API Documentation: https://docs.binance.us/
- OKX API Guide: https://my.okx.com/docs-v5/en/
- Kraken Exchange Overview: https://docs.kraken.com/exchange/guides/overview

## 3. 当前项目现状

### 3.1 `surprising-admin-web`

- Git 仓库已克隆到桌面。
- 当前分支：`main`
- 最近提交：`17ca78e Initial commit`
- 初始文件：仅 `LICENSE`
- 当前状态：已生成 React + TypeScript + Vite 后台工程，包含真实页面、API client、构建配置和中文运行说明。

### 3.2 `surprising-ex-web`

现有用户交易端已经是 Vite + React + TypeScript：

- React 19
- Vite
- TypeScript
- `lucide-react`
- `lightweight-charts`
- 自定义 API client 和 mock fallback
- 已实现交易终端风格页面：市场选择、K 线、盘口、成交、账户、持仓、下单、撤单、登录/注册、WebSocket 实时数据。

后台管理端可以复用它的工程风格、API 配置、展示格式化逻辑和实时连接思路，但不应复用交易页布局。后台应以表格、筛选器、详情抽屉、审批弹窗、审计时间线为核心。

### 3.3 `surprising-ex`

后端是多模块 Java/Spring 交易所服务，主要模块：

- `surprising-instrument`：合约基础配置和产品规则中心。
- `surprising-candlestick`：K 线服务。
- `surprising-price`：指数价格、标记价格、法币汇率。
- `surprising-trading`：订单入口、条件单、撮合、费率、杠杆。
- `surprising-account`：账户余额、产品账户余额、持仓、保证金。
- `surprising-risk`：保证金率、风险快照、爆仓候选。
- `surprising-liquidation`：强平候选执行和平仓订单。
- `surprising-funding`：永续合约资金费率和结算。
- `surprising-insurance`：保险基金和穿仓亏损覆盖。
- `surprising-adl`：自动减仓队列和事件。
- `surprising-websocket`：行情、订单、成交、持仓实时推送。
- `surprising-gateway`：面向前端/BFF 的 REST gateway。
- `surprising-market-maker`：做市商策略和压测服务。

数据库 schema 在根目录 `init.sql`，包含 instruments、candlestick、price、funding、trading、account、risk、liquidation、insurance、adl、market-maker、gateway auth 等表。

## 4. 现有可用接口矩阵

以下接口可作为后台 MVP 的直接数据来源。通过 gateway 时，路径一般是 `/api/v1/gateway/{service}` 加上模块内路径。

### 4.1 认证与 Gateway

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `ANY /api/v1/gateway/{service}/**`

现有 gateway 路由：

- `instrument`
- `candlestick`
- `price-index`
- `price-fx`
- `price-mark`
- `trading`
- `trading-market`
- `trading-trigger`
- `account`
- `risk`
- `liquidation`
- `funding`
- `insurance`
- `adl`
- `market-maker`

注意：普通前端 gateway 仍保留 `X-User-Id` fallback 以兼容现有用户侧调用；后台代理已改为 `/api/v1/admin/gateway/{service}`，只接受 SUPPORT/ADMIN/SUPER_ADMIN Bearer Token，并继续通过权限点限制实际可访问范围，不走 fallback。

### 4.2 产品与交易规则

- `GET /api/v1/instruments/latest?symbol=...`
- `GET /api/v1/instruments/version?symbol=...&version=...`
- `GET /api/v1/instruments/list?type=...&status=...`
- `POST /api/v1/instruments/admin/upsert`
- `POST /api/v1/instruments/admin/{symbol}/status?status=...`

后台可实现：

- 交易对/合约列表
- 合约详情
- 风险档位
- 指数源配置
- 上架、下架、暂停交易
- 产品参数编辑

### 4.3 行情与市场数据

- `GET /api/v1/candlestick/candles`
- `GET /api/v1/candlestick/candles/latest`
- `GET /api/v1/price/index/latest`
- `GET /api/v1/price/index/history`
- `GET /api/v1/price/mark/latest`
- `GET /api/v1/price/mark/history`
- `GET /api/v1/price/fx/latest`
- `GET /api/v1/price/fx/rates`
- `GET /api/v1/price/fx/convert`
- `GET /api/v1/trading/market/orderbook`

后台可实现：

- 市场实时监控
- 标记价格/指数价格历史
- 资金费率趋势联动
- 盘口深度快照
- 行情延迟和异常监控

### 4.4 订单、条件单、杠杆、费率

普通订单：

- `POST /api/v1/trading/orders`
- `POST /api/v1/trading/orders/cancel`
- `GET /api/v1/trading/orders/{orderId}`
- `GET /api/v1/trading/orders/by-client-order-id`
- `GET /api/v1/trading/orders/open`

条件单：

- `POST /api/v1/trading/trigger-orders`
- `POST /api/v1/trading/trigger-orders/cancel`
- `GET /api/v1/trading/trigger-orders/{triggerOrderId}`
- `GET /api/v1/trading/trigger-orders/open`

杠杆：

- `POST /api/v1/trading/leverage/settings`
- `GET /api/v1/trading/leverage/settings`

后台费率：

- `GET /api/v1/trading/fees/effective`
- `POST /api/v1/admin/trading/fees/schedules`
- `POST /api/v1/admin/trading/fees/schedules/{feeScheduleId}/disable`
- `GET /api/v1/admin/trading/fees/schedules`
- `POST /api/v1/admin/trading/fees/tiers`
- `GET /api/v1/admin/trading/fees/tiers`
- `POST /api/v1/admin/trading/fees/tiers/refresh`
- `POST /api/v1/admin/trading/fees/tiers/refresh-active`
- `GET /api/v1/admin/trading/fees/tiers/users/{userId}`

后台订单审计与运营：

- `GET /api/v1/admin/trading/metrics`
- `GET /api/v1/admin/trading/orders`
- `GET /api/v1/admin/trading/orders/{orderId}/events`
- `GET /api/v1/admin/trading/orders/{orderId}/match-results`
- `GET /api/v1/admin/trading/orders/{orderId}/timeline`
- `GET /api/v1/admin/trading/orders/trades`
- `GET /api/v1/admin/trading/orders/cancel-preview`
- `POST /api/v1/admin/trading/orders/{orderId}/cancel`
- `POST /api/v1/admin/trading/orders/cancel`
- `POST /api/v1/admin/trading/orders/cancel-by-symbol`
- `GET /api/v1/admin/trading/trigger-orders`
- `GET /api/v1/admin/trading/trigger-orders/{triggerOrderId}`
- `GET /api/v1/admin/trading/trigger-orders/{triggerOrderId}/timeline`

后台可实现：

- 用户当前挂单查询
- 按 orderId/clientOrderId 查询订单
- 条件单查询
- 用户杠杆设置查看/调整
- VIP 费率档位配置
- 用户特殊费率配置
- 活跃用户费率刷新

当前缺口：

- gateway 本地核心列表、trading 订单/条件单/成交明细、account 账户明细、wallet operations/finance 大列表、funding/insurance 财务明细以及 risk/liquidation/ADL 后台列表已完成游标分页和排序；下一步应继续把更复杂的过滤条件沉淀成服务端白名单，并为跨服务聚合报表增加异步查询/导出能力。

### 4.5 账户、余额、持仓

账户查询：

- `GET /api/v1/accounts/balance`
- `GET /api/v1/accounts/balances`
- `GET /api/v1/accounts/product-balance`
- `GET /api/v1/accounts/product-balances`
- `POST /api/v1/accounts/transfers`
- `GET /api/v1/accounts/position`
- `GET /api/v1/accounts/position-margin`
- `POST /api/v1/accounts/position-margin-adjustments`
- `GET /api/v1/accounts/positions`

后台资产调整：

- `POST /api/v1/admin/accounts/balance-adjustments`
- `POST /api/v1/admin/accounts/product-balance-adjustments`
- `GET /api/v1/admin/accounts/adjustments`

后台可实现：

- 用户资产总览
- 产品账户余额
- 资金划转
- 持仓详情
- 逐仓保证金调整
- 人工余额调整
- 产品账户人工调整

当前已补齐：

- 用户列表、用户状态操作、会话治理和用户详情聚合。
- 账户余额、产品账户余额、持仓、账户流水、产品账户流水和资金划转记录查询。
- 后台余额人工调整、产品账户人工调整和人工调整历史专用追溯。
- 账户余额、产品余额、持仓、账户流水、产品流水、资金划转和人工调整记录已接入统一 CSV 导出任务数据源。
- 账户资产跨币种估值报表、日终快照生成/查询、自动调度和对账差异告警。
- 钱包运营页已通过 `surprising-wallet` 接入 gateway，提现审核通过/拒绝会写入 `withdrawal_review_audit` 并在后台资金审核页展示。

当前已补齐：日终快照可手动生成，也可由 gateway 调度器自动生成；调度后会对比上一日同账户类型/资产估值，异常写入告警中心并在账户资产页展示。

### 4.6 风控、强平、ADL

风险：

- `GET /api/v1/risk/account/latest`
- `GET /api/v1/risk/positions/latest`
- `GET /api/v1/risk/liquidation-candidates`
- `GET /api/v1/admin/risk/rules`
- `POST /api/v1/admin/risk/rules/{ruleCode}`
- `GET /api/v1/admin/risk/high-risk-accounts`
- `GET /api/v1/admin/risk/liquidation-candidates`

强平：

- `GET /api/v1/liquidations/orders`
- `GET /api/v1/liquidations/orders/by-candidate`
- `GET /api/v1/admin/liquidations/orders`
- `GET /api/v1/admin/liquidations/candidates/{candidateId}/timeline`
- `POST /api/v1/admin/liquidations/candidates/{candidateId}/cancel`

ADL：

- `GET /api/v1/adl/queue`
- `GET /api/v1/adl/events`
- `GET /api/v1/adl/admin/queue`
- `GET /api/v1/adl/admin/events`

后台列表分页：

- 高风险账户、爆仓候选支持 `limit/cursor/sort`，排序白名单 `eventTime.desc`、`eventTime.asc`。
- 强平订单和 ADL 事件支持 `createdAt.desc`、`createdAt.asc`。
- ADL 队列使用实时排名游标 `priorityScorePpm.desc`。

后台可实现：

- 风险账户快照
- 用户持仓风险
- 爆仓候选列表
- 强平订单列表
- ADL 队列
- ADL 事件查询
- 风控、强平、ADL 运行时开关管理
- 风控规则持久覆盖、变更原因和管理员留痕
- 高风险账户按风险等级聚合，展示风险仓位、保证金率和活跃爆仓候选数量
- 强平候选事件时间线、关联订单、撮合结果和管理员动作审计
- 无活跃强平单候选的后台取消动作

当前已做：高风险账户聚合可接入告警中心规则和通知 worker；后续可补专用风险通知模板和外部渠道回执。

### 4.7 资金费、保险基金

资金费：

- `GET /api/v1/funding/rates/latest`
- `GET /api/v1/funding/rates/history`
- `GET /api/v1/funding/settlements/latest`
- `GET /api/v1/funding/payments`
- `GET /api/v1/funding/admin/rates/latest`
- `GET /api/v1/funding/admin/rates/history`
- `GET /api/v1/funding/admin/settlements/latest`
- `GET /api/v1/funding/admin/payments`

保险基金：

- `POST /api/v1/insurance/admin/fund-adjustments`
- `GET /api/v1/insurance/balances`
- `GET /api/v1/insurance/ledger`
- `GET /api/v1/insurance/coverages`
- `GET /api/v1/insurance/admin/balances`
- `GET /api/v1/insurance/admin/ledger`
- `GET /api/v1/insurance/admin/coverages`

后台可实现：

- 资金费率当前值和历史
- 最新结算批次
- 用户资金费流水
- 保险基金余额
- 保险基金流水
- 穿仓亏损覆盖记录
- 保险基金人工调整

### 4.8 做市管理

- admin-web 统一 gateway：`GET /api/v1/admin/gateway/market-maker/strategies`
- admin-web 统一 gateway：`GET /api/v1/admin/gateway/market-maker/metrics?limit=200`
- admin-web 统一 gateway：`POST /api/v1/admin/gateway/market-maker/strategies/{strategyId}/pause`
- admin-web 统一 gateway：`POST /api/v1/admin/gateway/market-maker/strategies/{strategyId}/resume`
- admin-web 统一 gateway：`GET /api/v1/admin/gateway/market-maker/strategies/{strategyId}/config`
- admin-web 统一 gateway：`POST /api/v1/admin/gateway/market-maker/strategies/{strategyId}/config`
- admin-web 统一 gateway：`POST /api/v1/admin/gateway/market-maker/run-once`
- admin-web 统一 gateway：`GET /api/v1/admin/gateway/market-maker/pnl-attribution`
- admin-web 统一 gateway：`GET /api/v1/admin/gateway/market-maker/strategy-logs`
- provider admin path：`/api/v1/admin/market-maker/...`

后台可实现：

- 做市策略列表
- 策略详情
- 暂停/恢复策略
- 手动运行一次
- 做市运行状态查看
- 做市库存、挂单覆盖率、缺失报价、陈旧报价、偏离目标报价、价差和异常告警聚合
- 做市收益归因：按配置策略、交易对和账号归集做市订单、成交、手续费、当前已实现盈亏和库存
- 策略运行日志：记录 cycle success/failure、报价对账、交易提交/拒绝、跳过原因、错误信息和 TraceId
- 策略报价/风险参数在线覆盖：enabled、baseQuantitySteps、marginMode、spreadTicks、levelSpacingTicks、maxInventorySteps、maxInventorySkewPpm、orderLevels

当前已做：

- 已实现库存与挂单质量指标、做市收益归因和独立策略运行日志。
- 收益归因只按部署配置中的 strategy/account/symbol 范围生成归因行，并使用做市 `clientOrderId` 前缀关联订单、成交和手续费，避免把普通用户交易混入做市核算。

## 5. 建议后台功能地图

### 5.1 总览工作台

目标：交易所运营人员打开后台后的第一屏。

核心组件：

- 今日成交量、成交笔数、手续费收入、活跃用户。
- 在线交易对、暂停交易对、异常交易对。
- 最新 mark/index price 状态。
- 资金费下一次结算倒计时。
- 风险账户数量、爆仓候选数量、强平中订单数量。
- 保险基金余额和最近覆盖事件。
- ADL 队列长度和最近 ADL 事件。
- 做市策略状态和报价质量异常。
- 服务健康、gateway 状态、WebSocket 状态、Kafka/outbox 状态。

当前已做：使用现有接口组合展示产品、价格、风险、强平、资金费、保险基金、ADL、做市状态、做市报价质量、做市收益归因和策略运行日志；gateway 已提供路由、`/actuator/health` 巡检、`/api/v1/admin/system/metrics` 指标聚合、`/api/v1/admin/system/observability` 可观测性聚合和 `/api/v1/admin/traces/{traceId}` 全链路查询，覆盖 outbox backlog、后台 API 错误率、登录失败、审批积压、Kafka lag、WebSocket 连接数、Prometheus 抓取状态和 TraceId 排障时间线；`/api/v1/admin/trading/metrics` 已聚合订单、成交、撮合、条件单、持仓和 Symbol 运营指标，`/api/v1/admin/market-maker/metrics` 已聚合做市库存、挂单覆盖率和异常；告警中心已具备通知渠道、投递队列和发送 worker。  
后续增强：外部渠道服务商回执和专用通知模板。

### 5.2 用户与权限

目标：后台管理员、运营、客服、风控、财务、审计等角色各自只看到可操作范围。

核心功能：

- 管理员登录。
- 管理员列表。
- 角色管理。
- 权限点管理。
- 登录日志。
- 会话管理。
- IP 白名单和 2FA。
- 敏感操作审批。
- 操作审计。

当前已做：复用 gateway 登录，服务端校验 SUPPORT/ADMIN/SUPER_ADMIN，提供管理员用户/角色、权限点 RBAC、角色权限分配、登录日志、会话治理/强制下线、管理员 IP 白名单、TOTP 2FA、操作审计和敏感操作审批流；用户状态/角色/会话撤销/角色权限变更本身也需要审批。  
后续增强：权限验收清单和生产运维策略。

### 5.3 用户管理

核心功能：

- 用户搜索：userId、username、email、状态。
- 用户详情：基本信息、角色、登录历史、资产、持仓、订单、条件单、风险快照。
- 用户限制：冻结、解冻、禁止交易、禁止提现、强制登出。
- 客服视图：只读用户资产和交易状态。

当前已做：用户列表、按 userId/username/email 搜索、状态筛选、角色变更、用户状态变更、登录日志查询、refresh session 列表、单会话撤销、用户全部会话强制下线，以及 `GET /api/v1/admin/users/{userId}/profile` 用户详情聚合；聚合内容包含基本信息、会话、登录日志、账户余额、产品账户、持仓、流水、资金划转、普通订单、成交、条件单和风险快照，且下游失败会按分区返回局部错误。客服视图已支持 `SUPPORT` 角色通过 `GET /api/v1/admin/support/users/{userId}/overview` 查看只读用户基础状态、KYC 摘要、资产、持仓、订单、成交、条件单和风险快照，不提供会话治理、角色编辑或登录审计；客服工单支持按用户/状态查询、创建工单、追加内部备注和状态变更备注时间线，工单列表和备注时间线均支持独立游标分页。合规风控页已支持 KYC 档案维护、风险标签创建/解除、AML case 创建/状态更新、合规用户汇总查询，以及风险标签和 AML case 全局审计列表独立游标分页。`FROZEN`、`TRADE_DISABLED`、`WITHDRAW_DISABLED` 已在 gateway 层生效。  

### 5.4 产品与交易规则

核心功能：

- 交易对列表。
- 新增/编辑合约。
- 查看版本历史。
- 切换交易状态。
- 风险限额档位。
- 指数源配置。
- 资金费参数。
- 手续费默认参数。
- 最小下单量、最大下单量、最小名义价值、最大杠杆、保证金率。

MVP 可做：基于 `instrument` admin 接口实现列表、详情、upsert、状态切换。  
增强项：变更 diff、审批后发布、灰度发布、回滚。

### 5.5 市场监控

核心功能：

- K 线预览。
- 盘口深度。
- 最新成交流。
- mark price/index price 对比。
- funding rate 趋势。
- 行情源状态。
- 异常价格偏离告警。

当前已做：复用交易前端的图表和行情 API；gateway 本地 `/api/v1/admin/market/health` 已聚合行情源健康、源延迟、index/mark 新鲜度、mark-index 偏离和 K 线新鲜度，并在“产品市场”页展示；告警中心已支持配置 `MARKET` 规则、手动评估、事件确认、通知渠道、投递记录和发送 worker。  
后续增强：外部渠道服务商回执和专用通知模板。

### 5.6 订单管理

核心功能：

- 当前挂单。
- 条件单。
- 按订单 ID 查询。
- 按 clientOrderId 查询。
- 用户订单视图。
- 后台撤单。
- 批量撤单。
- 订单状态时间线。
- 撮合成交详情。

当前已做：全量订单列表、用户/产品/状态/订单号筛选、成交审计、订单事件、撮合结果、订单时间线、撤单影响预览、后台单笔撤单、批量撤单、symbol 级取消、条件单全量审计、条件单触发时间线，以及 gateway 本地交易运营聚合统计；订单、条件单和成交明细列表已使用 `limit/cursor/sort` 游标分页协议。  
后续增强：复制 ID、固定列和更多服务端过滤白名单。

### 5.7 账户与资产运营

核心功能：

- 用户余额。
- 产品账户余额。
- 资金划转。
- 持仓和仓位保证金。
- 人工入账/扣账。
- 保险基金调整。
- 账户流水和调整流水。
- 充值、提现、钱包热冷余额。

MVP 可做：资产查询、产品账户查询、划转、持仓查询、保证金调整、人工余额调整、保险基金调整。  
当前已做：资产/产品账户/持仓查询、账户流水、产品流水、产品划转、人工余额调整、人工调整追溯、账户明细 `limit/cursor/sort` 游标分页、跨币种资产估值、资产估值查询游标分页、日终资产快照、日终快照查询游标分页、日终快照自动调度、快照差异告警、保险基金调整、资金费/保险基金明细游标分页、钱包系统对接，wallet operations 链上运营聚合、扫描高度、热钱包余额、地址账本、非零余额账户、充值/提现/归集异常队列，wallet finance 财务汇总、充值/提现列表、可选提现后台审核、提现审核审计记录，wallet operations/finance 大列表游标分页，以及余额、持仓、账户流水、产品流水、产品划转和人工调整记录 CSV 导出数据源。  
后续增强：更多对账规则模板和财务复核工作流。

### 5.8 风控、强平、保险基金、ADL

核心功能：

- 风险账户列表。
- 用户风险快照。
- 持仓风险表。
- 爆仓候选。
- 强平订单。
- 保险基金余额/流水/覆盖。
- ADL 队列/事件。
- 风控开关。
- 风控规则管理。
- 高风险账户分层聚合。
- 强平暂停/恢复。
- 强平候选详情时间线。
- 强平候选取消和操作原因留痕。

MVP 可做：查询、展示、运行时开关、风控规则覆盖、高风险账户聚合、强平候选安全取消，以及高风险账户/爆仓候选/强平订单/ADL 队列/ADL 事件的独立游标分页。  
后续增强：高风险账户聚合与通知渠道的独立 worker 联动。

### 5.9 手续费与 VIP

核心功能：

- 全局费率档位。
- 用户 VIP 档位。
- 用户/交易对特殊费率。
- 费率计划启用/禁用。
- 刷新单用户 VIP。
- 批量刷新活跃用户 VIP。

MVP 可做：现有 `admin/trading/fees` 接口已经覆盖主要功能。  
增强项：费率变更审批、预览影响用户数、变更历史。

### 5.10 做市管理

核心功能：

- 做市策略列表。
- 策略实时状态。
- 暂停、恢复、运行一次。
- 策略运行日志。
- 库存风险。
- 报价质量。
- 异常告警：无 live 报价、缺失目标报价、陈旧报价、偏离目标报价、库存超限、合约非交易状态和采集失败。
- 策略参数在线覆盖：enabled、基础数量、保证金模式、价差、层间距、库存上限/偏斜阈值、报价层数。

MVP 可做：列表、详情、暂停/恢复、run-once。  
当前已做：列表、状态、暂停/恢复、run-once、库存/报价质量指标、异常原因聚合、策略参数在线覆盖、做市收益归因和独立策略运行日志。  
收益归因通过配置范围和做市订单前缀归集订单、成交、手续费、当前已实现盈亏和库存；策略日志通过 `market_maker_strategy_run_events` 记录执行结果、跳过原因、错误信息和 TraceId。

### 5.11 系统运维与审计

核心功能：

- 服务健康。
- Kafka topic 状态。
- Outbox 积压。
- DB 表关键统计。
- WebSocket 连接数。
- API 错误率。
- 管理员操作审计。
- TraceId 查询。

当前已做：系统监控页已接入健康巡检、路由表、outbox backlog、后台 API 错误率、后台 API p50/p95/p99 延迟、登录失败、审批积压、Kafka lag 查询、WebSocket 连接数和 Prometheus 指标代理；告警中心已支持 `SYSTEM`、`MARKET`、`TRADING` 规则、告警事件、手动评估、确认、通知渠道、投递记录、发送 worker，以及规则/渠道/事件/投递四张表独立游标分页；审计日志页面已接入管理员操作审计、登录日志和 TraceId 全链路查询。  
后续增强：接入 SMTP、Slack、PagerDuty 官方凭证适配器和外部渠道回执。

## 6. 推荐 React 技术方案

建议新项目采用：

- Vite + React + TypeScript。
- React Router：后台多页面路由。
- TanStack Query：服务端状态、缓存、刷新、错误处理。
- 表格组件：优先选择成熟 data table 方案，支持固定列、排序、筛选、分页、列显隐。
- 表单校验：Zod 或同类 schema 校验。
- 图表：复用 `lightweight-charts` 展示价格和资金费，运营图表可用 ECharts/Recharts。
- 图标：`lucide-react`，与现有交易端保持一致。
- 样式：后台工作台风格，支持暗色/亮色主题。
- API 层：统一封装 gateway route、鉴权 token、刷新 token、traceId、错误码。
- Mock 层：后端未补齐前保留 mock 数据，页面先可跑通。

建议页面结构：

- `/login`
- `/dashboard`
- `/users`
- `/users/:userId`
- `/markets/instruments`
- `/markets/prices`
- `/orders/open`
- `/orders/triggers`
- `/accounts/balances`
- `/accounts/adjustments`
- `/risk/overview`
- `/risk/liquidations`
- `/risk/adl`
- `/funding/rates`
- `/insurance/fund`
- `/fees/schedules`
- `/fees/tiers`
- `/market-maker/strategies`
- `/market-maker/metrics`
- `/system/health`
- `/system/audit`

## 7. UI/交互设计原则

- 第一屏直接进入后台工作台，不做 landing page。
- 左侧导航按业务域分组，顶部提供环境标识、全局 userId/symbol 搜索、告警、主题切换、当前管理员。
- 表格页以筛选器 + 数据表 + 详情抽屉为核心。
- 高风险写操作使用确认弹窗，展示变更前后 diff、影响范围和操作原因输入框。
- 金额、价格、数量统一格式化；保留 ticks/steps/units 的原始值展示入口。
- 风险相关状态使用明确颜色：正常、警告、危险、暂停、处理中、失败。
- 操作按钮使用图标 + tooltip；主命令保留文字。
- 避免卡片堆叠卡片，复杂详情使用分区、tabs、抽屉。
- 所有列表支持复制 ID、复制 traceId、导出 CSV。

## 8. MVP 实施范围

第一版建议不要一次做完整后台，而是交付能真实服务运营的 MVP：

1. 工程基础
   - React + TypeScript + Vite。
   - 登录、token 保存、刷新、登出。
   - 基础布局、菜单、主题。
   - API client、错误处理、loading/empty/error 状态。

2. 只读运营面
   - Dashboard。
   - 产品列表和详情。
   - 市场监控。
   - 用户资产/持仓/风险按 userId 查询。
   - 订单和条件单按 userId 查询。
   - 风险、强平、资金费、保险基金、ADL、做市查询页。

3. 已有 admin 写操作
   - 产品 upsert 和状态切换。
   - 账户余额调整、产品余额调整。
   - 保险基金调整。
   - 费率 schedule/tier 管理。
   - 做市策略暂停/恢复/run-once。

4. 前端保护
   - 菜单权限。
   - 操作确认。
   - 操作原因。
   - 本地审计展示占位。

注意：第 4 点只能作为前端体验保护，不能替代后端权限和审计。

## 9. 后端配套需求

本次已新增或改造：

- gateway 的 admin 安全域。
- 管理员账号、角色、菜单权限、后台角色校验、用户状态限制和会话治理。
- 权限点 RBAC、角色权限分配和 admin gateway service/read-write 权限拦截。
- 用户详情聚合 BFF：基本信息、会话、登录日志、资产、持仓、订单、条件单和风险快照。
- 客服工单、状态变更和备注时间线。
- 移除后台生产环境的 `X-User-Id` fallback。
- 管理员操作审计表和查询 API。
- 导出中心：用户、登录日志、管理员操作日志、合规用户汇总、订单、条件单、成交、余额、持仓、账户流水、产品流水、资金划转和人工调整记录 CSV 任务。
- 账户资产报表：当前跨币种估值、缺失汇率提示、日终快照生成/查询、自动调度和快照差异告警。
- 敏感操作审批流：用户状态/角色变更、会话撤销/强制下线、余额调整、保险基金调整、产品规则变更、交易暂停、批量撤单。
- 账户流水、产品账户流水、资金划转记录、人工调整记录查询。
- 全量订单、历史订单、全量成交、订单事件查询。
- 后台专用撤单、批量撤单。
- 风控开关、强平开关、资金费开关、扫描任务开关管理。
- 风控规则持久覆盖和高风险账户聚合接口。
- 强平候选后台时间线和无活跃强平单候选取消动作。
- 后台 API 请求耗时审计和 p50/p95/p99 延迟分位指标。
- 受控长查询任务、订单审计专用长查询、配额控制和 JSON 结果归档。
- 服务健康巡检。

仍建议补强：

- 外部渠道服务商回执和专用适配器。
- 将已落地的统一分页、排序协议继续扩展到后续新增的跨服务报表，并补齐更严格的过滤白名单。

## 10. 风险与注意事项

- `surprising-admin-web` 初始为空仓库，本次已从后端和交易前端倒推并实现第一版后台。
- 普通用户 gateway 的身份模型仍适合前端兼容；后台必须持续使用 `/api/v1/admin/gateway` 安全域。
- 用户状态/角色变更、角色权限变更、KYC 审核、风险标签、AML case 状态、余额调整、保险基金调整、产品状态切换、做市暂停、后台撤单等操作会影响真实资金或市场；本次已补权限点 RBAC、操作审计、第一版审批流、管理员 IP 白名单和 TOTP 2FA，后续仍需做生产权限验收。
- 后台需要严格区分普通用户 userId 和管理员 adminId，不能混用。
- 页面可先做 mock/只读，但上线前必须以服务端权限为准。
- 报表和监控类页面需要聚合接口，否则前端直接扫多模块接口会造成性能和权限问题。

## 11. 下一步建议

建议按以下顺序推进：

1. 完成端到端联调：以真实 gateway、订单、账户、钱包服务跑通登录、审批、撤单、余额调整和钱包配置。
2. 补齐生产部署材料：Nginx/容器镜像、环境变量、数据库迁移、回滚步骤和权限验收清单。
3. 增强权限治理：管理员安全策略和权限验收。
4. 增强运营能力：将统一游标分页和排序过滤协议继续推广到剩余服务明细列表。
5. 增强监控：外部渠道回执、专用通知模板和渠道适配器。
