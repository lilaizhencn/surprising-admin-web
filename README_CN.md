# surprising-admin-web

Surprising 交易所后台管理 Web。后台所有业务请求统一走 gateway：

- 后台本地接口：`/api/v1/admin/...`
- 后台代理接口：`/api/v1/admin/gateway/{service}/...`

登录用户必须具备 `SUPPORT`、`ADMIN` 或 `SUPER_ADMIN` 角色，否则前端会拒绝进入后台，gateway 也会拒绝后台代理请求。`SUPPORT` 登录后只显示“客服视图”，`ADMIN` 和 `SUPER_ADMIN` 显示完整后台。

## 敏感操作审批

用户状态/角色变更、余额调整、保险基金调整、产品配置/状态、费率配置、做市控制、后台撤单/批量撤单、钱包配置、告警规则变更、导出任务、风控/强平/资金费/ADL 运行时开关属于高风险后台写操作。gateway 默认要求这些请求携带已批准审批单：

1. 操作人点击写操作按钮。
2. 前端弹出页面内审批面板，展示 service、method、path、query 和 request body hash；操作人可输入已批准审批单 ID，或填写原因创建审批申请。
3. 另一名管理员进入“审批中心”批准该申请。同一管理员不能自批。
4. 操作人重新执行原操作，输入已批准的审批单 ID。
5. gateway 校验审批单的 service、method、path、query、body hash 完全匹配后才转发请求，并把审批单标记为 `CONSUMED`。

## 用户状态限制

后台“用户权限”页支持 `NORMAL`、`FROZEN`、`TRADE_DISABLED`、`WITHDRAW_DISABLED` 状态。gateway 会以数据库中的实时状态为准：`FROZEN` 阻断登录/刷新/鉴权，`TRADE_DISABLED` 阻断普通用户交易写入但保留撤单能力，`WITHDRAW_DISABLED` 阻断钱包提现写入。

用户列表接口 `GET /api/v1/admin/users` 支持 `limit/cursor/sort` 游标分页，排序白名单为 `createdAt.desc`、`createdAt.asc`，响应保留 `users/count` 并额外返回 `nextCursor`、`hasMore`、`sort`、`limit`。

## 会话治理

“用户权限”页会展示用户 refresh session 列表，支持撤销单个会话或强制下线该用户全部有效会话。会话撤销接口位于 gateway 本地后台路径：

- `GET /api/v1/admin/users/{userId}/sessions`
- `POST /api/v1/admin/sessions/{sessionId}/revoke`
- `POST /api/v1/admin/users/{userId}/sessions/revoke`

撤销写操作同样需要审批单，通过后会把匹配 refresh session 标记为 `revoked_at`，用户下一次刷新 token 时会被拒绝。

会话列表支持 `createdAt.desc`、`createdAt.asc` 的 `limit/cursor/sort` 游标分页，响应保留 `sessions/count` 并额外返回 `nextCursor`、`hasMore`、`sort`、`limit`。

## 用户详情聚合

“用户权限”页选择用户后会调用 gateway 本地后台聚合接口：

- `GET /api/v1/admin/users/{userId}/profile?settleAsset=USDT&limit=50`

该接口由 gateway 校验管理员角色后，统一聚合用户基本信息、登录日志、会话、账户余额、产品账户、持仓、账户流水、产品流水、资金划转、普通订单、成交、条件单和风险快照。下游服务不可用时不会拖垮整个详情页，响应会在 `errors` 中返回对应分区的局部失败。

## 客服视图

“客服视图”页面向 `SUPPORT` 角色提供只读用户概览：

- `GET /api/v1/admin/support/users/{userId}/overview?settleAsset=USDT&limit=25`

该接口需要 `admin.support.read` 权限，会聚合用户基础状态、KYC 摘要、资产、持仓、资金划转、订单、成交、条件单和风险快照。它不会返回用户角色、refresh session、登录审计原始记录，也不提供任何写操作。`ADMIN` 默认也具备该权限，`SUPPORT` 默认只能访问该视图和自助 MFA。

