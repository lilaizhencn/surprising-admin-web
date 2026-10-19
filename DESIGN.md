# Surprising Operations Console Design System

## 0. Research Log

- Embedded references: routed the soft high-craft surface rules for future-tech materials and the institutional crypto-finance reference for trust, numeric hierarchy, and dense data handling.
- Existing-surface audit: preserved the current operations console’s dark/light variables, fixed sidebar, cursor pagination, and `lucide-react` icon vocabulary as the baseline.
- Product direction: an observability cockpit. Deep graphite surfaces, cool cyan navigation state, and amber/red only for operational risk. Visual depth comes from nested panels and hairline rims, not decorative gradients.

## 1. Personas and principles

- Operations administrator: completes user, KYC, wallet, risk, approval, and audit tasks with clear permission boundaries.
- Compliance reviewer: needs identity evidence, decision history, and immutable audit context without destructive shortcuts.
- Incident operator: needs current state, stale-data warnings, and safe retries that preserve idempotency.

Principles: least privilege is visible, every write has a reason, every money state has a timestamp, and review beats speed when funds are at risk.

## 2. Tokens

```css
--ops-graphite-950: #080b10;
--ops-graphite-900: #10161e;
--ops-graphite-800: #19222d;
--ops-fog-050: #f5f7fa;
--ops-cyan-500: #49d7e8;
--ops-amber-500: #f0b95a;
--ops-green-500: #43d39e;
--ops-red-500: #f06e78;
--ops-text-primary: #eef5fb;
--ops-text-secondary: #9eabbc;
--ops-border: rgba(170, 194, 214, 0.16);
--ops-radius-control: 10px;
--ops-radius-panel: 16px;
--ops-space-1: 4px;
--ops-space-2: 8px;
--ops-space-3: 12px;
--ops-space-4: 16px;
--ops-space-6: 24px;
--ops-space-8: 32px;
```

Use tabular numerals for IDs, amounts, rates, timestamps, and risk metrics. Use compact labels for tables and full explanations in detail panels.

## 3. Materials and elevation

- Navigation: opaque graphite with a cyan active rail and clear keyboard focus.
- Data surface: graphite-900 core, graphite-800 outer bezel, subtle rim, no large blur.
- Destructive/financial write: a confirmation drawer with target, impact, approver, audit reason, and idempotency key.

## 4. Layout and responsive behavior

- Desktop: fixed navigation, scrollable content shell, table/detail split only when both panes have independent scroll ownership.
- Tablet: navigation collapses; filters become a horizontal scroll row.
- Mobile: table rows become cards with an explicit “open detail” action; no critical action is hidden behind hover.

## 5. Reusable primitives and states

- `OpsPanel`: `default`, `loading`, `stale`, `error`.
- `DataTable`: `empty`, `loading`, `partial`, `ready`, `error`; stable column alignment.
- `WriteAction`: `allowed`, `requires-approval`, `pending`, `approved`, `rejected`, `failed`.
- `AuditTimeline`: `created`, `reviewed`, `approved`, `rejected`, `executed`, `compensated`.
- `RiskLabel`: semantic tone plus text, never color-only.

## 6. Motion and interaction

Motion communicates state changes only: drawer enter/exit, row selection, pending-to-complete transitions. Respect reduced motion and never animate table layout.

## 7. Accessibility and content

All write actions expose permission and approval requirements before submit. Focus remains inside dialogs. Error text names the recoverable action. Amounts include asset and valuation basis.

## 8. Accepted debt and handoff

Legacy pages are progressively migrated; new security, compliance, wallet, and approval pages must use this contract. Visual QA must cover empty/loading/error/pending/approval states at 375/768/1280.
