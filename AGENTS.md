# AGENTS.md

Surprising Admin Web 是管理后台。改动要优先保证风险、资金、订单、产品线状态展示准确。

## 技术栈

- React + TypeScript + Vite。
- 常用命令：
  - `npm run lint`
  - `npm run build`
  - `npm run dev -- --host 0.0.0.0`

## 后台业务规则

- 管理后台展示的数据必须带产品线维度，不能把现货、永续、交割、期权混在一起。
- 涉及资金、风险、强平、交割、行权、用户资产的页面，字段含义要和后端 API 保持一致。
- 高风险操作要有明确确认和错误反馈，不要为了 UI 简化省略关键状态。
- 不要用 mock 数据替代真实接口数据，除非明确是离线演示。

## UI 和文案

- 保持后台风格克制、信息密度合理，优先表格、筛选、状态、审计字段。
- 不要出现 OKX、欧易、Binance 等硬编码品牌。
- 注意暗色/亮色主题、滚动条、长文本、移动端窄屏下的可读性。

## 验证和提交

- 提交前跑 `npm run lint` 和 `npm run build`。
- 资金、风控、订单相关改动要和后端接口字段核对。
- 通过验证后 commit and push。
- 不提交 `.DS_Store`、`dist/`、`node_modules/`。