客服工单列表 `GET /api/v1/admin/support/tickets` 支持 `updatedAt.desc`、`updatedAt.asc`、`createdAt.desc`、`createdAt.asc` 的 `limit/cursor/sort` 游标分页，响应保留 `tickets/ticketCount` 并额外返回 `nextCursor`、`hasMore`、`sort`、`limit`。工单备注时间线 `GET /api/v1/admin/support/tickets/{ticketId}/notes` 支持 `createdAt.asc`、`createdAt.desc` 游标分页，响应保留 `notes/noteCount` 并返回相同分页元数据。创建工单、追加备注和变更状态需要 `admin.support.write`。

## 合规风控

“合规风控”页通过 gateway 本地后台接口管理用户 KYC、风险标签和 AML case：

- `GET /api/v1/admin/compliance/users`
- `GET /api/v1/admin/compliance/users/{userId}`
- `GET /api/v1/admin/compliance/risk-tags`
- `GET /api/v1/admin/compliance/aml-cases`
- `POST /api/v1/admin/compliance/users/{userId}/kyc`
- `POST /api/v1/admin/compliance/users/{userId}/risk-tags`
- `POST /api/v1/admin/compliance/risk-tags/{tagId}/resolve`
- `POST /api/v1/admin/compliance/users/{userId}/aml-cases`
- `POST /api/v1/admin/compliance/aml-cases/{caseId}/status`

合规用户列表支持 `updatedAt.desc`、`updatedAt.asc` 的 `limit/cursor/sort` 游标分页；风险标签审计支持 `createdAt.desc`、`createdAt.asc`、`updatedAt.desc`、`updatedAt.asc`；AML case 审计支持 `updatedAt.desc`、`updatedAt.asc`、`createdAt.desc`、`createdAt.asc`。响应保留 `users/tags/cases/count` 并额外返回 `nextCursor`、`hasMore`、`sort`、`limit`。页面提供结构化 KYC 审核、风险标签创建、AML case 创建和 AML 状态更新表单，表格操作可回填 caseId/status/riskScore，高级 JSON 请求体仅作为受控补充入口。读接口需要 `admin.compliance.read`，写接口需要 `admin.compliance.write`，并且写操作同样进入敏感操作审批流。审批校验会匹配 method、path、query 和 body hash，防止审批单被挪用到其他用户或其他合规动作。

## 导出中心

“导出中心”页通过 gateway 本地后台接口创建、查询和下载 CSV 导出任务：

- `GET /api/v1/admin/exports`
- `GET /api/v1/admin/exports/{exportId}`
- `POST /api/v1/admin/exports`
- `GET /api/v1/admin/exports/{exportId}/download`

当前导出类型包括 `USERS`、`LOGIN_LOGS`、`ADMIN_OPERATIONS`、`COMPLIANCE_USERS`、`ORDERS`、`TRIGGER_ORDERS`、`MATCH_TRADES`、`ACCOUNT_BALANCES`、`PRODUCT_BALANCES`、`POSITIONS`、`ACCOUNT_LEDGER`、`PRODUCT_LEDGER`、`PRODUCT_TRANSFERS`、`ACCOUNT_ADJUSTMENTS`。任务和结果保存在 gateway 的 `gateway_admin_export_jobs`，结果默认 7 天过期。查询和下载需要 `admin.exports.read`，创建任务需要 `admin.exports.write` 和已批准审批单。

导出任务、查询任务、审批中心、登录日志和管理员操作日志均支持统一游标分页参数：`limit`、`cursor`、`sort`。服务端返回 `nextCursor`、`hasMore`、`sort` 和 `limit`，前端使用“下一页/首页”按钮翻页。导出/查询/审批列表支持 `requestedAt.desc`、`requestedAt.asc`；审计日志支持 `createdAt.desc`、`createdAt.asc`。

## 查询任务

“查询任务”页通过 gateway 本地后台接口创建、查看和维护受控长查询：

- `GET /api/v1/admin/query-tasks`
- `GET /api/v1/admin/query-tasks/limits`
- `GET /api/v1/admin/query-tasks/{queryTaskId}`
- `POST /api/v1/admin/query-tasks`
- `POST /api/v1/admin/query-tasks/archive-expired`

当前白名单查询类型包括 `SYSTEM_OPERATION_LATENCY`、`OUTBOX_BACKLOG`、`APPROVAL_BACKLOG`、`ALERT_DELIVERY_FAILURES`、`ORDER_AUDIT_SEARCH`、`TRIGGER_ORDER_AUDIT_SEARCH`、`MATCH_TRADE_AUDIT_SEARCH`。订单审计类任务会返回订单、条件单和成交的受控 JSON 明细。页面会展示单管理员/全局活跃任务配额、窗口创建配额、保留结果字节数和可归档任务数；归档动作会清空过期或指定完成天数之前的 JSON 结果，任务元数据仍以 `ARCHIVED` 状态保留。读取需要 `admin.queries.read`，创建和归档需要 `admin.queries.write`。

## 管理员 2FA

登录表单支持 6 位 TOTP 动态码。“系统监控”页的“管理员安全”面板支持当前管理员自助绑定、确认和关闭 2FA。相关 gateway 本地后台接口：

- `GET /api/v1/admin/security/mfa`
- `POST /api/v1/admin/security/mfa/enroll`
- `POST /api/v1/admin/security/mfa/confirm`
- `POST /api/v1/admin/security/mfa/disable`

TOTP 密钥在 gateway 数据库中以 AES-GCM 加密保存。生产环境建议设置独立密钥并在管理员完成绑定后强制启用：

```bash
export GATEWAY_MFA_SECRET_ENCRYPTION_KEY='replace-with-32-byte-or-longer-secret'
```

```yaml
surprising:
  gateway:
    security:
      require-admin-mfa: true
```

## 权限点 RBAC

“权限治理”页通过 gateway 本地后台接口管理角色权限点：

- `GET /api/v1/admin/roles`
- `GET /api/v1/admin/permissions`
- `GET /api/v1/admin/roles/{roleCode}/permissions`
- `POST /api/v1/admin/roles/{roleCode}/permissions`

gateway 会在服务端校验权限点：本地 `/api/v1/admin/...` 路径由权限 filter 映射到 `admin.support.read`、`admin.users.read`、`admin.users.write`、`admin.audit.read`、`admin.market.read`、`admin.alerts.read/write`、`admin.trading.read`、`admin.reports.read/write`、`admin.compliance.read/write`、`admin.exports.read/write`、`admin.permissions.write` 等权限；后台代理 `/api/v1/admin/gateway/{service}` 会按 `admin.gateway.{service}.read/write` 校验。`SUPER_ADMIN` 默认拥有 `admin.*`，`ADMIN` 默认拥有当前运营权限但不能修改权限点，`SUPPORT` 默认只拥有 `admin.support.read` 和 `admin.security.mfa`。

## 账户资产

“账户资产”页通过统一后台 gateway 调用 `account` 服务：

- `GET /api/v1/admin/gateway/account/balances`
- `GET /api/v1/admin/gateway/account/product-balances`
- `GET /api/v1/admin/gateway/account/positions`
- `GET /api/v1/admin/gateway/account/ledger`
- `GET /api/v1/admin/gateway/account/product-ledger`
- `GET /api/v1/admin/gateway/account/transfers`
- `GET /api/v1/admin/gateway/account/adjustments`
- `POST /api/v1/admin/gateway/account/balance-adjustments`
- `POST /api/v1/admin/gateway/account/product-balance-adjustments`

账户流水、产品账户流水、产品划转和人工调整追溯列表均支持统一 `limit/cursor/sort` 游标分页；排序白名单为 `createdAt.desc`、`createdAt.asc`。页面为四张明细表分别维护独立 cursor，支持“下一页/首页”翻页，不会因为某一张表翻页重载其他表的游标。

余额调整写请求会进入敏感操作审批；通过后 account 服务会在资金变更同一事务中记录 `account_admin_balance_adjustments`，页面可按用户、资产、管理员、调整类型和 Reference ID 查询人工调整追溯。

同一页面的资产估值和日终快照使用 gateway 本地后台报表接口：

- `GET /api/v1/admin/reports/account-assets/valuation`
- `POST /api/v1/admin/reports/account-assets/snapshots`
- `GET /api/v1/admin/reports/account-assets/snapshots`

估值报表使用 `account_asset_scales` 和 `price_exchange_rates` 把各资产余额折算成指定计价资产；缺少汇率的资产会保留在表格并标记为 `MISSING`，不会静默计入合计。估值行支持 `valuationValue.desc`、`valuationValue.asc` 的 `limit/cursor/sort` 游标分页。
日终快照查询支持 `snapshotDate.desc`、`snapshotDate.asc` 的 `limit/cursor/sort` 游标分页；页面为估值和快照两张表分别维护 cursor，响应继续保留 `rows/snapshots/count` 并额外读取 `nextCursor`、`hasMore`、`sort`、`limit`。
gateway 会按 `surprising.gateway.reports.account-asset-snapshots` 配置自动生成日终快照，默认在 UTC 00:05 生成前一日 `USDT` 估值快照；生成后会对比上一日同账户类型/资产的总值，超过阈值时写入 `SYSTEM` 告警 `ACCOUNT_ASSET_SNAPSHOT_DIFF_PPM` 并进入告警通知投递。账户资产页会展示当前未解决的快照差异告警。

## 管理员 IP 白名单

gateway 支持对所有 `/api/v1/admin/...` 路径做管理员来源 IP 白名单控制，默认空列表表示不限制。生产环境建议只允许办公网、堡垒机或 VPN 出口：

```yaml
surprising:
  gateway:
    security:
      admin-ip-allowlist:
        - 10.8.0.0/16
        - 203.0.113.10
```

白名单支持精确 IP 和 CIDR，优先读取 `X-Forwarded-For` 的第一个 IP；部署在反向代理后时应确保该请求头只由可信代理写入。

## 授权管理员

先通过 gateway 注册或已有账号创建用户，然后在 `surprising_exchange` 数据库执行：

```sql
INSERT INTO gateway_roles (role_code, role_name)
VALUES ('SUPPORT', 'Customer support read-only operator'), ('ADMIN', 'Admin operator'), ('SUPER_ADMIN', 'Super administrator')
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO gateway_user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM gateway_users u
JOIN gateway_roles r ON r.role_code = 'SUPER_ADMIN'
WHERE u.username = 'admin'
ON CONFLICT (user_id, role_id) DO NOTHING;
```

## 本地开发

```bash
pnpm install
pnpm dev
```

默认 gateway 地址是 `http://localhost:9094`，可通过 `.env` 覆盖：

```bash
VITE_GATEWAY_BASE_URL=http://localhost:9094
```

如果启用钱包运营页，需要同时启动桌面上的 `surprising-wallet`：

```bash
cd /Users/atomex/Desktop/surprising-wallet
mvn -pl backendservices/wallet-sig1 -am spring-boot:run
mvn -pl backendservices/wallet-sig2 -am spring-boot:run
mvn -pl backendservices/wallet-parent/wallet-server -am spring-boot:run
```

gateway 访问钱包后台配置接口时会在服务端注入 Basic Auth，不会把钱包后台密码发给浏览器。启动 gateway 前配置：

```bash
export SW_WALLET_ADMIN_USERNAME=admin
export SW_WALLET_ADMIN_PASSWORD='your-wallet-admin-password'
```

钱包运营页通过统一后台 gateway 调用 `wallet-admin` 服务：

- `GET /api/v1/admin/gateway/wallet-admin/finance/summary`
- `GET /api/v1/admin/gateway/wallet-admin/operations/overview`
- `GET /api/v1/admin/gateway/wallet-admin/operations/addresses`
- `GET /api/v1/admin/gateway/wallet-admin/operations/balances`
- `GET /api/v1/admin/gateway/wallet-admin/operations/exceptions`
- `GET /api/v1/admin/gateway/wallet-admin/finance/deposits`
- `GET /api/v1/admin/gateway/wallet-admin/finance/withdrawals`
- `GET /api/v1/admin/gateway/wallet-admin/finance/withdrawal-reviews`
- `POST /api/v1/admin/gateway/wallet-admin/finance/withdrawals/{chain}/{orderNo}/approve`
- `POST /api/v1/admin/gateway/wallet-admin/finance/withdrawals/{chain}/{orderNo}/reject`

地址账本、非零余额账户、充值/提现异常流水、充值记录、提现记录和提现审核审计均支持统一 `limit/cursor/sort` 游标分页。operations/finance 主列表使用 `updatedAt.desc`、`updatedAt.asc`，提现审核审计使用 `createdAt.desc`、`createdAt.asc`；页面为每张表独立维护 cursor。

`surprising-wallet` 的 `wallet_system_config.withdrawal.admin.approval.required=true` 后，用户提现会先冻结账本金额并停在 `PENDING_REVIEW`；后台审核通过后才转为 `FROZEN` 进入签名广播，拒绝会释放冻结金额。审核通过/拒绝会写入 `withdrawal_review_audit`，后台可按链、资产、审核结果、管理员、用户和订单查询。`wallet-admin` 写请求仍由 gateway 做后台角色鉴权、权限点、操作审计和敏感操作审批。

## 风控强平

“风控强平”页通过统一后台 gateway 调用 `risk-admin`、`liquidation-admin` 和 `adl` 的 admin namespace：

- `GET /api/v1/admin/gateway/risk-admin/high-risk-accounts`
- `GET /api/v1/admin/gateway/risk-admin/liquidation-candidates`
- `GET /api/v1/admin/gateway/risk-admin/rules`
- `POST /api/v1/admin/gateway/risk-admin/rules/{ruleCode}`
- `GET /api/v1/admin/gateway/liquidation-admin/orders`
- `GET /api/v1/admin/gateway/liquidation-admin/candidates/{candidateId}/timeline`
- `POST /api/v1/admin/gateway/liquidation-admin/candidates/{candidateId}/cancel`
- `GET /api/v1/admin/gateway/adl/admin/queue`
- `GET /api/v1/admin/gateway/adl/admin/events`

爆仓候选和高风险账户支持 `eventTime.desc`、`eventTime.asc`；强平订单和 ADL 事件支持 `createdAt.desc`、`createdAt.asc`；ADL 队列使用实时排名游标 `priorityScorePpm.desc`。页面为高风险账户、爆仓候选、强平订单、ADL 队列和 ADL 事件分别维护独立 cursor。

## 资金费与保险基金

“资金费与保险基金”页通过统一后台 gateway 调用 `funding` 和 `insurance-admin` 服务：

- `GET /api/v1/admin/gateway/funding/admin/rates/latest`
- `GET /api/v1/admin/gateway/funding/admin/rates/history`
- `GET /api/v1/admin/gateway/funding/admin/settlements/latest`
- `GET /api/v1/admin/gateway/funding/admin/payments`
- `GET /api/v1/admin/gateway/insurance-admin/balances`
- `GET /api/v1/admin/gateway/insurance-admin/ledger`
- `GET /api/v1/admin/gateway/insurance-admin/coverages`
- `POST /api/v1/admin/gateway/insurance-admin/fund-adjustments`

资金费历史支持 `eventTime.desc`、`eventTime.asc`；资金费付款、保险基金流水和亏损覆盖支持 `createdAt.desc`、`createdAt.asc`。四张明细表均使用 `limit/cursor/sort` 游标分页并在页面独立维护 cursor。

## 费率配置

“费率配置”页通过统一后台 gateway 调用 `trading-fees` 服务，gateway 后台路由会转发到 provider 的 `/api/v1/admin/trading/fees/...`：

- `GET /api/v1/admin/gateway/trading-fees/schedules`
- `POST /api/v1/admin/gateway/trading-fees/schedules`
- `POST /api/v1/admin/gateway/trading-fees/schedules/{feeScheduleId}/disable`
- `GET /api/v1/admin/gateway/trading-fees/tiers`
- `POST /api/v1/admin/gateway/trading-fees/tiers`
- `POST /api/v1/admin/gateway/trading-fees/tiers/refresh`
- `POST /api/v1/admin/gateway/trading-fees/tiers/refresh-active`
- `GET /api/v1/admin/gateway/trading-fees/tiers/users/{userId}`

费率计划列表支持 `updatedAt.desc`、`updatedAt.asc`、`createdAt.desc`、`createdAt.asc`、`effectiveTime.desc`、`effectiveTime.asc`；VIP 档位列表支持 `priority.desc`、`priority.asc`。两张表均使用 `limit/cursor/sort` 游标分页并在页面独立维护 cursor，响应保留 `schedules/tiers/count` 并额外读取 `nextCursor`、`hasMore`、`sort`、`limit`。

页面提供结构化费率计划和 VIP 档位表单，支持从表格点击回填、更新已有计划、禁用计划、刷新活跃用户 VIP，并保留高级 JSON 请求体入口。费率计划写入要求 `userId` 为正数；`symbol` 为空表示用户全局覆盖。所有费率写操作属于敏感操作，需要 gateway 审批流放行。

## 做市管理

“做市管理”页通过统一后台 gateway 调用 `market-maker` 服务，gateway 后台路由会转发到 provider 的 `/api/v1/admin/market-maker/...`：

- `GET /api/v1/admin/gateway/market-maker/strategies`
- `GET /api/v1/admin/gateway/market-maker/metrics?limit=200`
- `GET /api/v1/admin/gateway/market-maker/strategies/{strategyId}/config`
- `POST /api/v1/admin/gateway/market-maker/strategies/{strategyId}/config`
- `POST /api/v1/admin/gateway/market-maker/strategies/{strategyId}/pause`
- `POST /api/v1/admin/gateway/market-maker/strategies/{strategyId}/resume`
- `POST /api/v1/admin/gateway/market-maker/run-once`
- `GET /api/v1/admin/gateway/market-maker/pnl-attribution`
- `GET /api/v1/admin/gateway/market-maker/strategy-logs`

页面展示策略运行状态、库存占用、owned live 挂单数量、目标报价数、缺失报价数、陈旧报价数、偏离目标报价数、盘口价差、报价覆盖率、做市收益归因和策略运行日志。异常聚合覆盖无 live 报价、缺失目标报价、陈旧报价、偏离目标报价、库存超限、合约非交易状态和指标采集失败。收益归因可按 strategy、symbol、account 和窗口筛选，展示做市订单数、拒单数、Maker/Taker 成交、成交量、名义金额、净手续费、当前已实现盈亏和库存；策略日志展示执行结果、跳过原因、错误信息和 TraceId，并支持 `createdAt.desc`、`createdAt.asc` 的 `limit/cursor/sort` 游标分页。暂停、恢复和手动运行一次仍属于敏感写操作，需要 gateway 审批流放行。

策略参数编辑会写入 `market_maker_strategy_overrides`，只覆盖可安全热更新的报价/风险参数：`enabled`、`baseQuantitySteps`、`marginMode`、`spreadTicks`、`levelSpacingTicks`、`maxInventorySteps`、`maxInventorySkewPpm`、`orderLevels`。账号和交易对仍由部署配置管理。保存覆盖和清除覆盖都属于敏感写操作，需要审批。

## 产品市场

“产品市场”页面会同时调用 gateway 后台代理和 gateway 本地市场健康接口：

- `GET /api/v1/admin/gateway/instrument-admin/list`
- `GET /api/v1/admin/gateway/instrument-admin/{symbol}`
- `GET /api/v1/admin/gateway/instrument-admin/{symbol}/versions`
- `POST /api/v1/admin/gateway/instrument-admin/{symbol}/status`
- `POST /api/v1/admin/gateway/instrument-admin/upsert`
- `GET /api/v1/admin/market/health?period=1m&staleSeconds=120&limit=100`

产品列表使用 instrument provider 的 `/api/v1/instruments/admin/...` 路径，前端不直接调用 public instrument API。当前版本列表支持 `symbol.asc`、`symbol.desc`、`updatedAt.desc`、`updatedAt.asc`、`createdAt.desc`、`createdAt.asc` 的 `limit/cursor/sort` 游标分页；版本历史支持 `version.desc`、`version.asc`。页面支持结构化编辑产品基础信息、交易规则、风险参数、资金费、默认手续费和状态切换，同时保留高级 JSON 编辑。产品 upsert 和状态切换属于敏感写操作，默认需要审批单。

市场健康接口使用 `admin.market.read` 权限，聚合 index price、mark price、行情源 component、K 线更新时间、源延迟和 mark-index 偏离。页面会展示价格链路健康、行情源状态和局部 warning。

## 告警中心

“告警中心”页面调用 gateway 本地后台接口：

- `GET /api/v1/admin/alerts/rules`
- `POST /api/v1/admin/alerts/rules`
- `POST /api/v1/admin/alerts/rules/{ruleId}`
- `POST /api/v1/admin/alerts/rules/{ruleId}/enable`
- `POST /api/v1/admin/alerts/rules/{ruleId}/disable`
- `GET /api/v1/admin/alerts/events`
- `POST /api/v1/admin/alerts/events/{eventId}/acknowledge`
- `GET /api/v1/admin/alerts/channels`
- `POST /api/v1/admin/alerts/channels`
- `POST /api/v1/admin/alerts/channels/{channelId}`
- `POST /api/v1/admin/alerts/channels/{channelId}/enable`
- `POST /api/v1/admin/alerts/channels/{channelId}/disable`
- `GET /api/v1/admin/alerts/deliveries`
- `POST /api/v1/admin/alerts/deliveries/{deliveryId}/retry`
- `POST /api/v1/admin/alerts/evaluate`

规则、事件、通知渠道和投递记录分别落在 gateway 的 `gateway_admin_alert_rules`、`gateway_admin_alert_events`、`gateway_admin_alert_channels`、`gateway_admin_alert_deliveries`。规则和通知渠道支持 `updatedAt.desc`、`updatedAt.asc`、`createdAt.desc`、`createdAt.asc`；事件列表支持 `lastSeenAt.desc`、`lastSeenAt.asc`、`createdAt.desc`、`createdAt.asc`；投递记录支持 `createdAt.desc`、`createdAt.asc`、`updatedAt.desc`、`updatedAt.asc`。四张表均使用 `limit/cursor/sort` 游标分页。读接口需要 `admin.alerts.read`，写接口需要 `admin.alerts.write`；规则和渠道新增、更新、启用和停用默认还需要匹配的已批准审批单。页面支持结构化维护规则编码、域、metric key、目标、比较条件、阈值、窗口、冷却、严重级别和启用状态，也支持结构化维护 WEBHOOK/EMAIL/SLACK/PAGERDUTY/OPS 通知渠道、域过滤、最低级别和 endpoint；高级 JSON 请求体保留用于审计和扩展字段。当前手动评估支持系统 outbox/审批/API 失败率、市场价格链路和交易拒绝率等固定 metric key；触发告警会为匹配的启用渠道创建 `PENDING` 投递记录，页面可确认 OPEN 事件并重试失败/跳过的投递。

## 系统监控

“系统监控”页面调用 gateway 本地后台接口：

- `GET /api/v1/admin/system/routes`
- `GET /api/v1/admin/system/health`
- `GET /api/v1/admin/system/metrics`
- `GET /api/v1/admin/system/observability`

gateway 会根据已配置的普通路由和后台路由，对各后端 `baseUrl + /actuator/health` 做连通性巡检，并在页面展示 UP/DOWN、延迟、路由目标和 Basic Auth 是否已配置。`/metrics` 会聚合 gateway 数据库里的 outbox backlog、后台 API 错误率、登录失败和审批积压。`/observability` 会聚合 Kafka consumer lag、WebSocket 连接/订阅统计和各后端 `/actuator/prometheus` 抓取状态，使用 `admin.system.read` 权限。

Kafka lag 查询默认关闭，生产环境可在 gateway 开启：

```bash
export ADMIN_KAFKA_LAG_ENABLED=true
export ADMIN_KAFKA_BOOTSTRAP_SERVERS='kafka-1:9092,kafka-2:9092'
```

## 订单运营

“订单审计”页面会先调用 gateway 本地聚合接口：

- `GET /api/v1/admin/trading/metrics?windowMinutes=1440&limit=20`

该接口使用 `admin.trading.read` 权限，聚合订单流、成交量、撮合拒绝率、条件单积压、持仓集中度和 Symbol 运营排名，避免页面为了统计跨服务扫明细。

明细查询仍通过 `trading-orders` 后台服务路由查询全量订单、成交、订单事件和撮合时间线，并支持撤单影响预览、后台单笔撤单、按筛选条件批量撤单和按 Symbol 撤单。页面也通过 `trading-trigger` 后台服务路由查询条件单全量审计和触发时间线。订单、条件单和成交审计列表均支持统一 `limit/cursor/sort` 游标分页；订单/条件单支持 `createdAt.desc`、`createdAt.asc`，成交支持 `eventTime.desc`、`eventTime.asc`。撤单写请求会进入敏感操作审批流，通过后才会转发到订单服务的 `/api/v1/admin/trading/orders/...` 接口。

## 审计追踪

“审计日志”页面支持 TraceId 全链路查询，调用 gateway 本地后台接口：

- `GET /api/v1/admin/traces/{traceId}?limit=50`

该接口使用 `admin.traces.read` 权限，聚合交易触发单、订单事件、撮合结果、成交、交易/account/risk outbox、后台操作日志和审批消费记录，并按事件时间生成排障时间线。

## 构建

```bash
pnpm build
```
