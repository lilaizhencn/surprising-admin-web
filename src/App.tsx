import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Database,
  Download,
  FileText,
  Gauge,
  LifeBuoy,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Scale,
  Search,
  Server,
  Shield,
  SlidersHorizontal,
  Users,
  WalletCards
} from "lucide-react";
import {
  accountAdjustments,
  type AdminApprovalDecision,
  type AdminApprovalRequestContext,
  accountAssetSnapshots,
  accountAssetValuation,
  adminUsers,
  adminPermissions,
  adminRoles,
  acknowledgeAlertEvent,
  alertChannels,
  alertDeliveries,
  alertEvents,
  alertRules,
  approvalRequests,
  approveApproval,
  confirmMfa,
  complianceAmlCases,
  complianceRiskTags,
  complianceUser,
  complianceUsers,
  archiveExpiredQueryTasks,
  createExportJob,
  createQueryTask,
  createAlertRule,
  createAmlCase,
  createAccountAssetSnapshot,
  createAlertChannel,
  createRiskTag,
  disableMfa,
  disableAlertChannel,
  disableAlertRule,
  downloadExportFile,
  enableAlertRule,
  enableAlertChannel,
  enrollMfa,
  evaluateAlerts,
  exportJobs,
  gatewayGet,
  gatewayPatch,
  gatewayPost,
  getRolePermissions,
  login,
  loginLogs,
  instrumentLatest,
  instruments as instrumentList,
  instrumentVersions,
  marketHealth,
  mfaStatus,
  operationLogs,
  queryTask,
  queryTaskLimits,
  queryTasks,
  rejectApproval,
  replaceRolePermissions,
  resolveRiskTag,
  revokeSession,
  revokeUserSessions,
  replaceUserRoles,
  addSupportTicketNote,
  createSupportTicket,
  supportTicketNotes,
  supportTickets,
  supportUserOverview,
  systemHealth,
  systemMetrics,
  systemObservability,
  systemRoutes,
  traceTimeline,
  tradingMetrics,
  updateAmlCaseStatus,
  updateAlertRule,
  updateAlertChannel,
  updateInstrumentStatus,
  updateKyc,
  updateSupportTicketStatus,
  updateUserStatus,
  upsertInstrument,
  userProfile,
  userSessions,
  approveWalletWithdrawal,
  rejectWalletWithdrawal,
  retryAlertDelivery,
  setApprovalRequestHandler,
  walletOperationAddresses,
  walletOperationBalances,
  walletOperationExceptions,
  walletOperationsOverview,
  walletFinanceDeposits,
  walletFinanceSummary,
  walletFinanceWithdrawalReviews,
  walletFinanceWithdrawals
} from "./api/admin";
import { ApiError, loadSession, saveSession } from "./api/client";
import { compactNumber, formatDate, formatValue } from "./config";
import type {
  AuthSession,
  AuthenticatedUser,
  BalanceRecord,
  Instrument,
  OrderRecord,
  PositionRecord,
  ProductLine,
  RouteKey,
  StatusTone,
  UnknownRecord
} from "./types";

const NAV = [
  { key: "dashboard", label: "总览", icon: LayoutDashboard },
  { key: "support", label: "客服视图", icon: LifeBuoy },
  { key: "users", label: "用户权限", icon: Users },
  { key: "markets", label: "产品市场", icon: BarChart3 },
  { key: "orders", label: "订单审计", icon: ClipboardList },
  { key: "accounts", label: "账户资产", icon: WalletCards },
  { key: "wallet", label: "钱包运营", icon: Database },
  { key: "compliance", label: "合规风控", icon: Scale },
  { key: "risk", label: "风控强平", icon: Gauge },
  { key: "funding", label: "资金保险", icon: CircleDollarSign },
  { key: "fees", label: "费率配置", icon: SlidersHorizontal },
  { key: "maker", label: "做市管理", icon: Activity },
  { key: "security", label: "权限治理", icon: BadgeCheck },
  { key: "approvals", label: "审批中心", icon: CheckCircle2 },
  { key: "exports", label: "导出中心", icon: Download },
  { key: "queries", label: "查询任务", icon: BookOpen },
  { key: "alerts", label: "告警中心", icon: Bell },
  { key: "system", label: "系统监控", icon: Server },
  { key: "audit", label: "审计日志", icon: FileText }
] satisfies Array<{ key: RouteKey; label: string; icon: typeof LayoutDashboard }>;

const USER_STATUSES = ["NORMAL", "FROZEN", "TRADE_DISABLED", "WITHDRAW_DISABLED"];
const INSTRUMENT_TYPES = ["SPOT", "PERPETUAL", "DELIVERY", "OPTION"];
const CONTRACT_TYPES = ["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "VANILLA_OPTION"];
const INSTRUMENT_STATUSES = ["PRE_TRADING", "TRADING", "HALT", "SETTLING", "CLOSED"];
const OPTION_TYPES = ["CALL", "PUT"];
const OPTION_EXERCISE_STYLES = ["EUROPEAN", "AMERICAN"];
const SETTLEMENT_METHODS = ["CASH", "PHYSICAL"];
const CONTRACT_TYPES_BY_INSTRUMENT: Record<string, string[]> = {
  SPOT: ["SPOT"],
  PERPETUAL: ["LINEAR_PERPETUAL", "INVERSE_PERPETUAL"],
  DELIVERY: ["LINEAR_DELIVERY", "INVERSE_DELIVERY"],
  OPTION: ["VANILLA_OPTION"]
};
const FEE_STATUSES = ["ACTIVE", "DISABLED"];
const FEE_SOURCE_TYPES = ["USER_OVERRIDE", "VIP", "MARKET_MAKER", "PROMOTION", "RISK_OVERRIDE"];
const FEE_TIER_QUALIFICATION_MODES = ["VOLUME_ONLY", "BALANCE_ONLY", "VOLUME_OR_BALANCE", "VOLUME_AND_BALANCE"];
const KYC_LEVELS = ["NONE", "BASIC", "ADVANCED", "INSTITUTIONAL"];
const KYC_STATUSES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"];
const RISK_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const RISK_TAG_STATUSES = ["ACTIVE", "RESOLVED"];
const AML_STATUSES = ["OPEN", "REVIEWING", "ESCALATED", "RESTRICTED", "CLEARED", "CLOSED"];
const ORDER_STATUSES = ["", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_REQUESTED", "CANCELED", "FILLED", "REJECTED"];
const TRIGGER_ORDER_STATUSES = ["", "PENDING", "TRIGGERING", "TRIGGERED", "TRIGGER_FAILED", "CANCELED", "EXPIRED"];
const AUDIT_STATUS_FILTERS = Array.from(new Set([...ORDER_STATUSES, ...TRIGGER_ORDER_STATUSES]));
const ACCOUNT_TYPES = ["", "FUNDING", "SPOT", "USDT_PERPETUAL", "COIN_PERPETUAL", "USDT_DELIVERY", "COIN_DELIVERY", "OPTION"];
const PRODUCT_LINES = ["", "SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"] as const;
const ACCOUNT_TYPE_PRODUCT_LINE: Record<string, ProductLine> = {
  SPOT: "SPOT",
  USDT_PERPETUAL: "LINEAR_PERPETUAL",
  COIN_PERPETUAL: "INVERSE_PERPETUAL",
  USDT_DELIVERY: "LINEAR_DELIVERY",
  COIN_DELIVERY: "INVERSE_DELIVERY",
  OPTION: "OPTION"
};
const productLineForAccountType = (accountType: string) => ACCOUNT_TYPE_PRODUCT_LINE[accountType] ?? "";
const isFundingProductLine = (productLine: string) => !productLine || productLine === "LINEAR_PERPETUAL" || productLine === "INVERSE_PERPETUAL";
function productLineForInstrument(instrument?: Pick<Instrument, "instrumentType" | "contractType">): ProductLine {
  if (instrument?.instrumentType === "SPOT" || instrument?.contractType === "SPOT") return "SPOT";
  if (instrument?.instrumentType === "OPTION" || instrument?.contractType === "VANILLA_OPTION") return "OPTION";
  if (instrument?.contractType === "LINEAR_DELIVERY") return "LINEAR_DELIVERY";
  if (instrument?.contractType === "INVERSE_DELIVERY") return "INVERSE_DELIVERY";
  if (instrument?.contractType === "INVERSE_PERPETUAL" || instrument?.contractType === "INVERSE") return "INVERSE_PERPETUAL";
  return "LINEAR_PERPETUAL";
}
const WALLET_WITHDRAWAL_STATUSES = [
  "",
  "PENDING_REVIEW",
  "FROZEN",
  "SIGNING",
  "SENT",
  "CONFIRMING",
  "CONFIRMED",
  "FAILED",
  "BROADCAST_UNKNOWN",
  "REJECTED"
];
const WALLET_OPERATION_EVENT_TYPES = ["", "DEPOSIT", "WITHDRAWAL", "COLLECTION"];
const WALLET_OPERATION_EXCEPTION_STATUSES = [
  "",
  "PENDING_REVIEW",
  "DETECTED",
  "CREATED",
  "SIGNING",
  "SENT",
  "FAILED",
  "BROADCAST_UNKNOWN",
  "REJECTED"
];
const EXPORT_TYPES = [
  "USERS",
  "LOGIN_LOGS",
  "ADMIN_OPERATIONS",
  "COMPLIANCE_USERS",
  "ORDERS",
  "TRIGGER_ORDERS",
  "MATCH_TRADES",
  "ACCOUNT_BALANCES",
  "PRODUCT_BALANCES",
  "POSITIONS",
  "ACCOUNT_LEDGER",
  "PRODUCT_LEDGER",
  "PRODUCT_TRANSFERS",
  "ACCOUNT_ADJUSTMENTS"
];
const EXPORT_STATUSES = ["", "PENDING", "RUNNING", "SUCCEEDED", "FAILED"];
const ALERT_DOMAINS = ["", "SYSTEM", "MARKET", "TRADING", "RISK", "WALLET"];
const ALERT_SEVERITIES = ["", "INFO", "WARN", "CRITICAL"];
const ALERT_EDIT_DOMAINS = ["SYSTEM", "MARKET", "TRADING", "RISK", "WALLET"];
const ALERT_EDIT_SEVERITIES = ["INFO", "WARN", "CRITICAL"];
const ALERT_OPERATORS = ["GT", "GTE", "LT", "LTE", "EQ", "NE"];
const ALERT_CHANNEL_TYPES = ["WEBHOOK", "EMAIL", "SLACK", "PAGERDUTY", "OPS"];
const ALERT_STATUSES = ["", "OPEN", "ACKNOWLEDGED", "RESOLVED"];
const ALERT_DELIVERY_STATUSES = ["", "PENDING", "SENT", "FAILED", "SKIPPED"];
const ALERT_RULE_TEMPLATE = {
  ruleCode: "MARK_DEVIATION_WARN",
  ruleName: "Mark/index deviation",
  domain: "MARKET",
  metricKey: "MARK_INDEX_DEVIATION_PPM",
  target: "",
  conditionOperator: "GT",
  thresholdValue: 5000,
  severity: "WARN",
  enabled: true,
  windowSeconds: 300,
  cooldownSeconds: 300,
  description: "Trigger when mark price deviates from index price by more than 0.5%."
};
const ALERT_CHANNEL_TEMPLATE = {
  channelCode: "OPS_WEBHOOK",
  channelName: "Ops webhook",
  channelType: "WEBHOOK",
  enabled: true,
  domain: "",
  minSeverity: "WARN",
  endpoint: "https://ops.example.com/alerts",
  description: "Primary operations alert notification channel."
};
const EXPORT_PARAM_TEMPLATES: Record<string, Record<string, string>> = {
  USERS: { query: "", status: "", limit: "1000" },
  LOGIN_LOGS: { userId: "", result: "", limit: "1000" },
  ADMIN_OPERATIONS: { adminUserId: "", service: "", method: "", success: "", limit: "1000" },
  COMPLIANCE_USERS: { userId: "", kycStatus: "", tagCode: "", limit: "1000" },
  ORDERS: { userId: "", orderId: "", symbol: "", status: "", createdAfter: "", createdBefore: "", limit: "1000" },
  TRIGGER_ORDERS: { userId: "", triggerOrderId: "", symbol: "", status: "", createdAfter: "", createdBefore: "", limit: "1000" },
  MATCH_TRADES: { userId: "", orderId: "", symbol: "", takerSide: "", createdAfter: "", createdBefore: "", limit: "1000" },
  ACCOUNT_BALANCES: { userId: "", asset: "", nonZeroOnly: "true", limit: "1000" },
  PRODUCT_BALANCES: { userId: "", accountType: "", asset: "", nonZeroOnly: "true", limit: "1000" },
  POSITIONS: { userId: "", symbol: "", marginMode: "", openOnly: "true", limit: "1000" },
  ACCOUNT_LEDGER: { userId: "", asset: "", symbol: "", orderId: "", referenceType: "", createdAfter: "", createdBefore: "", limit: "1000" },
  PRODUCT_LEDGER: { userId: "", accountType: "", asset: "", referenceType: "", createdAfter: "", createdBefore: "", limit: "1000" },
  PRODUCT_TRANSFERS: { userId: "", accountType: "", asset: "", status: "", createdAfter: "", createdBefore: "", limit: "1000" },
  ACCOUNT_ADJUSTMENTS: {
    adminUserId: "",
    userId: "",
    adjustmentKind: "",
    accountType: "",
    asset: "",
    referenceId: "",
    createdAfter: "",
    createdBefore: "",
    limit: "1000"
  }
};
const QUERY_TASK_PARAM_TEMPLATES: Record<string, Record<string, string>> = {
  SYSTEM_OPERATION_LATENCY: { service: "", windowMinutes: "1440", limit: "100" },
  OUTBOX_BACKLOG: {},
  APPROVAL_BACKLOG: { service: "", limit: "100" },
  ALERT_DELIVERY_FAILURES: { status: "", limit: "100" },
  ORDER_AUDIT_SEARCH: {
    userId: "",
    orderId: "",
    clientOrderId: "",
    symbol: "",
    status: "",
    side: "",
    marginMode: "",
    orderType: "",
    createdAfter: "",
    createdBefore: "",
    limit: "1000"
  },
  TRIGGER_ORDER_AUDIT_SEARCH: {
    userId: "",
    triggerOrderId: "",
    clientTriggerOrderId: "",
    ocoGroupId: "",
    symbol: "",
    status: "",
    side: "",
    triggerType: "",
    marginMode: "",
    createdAfter: "",
    createdBefore: "",
    limit: "1000"
  },
  MATCH_TRADE_AUDIT_SEARCH: {
    userId: "",
    orderId: "",
    tradeId: "",
    symbol: "",
    takerSide: "",
    traceId: "",
    createdAfter: "",
    createdBefore: "",
    limit: "1000"
  }
};
const QUERY_TASK_TYPES = Object.keys(QUERY_TASK_PARAM_TEMPLATES);
const JOB_STATUSES = ["", "PENDING", "RUNNING", "SUCCEEDED", "FAILED", "ARCHIVED"];
const MARKET_MAKER_EVENT_TYPES = ["", "CYCLE_SUCCESS", "CYCLE_FAILED", "QUOTE_RECONCILED", "TRADE_SUBMITTED", "TRADE_REJECTED", "SKIPPED"];
const CONSOLE_ROLES = ["SUPPORT", "ADMIN", "SUPER_ADMIN"];

type ApprovalPromptState = {
  context: AdminApprovalRequestContext;
  approvalId: string;
  reason: string;
  error: string;
  resolve: (decision: AdminApprovalDecision) => void;
};

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [route, setRoute] = useState<RouteKey>(() => routeFromHash());
  const [approvalPrompt, setApprovalPrompt] = useState<ApprovalPromptState | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    setApprovalRequestHandler((context) => new Promise((resolve) => {
      setApprovalPrompt((current) => {
        if (current) {
          resolve(null);
          return current;
        }
        return { context, approvalId: "", reason: "", error: "", resolve };
      });
    }));
    return () => setApprovalRequestHandler(null);
  }, []);

  const consoleRole = session?.user.roles.some((role) => CONSOLE_ROLES.includes(role)) ?? false;
  const fullAdminRole = session?.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN") ?? false;

  if (!session) {
    return <LoginScreen onLogin={(next) => {
      saveSession(next);
      setSession(next);
    }} />;
  }

  if (!consoleRole) {
    return <ForbiddenScreen session={session} onLogout={() => {
      saveSession(null);
      setSession(null);
    }} />;
  }

  const visibleNav = fullAdminRole ? NAV : NAV.filter((item) => item.key === "support");
  const activeRoute = visibleNav.some((item) => item.key === route) ? route : visibleNav[0].key;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Shield size={24} />
          <div>
            <strong>Surprising Admin</strong>
            <span>Exchange Ops Console</span>
          </div>
        </div>
        <nav>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={activeRoute === item.key ? "active" : ""} onClick={() => navigate(item.key)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <h1>{visibleNav.find((item) => item.key === activeRoute)?.label}</h1>
            <p>后台接口统一走 gateway，当前管理员：{session.user.username}</p>
          </div>
          <div className="top-actions">
            <span className="role-pill">{session.user.roles.join(", ")}</span>
            <button className="icon-button" title="退出登录" onClick={() => {
              saveSession(null);
              setSession(null);
            }}>
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <section className="content">
          {activeRoute === "dashboard" && <DashboardPage />}
          {activeRoute === "support" && <SupportPage />}
          {activeRoute === "users" && <UsersPage />}
          {activeRoute === "markets" && <MarketsPage />}
          {activeRoute === "orders" && <OrdersPage />}
          {activeRoute === "accounts" && <AccountsPage />}
          {activeRoute === "wallet" && <WalletPage />}
          {activeRoute === "compliance" && <CompliancePage />}
          {activeRoute === "risk" && <RiskPage />}
          {activeRoute === "funding" && <FundingInsurancePage />}
          {activeRoute === "fees" && <FeesPage />}
          {activeRoute === "maker" && <MarketMakerPage />}
          {activeRoute === "security" && <SecurityPage />}
          {activeRoute === "approvals" && <ApprovalsPage />}
          {activeRoute === "exports" && <ExportsPage />}
          {activeRoute === "queries" && <QueryTasksPage />}
          {activeRoute === "alerts" && <AlertsPage />}
          {activeRoute === "system" && <SystemPage />}
          {activeRoute === "audit" && <AuditPage />}
        </section>
      </main>
      {approvalPrompt && <ApprovalRequestDialog prompt={approvalPrompt} setPrompt={setApprovalPrompt} />}
    </div>
  );
}

function ApprovalRequestDialog({ prompt, setPrompt }: {
  prompt: ApprovalPromptState;
  setPrompt: React.Dispatch<React.SetStateAction<ApprovalPromptState | null>>;
}) {
  function update(patch: Partial<Pick<ApprovalPromptState, "approvalId" | "reason" | "error">>) {
    setPrompt((current) => current ? { ...current, ...patch } : current);
  }

  function cancel() {
    prompt.resolve(null);
    setPrompt(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const approvalId = prompt.approvalId.trim();
    const reason = prompt.reason.trim();
    if (!approvalId && !reason) {
      update({ error: "请输入已批准审批单 ID，或填写原因创建审批申请。" });
      return;
    }
    prompt.resolve(approvalId ? { approvalId } : { reason });
    setPrompt(null);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-panel" onSubmit={submit}>
        <div className="modal-heading">
          <h2>敏感操作审批</h2>
          <p>提交已批准审批单 ID 可继续执行；填写申请原因会创建审批单并中止本次操作。</p>
        </div>
        <KeyValue data={{
          service: prompt.context.service,
          method: prompt.context.method,
          requestPath: prompt.context.requestPath,
          query: prompt.context.query,
          requestBodySha256: prompt.context.requestBodySha256 ?? ""
        }} />
        <div className="form-grid">
          <label>审批单 ID
            <input value={prompt.approvalId} onChange={(event) => update({ approvalId: event.target.value, error: "" })} />
          </label>
          <label>审批申请原因
            <input value={prompt.reason} onChange={(event) => update({ reason: event.target.value, error: "" })} />
          </label>
        </div>
        {prompt.error && <div className="alert danger">{prompt.error}</div>}
        <div className="button-row">
          <button type="button" onClick={cancel}>取消</button>
          <button className="primary" type="submit">继续</button>
        </div>
      </form>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
      setError("");
    try {
      const session = await login(username, password, totpCode);
      if (!session.user.roles.some((role) => CONSOLE_ROLES.includes(role))) {
        throw new Error("当前账号没有后台角色，请先在 gateway_user_roles 授予 SUPPORT、ADMIN 或 SUPER_ADMIN。");
      }
      onLogin(session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand large">
          <Shield size={30} />
          <div>
            <strong>Surprising Admin</strong>
            <span>Production Operations</span>
          </div>
        </div>
        <label>
          管理员账号
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        <label>
          2FA 动态码
          <input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
        </label>
        {error && <div className="alert danger">{error}</div>}
        <button className="primary" disabled={loading}>{loading ? "登录中..." : "登录后台"}</button>
      </form>
    </div>
  );
}

function ForbiddenScreen({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  return (
    <div className="login-page">
      <div className="login-panel">
        <StatusBadge value="FORBIDDEN" />
        <h2>当前账号不是后台管理员</h2>
        <p>{session.user.username} 的角色为 {session.user.roles.join(", ") || "空"}。后台访问需要 ADMIN 或 SUPER_ADMIN。</p>
        <button className="primary" onClick={onLogout}>退出</button>
      </div>
    </div>
  );
}

function DashboardPage() {
  const [state, setState] = useState(loadable<DashboardData>());
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [asset, setAsset] = useState("USDT");

  async function load() {
    setState({ loading: true, error: null, data: state.data });
    try {
      const instruments = await instrumentList({ limit: 200, sort: "symbol.asc" });
      const instrumentRows = instruments.instruments ?? instruments.items ?? [];
      const selectedInstrument = instrumentRows.find((item) => item.symbol === symbol);
      const productLine = productLineForInstrument(selectedInstrument);
      const shouldLoadFunding = !selectedInstrument || isFundingInstrument(selectedInstrument);
      const fundingRequest = shouldLoadFunding
        ? gatewayGet<UnknownRecord>("funding", "/admin/rates/latest", { symbol, productLine }).catch(() => null)
        : Promise.resolve(null);
      const [candidates, liquidations, insurance, adl, makers, funding] = await Promise.all([
        gatewayGet<{ candidates?: UnknownRecord[]; items?: UnknownRecord[] }>("risk-admin", "/liquidation-candidates", { status: "NEW", productLine, limit: 50 }),
        gatewayGet<{ orders?: UnknownRecord[]; items?: UnknownRecord[] }>("liquidation-admin", "/orders", { productLine, limit: 50 }),
        gatewayGet<{ balances?: UnknownRecord[]; items?: UnknownRecord[] }>("insurance-admin", "/balances", { asset, productLine }),
        gatewayGet<{ positions?: UnknownRecord[]; items?: UnknownRecord[] }>("adl", "/admin/queue", { asset, productLine, limit: 50, sort: ADL_QUEUE_SORT }),
        gatewayGet<{ strategies?: UnknownRecord[]; items?: UnknownRecord[] }>("market-maker", "/strategies", { productLine }),
        fundingRequest
      ]);
      setState({
        loading: false,
        error: null,
        data: {
          instruments: instrumentRows,
          candidates: candidates.candidates ?? candidates.items ?? [],
          liquidations: liquidations.orders ?? liquidations.items ?? [],
          insurance: insurance.balances ?? insurance.items ?? [],
          adl: adl.positions ?? adl.items ?? [],
          makers: makers.strategies ?? makers.items ?? [],
          funding
        }
      });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err), data: state.data });
    }
  }

  useEffect(() => { void load(); }, []);

  const data = state.data;
  const selectedInstrument = data?.instruments.find((item) => item.symbol === symbol);
  const fundingMetric = selectedInstrument && !isFundingInstrument(selectedInstrument)
    ? "非永续"
    : formatValue(data?.funding?.fundingRatePpm ?? data?.funding?.fundingRate);
  return (
    <Page title="运营总览" onRefresh={load} loading={state.loading} error={state.error}>
      <div className="filters compact">
        <label>Symbol<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} /></label>
        <label>Asset<input value={asset} onChange={(event) => setAsset(event.target.value.toUpperCase())} /></label>
        <button onClick={load}><RefreshCw size={16} />刷新</button>
      </div>
      <div className="metrics">
        <Metric label="上线产品" value={data?.instruments.filter((item) => item.status === "TRADING").length ?? 0} tone="ok" />
        <Metric label="爆仓候选" value={data?.candidates.length ?? 0} tone={(data?.candidates.length ?? 0) > 0 ? "danger" : "ok"} />
        <Metric label="强平订单" value={data?.liquidations.length ?? 0} tone={(data?.liquidations.length ?? 0) > 0 ? "warn" : "ok"} />
        <Metric label="ADL 队列" value={data?.adl.length ?? 0} tone={(data?.adl.length ?? 0) > 0 ? "warn" : "ok"} />
        <Metric label="做市策略" value={data?.makers.length ?? 0} tone="muted" />
        <Metric label="资金费率" value={fundingMetric} tone="muted" />
      </div>
      <TwoColumn>
        <Panel title="保险基金">
          <DataTable rows={records(data?.insurance)} maxColumns={8} />
        </Panel>
        <Panel title="风险候选">
          <DataTable rows={records(data?.candidates)} maxColumns={8} />
        </Panel>
      </TwoColumn>
    </Page>
  );
}

function UsersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [listFilters, setListFilters] = useState({ limit: "200", cursor: "", sort: "createdAt.desc" });
  const [userPageInfo, setUserPageInfo] = useState(cursorInfo());
  const [users, setUsers] = useState<AuthenticatedUser[]>([]);
  const [selected, setSelected] = useState<AuthenticatedUser | null>(null);
  const [sessions, setSessions] = useState<UnknownRecord[]>([]);
  const [sessionFilters, setSessionFilters] = useState({ active: "", limit: "100", cursor: "", sort: "createdAt.desc" });
  const [sessionPageInfo, setSessionPageInfo] = useState(cursorInfo());
  const [profile, setProfile] = useState<UnknownRecord | null>(null);
  const [profileAsset, setProfileAsset] = useState("USDT");
  const [profileProductLine, setProfileProductLine] = useState("LINEAR_PERPETUAL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rolesText, setRolesText] = useState("");

  function updateSessionFilters(patch: Partial<typeof sessionFilters>) {
    setSessionFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  async function loadSessions(userId: number, nextCursor = sessionFilters.cursor) {
    const response = await userSessions(userId, {
      active: sessionFilters.active === "" ? undefined : sessionFilters.active === "true",
      limit: Number(sessionFilters.limit) || 100,
      cursor: nextCursor,
      sort: sessionFilters.sort
    });
    setSessions(response.sessions);
    setSessionPageInfo(cursorInfo(response));
    setSessionFilters((current) => ({ ...current, cursor: nextCursor || "" }));
  }

  async function loadProfile(userId: number) {
    const response = await userProfile(userId, {
      settleAsset: profileAsset,
      productLine: profileProductLine,
      limit: 50
    });
    setProfile(response);
  }

  function resetUserCursor() {
    setListFilters((current) => ({ ...current, cursor: "" }));
  }

  function updateListFilters(patch: Partial<typeof listFilters>) {
    setListFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  async function load(nextCursor = listFilters.cursor) {
    setLoading(true);
    setError("");
    try {
      const response = await adminUsers({
        query,
        status,
        limit: Number(listFilters.limit) || 200,
        cursor: nextCursor,
        sort: listFilters.sort
      });
      setUsers(response.users);
      setUserPageInfo(cursorInfo(response));
      setListFilters((current) => ({ ...current, cursor: nextCursor || "" }));
      if (selected) {
        const nextSelected = response.users.find((user) => user.userId === selected.userId) ?? null;
        setSelected(nextSelected);
        if (nextSelected) {
          await loadSessions(nextSelected.userId);
          await loadProfile(nextSelected.userId);
        } else {
          setSessions([]);
          setProfile(null);
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { setRolesText(selected?.roles.join(",") ?? ""); }, [selected]);
  useEffect(() => {
    if (selected) {
      void Promise.all([loadSessions(selected.userId, ""), loadProfile(selected.userId)])
        .catch((err) => setError(errorMessage(err)));
    } else {
      setSessions([]);
      setSessionPageInfo(cursorInfo());
      setProfile(null);
    }
  }, [selected?.userId]);

  async function saveStatus(next: string) {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const updated = await updateUserStatus(selected.userId, next);
      setSelected(updated);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveRoles() {
    if (!selected) return;
    const roles = rolesText.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
    setLoading(true);
    setError("");
    try {
      const updated = await replaceUserRoles(selected.userId, roles);
      setSelected(updated);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function revokeOneSession(sessionId: unknown) {
    if (!selected || !sessionId) return;
    setLoading(true);
    setError("");
    try {
      await revokeSession(String(sessionId));
      await loadSessions(selected.userId, sessionFilters.cursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function forceLogoutUser() {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      await revokeUserSessions(selected.userId);
      await loadSessions(selected.userId, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="用户权限" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <label>搜索<input value={query} onChange={(event) => { setQuery(event.target.value); resetUserCursor(); }} placeholder="userId / username / email" /></label>
        <label>状态<select value={status} onChange={(event) => { setStatus(event.target.value); resetUserCursor(); }}>
          <option value="">全部</option>
          {USER_STATUSES.map((item) => <option key={item}>{item}</option>)}
        </select></label>
        <TextFilter label="Limit" value={listFilters.limit} onChange={(value) => updateListFilters({ limit: value })} />
        <SortSelect value={listFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => updateListFilters({ sort: value })} />
        <button onClick={() => void load("")}><Search size={16} />查询</button>
      </div>
      <TwoColumn>
        <Panel title="用户列表">
          <div className="stack">
            <DataTable rows={users as unknown as UnknownRecord[]} onRowClick={(row) => setSelected(row as unknown as AuthenticatedUser)} />
            <CursorPager
              page={userPageInfo}
              cursor={listFilters.cursor}
              onNext={() => void load(userPageInfo.nextCursor || "")}
              onReset={() => void load("")}
            />
          </div>
        </Panel>
        <Panel title="权限操作">
          {selected ? (
            <div className="stack">
              <KeyValue data={selected as unknown as UnknownRecord} />
              <label>状态<select value={selected.status} onChange={(event) => void saveStatus(event.target.value)}>
                {USER_STATUSES.map((item) => <option key={item}>{item}</option>)}
              </select></label>
              <label>角色<input value={rolesText} onChange={(event) => setRolesText(event.target.value)} placeholder="USER,ADMIN" /></label>
              <button className="primary" onClick={() => void saveRoles()}>保存角色</button>
            </div>
          ) : <Empty text="选择一个用户进行管理" />}
        </Panel>
      </TwoColumn>
      <Panel title="会话治理">
        {selected ? (
          <div className="stack">
            <div className="button-row">
              <button onClick={() => void loadSessions(selected.userId, sessionFilters.cursor)}><RefreshCw size={16} />刷新会话</button>
              <button className="primary" onClick={() => void forceLogoutUser()}>强制下线全部会话</button>
            </div>
            <div className="filters compact">
              <label>Active<select value={sessionFilters.active} onChange={(event) => updateSessionFilters({ active: event.target.value })}><option value="">全部</option><option value="true">有效</option><option value="false">失效</option></select></label>
              <TextFilter label="Limit" value={sessionFilters.limit} onChange={(value) => updateSessionFilters({ limit: value })} />
              <SortSelect value={sessionFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => updateSessionFilters({ sort: value })} />
              <button onClick={() => void loadSessions(selected.userId, "")}><Search size={16} />查询会话</button>
            </div>
            <DataTable
              rows={sessions}
              columns={["sessionId", "userId", "active", "ipAddress", "userAgent", "expiresAt", "revokedAt", "createdAt"]}
              actions={(row) => row.active ? <button onClick={() => void revokeOneSession(row.sessionId)}>撤销</button> : <StatusBadge value="REVOKED" />}
            />
            <CursorPager
              page={sessionPageInfo}
              cursor={sessionFilters.cursor}
              onNext={() => void loadSessions(selected.userId, sessionPageInfo.nextCursor || "")}
              onReset={() => void loadSessions(selected.userId, "")}
            />
          </div>
        ) : <Empty text="选择用户查看登录会话" />}
      </Panel>
      <Panel title="用户详情聚合">
        {selected ? (
          <UserProfileView
            profile={profile}
            settleAsset={profileAsset}
            onSettleAssetChange={setProfileAsset}
            productLine={profileProductLine}
            onProductLineChange={setProfileProductLine}
            onRefresh={() => void loadProfile(selected.userId)}
          />
        ) : <Empty text="选择用户查看资产、订单和风险画像" />}
      </Panel>
    </Page>
  );
}

function SupportPage() {
  const [userId, setUserId] = useState("");
  const [settleAsset, setSettleAsset] = useState("USDT");
  const [productLine, setProductLine] = useState("LINEAR_PERPETUAL");
  const [overview, setOverview] = useState<UnknownRecord | null>(null);
  const [tickets, setTickets] = useState<UnknownRecord[]>([]);
  const [ticketFilters, setTicketFilters] = useState({ status: "", limit: "50", cursor: "", sort: "updatedAt.desc" });
  const [ticketPageInfo, setTicketPageInfo] = useState(cursorInfo());
  const [selectedTicket, setSelectedTicket] = useState<UnknownRecord | null>(null);
  const [ticketNotes, setTicketNotes] = useState<UnknownRecord[]>([]);
  const [noteFilters, setNoteFilters] = useState({ limit: "200", cursor: "", sort: "createdAt.asc" });
  const [notePageInfo, setNotePageInfo] = useState(cursorInfo());
  const [ticketForm, setTicketForm] = useState({
    title: "",
    category: "GENERAL",
    priority: "MEDIUM",
    initialNote: ""
  });
  const [noteBody, setNoteBody] = useState("");
  const [statusForm, setStatusForm] = useState({ status: "PENDING_INTERNAL", reason: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateTicketFilters(patch: Partial<typeof ticketFilters>) {
    setTicketFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateNoteFilters(patch: Partial<typeof noteFilters>) {
    setNoteFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  async function load(nextTicketCursor = ticketFilters.cursor) {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      setError("请输入 User ID。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [overviewResponse, ticketsResponse] = await Promise.all([
        supportUserOverview(trimmedUserId, { settleAsset, productLine, limit: 25 }),
        supportTickets({
          userId: trimmedUserId,
          status: ticketFilters.status,
          limit: Number(ticketFilters.limit) || 50,
          cursor: nextTicketCursor,
          sort: ticketFilters.sort
        })
      ]);
      setOverview(overviewResponse);
      setTickets(ticketsResponse.tickets ?? []);
      setTicketPageInfo(cursorInfo(ticketsResponse));
      setTicketFilters((current) => ({ ...current, cursor: nextTicketCursor || "" }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadTicketNotes(ticket: UnknownRecord, nextCursor = noteFilters.cursor) {
    const ticketId = ticket.ticketId;
    if (ticketId === undefined || ticketId === null) return;
    setSelectedTicket(ticket);
    setLoading(true);
    setError("");
    try {
      const response = await supportTicketNotes(String(ticketId), {
        limit: Number(noteFilters.limit) || 200,
        cursor: nextCursor,
        sort: noteFilters.sort
      });
      setTicketNotes(response.notes ?? []);
      setNotePageInfo(cursorInfo(response));
      setNoteFilters((current) => ({ ...current, cursor: nextCursor || "" }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function createTicket() {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      setError("请输入 User ID。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (!ticketForm.title.trim()) throw new Error("请输入工单标题。");
      const response = await createSupportTicket(trimmedUserId, {
        title: ticketForm.title.trim(),
        category: ticketForm.category.trim() || "GENERAL",
        priority: ticketForm.priority,
        initialNote: ticketForm.initialNote.trim() || undefined
      });
      setTicketForm({ title: "", category: "GENERAL", priority: "MEDIUM", initialNote: "" });
      await load();
      const ticket = objectValue(response.ticket);
      if (ticket.ticketId) await loadTicketNotes(ticket, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function addNote() {
    const ticket = selectedTicket;
    const ticketId = ticket?.ticketId;
    if (!ticket || ticketId === undefined || ticketId === null) {
      setError("请选择工单。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (!noteBody.trim()) throw new Error("请输入备注内容。");
      await addSupportTicketNote(String(ticketId), { noteType: "NOTE", visibility: "INTERNAL", body: noteBody.trim() });
      setNoteBody("");
      await loadTicketNotes(ticket, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function changeTicketStatus() {
    const ticketId = selectedTicket?.ticketId;
    if (ticketId === undefined || ticketId === null) {
      setError("请选择工单。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (!statusForm.reason.trim()) throw new Error("请输入状态变更原因。");
      const response = await updateSupportTicketStatus(String(ticketId), {
        status: statusForm.status,
        reason: statusForm.reason.trim()
      });
      setStatusForm((current) => ({ ...current, reason: "" }));
      await load();
      const ticket = objectValue(response.ticket);
      if (ticket.ticketId) await loadTicketNotes(ticket, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const user = objectValue(overview?.user);
  const compliance = objectValue(overview?.compliance);
  const errors = extractRows(overview?.errors);

  return (
    <Page title="客服视图" onRefresh={overview ? load : undefined} loading={loading} error={error}>
      <div className="filters">
        <TextFilter label="User ID" value={userId} onChange={setUserId} />
        <label>产品线<select value={productLine} onChange={(event) => setProductLine(event.target.value)}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <TextFilter label="Settle Asset" value={settleAsset} onChange={(value) => setSettleAsset(value.toUpperCase())} />
        <button className="primary" onClick={() => void load("")}><Search size={16} />查询用户</button>
      </div>
      {!overview ? <Empty text="输入用户 ID 查询只读资产、订单和风险状态" /> : (
        <>
          <div className="metrics">
            <Metric label="用户状态" value={user.status ?? "-"} tone={String(user.status ?? "") === "NORMAL" ? "ok" : "warn"} />
            <Metric label="KYC" value={compliance.kycStatus ?? "-"} tone={String(compliance.kycStatus ?? "") === "VERIFIED" ? "ok" : "warn"} />
            <Metric label="风险标签" value={compliance.activeRiskTags ?? 0} tone={Number(compliance.activeRiskTags ?? 0) > 0 ? "warn" : "ok"} />
            <Metric label="AML Case" value={compliance.openAmlCases ?? 0} tone={Number(compliance.openAmlCases ?? 0) > 0 ? "danger" : "ok"} />
            <Metric label="AML 最高分" value={compliance.maxAmlRiskScore ?? 0} tone={Number(compliance.maxAmlRiskScore ?? 0) >= 70 ? "danger" : "muted"} />
            <Metric label="聚合错误" value={errors.length} tone={errors.length ? "danger" : "ok"} />
          </div>
          <TwoColumn>
            <Panel title="用户基础状态">
              <KeyValue data={user} />
            </Panel>
            <Panel title="合规摘要">
              <KeyValue data={compliance} />
            </Panel>
          </TwoColumn>
          <Panel title="只读交易与资产概览">
            <UserProfileView
              profile={overview}
              settleAsset={settleAsset}
              onSettleAssetChange={setSettleAsset}
              productLine={productLine}
              onProductLineChange={setProductLine}
              onRefresh={() => void load()}
              showAudit={false}
              showRaw={false}
              refreshLabel="刷新客服概览"
            />
          </Panel>
          <TwoColumn>
            <Panel title="客服工单">
              <div className="stack">
                <div className="filters compact">
                  <label>状态
                    <select value={ticketFilters.status} onChange={(event) => updateTicketFilters({ status: event.target.value })}>
                      <option value="">全部</option>
                      <option value="OPEN">OPEN</option>
                      <option value="PENDING_USER">PENDING_USER</option>
                      <option value="PENDING_INTERNAL">PENDING_INTERNAL</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </label>
                  <TextFilter label="Limit" value={ticketFilters.limit} onChange={(value) => updateTicketFilters({ limit: value })} />
                  <SortSelect value={ticketFilters.sort} options={SUPPORT_TICKET_SORTS} onChange={(value) => updateTicketFilters({ sort: value })} />
                  <button onClick={() => void load("")}><Search size={16} />查询工单</button>
                </div>
                <DataTable
	                  rows={tickets}
	                  columns={["ticketId", "userId", "status", "priority", "category", "title", "assignedAdminUserId", "updatedAt"]}
	                  onRowClick={(row) => void loadTicketNotes(row, "")}
	                />
                <CursorPager
                  page={ticketPageInfo}
                  cursor={ticketFilters.cursor}
                  onNext={() => void load(ticketPageInfo.nextCursor || "")}
                  onReset={() => void load("")}
                />
                <div className="filters">
                  <TextFilter label="Title" value={ticketForm.title} onChange={(value) => setTicketForm((current) => ({ ...current, title: value }))} />
                  <TextFilter label="Category" value={ticketForm.category} onChange={(value) => setTicketForm((current) => ({ ...current, category: value.toUpperCase() }))} />
                  <label>Priority
                    <select value={ticketForm.priority} onChange={(event) => setTicketForm((current) => ({ ...current, priority: event.target.value }))}>
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </label>
                  <button className="primary" onClick={() => void createTicket()}>创建工单</button>
                </div>
                <textarea className="json-editor small" value={ticketForm.initialNote} onChange={(event) => setTicketForm((current) => ({ ...current, initialNote: event.target.value }))} placeholder="首条内部备注" />
              </div>
            </Panel>
	            <Panel title="备注时间线">
	              <div className="stack">
	                <KeyValue data={objectValue(selectedTicket)} />
	                <div className="filters compact">
	                  <TextFilter label="Limit" value={noteFilters.limit} onChange={(value) => updateNoteFilters({ limit: value })} />
	                  <SortSelect value={noteFilters.sort} options={SUPPORT_NOTE_SORTS} onChange={(value) => updateNoteFilters({ sort: value })} />
	                  <button onClick={() => selectedTicket && void loadTicketNotes(selectedTicket, "")} disabled={!selectedTicket}>
	                    <RefreshCw size={16} />刷新备注
	                  </button>
	                </div>
	                <CursorPager
	                  page={notePageInfo}
	                  cursor={noteFilters.cursor}
	                  onNext={() => selectedTicket && void loadTicketNotes(selectedTicket, notePageInfo.nextCursor || "")}
	                  onReset={() => selectedTicket && void loadTicketNotes(selectedTicket, "")}
	                />
	                <DataTable rows={ticketNotes} columns={["createdAt", "adminUserId", "noteType", "visibility", "body"]} />
                <textarea className="json-editor small" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="内部备注" />
                <div className="button-row">
                  <button onClick={() => void addNote()} disabled={!selectedTicket}>追加备注</button>
                  <label>Status
                    <select value={statusForm.status} onChange={(event) => setStatusForm((current) => ({ ...current, status: event.target.value }))}>
                      <option value="OPEN">OPEN</option>
                      <option value="PENDING_USER">PENDING_USER</option>
                      <option value="PENDING_INTERNAL">PENDING_INTERNAL</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </label>
                  <TextFilter label="Reason" value={statusForm.reason} onChange={(value) => setStatusForm((current) => ({ ...current, reason: value }))} />
                  <button className="primary" onClick={() => void changeTicketStatus()} disabled={!selectedTicket}>变更状态</button>
                </div>
              </div>
            </Panel>
          </TwoColumn>
        </>
      )}
    </Page>
  );
}

function UserProfileView({
  profile,
  settleAsset,
  onSettleAssetChange,
  productLine,
  onProductLineChange,
  onRefresh,
  showAudit = true,
  showRaw = true,
  refreshLabel = "刷新聚合详情"
}: {
  profile: UnknownRecord | null;
  settleAsset: string;
  onSettleAssetChange: (value: string) => void;
  productLine?: string;
  onProductLineChange?: (value: string) => void;
  onRefresh: () => void;
  showAudit?: boolean;
  showRaw?: boolean;
  refreshLabel?: string;
}) {
  const account = objectValue(profile?.account);
  const trading = objectValue(profile?.trading);
  const risk = objectValue(profile?.risk);
  const balances = extractRows(account.balances, ["balances", "items"]);
  const productBalances = extractRows(account.productBalances, ["balances", "items"]);
  const positions = extractRows(account.positions, ["positions", "items"]);
  const accountLedger = extractRows(account.accountLedger, ["ledger", "records", "items"]);
  const productLedger = extractRows(account.productLedger, ["ledger", "records", "items"]);
  const transfers = extractRows(account.transfers, ["transfers", "records", "items"]);
  const orders = extractRows(trading.orders, ["orders", "items"]);
  const trades = extractRows(trading.trades, ["trades", "items"]);
  const triggerOrders = extractRows(trading.triggerOrders, ["orders", "items"]);
  const riskAccount = extractRows(risk.accountLatest);
  const riskPositions = extractRows(risk.positionsLatest, ["positions", "items"]);
  const sessions = extractRows(profile?.sessions, ["sessions"]);
  const logs = extractRows(profile?.loginLogs, ["logs"]);
  const errors = extractRows(profile?.errors);

  return (
    <div className="stack">
      <div className="filters compact">
        {onProductLineChange && (
          <label>产品线<select value={productLine ?? ""} onChange={(event) => onProductLineChange(event.target.value)}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        )}
        <label>结算资产<input value={settleAsset} onChange={(event) => onSettleAssetChange(event.target.value.toUpperCase())} /></label>
        <button onClick={onRefresh}><RefreshCw size={16} />{refreshLabel}</button>
      </div>
      {!profile ? <Empty text="正在等待聚合数据" /> : (
        <>
          <div className="metrics">
            <Metric label="余额条目" value={balances.length + productBalances.length} tone="muted" />
            <Metric label="持仓条目" value={positions.length} tone={positions.length > 0 ? "warn" : "ok"} />
            <Metric label="订单条目" value={orders.length + triggerOrders.length} tone="muted" />
            <Metric label="成交条目" value={trades.length} tone="muted" />
            {showAudit && <Metric label="活动会话" value={sessions.filter((item) => item.active).length} tone="muted" />}
            <Metric label="聚合错误" value={errors.length} tone={errors.length ? "danger" : "ok"} />
          </div>
          {errors.length > 0 && (
            <div className="alert danger">
              <DataTable rows={errors} columns={["service", "section", "httpStatus", "message", "targetUri"]} />
            </div>
          )}
          <div className="profile-sections">
            <ProfileSection title="资金余额">
              <DataTable rows={balances} columns={["userId", "asset", "availableUnits", "lockedUnits", "equityUnits", "updatedAt"]} />
            </ProfileSection>
            <ProfileSection title="产品账户">
              <DataTable rows={productBalances} columns={["userId", "accountType", "asset", "availableUnits", "lockedUnits", "equityUnits", "updatedAt"]} />
            </ProfileSection>
            <ProfileSection title="合约持仓">
              <DataTable rows={positions} columns={["userId", "symbol", "marginMode", "positionSide", "signedQuantitySteps", "entryPriceTicks", "updatedAt"]} />
            </ProfileSection>
            <ProfileSection title="风险快照">
              <DataTable rows={[...riskAccount, ...riskPositions]} maxColumns={8} />
            </ProfileSection>
            <ProfileSection title="普通订单">
              <DataTable rows={orders} columns={["orderId", "userId", "symbol", "side", "positionSide", "orderType", "status", "remainingQuantitySteps", "updatedAt"]} />
            </ProfileSection>
            <ProfileSection title="触发订单">
              <DataTable rows={triggerOrders} columns={["triggerOrderId", "userId", "symbol", "side", "positionSide", "status", "triggerPriceTicks", "updatedAt"]} />
            </ProfileSection>
            <ProfileSection title="成交明细">
              <DataTable rows={trades} columns={["tradeId", "orderId", "userId", "symbol", "priceTicks", "quantitySteps", "createdAt"]} />
            </ProfileSection>
            <ProfileSection title="资金流水">
              <DataTable rows={[...accountLedger, ...productLedger, ...transfers]} maxColumns={8} />
            </ProfileSection>
            {showAudit && (
              <ProfileSection title="登录审计" wide>
                <DataTable rows={logs} columns={["loginId", "userId", "result", "reason", "ipAddress", "userAgent", "createdAt"]} />
              </ProfileSection>
            )}
          </div>
          {showRaw && (
            <details className="raw-toggle">
              <summary>原始聚合响应</summary>
              <JsonBlock value={profile} />
            </details>
          )}
        </>
      )}
    </div>
  );
}

function ProfileSection({ title, wide = false, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`profile-section${wide ? " wide" : ""}`}>
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function MarketsPage() {
  const [filters, setFilters] = useState({ status: "TRADING", type: "", limit: "100", cursor: "", sort: "symbol.asc" });
  const [versionFilters, setVersionFilters] = useState({ limit: "50", cursor: "", sort: "version.desc" });
  const [healthPeriod, setHealthPeriod] = useState("1m");
  const [staleSeconds, setStaleSeconds] = useState("120");
  const [items, setItems] = useState<Instrument[]>([]);
  const [page, setPage] = useState(cursorInfo(null));
  const [versions, setVersions] = useState<Instrument[]>([]);
  const [versionPage, setVersionPage] = useState(cursorInfo(null));
  const [health, setHealth] = useState<UnknownRecord | null>(null);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [json, setJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const draftState = useMemo(() => parseInstrumentDraft(json), [json]);
  const draft = draftState.value;

  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateVersionFilters(patch: Partial<typeof versionFilters>) {
    setVersionFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  async function load(nextCursor = filters.cursor) {
    setLoading(true);
    setError("");
    try {
      const [response, healthResponse] = await Promise.all([
        instrumentList({
          type: filters.type,
          status: filters.status,
          limit: Number(filters.limit) || 100,
          cursor: nextCursor,
          sort: filters.sort
        }),
        marketHealth({ period: healthPeriod, staleSeconds: Number(staleSeconds) || 120, limit: 100 })
      ]);
      const rows = response.instruments ?? response.items ?? [];
      setItems(rows);
      setPage(cursorInfo(response));
      setFilters((current) => ({ ...current, cursor: nextCursor }));
      setHealth(healthResponse);
      const nextSelected = selected?.symbol
        ? rows.find((row) => row.symbol === selected.symbol) ?? rows[0] ?? null
        : rows[0] ?? null;
      setSelected(nextSelected);
      if (nextSelected?.symbol) {
        await loadVersions(nextSelected.symbol, "");
      } else {
        setVersions([]);
        setVersionPage(cursorInfo(null));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadVersions(symbol = selected?.symbol ?? "", nextCursor = versionFilters.cursor) {
    if (!symbol) return;
    setHistoryLoading(true);
    try {
      const response = await instrumentVersions(symbol, {
        limit: Number(versionFilters.limit) || 50,
        cursor: nextCursor,
        sort: versionFilters.sort
      });
      setVersions(response.instruments ?? response.items ?? []);
      setVersionPage(cursorInfo(response));
      setVersionFilters((current) => ({ ...current, cursor: nextCursor }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function selectInstrument(row: Instrument) {
    setLoading(true);
    setError("");
    try {
      const detail = await instrumentLatest(row.symbol);
      setSelected(detail);
      await loadVersions(detail.symbol, "");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { setJson(selected ? JSON.stringify(selected, null, 2) : ""); }, [selected]);

  async function changeStatus(next: string) {
    if (!selected) return;
    try {
      const updated = await updateInstrumentStatus(selected.symbol, next);
      setSelected(updated);
      await load(filters.cursor);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function upsert() {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("产品配置必须是 JSON object。");
      }
      const body = normalizeInstrumentDraft(parsed as UnknownRecord, "instrumentType");
      const updated = await upsertInstrument(body);
      setSelected(updated);
      await load("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function updateDraftField(field: string, value: unknown) {
    const base = draft ?? objectValue(selected);
    setJson(JSON.stringify(normalizeInstrumentDraft({ ...base, [field]: value }, field), null, 2));
  }

  return (
    <Page title="产品与市场" onRefresh={() => load(filters.cursor)} loading={loading} error={error}>
      <div className="filters">
        <label>类型<select value={filters.type} onChange={(event) => updateFilters({ type: event.target.value })}>
          <option value="">全部</option>
          {INSTRUMENT_TYPES.map((item) => <option key={item}>{item}</option>)}
        </select></label>
        <label>状态<select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}>
          <option value="">全部</option>
          {INSTRUMENT_STATUSES.map((item) => <option key={item}>{item}</option>)}
        </select></label>
        <SortSelect label="产品排序" value={filters.sort} options={INSTRUMENT_SORTS} onChange={(sort) => updateFilters({ sort })} />
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => updateFilters({ limit: value })} />
        <label>K线周期<select value={healthPeriod} onChange={(event) => setHealthPeriod(event.target.value)}>
          <option value="1m">1m</option>
          <option value="5m">5m</option>
          <option value="15m">15m</option>
          <option value="1h">1h</option>
        </select></label>
        <TextFilter label="过期秒数" value={staleSeconds} onChange={setStaleSeconds} />
        <button onClick={() => void load("")}><Search size={16} />查询</button>
      </div>
      {health && <MarketHealthOverview health={health} />}
      <TwoColumn>
        <Panel title="交易产品">
          <DataTable rows={items as unknown as UnknownRecord[]} columns={["symbol", "status", "instrumentType", "contractType", "settleAsset", "expiryTime", "version", "maxLeveragePpm", "makerFeeRatePpm", "takerFeeRatePpm", "updatedAt"]} onRowClick={(row) => void selectInstrument(row as unknown as Instrument)} />
          <CursorPager
            page={page}
            cursor={filters.cursor}
            onNext={() => void load(page.nextCursor)}
            onReset={() => void load("")}
          />
        </Panel>
        <Panel title="产品配置">
          {selected ? (
            <div className="stack">
              <div className="metrics">
                <Metric label="当前产品" value={selected.symbol} tone="muted" />
                <Metric label="当前版本" value={selected.version ?? "-"} tone="muted" />
                <Metric label="状态" value={selected.status ?? "-"} tone={selected.status === "TRADING" ? "ok" : "warn"} />
                <Metric label="指数源" value={selected.indexSources?.length ?? 0} tone="muted" />
                <Metric label="到期时间" value={selected.expiryTime ?? "-"} tone="muted" />
                <Metric label="期权方向" value={selected.optionType ?? "-"} tone="muted" />
              </div>
              <div className="button-row">
                {INSTRUMENT_STATUSES.map((item) => <button key={item} onClick={() => void changeStatus(item)}>{item}</button>)}
              </div>
              {draftState.error && <div className="alert danger">{draftState.error}</div>}
              <div className="profile-sections">
                <ProfileSection title="基础信息">
                  <div className="form-grid">
                    <DraftTextField label="Symbol" field="symbol" draft={draft} update={updateDraftField} upper />
                    <DraftSelectField label="产品类型" field="instrumentType" draft={draft} update={updateDraftField} options={INSTRUMENT_TYPES} />
                    <DraftSelectField label="合约类型" field="contractType" draft={draft} update={updateDraftField} options={CONTRACT_TYPES} />
                    <DraftSelectField label="状态" field="status" draft={draft} update={updateDraftField} options={INSTRUMENT_STATUSES} />
                    <DraftTextField label="Base" field="baseAsset" draft={draft} update={updateDraftField} upper />
                    <DraftTextField label="Quote" field="quoteAsset" draft={draft} update={updateDraftField} upper />
                    <DraftTextField label="Settle" field="settleAsset" draft={draft} update={updateDraftField} upper />
                    <DraftTextField label="合约价值资产" field="contractValueAsset" draft={draft} update={updateDraftField} upper />
                  </div>
                </ProfileSection>
                <ProfileSection title="交割与期权">
                  <div className="form-grid">
                    <DraftOptionalTextField label="到期时间 ISO" field="expiryTime" draft={draft} update={updateDraftField} />
                    <DraftOptionalTextField label="交割时间 ISO" field="deliveryTime" draft={draft} update={updateDraftField} />
                    <DraftOptionalTextField label="底层标的" field="underlyingSymbol" draft={draft} update={updateDraftField} upper />
                    <DraftOptionalNumberField label="行权价 units" field="strikePriceUnits" draft={draft} update={updateDraftField} />
                    <DraftOptionalSelectField label="期权方向" field="optionType" draft={draft} update={updateDraftField} options={OPTION_TYPES} />
                    <DraftOptionalSelectField label="行权方式" field="optionExerciseStyle" draft={draft} update={updateDraftField} options={OPTION_EXERCISE_STYLES} />
                    <DraftOptionalSelectField label="结算方式" field="settlementMethod" draft={draft} update={updateDraftField} options={SETTLEMENT_METHODS} />
                  </div>
                </ProfileSection>
                <ProfileSection title="交易规则">
                  <div className="form-grid">
                    <DraftNumberField label="价格 tick" field="priceTickUnits" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="数量 step" field="quantityStepUnits" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="最小数量" field="minQuantitySteps" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="最大数量" field="maxQuantitySteps" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="最小 notional" field="minNotionalUnits" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="最大 notional" field="maxNotionalUnits" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="价格精度" field="pricePrecision" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="数量精度" field="quantityPrecision" draft={draft} update={updateDraftField} />
                    <DraftCsvField label="订单类型" field="supportedOrderTypes" draft={draft} update={updateDraftField} />
                    <DraftCsvField label="Time in force" field="supportedTimeInForce" draft={draft} update={updateDraftField} />
                  </div>
                  <div className="checkbox-grid">
                    <DraftCheckboxField label="Post only" field="postOnlyEnabled" draft={draft} update={updateDraftField} />
                    <DraftCheckboxField label="Reduce only" field="reduceOnlyEnabled" draft={draft} update={updateDraftField} />
                    <DraftCheckboxField label="Market order" field="marketOrderEnabled" draft={draft} update={updateDraftField} />
                  </div>
                </ProfileSection>
                <ProfileSection title="风险与资金费">
                  <div className="form-grid">
                    <DraftNumberField label="最大杠杆 ppm" field="maxLeveragePpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="初始保证金 ppm" field="initialMarginRatePpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="维持保证金 ppm" field="maintenanceMarginRatePpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="最大持仓 notional" field="maxPositionNotionalUnits" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="用户 OI rate ppm" field="userOpenInterestLimitRatePpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="用户 OI floor" field="userOpenInterestLimitFloorUnits" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="资金费周期小时" field="fundingIntervalHours" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="利率 ppm" field="interestRatePpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="资金费上限 ppm" field="fundingRateCapPpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="资金费下限 ppm" field="fundingRateFloorPpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="影响价格 notional" field="impactNotionalUnits" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="最少有效指数源" field="minValidIndexSources" draft={draft} update={updateDraftField} />
                  </div>
                </ProfileSection>
                <ProfileSection title="费用与合约面值">
                  <div className="form-grid">
                    <DraftNumberField label="Maker fee ppm" field="makerFeeRatePpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="Taker fee ppm" field="takerFeeRatePpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="合约乘数 ppm" field="contractMultiplierPpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="Notional multiplier" field="notionalMultiplierUnits" draft={draft} update={updateDraftField} />
                  </div>
                </ProfileSection>
              </div>
              <details className="raw-toggle">
                <summary>高级 JSON 配置</summary>
                <textarea className="json-editor" value={json} onChange={(event) => setJson(event.target.value)} />
              </details>
              <button className="primary" onClick={() => void upsert()}>保存产品配置</button>
              <ProfileSection title="版本历史" wide>
                <div className="filters">
                  <SortSelect label="版本排序" value={versionFilters.sort} options={INSTRUMENT_VERSION_SORTS} onChange={(sort) => updateVersionFilters({ sort })} />
                  <TextFilter label="Limit" value={versionFilters.limit} onChange={(value) => updateVersionFilters({ limit: value })} />
                  <button onClick={() => void loadVersions(selected.symbol, "")} disabled={historyLoading}><Search size={16} />查询版本</button>
                </div>
                <DataTable rows={versions as unknown as UnknownRecord[]} columns={["version", "status", "contractType", "expiryTime", "effectiveTime", "updatedAt", "makerFeeRatePpm", "takerFeeRatePpm", "maxLeveragePpm"]} onRowClick={(row) => setSelected(row as unknown as Instrument)} />
                <CursorPager
                  page={versionPage}
                  cursor={versionFilters.cursor}
                  onNext={() => void loadVersions(selected.symbol, versionPage.nextCursor)}
                  onReset={() => void loadVersions(selected.symbol, "")}
                />
              </ProfileSection>
            </div>
          ) : <Empty text="选择一个产品" />}
        </Panel>
      </TwoColumn>
    </Page>
  );
}

function parseInstrumentDraft(json: string): { value: UnknownRecord | null; error: string } {
  if (!json.trim()) return { value: null, error: "" };
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: null, error: "产品配置必须是 JSON object。" };
    }
    return { value: parsed as UnknownRecord, error: "" };
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : "JSON 格式错误。" };
  }
}

function normalizeInstrumentDraft(next: UnknownRecord, changedField: string): UnknownRecord {
  const contractType = String(next.contractType ?? "");
  const inferredType = instrumentTypeForContract(contractType);
  const instrumentType = changedField === "contractType" && inferredType
    ? inferredType
    : String(next.instrumentType ?? "");
  if (instrumentType) {
    next.instrumentType = instrumentType;
    const allowed = CONTRACT_TYPES_BY_INSTRUMENT[instrumentType] ?? CONTRACT_TYPES;
    if (!allowed.includes(String(next.contractType ?? ""))) {
      next.contractType = allowed[0];
    }
  }
  if (instrumentType !== "PERPETUAL") {
    next.fundingIntervalHours = 0;
    next.interestRatePpm = 0;
    next.fundingRateCapPpm = 0;
    next.fundingRateFloorPpm = 0;
  }
  if (instrumentType === "SPOT") {
    next.reduceOnlyEnabled = false;
    next.riskLimitBrackets = [];
  }
  if (instrumentType === "SPOT" || instrumentType === "PERPETUAL") {
    next.expiryTime = null;
    next.deliveryTime = null;
    next.underlyingSymbol = null;
    next.strikePriceUnits = null;
    next.optionType = null;
    next.optionExerciseStyle = null;
    next.settlementMethod = null;
  }
  if (instrumentType === "DELIVERY") {
    next.settlementMethod = next.settlementMethod || "CASH";
    next.strikePriceUnits = null;
    next.optionType = null;
    next.optionExerciseStyle = null;
  }
  if (instrumentType === "OPTION") {
    next.contractType = "VANILLA_OPTION";
    next.optionType = next.optionType || "CALL";
    next.optionExerciseStyle = next.optionExerciseStyle || "EUROPEAN";
    next.settlementMethod = next.settlementMethod || "CASH";
  }
  return next;
}

function instrumentTypeForContract(contractType: string) {
  return Object.entries(CONTRACT_TYPES_BY_INSTRUMENT)
    .find(([, contractTypes]) => contractTypes.includes(contractType))?.[0] ?? "";
}

function isFundingInstrument(instrument?: Instrument | null): boolean {
  const instrumentType = String(instrument?.instrumentType ?? "");
  const contractType = String(instrument?.contractType ?? "");
  return instrumentType === "PERPETUAL"
    || contractType === "LINEAR_PERPETUAL"
    || contractType === "INVERSE_PERPETUAL"
    || contractType === "LINEAR"
    || contractType === "INVERSE";
}

function DraftTextField({ label, field, draft, update, upper = false }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
  upper?: boolean;
}) {
  const value = String(draft?.[field] ?? "");
  return (
    <label>{label}
      <input
        value={value}
        onChange={(event) => update(field, upper ? event.target.value.toUpperCase() : event.target.value)}
      />
    </label>
  );
}

function DraftOptionalTextField({ label, field, draft, update, upper = false }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
  upper?: boolean;
}) {
  const value = String(draft?.[field] ?? "");
  return (
    <label>{label}
      <input
        value={value}
        onChange={(event) => {
          const next = upper ? event.target.value.toUpperCase() : event.target.value;
          update(field, next.trim() ? next : null);
        }}
      />
    </label>
  );
}

function DraftNumberField({ label, field, draft, update }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
}) {
  const value = draft?.[field];
  return (
    <label>{label}
      <input
        inputMode="numeric"
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(event) => {
          const next = event.target.value.trim();
          update(field, next === "" ? "" : Number(next));
        }}
      />
    </label>
  );
}

function DraftOptionalNumberField({ label, field, draft, update }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
}) {
  const value = draft?.[field];
  return (
    <label>{label}
      <input
        inputMode="numeric"
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(event) => {
          const next = event.target.value.trim();
          update(field, next === "" ? null : Number(next));
        }}
      />
    </label>
  );
}

function DraftSelectField({ label, field, draft, update, options }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
  options: string[];
}) {
  const value = String(draft?.[field] ?? "");
  return (
    <label>{label}
      <select value={value} onChange={(event) => update(field, event.target.value)}>
        <option value="">请选择</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function DraftOptionalSelectField({ label, field, draft, update, options }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
  options: string[];
}) {
  const value = String(draft?.[field] ?? "");
  return (
    <label>{label}
      <select value={value} onChange={(event) => update(field, event.target.value || null)}>
        <option value="">请选择</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function DraftCsvField({ label, field, draft, update }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
}) {
  const value = draft?.[field];
  const text = Array.isArray(value) ? value.join(",") : String(value ?? "");
  return (
    <label>{label}
      <input
        value={text}
        onChange={(event) => update(field, event.target.value
          .split(",")
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean))}
      />
    </label>
  );
}

function DraftCheckboxField({ label, field, draft, update }: {
  label: string;
  field: string;
  draft: UnknownRecord | null;
  update: (field: string, value: unknown) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={Boolean(draft?.[field])}
        onChange={(event) => update(field, event.target.checked)}
      />
      {label}
    </label>
  );
}

function MarketHealthOverview({ health }: { health: UnknownRecord }) {
  const summary = objectValue(health.summary);
  const symbols = extractRows(health.symbols);
  const sources = extractRows(health.sources);
  const warnings = extractRows(health.warnings);
  const unhealthyIndex = Number(summary.unhealthyIndexSymbols ?? 0);
  const unhealthyMark = Number(summary.unhealthyMarkSymbols ?? 0);
  const staleCandles = Number(summary.staleCandleSymbols ?? 0);
  const sourceIssues = Number(summary.sourceIssueSymbols ?? 0);

  return (
    <div className="stack">
      <div className="metrics">
        <Metric label="监控产品" value={summary.totalSymbols ?? 0} tone="muted" />
        <Metric label="交易中产品" value={summary.tradingSymbols ?? 0} tone="ok" />
        <Metric label="Index 异常" value={unhealthyIndex} tone={unhealthyIndex ? "danger" : "ok"} />
        <Metric label="Mark 异常" value={unhealthyMark} tone={unhealthyMark ? "danger" : "ok"} />
        <Metric label="K线过期" value={staleCandles} tone={staleCandles ? "warn" : "ok"} />
        <Metric label="源异常" value={sourceIssues} tone={sourceIssues ? "warn" : "ok"} />
        <Metric label="最大源延迟" value={`${compactNumber(summary.maxSourceLatencyMillis ?? 0)} ms`} tone={Number(summary.maxSourceLatencyMillis ?? 0) > 1000 ? "warn" : "muted"} />
        <Metric label="最大 Mark 偏离" value={ppmPercent(summary.maxMarkIndexDeviationPpm)} tone={Number(summary.maxMarkIndexDeviationPpm ?? 0) > 5000 ? "warn" : "muted"} />
      </div>
      <TwoColumn>
        <Panel title="价格链路健康">
          <DataTable
            rows={symbols}
            columns={[
              "symbol",
              "instrumentStatus",
              "indexStatus",
              "markStatus",
              "indexPrice",
              "markPrice",
              "markIndexDeviationPpm",
              "validComponentCount",
              "componentCount",
              "indexAgeSeconds",
              "markAgeSeconds",
              "candleAgeSeconds"
            ]}
          />
        </Panel>
        <Panel title="行情源状态">
          <DataTable
            rows={sources}
            columns={[
              "symbol",
              "source",
              "sourceSymbol",
              "status",
              "reason",
              "latencyMillis",
              "price",
              "bidPrice",
              "askPrice",
              "receivedAt"
            ]}
          />
        </Panel>
      </TwoColumn>
      {warnings.length > 0 && (
        <Panel title="市场监控告警">
          <DataTable rows={warnings} columns={["area", "source", "message"]} />
        </Panel>
      )}
    </div>
  );
}

function OrdersPage() {
  const [filters, setFilters] = useState({
    productLine: "LINEAR_PERPETUAL",
    userId: "",
    symbol: "",
    status: "",
    orderId: "",
    limit: "100",
    orderCursor: "",
    triggerCursor: "",
    tradeCursor: "",
    orderSort: "createdAt.desc",
    triggerSort: "createdAt.desc",
    tradeSort: "eventTime.desc"
  });
  const [metricsWindowMinutes, setMetricsWindowMinutes] = useState("1440");
  const [metrics, setMetrics] = useState<UnknownRecord | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [orderPageInfo, setOrderPageInfo] = useState(cursorInfo());
  const [timeline, setTimeline] = useState<UnknownRecord | null>(null);
  const [triggerOrders, setTriggerOrders] = useState<UnknownRecord[]>([]);
  const [triggerPageInfo, setTriggerPageInfo] = useState(cursorInfo());
  const [triggerTimeline, setTriggerTimeline] = useState<UnknownRecord | null>(null);
  const [cancelPreview, setCancelPreview] = useState<UnknownRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("Admin operation cancel");
  const [trades, setTrades] = useState<UnknownRecord[]>([]);
  const [tradePageInfo, setTradePageInfo] = useState(cursorInfo());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((current) => ({
      ...current,
      ...patch,
      orderCursor: "",
      triggerCursor: "",
      tradeCursor: ""
    }));
  }

  async function load(nextOrderCursor = filters.orderCursor,
                      nextTriggerCursor = filters.triggerCursor,
                      nextTradeCursor = filters.tradeCursor) {
    setLoading(true);
    setError("");
    try {
      const orderStatus = ORDER_STATUSES.includes(filters.status) ? filters.status : "";
      const triggerStatus = TRIGGER_ORDER_STATUSES.includes(filters.status) ? filters.status : "";
      const [metricsResponse, response, triggerResponse, tradeResponse] = await Promise.all([
        tradingMetrics({ windowMinutes: Number(metricsWindowMinutes) || 1440, productLine: filters.productLine, limit: 20 }),
        gatewayGet<{ orders?: OrderRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("trading-orders", "", {
          userId: filters.userId,
          symbol: filters.symbol,
          status: orderStatus,
          orderId: filters.orderId,
          productLine: filters.productLine,
          limit: Number(filters.limit) || 100,
          cursor: nextOrderCursor,
          sort: filters.orderSort
        }),
        gatewayGet<{ orders?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("trading-trigger", "", {
          userId: filters.userId,
          symbol: filters.symbol,
          status: triggerStatus,
          triggerOrderId: filters.orderId,
          productLine: filters.productLine,
          limit: Number(filters.limit) || 100,
          cursor: nextTriggerCursor,
          sort: filters.triggerSort
        }),
        gatewayGet<{ trades?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("trading-orders", "/trades", {
          userId: filters.userId,
          symbol: filters.symbol,
          orderId: filters.orderId,
          productLine: filters.productLine,
          limit: Number(filters.limit) || 100,
          cursor: nextTradeCursor,
          sort: filters.tradeSort
        })
      ]);
      setMetrics(metricsResponse);
      setOrders(response.orders ?? []);
      setOrderPageInfo(cursorInfo(response));
      setTriggerOrders(triggerResponse.orders ?? []);
      setTriggerPageInfo(cursorInfo(triggerResponse));
      setTrades(tradeResponse.trades ?? []);
      setTradePageInfo(cursorInfo(tradeResponse));
      setFilters((current) => ({
        ...current,
        orderCursor: nextOrderCursor,
        triggerCursor: nextTriggerCursor,
        tradeCursor: nextTradeCursor
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeline(orderId: number) {
    const response = await gatewayGet<UnknownRecord>("trading-orders", `/${orderId}/timeline`, { productLine: filters.productLine });
    setTimeline(response);
  }

  async function loadTriggerTimeline(triggerOrderId: number) {
    const response = await gatewayGet<UnknownRecord>("trading-trigger", `/${triggerOrderId}/timeline`, { productLine: filters.productLine });
    setTriggerTimeline(response);
  }

  async function cancelOrder(orderId: unknown) {
    if (!orderId) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setError("请输入后台撤单原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await gatewayPost("trading-orders", `/${orderId}/cancel`, { reason }, { productLine: filters.productLine });
      await load("", filters.triggerCursor, filters.tradeCursor);
      await loadTimeline(Number(orderId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function batchCancel() {
    const reason = cancelReason.trim();
    if (!reason) {
      setError("请输入批量撤单原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await gatewayPost<UnknownRecord>("trading-orders", "/cancel", {
        userId: filters.userId ? Number(filters.userId) : undefined,
        symbol: filters.symbol || undefined,
        limit: Number(filters.limit) || 100,
        reason
      }, { productLine: filters.productLine });
      setTimeline(response);
      await load("", filters.triggerCursor, filters.tradeCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function previewCancelImpact() {
    setLoading(true);
    setError("");
    try {
      const response = await gatewayGet<UnknownRecord>("trading-orders", "/cancel-preview", {
        userId: filters.userId ? Number(filters.userId) : undefined,
        symbol: filters.symbol || undefined,
        productLine: filters.productLine,
        limit: Number(filters.limit) || 100
      });
      setCancelPreview(response);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function cancelBySymbol() {
    if (!filters.symbol) {
      setError("按 Symbol 撤单需要先输入 Symbol。");
      return;
    }
    const reason = cancelReason.trim();
    if (!reason) {
      setError("请输入按 Symbol 撤单原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await gatewayPost<UnknownRecord>("trading-orders", "/cancel-by-symbol", {
        symbol: filters.symbol,
        limit: Number(filters.limit) || 100,
        reason
      }, { productLine: filters.productLine });
      setTimeline(response);
      await load("", filters.triggerCursor, filters.tradeCursor);
      await previewCancelImpact();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <Page title="订单审计" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <label>产品线<select value={filters.productLine} onChange={(event) => updateFilters({ productLine: event.target.value })}>{PRODUCT_LINES.map((item) => <option key={item} value={item}>{item || "全部"}</option>)}</select></label>
        <TextFilter label="User ID" value={filters.userId} onChange={(value) => updateFilters({ userId: value })} />
        <TextFilter label="Symbol" value={filters.symbol} onChange={(value) => updateFilters({ symbol: value.toUpperCase() })} />
        <TextFilter label="Order / Trigger ID" value={filters.orderId} onChange={(value) => updateFilters({ orderId: value })} />
        <label>状态<select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}>{AUDIT_STATUS_FILTERS.map((item) => <option key={item} value={item}>{item || "全部"}</option>)}</select></label>
        <label>统计窗口<select value={metricsWindowMinutes} onChange={(event) => setMetricsWindowMinutes(event.target.value)}>
          <option value="60">1 小时</option>
          <option value="360">6 小时</option>
          <option value="1440">24 小时</option>
          <option value="10080">7 天</option>
        </select></label>
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => updateFilters({ limit: value })} />
        <SortSelect label="订单排序" value={filters.orderSort} options={CREATED_AT_SORTS} onChange={(value) => updateFilters({ orderSort: value })} />
        <SortSelect label="条件单排序" value={filters.triggerSort} options={CREATED_AT_SORTS} onChange={(value) => updateFilters({ triggerSort: value })} />
        <SortSelect label="成交排序" value={filters.tradeSort} options={EVENT_TIME_SORTS} onChange={(value) => updateFilters({ tradeSort: value })} />
        <TextFilter label="撤单原因" value={cancelReason} onChange={setCancelReason} />
        <button onClick={() => void load("", "", "")}><Search size={16} />查询</button>
        <button onClick={() => void previewCancelImpact()}>预览撤单影响</button>
        <button className="primary" onClick={() => void batchCancel()}>批量撤单</button>
        <button className="primary" onClick={() => void cancelBySymbol()}>按 Symbol 撤单</button>
      </div>
      {metrics && <TradingMetricsOverview metrics={metrics} />}
      {cancelPreview && <Panel title="撤单影响预览"><JsonBlock value={cancelPreview} /></Panel>}
      <TwoColumn>
        <Panel title="订单列表">
          <CursorPager
            page={orderPageInfo}
            cursor={filters.orderCursor}
            onNext={() => void load(orderPageInfo.nextCursor || "", filters.triggerCursor, filters.tradeCursor)}
            onReset={() => void load("", filters.triggerCursor, filters.tradeCursor)}
          />
          <DataTable
            rows={orders as unknown as UnknownRecord[]}
            columns={["orderId", "userId", "symbol", "side", "positionSide", "orderType", "priceTicks", "quantitySteps", "remainingQuantitySteps", "status", "createdAt"]}
            onRowClick={(row) => void loadTimeline(Number(row.orderId))}
            actions={(row) => <button onClick={() => void cancelOrder(row.orderId)}>撤单</button>}
          />
        </Panel>
        <Panel title="订单时间线">
          {timeline ? <JsonBlock value={timeline} /> : <Empty text="选择订单查看事件、撮合结果和成交" />}
        </Panel>
      </TwoColumn>
      <TwoColumn>
        <Panel title="条件单列表">
          <CursorPager
            page={triggerPageInfo}
            cursor={filters.triggerCursor}
            onNext={() => void load(filters.orderCursor, triggerPageInfo.nextCursor || "", filters.tradeCursor)}
            onReset={() => void load(filters.orderCursor, "", filters.tradeCursor)}
          />
          <DataTable
            rows={triggerOrders}
            columns={["triggerOrderId", "userId", "symbol", "side", "positionSide", "triggerType", "triggerPriceTicks", "orderType", "quantitySteps", "status", "placedOrderId", "createdAt"]}
            onRowClick={(row) => void loadTriggerTimeline(Number(row.triggerOrderId))}
          />
        </Panel>
        <Panel title="条件单时间线">
          {triggerTimeline ? <JsonBlock value={triggerTimeline} /> : <Empty text="选择条件单查看触发、执行和拒绝原因" />}
        </Panel>
      </TwoColumn>
      <Panel title="成交审计">
        <CursorPager
          page={tradePageInfo}
          cursor={filters.tradeCursor}
          onNext={() => void load(filters.orderCursor, filters.triggerCursor, tradePageInfo.nextCursor || "")}
          onReset={() => void load(filters.orderCursor, filters.triggerCursor, "")}
        />
        <DataTable
          rows={trades}
          columns={["tradeId", "symbol", "takerSide", "takerPositionSide", "makerPositionSide", "priceTicks", "quantitySteps", "takerOrderId", "makerOrderId", "eventTime"]}
        />
      </Panel>
    </Page>
  );
}

function TradingMetricsOverview({ metrics }: { metrics: UnknownRecord }) {
  const orders = objectValue(metrics.orders);
  const trades = objectValue(metrics.trades);
  const matching = objectValue(metrics.matching);
  const triggerOrders = objectValue(metrics.triggerOrders);
  const positions = objectValue(metrics.positions);
  const symbols = extractRows(metrics.symbols);
  const orderStatuses = extractRows(orders.statuses);
  const positionSymbols = extractRows(positions.symbols);
  const warnings = extractRows(metrics.warnings);

  return (
    <div className="stack">
      <div className="metrics">
        <Metric label="窗口内订单" value={orders.submitted ?? 0} tone="muted" />
        <Metric label="订单拒绝率" value={ppmPercent(orders.rejectRatePpm)} tone={Number(orders.rejected ?? 0) > 0 ? "warn" : "ok"} />
        <Metric label="窗口内成交" value={trades.trades ?? 0} tone="ok" />
        <Metric label="成交名义值" value={trades.notionalTicksSteps ?? 0} tone="muted" />
        <Metric label="撮合拒绝率" value={ppmPercent(matching.rejectRatePpm)} tone={Number(matching.rejectedCommands ?? 0) > 0 ? "warn" : "ok"} />
        <Metric label="未完成订单" value={orders.openOrders ?? 0} tone={Number(orders.openOrders ?? 0) > 0 ? "warn" : "muted"} />
        <Metric label="条件单待触发" value={triggerOrders.pending ?? 0} tone={Number(triggerOrders.expiredPending ?? 0) > 0 ? "danger" : "muted"} />
        <Metric label="持仓用户" value={positions.usersWithPositions ?? 0} tone="muted" />
      </div>
      <TwoColumn>
        <Panel title="Symbol 运营排名">
          <DataTable
            rows={symbols}
            columns={[
              "symbol",
              "submittedOrders",
              "trades",
              "notionalTicksSteps",
              "openOrders",
              "openInterestSteps",
              "lastTradePriceTicks",
              "lastTradeAt"
            ]}
          />
        </Panel>
        <Panel title="订单状态分布">
          <DataTable rows={orderStatuses} columns={["status", "total"]} />
        </Panel>
      </TwoColumn>
      <TwoColumn>
        <Panel title="持仓集中度">
          <DataTable
            rows={positionSymbols}
            columns={[
              "symbol",
              "openPositions",
              "users",
              "longPositions",
              "shortPositions",
              "longQuantitySteps",
              "shortQuantitySteps",
              "lastUpdatedAt"
            ]}
          />
        </Panel>
        <Panel title="交易链路状态">
          <KeyValue data={{
            generatedAt: metrics.generatedAt,
            windowMinutes: metrics.windowMinutes,
            uniqueOrderUsers: orders.uniqueUsers,
            uniqueTradeParticipants: trades.uniqueParticipants,
            matchingCommands: matching.commands,
            matchingRejectedCommands: matching.rejectedCommands,
            triggerExpiredPending: triggerOrders.expiredPending,
            openQuantitySteps: orders.openQuantitySteps,
            longQuantitySteps: positions.longQuantitySteps,
            shortQuantitySteps: positions.shortQuantitySteps,
            lastTradeAt: trades.lastTradeAt,
            lastOpenOrderUpdatedAt: orders.lastOpenUpdatedAt
          }} />
        </Panel>
      </TwoColumn>
      {warnings.length > 0 && (
        <Panel title="指标告警">
          <DataTable rows={warnings} columns={["area", "source", "message"]} />
        </Panel>
      )}
    </div>
  );
}

function AccountsPage() {
  const [userId, setUserId] = useState("1001");
  const [accountType, setAccountType] = useState("USDT_PERPETUAL");
  const [asset, setAsset] = useState("USDT");
  const [data, setData] = useState<AccountData | null>(null);
  const [adjust, setAdjust] = useState({ amountUnits: "", referenceId: "", reason: "" });
  const [adjustmentFilters, setAdjustmentFilters] = useState({
    adminUserId: "",
    adjustmentKind: "",
    referenceId: "",
    limit: "100",
    cursor: "",
    sort: "createdAt.desc"
  });
  const [ledgerFilters, setLedgerFilters] = useState({
    limit: "100",
    sort: "createdAt.desc",
    ledgerCursor: "",
    productLedgerCursor: "",
    transferCursor: ""
  });
  const [ledgerPageInfo, setLedgerPageInfo] = useState(cursorInfo());
  const [productLedgerPageInfo, setProductLedgerPageInfo] = useState(cursorInfo());
  const [transferPageInfo, setTransferPageInfo] = useState(cursorInfo());
  const [adjustmentPageInfo, setAdjustmentPageInfo] = useState(cursorInfo());
  const [reportFilters, setReportFilters] = useState({
    valuationAsset: "USDT",
    userId: "",
    accountType: "",
    asset: "",
    snapshotDate: new Date().toISOString().slice(0, 10),
    limit: "100",
    valuationCursor: "",
    valuationSort: "valuationValue.desc",
    snapshotCursor: "",
    snapshotSort: "snapshotDate.desc"
  });
  const [valuationPageInfo, setValuationPageInfo] = useState(cursorInfo());
  const [snapshotPageInfo, setSnapshotPageInfo] = useState(cursorInfo());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function resetListCursors() {
    setLedgerFilters((current) => ({
      ...current,
      ledgerCursor: "",
      productLedgerCursor: "",
      transferCursor: ""
    }));
    setAdjustmentFilters((current) => ({ ...current, cursor: "" }));
  }

  function updateLedgerFilters(patch: Partial<typeof ledgerFilters>) {
    setLedgerFilters((current) => ({
      ...current,
      ...patch,
      ledgerCursor: "",
      productLedgerCursor: "",
      transferCursor: ""
    }));
  }

  function updateAdjustmentFilters(patch: Partial<typeof adjustmentFilters>) {
    setAdjustmentFilters((current) => ({
      ...current,
      ...patch,
      cursor: ""
    }));
  }

  function updateReportFilters(patch: Partial<typeof reportFilters>) {
    setReportFilters((current) => ({
      ...current,
      ...patch,
      valuationCursor: "",
      snapshotCursor: ""
    }));
  }

  async function load(nextLedgerCursor = ledgerFilters.ledgerCursor,
                      nextProductLedgerCursor = ledgerFilters.productLedgerCursor,
                      nextTransferCursor = ledgerFilters.transferCursor,
                      nextAdjustmentCursor = adjustmentFilters.cursor,
                      nextValuationCursor = reportFilters.valuationCursor,
                      nextSnapshotCursor = reportFilters.snapshotCursor) {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const productLine = productLineForAccountType(accountType);
      const adjustmentParams = {
        userId,
        asset,
        adminUserId: adjustmentFilters.adminUserId || undefined,
        adjustmentKind: adjustmentFilters.adjustmentKind || undefined,
        referenceId: adjustmentFilters.referenceId || undefined,
        limit: Number(adjustmentFilters.limit) || 100,
        cursor: nextAdjustmentCursor,
        sort: adjustmentFilters.sort,
        ...(adjustmentFilters.adjustmentKind === "PRODUCT" ? { accountType, productLine } : {})
      };
      const reportParams = {
        valuationAsset: reportFilters.valuationAsset || "USDT",
        userId: reportFilters.userId || undefined,
        accountType: reportFilters.accountType || undefined,
        asset: reportFilters.asset || undefined,
        nonZeroOnly: "true",
        limit: Number(reportFilters.limit) || 100,
        cursor: nextValuationCursor,
        sort: reportFilters.valuationSort
      };
      const snapshotParams = {
        snapshotDate: reportFilters.snapshotDate || undefined,
        valuationAsset: reportFilters.valuationAsset || "USDT",
        accountType: reportFilters.accountType || undefined,
        asset: reportFilters.asset || undefined,
        limit: Number(reportFilters.limit) || 100,
        cursor: nextSnapshotCursor,
        sort: reportFilters.snapshotSort
      };
      const [
        balances,
        productBalances,
        positions,
        ledger,
        productLedger,
        transfers,
        adjustments,
        assetValuation,
        assetSnapshots,
        snapshotAlerts
      ] = await Promise.all([
        gatewayGet<{ balances?: BalanceRecord[] }>("account", "/balances", { userId }),
        gatewayGet<{ balances?: BalanceRecord[] }>("account", "/product-balances", { userId, accountType, productLine }),
        gatewayGet<{ positions?: PositionRecord[] }>("account", "/positions", { userId, productLine }),
        gatewayGet<{ entries?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>(
          "account",
          "/ledger",
          {
            userId,
            asset,
            limit: Number(ledgerFilters.limit) || 100,
            cursor: nextLedgerCursor,
            sort: ledgerFilters.sort
          }
        ),
        gatewayGet<{ entries?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>(
          "account",
          "/product-ledger",
          {
            userId,
            accountType,
            asset,
            productLine,
            limit: Number(ledgerFilters.limit) || 100,
            cursor: nextProductLedgerCursor,
            sort: ledgerFilters.sort
          }
        ),
        gatewayGet<{ transfers?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>(
          "account",
          "/transfers",
          {
            userId,
            accountType,
            asset,
            productLine,
            limit: Number(ledgerFilters.limit) || 100,
            cursor: nextTransferCursor,
            sort: ledgerFilters.sort
          }
        ),
        accountAdjustments(adjustmentParams),
        accountAssetValuation(reportParams),
        accountAssetSnapshots(snapshotParams),
        alertEvents({ status: "OPEN", domain: "SYSTEM", limit: 100 })
      ]);
      setData({
        balances: balances.balances ?? [],
        productBalances: productBalances.balances ?? [],
        positions: positions.positions ?? [],
        ledger: ledger.entries ?? [],
        productLedger: productLedger.entries ?? [],
        transfers: transfers.transfers ?? [],
        adjustments: adjustments.adjustments ?? [],
        assetValuation,
        assetSnapshots: assetSnapshots.snapshots ?? [],
        assetSnapshotAlerts: records(snapshotAlerts.events)
          .filter((row) => row.metricKey === "ACCOUNT_ASSET_SNAPSHOT_DIFF_PPM")
      });
      setLedgerPageInfo(cursorInfo(ledger));
      setProductLedgerPageInfo(cursorInfo(productLedger));
      setTransferPageInfo(cursorInfo(transfers));
      setAdjustmentPageInfo(cursorInfo(adjustments));
      setValuationPageInfo(cursorInfo(assetValuation));
      setSnapshotPageInfo(cursorInfo(assetSnapshots));
      setLedgerFilters((current) => ({
        ...current,
        ledgerCursor: nextLedgerCursor,
        productLedgerCursor: nextProductLedgerCursor,
        transferCursor: nextTransferCursor
      }));
      setAdjustmentFilters((current) => ({ ...current, cursor: nextAdjustmentCursor }));
      setReportFilters((current) => ({
        ...current,
        valuationCursor: nextValuationCursor,
        snapshotCursor: nextSnapshotCursor
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function adjustBalance(product: boolean) {
    const body = {
      userId: Number(userId),
      ...(product ? { accountType } : {}),
      asset,
      amountUnits: Number(adjust.amountUnits),
      referenceId: adjust.referenceId,
      reason: adjust.reason
    };
    setLoading(true);
    setError("");
    try {
      const productLine = product ? productLineForAccountType(accountType) : "";
      await gatewayPost(
        "account",
        product ? "/product-balance-adjustments" : "/balance-adjustments",
        body,
        productLine ? { productLine } : {}
      );
      setAdjust({ amountUnits: "", referenceId: "", reason: "" });
      await load("", "", "", "", "", "");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  async function generateAssetSnapshot() {
    setLoading(true);
    setError("");
    try {
      await createAccountAssetSnapshot({
        valuationAsset: reportFilters.valuationAsset || "USDT",
        snapshotDate: reportFilters.snapshotDate || undefined
      });
      await load("", "", "", "", "", "");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const valuationRows = records(data?.assetValuation?.rows as UnknownRecord[] | undefined);
  const valuationTotals = objectValue(data?.assetValuation?.totals);
  const valuationWarnings = records(data?.assetValuation?.warnings as UnknownRecord[] | undefined);
  const snapshotAlerts = records(data?.assetSnapshotAlerts);

  return (
    <Page title="账户资产" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <TextFilter label="User ID" value={userId} onChange={(value) => { setUserId(value); resetListCursors(); }} />
        <label>账户类型<select value={accountType} onChange={(event) => { setAccountType(event.target.value); resetListCursors(); }}>{ACCOUNT_TYPES.filter(Boolean).map((item) => <option key={item}>{item}</option>)}</select></label>
        <TextFilter label="Asset" value={asset} onChange={(value) => { setAsset(value.toUpperCase()); resetListCursors(); }} />
        <TextFilter label="流水 Limit" value={ledgerFilters.limit} onChange={(value) => updateLedgerFilters({ limit: value })} />
        <SortSelect label="流水排序" value={ledgerFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => updateLedgerFilters({ sort: value })} />
        <button onClick={() => void load("", "", "", "", reportFilters.valuationCursor, reportFilters.snapshotCursor)}><Search size={16} />查询</button>
      </div>
      <div className="three-grid">
        <Panel title="基础余额"><DataTable rows={records(data?.balances)} /></Panel>
        <Panel title="产品余额"><DataTable rows={records(data?.productBalances)} /></Panel>
        <Panel title="持仓"><DataTable rows={records(data?.positions)} maxColumns={8} /></Panel>
      </div>
      <Panel title="资产估值报表">
        <div className="filters">
          <TextFilter
            label="计价资产"
            value={reportFilters.valuationAsset}
            onChange={(value) => updateReportFilters({ valuationAsset: value.toUpperCase() })}
          />
          <TextFilter
            label="User ID"
            value={reportFilters.userId}
            onChange={(value) => updateReportFilters({ userId: value })}
          />
          <label>账户类型
            <select
              value={reportFilters.accountType}
              onChange={(event) => updateReportFilters({ accountType: event.target.value })}
            >
              {["", "BASIC", ...ACCOUNT_TYPES.filter(Boolean)].map((item) => <option key={item || "ALL"} value={item}>{item || "全部"}</option>)}
            </select>
          </label>
          <TextFilter
            label="Asset"
            value={reportFilters.asset}
            onChange={(value) => updateReportFilters({ asset: value.toUpperCase() })}
          />
          <TextFilter
            label="快照日期"
            value={reportFilters.snapshotDate}
            onChange={(value) => updateReportFilters({ snapshotDate: value })}
          />
          <TextFilter
            label="Limit"
            value={reportFilters.limit}
            onChange={(value) => updateReportFilters({ limit: value })}
          />
          <SortSelect
            label="估值排序"
            value={reportFilters.valuationSort}
            options={ACCOUNT_VALUATION_SORTS}
            onChange={(value) => updateReportFilters({ valuationSort: value })}
          />
          <SortSelect
            label="快照排序"
            value={reportFilters.snapshotSort}
            options={ACCOUNT_SNAPSHOT_SORTS}
            onChange={(value) => updateReportFilters({ snapshotSort: value })}
          />
          <button onClick={() => void load("", "", "", "", "", "")}><Search size={16} />查询</button>
          <button className="primary" onClick={() => void generateAssetSnapshot()}>生成快照</button>
        </div>
        <div className="metrics">
          <Metric label="估值合计" value={valuationTotals.totalValue ?? "0"} tone="ok" />
          <Metric label="账户行" value={valuationTotals.rows ?? 0} tone="muted" />
          <Metric label="用户数" value={valuationTotals.uniqueUsers ?? 0} tone="muted" />
          <Metric label="已计价" value={valuationTotals.pricedRows ?? 0} tone="ok" />
          <Metric label="缺汇率" value={valuationTotals.missingRateRows ?? 0} tone={Number(valuationTotals.missingRateRows ?? 0) > 0 ? "warn" : "ok"} />
          <Metric label="快照差异告警" value={snapshotAlerts.length} tone={snapshotAlerts.length ? "danger" : "ok"} />
        </div>
        {valuationWarnings.length > 0 && (
          <DataTable rows={valuationWarnings} columns={["area", "message"]} />
        )}
        <CursorPager
          page={valuationPageInfo}
          cursor={reportFilters.valuationCursor}
          onNext={() => void load(
            ledgerFilters.ledgerCursor,
            ledgerFilters.productLedgerCursor,
            ledgerFilters.transferCursor,
            adjustmentFilters.cursor,
            valuationPageInfo.nextCursor || "",
            reportFilters.snapshotCursor
          )}
          onReset={() => void load(
            ledgerFilters.ledgerCursor,
            ledgerFilters.productLedgerCursor,
            ledgerFilters.transferCursor,
            adjustmentFilters.cursor,
            "",
            reportFilters.snapshotCursor
          )}
        />
        <DataTable
          rows={valuationRows}
          columns={[
            "accountType",
            "userId",
            "asset",
            "availableUnits",
            "lockedUnits",
            "equityUnits",
            "scaleUnits",
            "valuationRate",
            "valuationValue",
            "valuationSource",
            "rateUpdatedAt",
            "balanceUpdatedAt"
          ]}
          maxColumns={12}
        />
      </Panel>
      <Panel title="日终资产快照">
        {snapshotAlerts.length > 0 && (
          <DataTable
            rows={snapshotAlerts}
            columns={["severity", "target", "currentValue", "thresholdValue", "message", "lastSeenAt", "occurrences"]}
          />
        )}
        <CursorPager
          page={snapshotPageInfo}
          cursor={reportFilters.snapshotCursor}
          onNext={() => void load(
            ledgerFilters.ledgerCursor,
            ledgerFilters.productLedgerCursor,
            ledgerFilters.transferCursor,
            adjustmentFilters.cursor,
            reportFilters.valuationCursor,
            snapshotPageInfo.nextCursor || ""
          )}
          onReset={() => void load(
            ledgerFilters.ledgerCursor,
            ledgerFilters.productLedgerCursor,
            ledgerFilters.transferCursor,
            adjustmentFilters.cursor,
            reportFilters.valuationCursor,
            ""
          )}
        />
        <DataTable
          rows={records(data?.assetSnapshots)}
          columns={[
            "snapshotDate",
            "valuationAsset",
            "accountType",
            "asset",
            "totalAvailableUnits",
            "totalLockedUnits",
            "totalEquityUnits",
            "valuationRate",
            "totalValue",
            "valuationSource",
            "userCount",
            "createdAt"
          ]}
          maxColumns={12}
        />
      </Panel>
      <Panel title="人工调整">
        <div className="filters">
          <label>金额 Units<input value={adjust.amountUnits} onChange={(event) => setAdjust({ ...adjust, amountUnits: event.target.value })} /></label>
          <label>Reference ID<input value={adjust.referenceId} onChange={(event) => setAdjust({ ...adjust, referenceId: event.target.value })} /></label>
          <label>原因<input value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} /></label>
          <button onClick={() => void adjustBalance(false)}>调整基础余额</button>
          <button className="primary" onClick={() => void adjustBalance(true)}>调整产品余额</button>
        </div>
      </Panel>
      <Panel title="人工调整追溯">
        <div className="filters">
          <label>类型
            <select
              value={adjustmentFilters.adjustmentKind}
              onChange={(event) => updateAdjustmentFilters({ adjustmentKind: event.target.value })}
            >
              <option value="">全部</option>
              <option value="BASIC">BASIC</option>
              <option value="PRODUCT">PRODUCT</option>
            </select>
          </label>
          <TextFilter
            label="管理员 ID"
            value={adjustmentFilters.adminUserId}
            onChange={(value) => updateAdjustmentFilters({ adminUserId: value })}
          />
          <TextFilter
            label="Reference ID"
            value={adjustmentFilters.referenceId}
            onChange={(value) => updateAdjustmentFilters({ referenceId: value })}
          />
          <TextFilter
            label="Limit"
            value={adjustmentFilters.limit}
            onChange={(value) => updateAdjustmentFilters({ limit: value })}
          />
          <SortSelect label="排序" value={adjustmentFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => updateAdjustmentFilters({ sort: value })} />
          <button onClick={() => void load(ledgerFilters.ledgerCursor, ledgerFilters.productLedgerCursor, ledgerFilters.transferCursor, "")}><Search size={16} />查询</button>
        </div>
        <CursorPager
          page={adjustmentPageInfo}
          cursor={adjustmentFilters.cursor}
          onNext={() => void load(
            ledgerFilters.ledgerCursor,
            ledgerFilters.productLedgerCursor,
            ledgerFilters.transferCursor,
            adjustmentPageInfo.nextCursor || ""
          )}
          onReset={() => void load(ledgerFilters.ledgerCursor, ledgerFilters.productLedgerCursor, ledgerFilters.transferCursor, "")}
        />
        <DataTable
          rows={records(data?.adjustments)}
          columns={[
            "adjustmentId",
            "adjustmentKind",
            "adminUserId",
            "adminUsername",
            "userId",
            "accountType",
            "asset",
            "amountUnits",
            "balanceAfterUnits",
            "referenceId",
            "reason",
            "createdAt"
          ]}
          maxColumns={12}
        />
      </Panel>
      <div className="three-grid">
        <Panel title="基础流水">
          <CursorPager
            page={ledgerPageInfo}
            cursor={ledgerFilters.ledgerCursor}
            onNext={() => void load(ledgerPageInfo.nextCursor || "", ledgerFilters.productLedgerCursor, ledgerFilters.transferCursor, adjustmentFilters.cursor)}
            onReset={() => void load("", ledgerFilters.productLedgerCursor, ledgerFilters.transferCursor, adjustmentFilters.cursor)}
          />
          <DataTable rows={records(data?.ledger)} maxColumns={9} />
        </Panel>
        <Panel title="产品流水">
          <CursorPager
            page={productLedgerPageInfo}
            cursor={ledgerFilters.productLedgerCursor}
            onNext={() => void load(ledgerFilters.ledgerCursor, productLedgerPageInfo.nextCursor || "", ledgerFilters.transferCursor, adjustmentFilters.cursor)}
            onReset={() => void load(ledgerFilters.ledgerCursor, "", ledgerFilters.transferCursor, adjustmentFilters.cursor)}
          />
          <DataTable rows={records(data?.productLedger)} maxColumns={9} />
        </Panel>
        <Panel title="划转记录">
          <CursorPager
            page={transferPageInfo}
            cursor={ledgerFilters.transferCursor}
            onNext={() => void load(ledgerFilters.ledgerCursor, ledgerFilters.productLedgerCursor, transferPageInfo.nextCursor || "", adjustmentFilters.cursor)}
            onReset={() => void load(ledgerFilters.ledgerCursor, ledgerFilters.productLedgerCursor, "", adjustmentFilters.cursor)}
          />
          <DataTable rows={records(data?.transfers)} maxColumns={9} />
        </Panel>
      </div>
    </Page>
  );
}

function WalletPage() {
  const [dashboard, setDashboard] = useState<WalletDashboard | null>(null);
  const [admin, setAdmin] = useState<WalletAdminConfig | null>(null);
  const [finance, setFinance] = useState<UnknownRecord | null>(null);
  const [operations, setOperations] = useState<UnknownRecord | null>(null);
  const [operationAddresses, setOperationAddresses] = useState<UnknownRecord[]>([]);
  const [operationBalances, setOperationBalances] = useState<UnknownRecord[]>([]);
  const [operationExceptions, setOperationExceptions] = useState<UnknownRecord[]>([]);
  const [financeDeposits, setFinanceDeposits] = useState<UnknownRecord[]>([]);
  const [financeWithdrawals, setFinanceWithdrawals] = useState<UnknownRecord[]>([]);
  const [financeWithdrawalReviews, setFinanceWithdrawalReviews] = useState<UnknownRecord[]>([]);
  const [operationAddressPageInfo, setOperationAddressPageInfo] = useState(cursorInfo());
  const [operationBalancePageInfo, setOperationBalancePageInfo] = useState(cursorInfo());
  const [operationExceptionPageInfo, setOperationExceptionPageInfo] = useState(cursorInfo());
  const [financeDepositPageInfo, setFinanceDepositPageInfo] = useState(cursorInfo());
  const [financeWithdrawalPageInfo, setFinanceWithdrawalPageInfo] = useState(cursorInfo());
  const [financeReviewPageInfo, setFinanceReviewPageInfo] = useState(cursorInfo());
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedRow, setSelectedRow] = useState<UnknownRecord | null>(null);
  const [updateJson, setUpdateJson] = useState("{}");
  const [withdrawalReviewReason, setWithdrawalReviewReason] = useState("Manual withdrawal review");
  const [addressQuery, setAddressQuery] = useState({ address: "", chain: "", limit: "100" });
  const [operationFilters, setOperationFilters] = useState({
    chain: "",
    assetSymbol: "",
    userId: "",
    walletRole: "",
    address: "",
    eventType: "",
    exceptionStatus: "",
    limit: "100",
    sort: "updatedAt.desc",
    addressCursor: "",
    balanceCursor: "",
    exceptionCursor: ""
  });
  const [withdrawalFilters, setWithdrawalFilters] = useState({
    chain: "",
    assetSymbol: "",
    depositStatus: "",
    depositCredited: "",
    status: "PENDING_REVIEW",
    decision: "",
    adminUserId: "",
    userId: "",
    orderNo: "",
    limit: "100",
    sort: "updatedAt.desc",
    reviewSort: "createdAt.desc",
    depositCursor: "",
    withdrawalCursor: "",
    reviewCursor: ""
  });
  const [addressTransactions, setAddressTransactions] = useState<UnknownRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateOperationFilters(patch: Partial<typeof operationFilters>) {
    setOperationFilters((current) => ({
      ...current,
      ...patch,
      addressCursor: "",
      balanceCursor: "",
      exceptionCursor: ""
    }));
  }

  function updateWithdrawalFilters(patch: Partial<typeof withdrawalFilters>) {
    setWithdrawalFilters((current) => ({
      ...current,
      ...patch,
      depositCursor: "",
      withdrawalCursor: "",
      reviewCursor: ""
    }));
  }

  async function load(
    nextAddressCursor = operationFilters.addressCursor,
    nextBalanceCursor = operationFilters.balanceCursor,
    nextExceptionCursor = operationFilters.exceptionCursor,
    nextDepositCursor = withdrawalFilters.depositCursor,
    nextWithdrawalCursor = withdrawalFilters.withdrawalCursor,
    nextReviewCursor = withdrawalFilters.reviewCursor
  ) {
    setLoading(true);
    setError("");
    try {
      const [
        dashboardResponse,
        adminResponse,
        financeResponse,
        operationsResponse,
        addressResponse,
        balanceResponse,
        exceptionResponse,
        depositResponse,
        withdrawalResponse,
        reviewResponse
      ] = await Promise.all([
        gatewayGet<WalletResponse<WalletDashboard>>("wallet", "/dashboard", { limit: 200 }),
        gatewayGet<WalletResponse<WalletAdminConfig>>("wallet-admin", "/config", { limit: 200 }),
        walletFinanceSummary({
          chain: withdrawalFilters.chain,
          assetSymbol: withdrawalFilters.assetSymbol,
          windowHours: 24,
          limit: 100
        }),
        walletOperationsOverview({
          chain: operationFilters.chain,
          assetSymbol: operationFilters.assetSymbol,
          windowHours: 24,
          limit: Number(operationFilters.limit) || 100
        }),
        walletOperationAddresses({
          chain: operationFilters.chain,
          assetSymbol: operationFilters.assetSymbol,
          userId: operationFilters.userId,
          walletRole: operationFilters.walletRole,
          address: operationFilters.address,
          limit: Number(operationFilters.limit) || 100,
          cursor: nextAddressCursor,
          sort: operationFilters.sort
        }),
        walletOperationBalances({
          chain: operationFilters.chain,
          assetSymbol: operationFilters.assetSymbol,
          userId: operationFilters.userId,
          nonZeroOnly: "true",
          limit: Number(operationFilters.limit) || 100,
          cursor: nextBalanceCursor,
          sort: operationFilters.sort
        }),
        walletOperationExceptions({
          eventType: operationFilters.eventType,
          chain: operationFilters.chain,
          assetSymbol: operationFilters.assetSymbol,
          status: operationFilters.exceptionStatus,
          limit: Number(operationFilters.limit) || 100,
          cursor: nextExceptionCursor,
          sort: operationFilters.sort
        }),
        walletFinanceDeposits({
          chain: withdrawalFilters.chain,
          assetSymbol: withdrawalFilters.assetSymbol,
          status: withdrawalFilters.depositStatus,
          credited: withdrawalFilters.depositCredited,
          limit: Number(withdrawalFilters.limit) || 100,
          cursor: nextDepositCursor,
          sort: withdrawalFilters.sort
        }),
        walletFinanceWithdrawals({
          chain: withdrawalFilters.chain,
          assetSymbol: withdrawalFilters.assetSymbol,
          status: withdrawalFilters.status,
          userId: withdrawalFilters.userId,
          orderNo: withdrawalFilters.orderNo,
          limit: Number(withdrawalFilters.limit) || 100,
          cursor: nextWithdrawalCursor,
          sort: withdrawalFilters.sort
        }),
        walletFinanceWithdrawalReviews({
          chain: withdrawalFilters.chain,
          assetSymbol: withdrawalFilters.assetSymbol,
          decision: withdrawalFilters.decision,
          adminUserId: withdrawalFilters.adminUserId,
          userId: withdrawalFilters.userId,
          orderNo: withdrawalFilters.orderNo,
          limit: Number(withdrawalFilters.limit) || 100,
          cursor: nextReviewCursor,
          sort: withdrawalFilters.reviewSort
        })
      ]);
      const nextDashboard = unwrapWallet(dashboardResponse);
      const nextAdmin = unwrapWallet(adminResponse);
      const tableNames = walletTableNames(nextAdmin);
      setDashboard(nextDashboard);
      setAdmin(nextAdmin);
      setFinance(unwrapWallet(financeResponse) ?? null);
      setOperations(unwrapWallet(operationsResponse) ?? null);
      const addressPage = unwrapWallet(addressResponse);
      const balancePage = unwrapWallet(balanceResponse);
      const exceptionPage = unwrapWallet(exceptionResponse);
      const depositPage = unwrapWallet(depositResponse);
      const withdrawalPage = unwrapWallet(withdrawalResponse);
      const reviewPage = unwrapWallet(reviewResponse);
      setOperationAddresses(walletPageRows(addressPage, "addresses"));
      setOperationBalances(walletPageRows(balancePage, "balances"));
      setOperationExceptions(walletPageRows(exceptionPage, "events"));
      setFinanceDeposits(walletPageRows(depositPage, "deposits"));
      setFinanceWithdrawals(walletPageRows(withdrawalPage, "withdrawals"));
      setFinanceWithdrawalReviews(walletPageRows(reviewPage, "reviews"));
      setOperationAddressPageInfo(cursorInfo(addressPage));
      setOperationBalancePageInfo(cursorInfo(balancePage));
      setOperationExceptionPageInfo(cursorInfo(exceptionPage));
      setFinanceDepositPageInfo(cursorInfo(depositPage));
      setFinanceWithdrawalPageInfo(cursorInfo(withdrawalPage));
      setFinanceReviewPageInfo(cursorInfo(reviewPage));
      setOperationFilters((current) => ({
        ...current,
        addressCursor: nextAddressCursor,
        balanceCursor: nextBalanceCursor,
        exceptionCursor: nextExceptionCursor
      }));
      setWithdrawalFilters((current) => ({
        ...current,
        depositCursor: nextDepositCursor,
        withdrawalCursor: nextWithdrawalCursor,
        reviewCursor: nextReviewCursor
      }));
      setSelectedTable((current) => current && tableNames.includes(current) ? current : tableNames[0] ?? "");
      setSelectedRow(null);
      setUpdateJson("{}");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function reviewWithdrawal(row: UnknownRecord, decision: "approve" | "reject") {
    const chain = String(row.chain ?? "");
    const orderNo = String(row.order_no ?? row.orderNo ?? "");
    if (!chain || !orderNo) {
      setError("当前提现记录缺少 chain 或 order_no");
      return;
    }
    const reason = withdrawalReviewReason.trim();
    if (!reason) {
      setError(decision === "approve" ? "请输入提现审核通过原因。" : "请输入提现拒绝原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (decision === "approve") {
        await approveWalletWithdrawal(chain, orderNo, reason);
      } else {
        await rejectWalletWithdrawal(chain, orderNo, reason);
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function searchAddressTransactions() {
    if (!addressQuery.address.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await gatewayGet<WalletResponse<UnknownRecord[]>>("wallet", "/dashboard/address-transactions", {
        address: addressQuery.address.trim(),
        chain: addressQuery.chain.trim().toUpperCase(),
        limit: Number(addressQuery.limit) || 100
      });
      setAddressTransactions(unwrapWallet(response) ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function beginEdit(row: UnknownRecord) {
    const editable = walletEditableColumns(admin, selectedTable);
    const updates: UnknownRecord = {};
    for (const column of editable) {
      if (Object.prototype.hasOwnProperty.call(row, column)) {
        updates[column] = row[column];
      }
    }
    setSelectedRow(row);
    setUpdateJson(JSON.stringify(updates, null, 2));
  }

  async function saveConfigUpdate() {
    if (!selectedTable || !selectedRow) return;
    const idColumn = walletIdColumn(admin, selectedTable);
    const id = selectedRow[idColumn];
    if (id === undefined || id === null || id === "") {
      setError(`当前行缺少主键字段 ${idColumn}`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const updates = JSON.parse(updateJson) as UnknownRecord;
      await gatewayPatch<WalletResponse<UnknownRecord>>(
        "wallet-admin",
        `/config/${selectedTable}/${encodeURIComponent(String(id))}`,
        { updates }
      );
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const runtime = (dashboard?.runtime ?? {}) as UnknownRecord;
  const counts = (runtime.counts ?? {}) as UnknownRecord;
  const financeTotals = (finance?.totals ?? {}) as UnknownRecord;
  const operationTotals = (operations?.totals ?? {}) as UnknownRecord;
  const tableNames = walletTableNames(admin);
  const tableRows = walletRows(admin, selectedTable);
  const tableMeta = walletMetadata(admin, selectedTable);
  const editableColumns = walletEditableColumns(admin, selectedTable);

  return (
    <Page title="钱包运营" onRefresh={load} loading={loading} error={error}>
      <div className="metrics">
        <Metric label="启用链" value={counts.enabledChains ?? 0} tone="ok" />
        <Metric label="启用 Token" value={counts.enabledTokens ?? 0} tone="ok" />
        <Metric label="RPC 节点" value={counts.enabledRpcNodes ?? 0} tone="warn" />
        <Metric label="地址数" value={counts.addresses ?? 0} tone="ok" />
        <Metric label="充值记录" value={counts.deposits ?? 0} tone="ok" />
        <Metric label="提现记录" value={counts.withdrawals ?? 0} tone="warn" />
      </div>

      <Panel title="链上运营总览">
        <div className="stack">
          <div className="metrics">
            <Metric label="启用链" value={operationTotals.enabled_chain_count ?? 0} tone="ok" />
            <Metric label="活跃资产" value={operationTotals.active_asset_count ?? 0} tone="ok" />
            <Metric label="RPC 节点" value={operationTotals.enabled_rpc_node_count ?? 0} tone="warn" />
            <Metric label="用户地址" value={operationTotals.user_address_count ?? 0} tone="ok" />
            <Metric label="热钱包" value={operationTotals.hot_wallet_count ?? 0} tone="warn" />
            <Metric label="账本总额" value={operationTotals.total_balance ?? "0"} tone="ok" />
            <Metric label="未入账充值" value={operationTotals.pending_credit_deposit_count ?? 0} tone="danger" />
            <Metric label="异常提现" value={operationTotals.exception_withdrawal_count ?? 0} tone="danger" />
          </div>
          <div className="filters compact">
            <TextFilter label="Chain" value={operationFilters.chain} onChange={(value) => updateOperationFilters({ chain: value.toUpperCase() })} />
            <TextFilter label="Asset" value={operationFilters.assetSymbol} onChange={(value) => updateOperationFilters({ assetSymbol: value.toUpperCase() })} />
            <TextFilter label="User ID" value={operationFilters.userId} onChange={(value) => updateOperationFilters({ userId: value })} />
            <TextFilter label="Role" value={operationFilters.walletRole} onChange={(value) => updateOperationFilters({ walletRole: value.toUpperCase() })} />
            <TextFilter label="Address" value={operationFilters.address} onChange={(value) => updateOperationFilters({ address: value })} />
            <label>异常类型
              <select value={operationFilters.eventType} onChange={(event) => updateOperationFilters({ eventType: event.target.value })}>
                {WALLET_OPERATION_EVENT_TYPES.map((type) => <option key={type} value={type}>{type || "ALL"}</option>)}
              </select>
            </label>
            <label>异常状态
              <select value={operationFilters.exceptionStatus} onChange={(event) => updateOperationFilters({ exceptionStatus: event.target.value })}>
                {WALLET_OPERATION_EXCEPTION_STATUSES.map((status) => <option key={status} value={status}>{status || "ALL"}</option>)}
              </select>
            </label>
            <TextFilter label="Limit" value={operationFilters.limit} onChange={(value) => updateOperationFilters({ limit: value })} />
            <SortSelect label="列表排序" value={operationFilters.sort} options={UPDATED_AT_SORTS} onChange={(value) => updateOperationFilters({ sort: value })} />
            <button onClick={() => void load()}><Search size={16} />查询</button>
          </div>
          <div className="three-grid">
            <div className="stack">
              <h3>链状态</h3>
              <DataTable rows={records(operations?.chainStatuses as UnknownRecord[] | undefined)} maxColumns={10} />
            </div>
            <div className="stack">
              <h3>资产账本汇总</h3>
              <DataTable rows={records(operations?.ledgerByAsset as UnknownRecord[] | undefined)} maxColumns={8} />
            </div>
            <div className="stack">
              <h3>热钱包余额</h3>
              <DataTable rows={records(operations?.hotWallets as UnknownRecord[] | undefined)} maxColumns={9} />
            </div>
          </div>
          <div className="two-grid">
            <div className="stack">
              <h3>扫描高度</h3>
              <DataTable rows={records(operations?.scanHeights as UnknownRecord[] | undefined)} maxColumns={7} />
            </div>
            <div className="stack">
              <h3>异常聚合</h3>
              <DataTable rows={records(operations?.exceptionSummary as UnknownRecord[] | undefined)} maxColumns={7} />
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="资金审核">
        <div className="stack">
          <div className="metrics">
            <Metric label="24h 充值" value={financeTotals.deposit_amount ?? "0"} tone="ok" />
            <Metric label="24h 提现" value={financeTotals.withdrawal_amount ?? "0"} tone="warn" />
            <Metric label="冻结余额" value={financeTotals.locked_balance ?? "0"} tone="warn" />
            <Metric label="待审提现" value={financeTotals.pending_review_count ?? 0} tone="danger" />
          </div>
          <div className="filters compact">
            <TextFilter label="Chain" value={withdrawalFilters.chain} onChange={(value) => updateWithdrawalFilters({ chain: value.toUpperCase() })} />
            <TextFilter label="Asset" value={withdrawalFilters.assetSymbol} onChange={(value) => updateWithdrawalFilters({ assetSymbol: value.toUpperCase() })} />
            <label>充值状态
              <select value={withdrawalFilters.depositStatus} onChange={(event) => updateWithdrawalFilters({ depositStatus: event.target.value })}>
                <option value="">ALL</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="PENDING">PENDING</option>
                <option value="FAILED">FAILED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="BROADCAST_UNKNOWN">BROADCAST_UNKNOWN</option>
              </select>
            </label>
            <label>已入账
              <select value={withdrawalFilters.depositCredited} onChange={(event) => updateWithdrawalFilters({ depositCredited: event.target.value })}>
                <option value="">ALL</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label>状态
              <select value={withdrawalFilters.status} onChange={(event) => updateWithdrawalFilters({ status: event.target.value })}>
                {WALLET_WITHDRAWAL_STATUSES.map((status) => <option key={status} value={status}>{status || "ALL"}</option>)}
              </select>
            </label>
            <label>审核结果
              <select value={withdrawalFilters.decision} onChange={(event) => updateWithdrawalFilters({ decision: event.target.value })}>
                <option value="">ALL</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </label>
            <TextFilter label="Admin ID" value={withdrawalFilters.adminUserId} onChange={(value) => updateWithdrawalFilters({ adminUserId: value })} />
            <TextFilter label="User ID" value={withdrawalFilters.userId} onChange={(value) => updateWithdrawalFilters({ userId: value })} />
            <TextFilter label="Order No" value={withdrawalFilters.orderNo} onChange={(value) => updateWithdrawalFilters({ orderNo: value })} />
            <TextFilter label="Limit" value={withdrawalFilters.limit} onChange={(value) => updateWithdrawalFilters({ limit: value })} />
            <TextFilter label="审核原因" value={withdrawalReviewReason} onChange={setWithdrawalReviewReason} />
            <SortSelect label="资金排序" value={withdrawalFilters.sort} options={UPDATED_AT_SORTS} onChange={(value) => updateWithdrawalFilters({ sort: value })} />
            <SortSelect label="审核排序" value={withdrawalFilters.reviewSort} options={CREATED_AT_SORTS} onChange={(value) => updateWithdrawalFilters({ reviewSort: value })} />
            <button onClick={() => void load()}><Search size={16} />查询</button>
          </div>
          <div className="three-grid">
            <div className="stack">
              <h3>资产汇总</h3>
              <DataTable rows={records(finance?.byAsset as UnknownRecord[] | undefined)} maxColumns={8} />
            </div>
            <div className="stack">
              <h3>充值记录</h3>
              <CursorPager
                page={financeDepositPageInfo}
                cursor={withdrawalFilters.depositCursor}
                onNext={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, financeDepositPageInfo.nextCursor || "", withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
                onReset={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, "", withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
              />
              <DataTable rows={financeDeposits} maxColumns={10} />
            </div>
            <div className="stack">
              <h3>提现审核队列</h3>
              <CursorPager
                page={financeWithdrawalPageInfo}
                cursor={withdrawalFilters.withdrawalCursor}
                onNext={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, financeWithdrawalPageInfo.nextCursor || "", withdrawalFilters.reviewCursor)}
                onReset={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, "", withdrawalFilters.reviewCursor)}
              />
              <DataTable rows={financeWithdrawals} maxColumns={10} actions={(row) => (
                String(row.status) === "PENDING_REVIEW" ? (
                  <>
                    <button onClick={() => void reviewWithdrawal(row, "approve")}>通过</button>
                    <button onClick={() => void reviewWithdrawal(row, "reject")}>拒绝</button>
                  </>
                ) : null
              )} />
            </div>
          </div>
          <div className="stack">
            <h3>提现审核记录</h3>
            <CursorPager
              page={financeReviewPageInfo}
              cursor={withdrawalFilters.reviewCursor}
              onNext={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, financeReviewPageInfo.nextCursor || "")}
              onReset={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, "")}
            />
            <DataTable
              rows={financeWithdrawalReviews}
              columns={[
                "review_id",
                "decision",
                "admin_user_id",
                "admin_username",
                "order_no",
                "user_id",
                "chain",
                "asset_symbol",
                "amount",
                "fee",
                "previous_status",
                "next_status",
                "reason",
                "released_amount",
                "created_at"
              ]}
              maxColumns={15}
            />
          </div>
        </div>
      </Panel>

      <TwoColumn>
        <Panel title="项目状态">
          <KeyValue data={(dashboard?.project ?? {}) as UnknownRecord} />
        </Panel>
        <Panel title="安全与密钥状态">
          <DataTable rows={records(admin?.secretStatus)} maxColumns={6} />
        </Panel>
      </TwoColumn>

      <div className="three-grid">
        <Panel title="链配置">
          <DataTable rows={records(runtime.chainProfiles as UnknownRecord[] | undefined)} maxColumns={9} />
        </Panel>
        <Panel title="RPC 节点">
          <DataTable rows={records(runtime.rpcNodes as UnknownRecord[] | undefined)} maxColumns={9} />
        </Panel>
        <Panel title="资产与 Token">
          <DataTable rows={[
            ...records(runtime.assets as UnknownRecord[] | undefined),
            ...records(runtime.tokens as UnknownRecord[] | undefined)
          ]} maxColumns={9} />
        </Panel>
      </div>

      <div className="three-grid">
        <Panel title="余额快照">
          <DataTable rows={records(runtime.balances as UnknownRecord[] | undefined)} maxColumns={8} />
        </Panel>
        <Panel title="最近链上流水">
          <DataTable rows={records(runtime.transactions as UnknownRecord[] | undefined)} maxColumns={9} />
        </Panel>
        <Panel title="地址查询">
          <div className="stack">
            <div className="filters compact">
              <TextFilter label="Address" value={addressQuery.address} onChange={(value) => setAddressQuery({ ...addressQuery, address: value })} />
              <TextFilter label="Chain" value={addressQuery.chain} onChange={(value) => setAddressQuery({ ...addressQuery, chain: value.toUpperCase() })} />
              <TextFilter label="Limit" value={addressQuery.limit} onChange={(value) => setAddressQuery({ ...addressQuery, limit: value })} />
              <button onClick={() => void searchAddressTransactions()}><Search size={16} />查询</button>
            </div>
            <DataTable rows={addressTransactions} maxColumns={9} />
          </div>
        </Panel>
      </div>

      <div className="two-grid">
        <Panel title="后台地址账本">
          <CursorPager
            page={operationAddressPageInfo}
            cursor={operationFilters.addressCursor}
            onNext={() => void load(operationAddressPageInfo.nextCursor || "", operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
            onReset={() => void load("", operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
          />
          <DataTable
            rows={operationAddresses}
            columns={["chain", "asset_symbol", "user_id", "biz", "address", "wallet_role", "enabled", "available_balance", "locked_balance", "total_balance", "updated_at"]}
            maxColumns={11}
          />
        </Panel>
        <Panel title="非零余额账户">
          <CursorPager
            page={operationBalancePageInfo}
            cursor={operationFilters.balanceCursor}
            onNext={() => void load(operationFilters.addressCursor, operationBalancePageInfo.nextCursor || "", operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
            onReset={() => void load(operationFilters.addressCursor, "", operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
          />
          <DataTable
            rows={operationBalances}
            columns={["chain", "asset_symbol", "user_id", "address", "wallet_role", "available_balance", "locked_balance", "total_balance", "updated_at"]}
            maxColumns={9}
          />
        </Panel>
      </div>

      <Panel title="充值提现异常流水">
        <CursorPager
          page={operationExceptionPageInfo}
          cursor={operationFilters.exceptionCursor}
          onNext={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationExceptionPageInfo.nextCursor || "", withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
          onReset={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, "", withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
        />
        <DataTable
          rows={operationExceptions}
          columns={["event_type", "event_id", "order_no", "user_id", "chain", "asset_symbol", "amount", "fee", "status", "reason", "tx_hash", "from_address", "to_address", "updated_at"]}
          maxColumns={14}
        />
      </Panel>

      <Panel title="钱包配置治理">
        <div className="stack">
          <div className="filters">
            <label>配置表
              <select value={selectedTable} onChange={(event) => {
                setSelectedTable(event.target.value);
                setSelectedRow(null);
                setUpdateJson("{}");
              }}>
                {tableNames.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
            <label>主键<input value={walletIdColumn(admin, selectedTable)} readOnly /></label>
            <label>可编辑字段<input value={editableColumns.join(", ")} readOnly /></label>
          </div>
          <KeyValue data={tableMeta} />
          <DataTable rows={tableRows} maxColumns={10} actions={(row) => (
            <button onClick={() => beginEdit(row)}>编辑</button>
          )} />
          <div className="two-grid">
            <textarea className="json-editor small" value={updateJson} onChange={(event) => setUpdateJson(event.target.value)} />
            <div className="stack">
              <KeyValue data={selectedRow ?? {}} />
              <button className="primary" disabled={!selectedRow || loading} onClick={() => void saveConfigUpdate()}>
                保存配置更新
              </button>
            </div>
          </div>
        </div>
      </Panel>
    </Page>
  );
}

function CompliancePage() {
  const [filters, setFilters] = useState({ userId: "", kycStatus: "", tagCode: "", limit: "100", cursor: "", sort: "updatedAt.desc" });
  const [pageInfo, setPageInfo] = useState(cursorInfo());
  const [users, setUsers] = useState<UnknownRecord[]>([]);
  const [riskTagFilters, setRiskTagFilters] = useState({ userId: "", status: "ACTIVE", limit: "100", cursor: "", sort: "createdAt.desc" });
  const [riskTagPageInfo, setRiskTagPageInfo] = useState(cursorInfo());
  const [globalRiskTags, setGlobalRiskTags] = useState<UnknownRecord[]>([]);
  const [amlCaseFilters, setAmlCaseFilters] = useState({ userId: "", status: "", limit: "100", cursor: "", sort: "updatedAt.desc" });
  const [amlCasePageInfo, setAmlCasePageInfo] = useState(cursorInfo());
  const [globalAmlCases, setGlobalAmlCases] = useState<UnknownRecord[]>([]);
  const [detail, setDetail] = useState<UnknownRecord | null>(null);
  const [kycForm, setKycForm] = useState(kycFormTemplate());
  const [riskTagForm, setRiskTagForm] = useState(riskTagFormTemplate());
  const [amlCaseForm, setAmlCaseForm] = useState(amlCaseFormTemplate());
  const [amlStatusForm, setAmlStatusForm] = useState(amlStatusFormTemplate());
  const [kycJson, setKycJson] = useState(() => JSON.stringify(kycPayload(kycFormTemplate()), null, 2));
  const [tagJson, setTagJson] = useState(() => JSON.stringify(riskTagPayload(riskTagFormTemplate()), null, 2));
  const [amlJson, setAmlJson] = useState(() => JSON.stringify(amlCasePayload(amlCaseFormTemplate()), null, 2));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateRiskTagFilters(patch: Partial<typeof riskTagFilters>) {
    setRiskTagFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateAmlCaseFilters(patch: Partial<typeof amlCaseFilters>) {
    setAmlCaseFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateKycForm(patch: Partial<ReturnType<typeof kycFormTemplate>>) {
    const next = { ...kycForm, ...patch };
    setKycForm(next);
    setKycJson(JSON.stringify(kycPayload(next), null, 2));
  }

  function updateRiskTagForm(patch: Partial<ReturnType<typeof riskTagFormTemplate>>) {
    const next = { ...riskTagForm, ...patch };
    setRiskTagForm(next);
    setTagJson(JSON.stringify(riskTagPayload(next), null, 2));
  }

  function updateAmlCaseForm(patch: Partial<ReturnType<typeof amlCaseFormTemplate>>) {
    const next = { ...amlCaseForm, ...patch };
    setAmlCaseForm(next);
    setAmlJson(JSON.stringify(amlCasePayload(next), null, 2));
  }

  function fillAmlStatus(row: UnknownRecord) {
    setAmlStatusForm({
      caseId: fieldText(row.caseId),
      status: enumOrDefault(row.status, AML_STATUSES, "REVIEWING"),
      riskScore: fieldText(row.riskScore)
    });
  }

  async function load(
    nextCursor = filters.cursor,
    nextRiskTagCursor = riskTagFilters.cursor,
    nextAmlCaseCursor = amlCaseFilters.cursor
  ) {
    setLoading(true);
    setError("");
    try {
      const [response, riskTagResponse, amlCaseResponse] = await Promise.all([
        complianceUsers({
          userId: filters.userId,
          kycStatus: filters.kycStatus,
          tagCode: filters.tagCode,
          limit: Number(filters.limit) || 100,
          cursor: nextCursor,
          sort: filters.sort
        }),
        complianceRiskTags({
          userId: riskTagFilters.userId,
          status: riskTagFilters.status,
          limit: Number(riskTagFilters.limit) || 100,
          cursor: nextRiskTagCursor,
          sort: riskTagFilters.sort
        }),
        complianceAmlCases({
          userId: amlCaseFilters.userId,
          status: amlCaseFilters.status,
          limit: Number(amlCaseFilters.limit) || 100,
          cursor: nextAmlCaseCursor,
          sort: amlCaseFilters.sort
        })
      ]);
      setUsers(response.users);
      setPageInfo(cursorInfo(response));
      setGlobalRiskTags(riskTagResponse.tags);
      setRiskTagPageInfo(cursorInfo(riskTagResponse));
      setGlobalAmlCases(amlCaseResponse.cases);
      setAmlCasePageInfo(cursorInfo(amlCaseResponse));
      setFilters((current) => ({ ...current, cursor: nextCursor || "" }));
      setRiskTagFilters((current) => ({ ...current, cursor: nextRiskTagCursor || "" }));
      setAmlCaseFilters((current) => ({ ...current, cursor: nextAmlCaseCursor || "" }));
      if (detail?.user && "userId" in (detail.user as UnknownRecord)) {
        await loadDetail(String((detail.user as UnknownRecord).userId));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(userId: number | string) {
    const response = await complianceUser(userId);
    setDetail(response);
    const nextKycForm = kycFormFromRecord(objectValue(response.kyc) || { kycLevel: "BASIC", status: "PENDING" });
    setKycForm(nextKycForm);
    setKycJson(JSON.stringify(kycPayload(nextKycForm), null, 2));
  }

  async function saveKyc() {
    const userId = detailUserId(detail);
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      await updateKyc(userId, jsonObject(kycJson));
      await loadDetail(userId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function addRiskTag() {
    const userId = detailUserId(detail);
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      await createRiskTag(userId, jsonObject(tagJson));
      await loadDetail(userId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function closeRiskTag(tagId: unknown) {
    const userId = detailUserId(detail);
    if (!tagId) return;
    setLoading(true);
    setError("");
    try {
      await resolveRiskTag(String(tagId));
      if (userId) await loadDetail(userId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function addAmlCase() {
    const userId = detailUserId(detail);
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      await createAmlCase(userId, jsonObject(amlJson));
      await loadDetail(userId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitAmlStatus(caseId: unknown = amlStatusForm.caseId) {
    const userId = detailUserId(detail);
    if (!caseId) return;
    setLoading(true);
    setError("");
    try {
      await updateAmlCaseStatus(String(caseId), {
        status: amlStatusForm.status,
        riskScore: amlStatusForm.riskScore.trim() ? numberField(amlStatusForm.riskScore, "风险分") : undefined
      });
      if (userId) await loadDetail(userId);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const riskTags = records(detail?.riskTags as UnknownRecord[] | undefined);
  const amlCases = records(detail?.amlCases as UnknownRecord[] | undefined);

  return (
    <Page title="合规风控" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <TextFilter label="User ID" value={filters.userId} onChange={(value) => updateFilters({ userId: value })} />
        <label>KYC 状态<select value={filters.kycStatus} onChange={(event) => updateFilters({ kycStatus: event.target.value })}>
          <option value="">全部</option>
          {KYC_STATUSES.map((item) => <option key={item}>{item}</option>)}
        </select></label>
        <TextFilter label="风险标签" value={filters.tagCode} onChange={(value) => updateFilters({ tagCode: value.toUpperCase() })} />
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => updateFilters({ limit: value })} />
        <SortSelect value={filters.sort} options={UPDATED_AT_SORTS} onChange={(value) => updateFilters({ sort: value })} />
        <button onClick={() => void load("")}><Search size={16} />查询</button>
      </div>
      <div className="metrics">
        <Metric label="用户数" value={users.length} tone="ok" />
        <Metric label="已认证" value={users.filter((item) => item.kycStatus === "VERIFIED").length} tone="ok" />
        <Metric label="待审核" value={users.filter((item) => item.kycStatus === "PENDING").length} tone="warn" />
        <Metric label="风险标签" value={users.reduce((sum, item) => sum + Number(item.activeRiskTags ?? 0), 0)} tone="warn" />
        <Metric label="AML Case" value={users.reduce((sum, item) => sum + Number(item.openAmlCases ?? 0), 0)} tone="danger" />
        <Metric label="当前用户" value={detailUserId(detail) || "-"} tone="muted" />
      </div>
      <TwoColumn>
        <Panel title="合规用户">
          <div className="stack">
            <DataTable
              rows={users}
              columns={["userId", "username", "userStatus", "kycLevel", "kycStatus", "country", "activeRiskTags", "openAmlCases", "updatedAt"]}
              onRowClick={(row) => void loadDetail(String(row.userId ?? ""))}
            />
            <CursorPager
              page={pageInfo}
              cursor={filters.cursor}
              onNext={() => void load(pageInfo.nextCursor || "")}
              onReset={() => void load("")}
            />
          </div>
        </Panel>
        <Panel title="用户合规详情">
          {detail ? (
            <div className="stack">
              <KeyValue data={(detail.user as UnknownRecord) ?? {}} />
              <KeyValue data={(detail.kyc as UnknownRecord) ?? { status: "UNVERIFIED" }} />
            </div>
          ) : <Empty text="选择用户" />}
        </Panel>
      </TwoColumn>
      <TwoColumn>
        <Panel title="风险标签审计">
          <div className="stack">
            <div className="filters compact">
              <TextFilter label="User ID" value={riskTagFilters.userId} onChange={(value) => updateRiskTagFilters({ userId: value })} />
              <label>状态
                <select value={riskTagFilters.status} onChange={(event) => updateRiskTagFilters({ status: event.target.value })}>
	                  <option value="">全部</option>
	                  {RISK_TAG_STATUSES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <TextFilter label="Limit" value={riskTagFilters.limit} onChange={(value) => updateRiskTagFilters({ limit: value })} />
              <SortSelect value={riskTagFilters.sort} options={COMPLIANCE_RISK_TAG_SORTS} onChange={(value) => updateRiskTagFilters({ sort: value })} />
              <button onClick={() => void load(filters.cursor, "", amlCaseFilters.cursor)}><Search size={16} />查询标签</button>
            </div>
            <CursorPager
              page={riskTagPageInfo}
              cursor={riskTagFilters.cursor}
              onNext={() => void load(filters.cursor, riskTagPageInfo.nextCursor || "", amlCaseFilters.cursor)}
              onReset={() => void load(filters.cursor, "", amlCaseFilters.cursor)}
            />
            <DataTable
              rows={globalRiskTags}
              columns={["tagId", "userId", "tagCode", "severity", "status", "source", "createdByUserId", "resolvedByUserId", "createdAt", "updatedAt"]}
              maxColumns={10}
              actions={(row) => row.status === "ACTIVE" ? <button onClick={() => void closeRiskTag(row.tagId)}>解除</button> : <StatusBadge value="RESOLVED" />}
            />
          </div>
        </Panel>
        <Panel title="AML Case 审计">
          <div className="stack">
            <div className="filters compact">
              <TextFilter label="User ID" value={amlCaseFilters.userId} onChange={(value) => updateAmlCaseFilters({ userId: value })} />
              <label>状态
                <select value={amlCaseFilters.status} onChange={(event) => updateAmlCaseFilters({ status: event.target.value })}>
	                  <option value="">全部</option>
	                  {AML_STATUSES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <TextFilter label="Limit" value={amlCaseFilters.limit} onChange={(value) => updateAmlCaseFilters({ limit: value })} />
              <SortSelect value={amlCaseFilters.sort} options={COMPLIANCE_AML_CASE_SORTS} onChange={(value) => updateAmlCaseFilters({ sort: value })} />
              <button onClick={() => void load(filters.cursor, riskTagFilters.cursor, "")}><Search size={16} />查询 Case</button>
            </div>
            <CursorPager
              page={amlCasePageInfo}
              cursor={amlCaseFilters.cursor}
              onNext={() => void load(filters.cursor, riskTagFilters.cursor, amlCasePageInfo.nextCursor || "")}
              onReset={() => void load(filters.cursor, riskTagFilters.cursor, "")}
            />
            <DataTable
	              rows={globalAmlCases}
	              columns={["caseId", "userId", "status", "riskScore", "source", "assignedAdminUserId", "createdByUserId", "reviewedByUserId", "createdAt", "updatedAt"]}
	              maxColumns={10}
	              actions={(row) => <button onClick={() => fillAmlStatus(row)}>填充状态</button>}
	            />
          </div>
        </Panel>
      </TwoColumn>
      {detail && (
        <>
          <TwoColumn>
            <Panel title="KYC 审核">
              <div className="stack">
                <div className="form-grid">
                  <label>KYC Level<select value={kycForm.kycLevel} onChange={(event) => updateKycForm({ kycLevel: event.target.value })}>{KYC_LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>状态<select value={kycForm.status} onChange={(event) => updateKycForm({ status: event.target.value })}>{KYC_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <TextFilter label="国家/地区" value={kycForm.country} onChange={(value) => updateKycForm({ country: value.toUpperCase() })} />
                  <TextFilter label="证件类型" value={kycForm.documentType} onChange={(value) => updateKycForm({ documentType: value.toUpperCase() })} />
                  <TextFilter label="Provider" value={kycForm.provider} onChange={(value) => updateKycForm({ provider: value })} />
                  <TextFilter label="Provider Ref" value={kycForm.providerReference} onChange={(value) => updateKycForm({ providerReference: value })} />
                  <TextFilter label="过期时间 ISO" value={kycForm.expiresAt} onChange={(value) => updateKycForm({ expiresAt: value })} />
                </div>
                <label>拒绝原因<textarea className="json-editor small text-editor" value={kycForm.rejectionReason} onChange={(event) => updateKycForm({ rejectionReason: event.target.value })} /></label>
                <details className="raw-toggle">
                  <summary>高级 JSON 请求体</summary>
                  <textarea className="json-editor small" value={kycJson} onChange={(event) => setKycJson(event.target.value)} />
                </details>
                <button className="primary" onClick={() => void saveKyc()}>保存 KYC</button>
              </div>
            </Panel>
            <Panel title="新增风险标签">
              <div className="stack">
                <div className="form-grid">
                  <TextFilter label="Tag Code" value={riskTagForm.tagCode} onChange={(value) => updateRiskTagForm({ tagCode: value.toUpperCase() })} />
                  <label>严重度<select value={riskTagForm.severity} onChange={(event) => updateRiskTagForm({ severity: event.target.value })}>{RISK_SEVERITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <TextFilter label="来源" value={riskTagForm.source} onChange={(value) => updateRiskTagForm({ source: value.toUpperCase() })} />
                </div>
                <label>原因<textarea className="json-editor small text-editor" value={riskTagForm.reason} onChange={(event) => updateRiskTagForm({ reason: event.target.value })} /></label>
                <details className="raw-toggle">
                  <summary>高级 JSON 请求体</summary>
                  <textarea className="json-editor small" value={tagJson} onChange={(event) => setTagJson(event.target.value)} />
                </details>
                <button className="primary" onClick={() => void addRiskTag()}>新增标签</button>
              </div>
            </Panel>
          </TwoColumn>
          <Panel title="风险标签">
            <DataTable
              rows={riskTags}
              columns={["tagId", "userId", "tagCode", "severity", "status", "source", "reason", "createdAt", "resolvedAt"]}
              actions={(row) => row.status === "ACTIVE" ? <button onClick={() => void closeRiskTag(row.tagId)}>解除</button> : <StatusBadge value="RESOLVED" />}
            />
          </Panel>
          <TwoColumn>
            <Panel title="新增 AML Case">
              <div className="stack">
                <div className="form-grid">
                  <label>状态<select value={amlCaseForm.status} onChange={(event) => updateAmlCaseForm({ status: event.target.value })}>{AML_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <TextFilter label="风险分" value={amlCaseForm.riskScore} onChange={(value) => updateAmlCaseForm({ riskScore: value })} />
                  <TextFilter label="来源" value={amlCaseForm.source} onChange={(value) => updateAmlCaseForm({ source: value.toUpperCase() })} />
                  <TextFilter label="指派管理员 ID" value={amlCaseForm.assignedAdminUserId} onChange={(value) => updateAmlCaseForm({ assignedAdminUserId: value })} />
                </div>
                <label>摘要<textarea className="json-editor small text-editor" value={amlCaseForm.summary} onChange={(event) => updateAmlCaseForm({ summary: event.target.value })} /></label>
                <details className="raw-toggle">
                  <summary>高级 JSON 请求体</summary>
                  <textarea className="json-editor small" value={amlJson} onChange={(event) => setAmlJson(event.target.value)} />
                </details>
                <button className="primary" onClick={() => void addAmlCase()}>新增 Case</button>
              </div>
            </Panel>
            <Panel title="更新 AML Case 状态">
              <div className="stack">
                <div className="form-grid">
                  <TextFilter label="Case ID" value={amlStatusForm.caseId} onChange={(value) => setAmlStatusForm((current) => ({ ...current, caseId: value }))} />
                  <label>状态<select value={amlStatusForm.status} onChange={(event) => setAmlStatusForm((current) => ({ ...current, status: event.target.value }))}>{AML_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <TextFilter label="风险分" value={amlStatusForm.riskScore} onChange={(value) => setAmlStatusForm((current) => ({ ...current, riskScore: value }))} />
                </div>
                <button className="primary" onClick={() => void submitAmlStatus()}>提交状态更新</button>
              </div>
            </Panel>
          </TwoColumn>
          <Panel title="AML Case">
              <DataTable
                rows={amlCases}
                columns={["caseId", "userId", "status", "riskScore", "source", "summary", "assignedAdminUserId", "updatedAt"]}
                actions={(row) => <button onClick={() => fillAmlStatus(row)}>填充状态</button>}
              />
          </Panel>
        </>
      )}
    </Page>
  );
}

function kycFormTemplate() {
  return {
    kycLevel: "BASIC",
    status: "PENDING",
    country: "",
    documentType: "",
    provider: "manual",
    providerReference: "",
    rejectionReason: "",
    expiresAt: ""
  };
}

function riskTagFormTemplate() {
  return {
    tagCode: "HIGH_RISK",
    severity: "HIGH",
    source: "MANUAL",
    reason: ""
  };
}

function amlCaseFormTemplate() {
  return {
    status: "OPEN",
    riskScore: "50",
    source: "MANUAL",
    summary: "",
    assignedAdminUserId: ""
  };
}

function amlStatusFormTemplate() {
  return {
    caseId: "",
    status: "REVIEWING",
    riskScore: ""
  };
}

function kycFormFromRecord(row: UnknownRecord) {
  return {
    kycLevel: enumOrDefault(row.kycLevel, KYC_LEVELS, "BASIC"),
    status: enumOrDefault(row.status, KYC_STATUSES, "PENDING"),
    country: fieldText(row.country),
    documentType: fieldText(row.documentType),
    provider: fieldText(row.provider) || "manual",
    providerReference: fieldText(row.providerReference),
    rejectionReason: fieldText(row.rejectionReason),
    expiresAt: fieldText(row.expiresAt)
  };
}

function kycPayload(form: ReturnType<typeof kycFormTemplate>): UnknownRecord {
  return {
    kycLevel: form.kycLevel,
    status: form.status,
    country: textOrNull(form.country.toUpperCase()),
    documentType: textOrNull(form.documentType.toUpperCase()),
    provider: textOrNull(form.provider),
    providerReference: textOrNull(form.providerReference),
    rejectionReason: textOrNull(form.rejectionReason),
    expiresAt: textOrNull(form.expiresAt)
  };
}

function riskTagPayload(form: ReturnType<typeof riskTagFormTemplate>): UnknownRecord {
  return {
    tagCode: form.tagCode.trim().toUpperCase(),
    severity: form.severity,
    source: textOrNull(form.source.toUpperCase()),
    reason: form.reason.trim()
  };
}

function amlCasePayload(form: ReturnType<typeof amlCaseFormTemplate>): UnknownRecord {
  return {
    status: form.status,
    riskScore: numberField(form.riskScore, "风险分"),
    source: textOrNull(form.source.toUpperCase()),
    summary: form.summary.trim(),
    assignedAdminUserId: optionalNumber(form.assignedAdminUserId)
  };
}

function RiskPage() {
  const [asset, setAsset] = useState("USDT");
  const [userId, setUserId] = useState("");
  const [listFilters, setListFilters] = useState({
    productLine: "LINEAR_PERPETUAL",
    limit: "100",
    candidateSort: "eventTime.asc",
    highRiskSort: "eventTime.desc",
    liquidationSort: "createdAt.desc",
    adlEventSort: "createdAt.desc",
    candidateCursor: "",
    highRiskCursor: "",
    liquidationCursor: "",
    adlQueueCursor: "",
    adlEventCursor: ""
  });
  const [candidatePageInfo, setCandidatePageInfo] = useState(cursorInfo());
  const [highRiskPageInfo, setHighRiskPageInfo] = useState(cursorInfo());
  const [liquidationPageInfo, setLiquidationPageInfo] = useState(cursorInfo());
  const [adlQueuePageInfo, setAdlQueuePageInfo] = useState(cursorInfo());
  const [adlEventPageInfo, setAdlEventPageInfo] = useState(cursorInfo());
  const [data, setData] = useState<RiskData | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<UnknownRecord | null>(null);
  const [timeline, setTimeline] = useState<UnknownRecord | null>(null);
  const [riskRuleForm, setRiskRuleForm] = useState({
    warningMarginRatioPpm: "",
    liquidationMarginRatioPpm: "",
    scanDelayMs: "",
    scanBatchSize: "",
    scanEnabled: true,
    reason: ""
  });
  const [cancelCandidateReason, setCancelCandidateReason] = useState("Manual liquidation candidate cancel");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function resetRiskCursors() {
    setListFilters((current) => ({
      ...current,
      candidateCursor: "",
      highRiskCursor: "",
      liquidationCursor: "",
      adlQueueCursor: "",
      adlEventCursor: ""
    }));
  }

  function updateRiskFilters(patch: Partial<typeof listFilters>) {
    setListFilters((current) => ({
      ...current,
      ...patch,
      candidateCursor: "",
      highRiskCursor: "",
      liquidationCursor: "",
      adlQueueCursor: "",
      adlEventCursor: ""
    }));
  }

  async function load(
    nextCandidateCursor = listFilters.candidateCursor,
    nextHighRiskCursor = listFilters.highRiskCursor,
    nextLiquidationCursor = listFilters.liquidationCursor,
    nextAdlQueueCursor = listFilters.adlQueueCursor,
    nextAdlEventCursor = listFilters.adlEventCursor
  ) {
    setLoading(true);
    setError("");
    try {
      const limit = Number(listFilters.limit) || 100;
      const [candidates, liquidations, adlQueue, adlEvents, rules, highRisk] = await Promise.all([
        gatewayGet<{ candidates?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("risk-admin", "/liquidation-candidates", {
          status: "NEW",
          productLine: listFilters.productLine,
          limit,
          cursor: nextCandidateCursor,
          sort: listFilters.candidateSort
        }),
        gatewayGet<{ orders?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("liquidation-admin", "/orders", {
          userId,
          productLine: listFilters.productLine,
          limit,
          cursor: nextLiquidationCursor,
          sort: listFilters.liquidationSort
        }),
        gatewayGet<{ positions?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("adl", "/admin/queue", {
          asset,
          productLine: listFilters.productLine,
          limit,
          cursor: nextAdlQueueCursor,
          sort: ADL_QUEUE_SORT
        }),
        gatewayGet<{ events?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("adl", "/admin/events", {
          userId,
          asset,
          productLine: listFilters.productLine,
          limit,
          cursor: nextAdlEventCursor,
          sort: listFilters.adlEventSort
        }),
        gatewayGet<{ rules?: UnknownRecord[]; items?: UnknownRecord[] }>("risk-admin", "/rules", { productLine: listFilters.productLine }),
        gatewayGet<{ accounts?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("risk-admin", "/high-risk-accounts", {
          productLine: listFilters.productLine,
          limit,
          cursor: nextHighRiskCursor,
          sort: listFilters.highRiskSort
        })
      ]);
      const ruleRows = rules.rules ?? rules.items ?? [];
      setData({
        candidates: candidates.candidates ?? candidates.items ?? [],
        liquidations: liquidations.orders ?? liquidations.items ?? [],
        adlQueue: adlQueue.positions ?? adlQueue.items ?? [],
        adlEvents: adlEvents.events ?? adlEvents.items ?? [],
        riskRules: ruleRows,
        highRiskAccounts: highRisk.accounts ?? highRisk.items ?? []
      });
      setCandidatePageInfo(cursorInfo(candidates));
      setHighRiskPageInfo(cursorInfo(highRisk));
      setLiquidationPageInfo(cursorInfo(liquidations));
      setAdlQueuePageInfo(cursorInfo(adlQueue));
      setAdlEventPageInfo(cursorInfo(adlEvents));
      setListFilters((current) => ({
        ...current,
        candidateCursor: nextCandidateCursor,
        highRiskCursor: nextHighRiskCursor,
        liquidationCursor: nextLiquidationCursor,
        adlQueueCursor: nextAdlQueueCursor,
        adlEventCursor: nextAdlEventCursor
      }));
      setRiskRuleForm((current) => {
        if (current.warningMarginRatioPpm || current.liquidationMarginRatioPpm || current.scanDelayMs || current.scanBatchSize) {
          return current;
        }
        const marginRule = ruleRows.find((row) => row.ruleCode === "GLOBAL_MARGIN_POLICY");
        const scanRule = ruleRows.find((row) => row.ruleCode === "RISK_SCAN_CONTROL");
        return {
          warningMarginRatioPpm: String(marginRule?.warningMarginRatioPpm ?? ""),
          liquidationMarginRatioPpm: String(marginRule?.liquidationMarginRatioPpm ?? ""),
          scanDelayMs: String(scanRule?.scanDelayMs ?? ""),
          scanBatchSize: String(scanRule?.scanBatchSize ?? ""),
          scanEnabled: Boolean(scanRule?.enabled ?? true),
          reason: current.reason
        };
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeline(candidate: UnknownRecord) {
    const candidateId = candidate.candidateId;
    if (candidateId === undefined || candidateId === null) return;
    setSelectedCandidate(candidate);
    setLoading(true);
    setError("");
    try {
      const response = await gatewayGet<UnknownRecord>(
        "liquidation-admin",
        `/candidates/${encodeURIComponent(String(candidateId))}/timeline`,
        { limit: 200, productLine: listFilters.productLine }
      );
      setTimeline(response);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function cancelCandidate() {
    const candidateId = selectedCandidate?.candidateId ?? timeline?.candidateId;
    if (candidateId === undefined || candidateId === null) {
      setError("请选择爆仓候选。");
      return;
    }
    const reason = cancelCandidateReason.trim();
    if (!reason) {
      setError("请输入取消强平候选原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await gatewayPost(
        "liquidation-admin",
        `/candidates/${encodeURIComponent(String(candidateId))}/cancel`,
        { reason },
        { productLine: listFilters.productLine }
      );
      await load();
      await loadTimeline({ candidateId });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function updateMarginRule() {
    setLoading(true);
    setError("");
    try {
      const warning = numberField(riskRuleForm.warningMarginRatioPpm, "warningMarginRatioPpm");
      const liquidation = numberField(riskRuleForm.liquidationMarginRatioPpm, "liquidationMarginRatioPpm");
      const reason = riskRuleForm.reason.trim();
      if (!reason) {
        throw new Error("请输入风控规则变更原因。");
      }
      await gatewayPost("risk-admin", "/rules/GLOBAL_MARGIN_POLICY", {
        ruleName: "Global margin thresholds",
        enabled: true,
        warningMarginRatioPpm: warning,
        liquidationMarginRatioPpm: liquidation,
        reason
      }, { productLine: listFilters.productLine });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function updateScanRule() {
    setLoading(true);
    setError("");
    try {
      const scanDelayMs = numberField(riskRuleForm.scanDelayMs, "scanDelayMs");
      const scanBatchSize = numberField(riskRuleForm.scanBatchSize, "scanBatchSize");
      const reason = riskRuleForm.reason.trim();
      if (!reason) {
        throw new Error("请输入风控规则变更原因。");
      }
      await gatewayPost("risk-admin", "/rules/RISK_SCAN_CONTROL", {
        ruleName: "Risk scan control",
        enabled: riskRuleForm.scanEnabled,
        scanDelayMs,
        scanBatchSize,
        reason
      }, { productLine: listFilters.productLine });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const timelineRows = records(timeline?.timeline as UnknownRecord[] | undefined);

  return (
    <Page title="风控强平" onRefresh={() => load()} loading={loading} error={error}>
      <div className="filters">
        <label>产品线<select value={listFilters.productLine} onChange={(event) => updateRiskFilters({ productLine: event.target.value })}>{PRODUCT_LINES.map((item) => <option key={item} value={item}>{item || "全部"}</option>)}</select></label>
        <TextFilter label="Asset" value={asset} onChange={(value) => { setAsset(value.toUpperCase()); resetRiskCursors(); }} />
        <TextFilter label="User ID" value={userId} onChange={(value) => { setUserId(value); resetRiskCursors(); }} />
        <TextFilter label="Limit" value={listFilters.limit} onChange={(value) => updateRiskFilters({ limit: value })} />
        <SortSelect label="候选排序" value={listFilters.candidateSort} options={EVENT_TIME_SORTS} onChange={(value) => updateRiskFilters({ candidateSort: value })} />
        <SortSelect label="账户排序" value={listFilters.highRiskSort} options={EVENT_TIME_SORTS} onChange={(value) => updateRiskFilters({ highRiskSort: value })} />
        <SortSelect label="订单排序" value={listFilters.liquidationSort} options={CREATED_AT_SORTS} onChange={(value) => updateRiskFilters({ liquidationSort: value })} />
        <SortSelect label="ADL 事件排序" value={listFilters.adlEventSort} options={CREATED_AT_SORTS} onChange={(value) => updateRiskFilters({ adlEventSort: value })} />
        <button onClick={() => { resetRiskCursors(); void load("", "", "", "", ""); }}><Search size={16} />查询</button>
      </div>
      <TwoColumn>
        <Panel title="高风险账户">
          <div className="stack">
            <DataTable
              rows={records(data?.highRiskAccounts)}
              columns={["riskLevel", "userId", "settleAsset", "status", "marginRatioPpm", "equityUnits", "maintenanceMarginUnits", "activeCandidateCount", "topSymbol", "topPositionMarginRatioPpm", "eventTime"]}
            />
            <CursorPager
              page={highRiskPageInfo}
              cursor={listFilters.highRiskCursor}
              onNext={() => void load(listFilters.candidateCursor, highRiskPageInfo.nextCursor, listFilters.liquidationCursor, listFilters.adlQueueCursor, listFilters.adlEventCursor)}
              onReset={() => void load(listFilters.candidateCursor, "", listFilters.liquidationCursor, listFilters.adlQueueCursor, listFilters.adlEventCursor)}
            />
          </div>
        </Panel>
        <Panel title="风控规则">
          <div className="stack">
            <DataTable
              rows={records(data?.riskRules)}
              columns={["ruleCode", "ruleType", "enabled", "warningMarginRatioPpm", "liquidationMarginRatioPpm", "scanDelayMs", "scanBatchSize", "source", "updatedAt"]}
            />
            <div className="filters">
              <TextFilter label="Warning PPM" value={riskRuleForm.warningMarginRatioPpm} onChange={(value) => setRiskRuleForm((current) => ({ ...current, warningMarginRatioPpm: value }))} />
              <TextFilter label="Liquidation PPM" value={riskRuleForm.liquidationMarginRatioPpm} onChange={(value) => setRiskRuleForm((current) => ({ ...current, liquidationMarginRatioPpm: value }))} />
              <button className="primary" onClick={() => void updateMarginRule()}>更新阈值</button>
            </div>
            <div className="filters">
              <label className="toggle"><input type="checkbox" checked={riskRuleForm.scanEnabled} onChange={(event) => setRiskRuleForm((current) => ({ ...current, scanEnabled: event.target.checked }))} />扫描启用</label>
              <TextFilter label="Scan Delay MS" value={riskRuleForm.scanDelayMs} onChange={(value) => setRiskRuleForm((current) => ({ ...current, scanDelayMs: value }))} />
              <TextFilter label="Batch Size" value={riskRuleForm.scanBatchSize} onChange={(value) => setRiskRuleForm((current) => ({ ...current, scanBatchSize: value }))} />
              <button className="primary" onClick={() => void updateScanRule()}>更新扫描</button>
            </div>
            <TextFilter label="Reason" value={riskRuleForm.reason} onChange={(value) => setRiskRuleForm((current) => ({ ...current, reason: value }))} />
          </div>
        </Panel>
      </TwoColumn>
      <div className="two-grid">
        <Panel title="爆仓候选">
          <div className="stack">
            <DataTable
              rows={records(data?.candidates)}
              maxColumns={10}
              onRowClick={(row) => void loadTimeline(row)}
            />
            <CursorPager
              page={candidatePageInfo}
              cursor={listFilters.candidateCursor}
              onNext={() => void load(candidatePageInfo.nextCursor, listFilters.highRiskCursor, listFilters.liquidationCursor, listFilters.adlQueueCursor, listFilters.adlEventCursor)}
              onReset={() => void load("", listFilters.highRiskCursor, listFilters.liquidationCursor, listFilters.adlQueueCursor, listFilters.adlEventCursor)}
            />
          </div>
        </Panel>
        <Panel title="强平订单">
          <div className="stack">
            <DataTable rows={records(data?.liquidations)} maxColumns={10} />
            <CursorPager
              page={liquidationPageInfo}
              cursor={listFilters.liquidationCursor}
              onNext={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, liquidationPageInfo.nextCursor, listFilters.adlQueueCursor, listFilters.adlEventCursor)}
              onReset={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, "", listFilters.adlQueueCursor, listFilters.adlEventCursor)}
            />
          </div>
        </Panel>
        <Panel title="ADL 队列">
          <div className="stack">
            <DataTable rows={records(data?.adlQueue)} maxColumns={10} />
            <CursorPager
              page={adlQueuePageInfo}
              cursor={listFilters.adlQueueCursor}
              onNext={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, listFilters.liquidationCursor, adlQueuePageInfo.nextCursor, listFilters.adlEventCursor)}
              onReset={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, listFilters.liquidationCursor, "", listFilters.adlEventCursor)}
            />
          </div>
        </Panel>
        <Panel title="ADL 事件">
          <div className="stack">
            <DataTable rows={records(data?.adlEvents)} maxColumns={10} />
            <CursorPager
              page={adlEventPageInfo}
              cursor={listFilters.adlEventCursor}
              onNext={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, listFilters.liquidationCursor, listFilters.adlQueueCursor, adlEventPageInfo.nextCursor)}
              onReset={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, listFilters.liquidationCursor, listFilters.adlQueueCursor, "")}
            />
          </div>
        </Panel>
      </div>
      <TwoColumn>
        <Panel title="强平时间线">
          <div className="stack">
            <div className="button-row">
              <TextFilter label="取消原因" value={cancelCandidateReason} onChange={setCancelCandidateReason} />
              <button onClick={() => selectedCandidate && void loadTimeline(selectedCandidate)} disabled={!selectedCandidate}><Search size={16} />刷新时间线</button>
              <button className="danger" onClick={() => void cancelCandidate()} disabled={!selectedCandidate && !timeline}>取消候选</button>
            </div>
            <DataTable rows={timelineRows} columns={["eventTime", "source", "eventType", "subject", "summary"]} />
          </div>
        </Panel>
        <Panel title="时间线详情">
          <KeyValue data={objectValue(timeline?.candidate)} />
          {records(timeline?.orders as UnknownRecord[] | undefined).length > 0 && (
            <DataTable rows={records(timeline?.orders as UnknownRecord[] | undefined)} maxColumns={8} />
          )}
        </Panel>
      </TwoColumn>
      <div className="three-grid">
        <RuntimeConfigPanel title="风控运行时配置" service="risk" path="/admin/runtime-config" template={{ calculationEnabled: false, coordinationEnabled: false }} productLine={listFilters.productLine} />
        <RuntimeConfigPanel title="强平运行时配置" service="liquidation" path="/admin/runtime-config" template={{ executionEnabled: false }} productLine={listFilters.productLine} />
        <RuntimeConfigPanel title="ADL 运行时配置" service="adl" path="/admin/runtime-config" template={{ scannerEnabled: false }} productLine={listFilters.productLine} />
      </div>
    </Page>
  );
}

function FundingInsurancePage() {
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [asset, setAsset] = useState("USDT");
  const [fundingUserId, setFundingUserId] = useState("");
  const [listFilters, setListFilters] = useState({
    productLine: "LINEAR_PERPETUAL",
    limit: "100",
    rateSort: "eventTime.desc",
    paymentSort: "createdAt.desc",
    insuranceSort: "createdAt.desc",
    rateCursor: "",
    paymentCursor: "",
    ledgerCursor: "",
    coverageCursor: ""
  });
  const [ratePageInfo, setRatePageInfo] = useState(cursorInfo());
  const [paymentPageInfo, setPaymentPageInfo] = useState(cursorInfo());
  const [ledgerPageInfo, setLedgerPageInfo] = useState(cursorInfo());
  const [coveragePageInfo, setCoveragePageInfo] = useState(cursorInfo());
  const [data, setData] = useState<FundingData | null>(null);
  const [adjust, setAdjust] = useState({ amountUnits: "", referenceId: "", reason: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function resetFundingCursors() {
    setListFilters((current) => ({
      ...current,
      rateCursor: "",
      paymentCursor: "",
      ledgerCursor: "",
      coverageCursor: ""
    }));
  }

  function updateListFilters(patch: Partial<typeof listFilters>) {
    setListFilters((current) => ({
      ...current,
      ...patch,
      rateCursor: "",
      paymentCursor: "",
      ledgerCursor: "",
      coverageCursor: ""
    }));
  }

  async function load(
    nextRateCursor = listFilters.rateCursor,
    nextPaymentCursor = listFilters.paymentCursor,
    nextLedgerCursor = listFilters.ledgerCursor,
    nextCoverageCursor = listFilters.coverageCursor
  ) {
    setLoading(true);
    setError("");
    try {
      const productLine = listFilters.productLine;
      const shouldLoadFunding = isFundingProductLine(productLine);
      const paymentRequest = fundingUserId.trim() && shouldLoadFunding
        ? gatewayGet<{ payments?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("funding", "/admin/payments", {
          userId: fundingUserId.trim(),
          symbol,
          productLine,
          limit: Number(listFilters.limit) || 100,
          cursor: nextPaymentCursor,
          sort: listFilters.paymentSort
        })
        : Promise.resolve({ payments: [], items: [], nextCursor: null, hasMore: false, sort: listFilters.paymentSort, limit: Number(listFilters.limit) || 100 });
      const [latest, history, settlement, payments, balances, ledger, coverages] = await Promise.all([
        shouldLoadFunding ? gatewayGet<UnknownRecord>("funding", "/admin/rates/latest", { symbol, productLine }) : Promise.resolve({}),
        shouldLoadFunding ? gatewayGet<{ rates?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("funding", "/admin/rates/history", {
          symbol,
          productLine,
          limit: Number(listFilters.limit) || 100,
          cursor: nextRateCursor,
          sort: listFilters.rateSort
        }) : Promise.resolve({ rates: [], items: [], nextCursor: null, hasMore: false, sort: listFilters.rateSort, limit: Number(listFilters.limit) || 100 }),
        shouldLoadFunding ? gatewayGet<UnknownRecord>("funding", "/admin/settlements/latest", { symbol, productLine }) : Promise.resolve({}),
        paymentRequest,
        gatewayGet<{ balances?: UnknownRecord[]; items?: UnknownRecord[] }>("insurance-admin", "/balances", { asset, productLine }),
        gatewayGet<{ entries?: UnknownRecord[]; ledger?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("insurance-admin", "/ledger", {
          asset,
          productLine,
          limit: Number(listFilters.limit) || 100,
          cursor: nextLedgerCursor,
          sort: listFilters.insuranceSort
        }),
        gatewayGet<{ coverages?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("insurance-admin", "/coverages", {
          asset,
          productLine,
          limit: Number(listFilters.limit) || 100,
          cursor: nextCoverageCursor,
          sort: listFilters.insuranceSort
        })
      ]);
      setData({
        latest,
        history: history.rates ?? history.items ?? [],
        payments: payments.payments ?? payments.items ?? [],
        settlement,
        balances: balances.balances ?? balances.items ?? [],
        ledger: ledger.entries ?? ledger.ledger ?? ledger.items ?? [],
        coverages: coverages.coverages ?? coverages.items ?? []
      });
      setRatePageInfo(cursorInfo(history));
      setPaymentPageInfo(cursorInfo(payments));
      setLedgerPageInfo(cursorInfo(ledger));
      setCoveragePageInfo(cursorInfo(coverages));
      setListFilters((current) => ({
        ...current,
        rateCursor: nextRateCursor,
        paymentCursor: nextPaymentCursor,
        ledgerCursor: nextLedgerCursor,
        coverageCursor: nextCoverageCursor
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function adjustFund() {
    await gatewayPost("insurance-admin", "/fund-adjustments", {
      asset,
      amountUnits: Number(adjust.amountUnits),
      referenceId: adjust.referenceId,
      reason: adjust.reason
    }, { productLine: listFilters.productLine });
    setAdjust({ amountUnits: "", referenceId: "", reason: "" });
    await load();
  }

  useEffect(() => { void load(); }, []);

  return (
    <Page title="资金费与保险基金" onRefresh={() => load()} loading={loading} error={error}>
      <div className="filters">
        <label>产品线<select value={listFilters.productLine} onChange={(event) => updateListFilters({ productLine: event.target.value })}>{PRODUCT_LINES.map((item) => <option key={item} value={item}>{item || "全部"}</option>)}</select></label>
        <TextFilter label="Symbol" value={symbol} onChange={(value) => { setSymbol(value.toUpperCase()); resetFundingCursors(); }} />
        <TextFilter label="Asset" value={asset} onChange={(value) => { setAsset(value.toUpperCase()); resetFundingCursors(); }} />
        <TextFilter label="付款 User ID" value={fundingUserId} onChange={(value) => { setFundingUserId(value); resetFundingCursors(); }} />
        <TextFilter label="Limit" value={listFilters.limit} onChange={(value) => updateListFilters({ limit: value })} />
        <SortSelect label="费率排序" value={listFilters.rateSort} options={EVENT_TIME_SORTS} onChange={(value) => updateListFilters({ rateSort: value })} />
        <SortSelect label="付款排序" value={listFilters.paymentSort} options={CREATED_AT_SORTS} onChange={(value) => updateListFilters({ paymentSort: value })} />
        <SortSelect label="保险排序" value={listFilters.insuranceSort} options={CREATED_AT_SORTS} onChange={(value) => updateListFilters({ insuranceSort: value })} />
        <button onClick={() => void load()}><Search size={16} />查询</button>
      </div>
      <div className="two-grid">
        <Panel title="最新资金费"><KeyValue data={data?.latest ?? {}} /></Panel>
        <Panel title="最新结算"><KeyValue data={data?.settlement ?? {}} /></Panel>
        <Panel title="资金费历史">
          <CursorPager
            page={ratePageInfo}
            cursor={listFilters.rateCursor}
            onNext={() => void load(ratePageInfo.nextCursor || "", listFilters.paymentCursor, listFilters.ledgerCursor, listFilters.coverageCursor)}
            onReset={() => void load("", listFilters.paymentCursor, listFilters.ledgerCursor, listFilters.coverageCursor)}
          />
          <DataTable rows={records(data?.history)} maxColumns={9} />
        </Panel>
        <Panel title="资金费付款">
          <CursorPager
            page={paymentPageInfo}
            cursor={listFilters.paymentCursor}
            onNext={() => void load(listFilters.rateCursor, paymentPageInfo.nextCursor || "", listFilters.ledgerCursor, listFilters.coverageCursor)}
            onReset={() => void load(listFilters.rateCursor, "", listFilters.ledgerCursor, listFilters.coverageCursor)}
          />
          <DataTable rows={records(data?.payments)} maxColumns={9} />
        </Panel>
        <Panel title="保险基金余额"><DataTable rows={records(data?.balances)} /></Panel>
        <Panel title="保险基金流水">
          <CursorPager
            page={ledgerPageInfo}
            cursor={listFilters.ledgerCursor}
            onNext={() => void load(listFilters.rateCursor, listFilters.paymentCursor, ledgerPageInfo.nextCursor || "", listFilters.coverageCursor)}
            onReset={() => void load(listFilters.rateCursor, listFilters.paymentCursor, "", listFilters.coverageCursor)}
          />
          <DataTable rows={records(data?.ledger)} maxColumns={9} />
        </Panel>
        <Panel title="亏损覆盖">
          <CursorPager
            page={coveragePageInfo}
            cursor={listFilters.coverageCursor}
            onNext={() => void load(listFilters.rateCursor, listFilters.paymentCursor, listFilters.ledgerCursor, coveragePageInfo.nextCursor || "")}
            onReset={() => void load(listFilters.rateCursor, listFilters.paymentCursor, listFilters.ledgerCursor, "")}
          />
          <DataTable rows={records(data?.coverages)} maxColumns={9} />
        </Panel>
      </div>
      <Panel title="保险基金人工调整">
        <div className="filters">
          <label>金额 Units<input value={adjust.amountUnits} onChange={(event) => setAdjust({ ...adjust, amountUnits: event.target.value })} /></label>
          <label>Reference ID<input value={adjust.referenceId} onChange={(event) => setAdjust({ ...adjust, referenceId: event.target.value })} /></label>
          <label>原因<input value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} /></label>
          <button className="primary" onClick={() => void adjustFund()}>调整保险基金</button>
        </div>
      </Panel>
      <TwoColumn>
        {isFundingProductLine(listFilters.productLine) && (
          <RuntimeConfigPanel title="资金费运行时配置" service="funding" path="/admin/runtime-config" template={{ calculationEnabled: false, settlementEnabled: false }} productLine={listFilters.productLine} />
        )}
        <RuntimeConfigPanel title="保险基金运行时配置" service="insurance-admin" path="/runtime-config" template={{ coverageEnabled: false }} productLine={listFilters.productLine} />
      </TwoColumn>
    </Page>
  );
}

function FeesPage() {
  const [filters, setFilters] = useState({
    productLine: "LINEAR_PERPETUAL",
    status: "",
    userId: "",
    symbol: "",
    limit: "200",
    scheduleCursor: "",
    scheduleSort: "updatedAt.desc",
    tierCursor: "",
    tierSort: "priority.desc"
  });
  const [data, setData] = useState<FeesData | null>(null);
  const [schedulePageInfo, setSchedulePageInfo] = useState(cursorInfo());
  const [tierPageInfo, setTierPageInfo] = useState(cursorInfo());
  const [scheduleForm, setScheduleForm] = useState(feeScheduleFormTemplate());
  const [tierForm, setTierForm] = useState(feeTierFormTemplate());
  const [scheduleJson, setScheduleJson] = useState(() => JSON.stringify(feeSchedulePayload(feeScheduleFormTemplate()), null, 2));
  const [tierJson, setTierJson] = useState(() => JSON.stringify(feeTierPayload(feeTierFormTemplate()), null, 2));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...patch, scheduleCursor: "", tierCursor: "" }));
  }

  async function load(nextScheduleCursor = filters.scheduleCursor, nextTierCursor = filters.tierCursor) {
    setLoading(true);
    setError("");
    try {
      const limit = Number(filters.limit) || 200;
      const [schedules, tiers, userTier] = await Promise.all([
        gatewayGet<{ schedules?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("trading-fees", "/schedules", {
          userId: filters.userId,
          symbol: filters.symbol,
          status: filters.status,
          limit,
          cursor: nextScheduleCursor,
          sort: filters.scheduleSort,
          productLine: filters.productLine
        }),
        gatewayGet<{ tiers?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("trading-fees", "/tiers", {
          status: filters.status,
          limit,
          cursor: nextTierCursor,
          sort: filters.tierSort
        }),
        filters.userId
          ? gatewayGet<UnknownRecord>("trading-fees", `/tiers/users/${filters.userId}`, { productLine: filters.productLine })
          : Promise.resolve(null)
      ]);
      setData({
        schedules: schedules.schedules ?? schedules.items ?? [],
        tiers: tiers.tiers ?? tiers.items ?? [],
        userTier: userTier ?? {}
      });
      setSchedulePageInfo(cursorInfo(schedules));
      setTierPageInfo(cursorInfo(tiers));
      setFilters((current) => ({
        ...current,
        scheduleCursor: nextScheduleCursor || "",
        tierCursor: nextTierCursor || ""
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function updateScheduleForm(patch: Partial<ReturnType<typeof feeScheduleFormTemplate>>) {
    const next = { ...scheduleForm, ...patch };
    setScheduleForm(next);
    setScheduleJson(JSON.stringify(feeSchedulePayload(next), null, 2));
  }

  function updateTierForm(patch: Partial<ReturnType<typeof feeTierFormTemplate>>) {
    const next = { ...tierForm, ...patch };
    setTierForm(next);
    setTierJson(JSON.stringify(feeTierPayload(next), null, 2));
  }

  function selectSchedule(row: UnknownRecord) {
    const next = feeScheduleFormFromRecord(row);
    setScheduleForm(next);
    setScheduleJson(JSON.stringify(feeSchedulePayload(next), null, 2));
  }

  function selectTier(row: UnknownRecord) {
    const next = feeTierFormFromRecord(row);
    setTierForm(next);
    setTierJson(JSON.stringify(feeTierPayload(next), null, 2));
  }

  async function submitSchedule() {
    try {
      const payload = jsonObject(scheduleJson);
      const productLine = fieldText(payload.productLine) || scheduleForm.productLine || filters.productLine;
      await gatewayPost("trading-fees", "/schedules", { ...payload, productLine }, { productLine });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function submitTier() {
    try {
      const payload = jsonObject(tierJson);
      const productLine = fieldText(payload.productLine) || filters.productLine;
      await gatewayPost("trading-fees", "/tiers", { ...payload, productLine }, { productLine });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function disableSchedule(row: UnknownRecord) {
    const feeScheduleId = row.feeScheduleId ?? row.id;
    if (!feeScheduleId) return;
    try {
      const productLine = fieldText(row.productLine) || filters.productLine;
      await gatewayPost("trading-fees", `/schedules/${encodeURIComponent(String(feeScheduleId))}/disable`,
        undefined, { productLine });
      await load(filters.scheduleCursor, filters.tierCursor);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <Page title="费率配置" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <label>产品线<select value={filters.productLine} onChange={(event) => updateFilters({ productLine: event.target.value })}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <TextFilter label="User ID" value={filters.userId} onChange={(value) => updateFilters({ userId: value })} />
        <TextFilter label="Symbol" value={filters.symbol} onChange={(value) => updateFilters({ symbol: value.toUpperCase() })} />
        <label>状态<select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}><option value="">全部</option><option>ACTIVE</option><option>DISABLED</option></select></label>
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => updateFilters({ limit: value })} />
        <SortSelect label="计划排序" value={filters.scheduleSort} options={FEE_SCHEDULE_SORTS} onChange={(value) => updateFilters({ scheduleSort: value })} />
        <SortSelect label="档位排序" value={filters.tierSort} options={FEE_TIER_SORTS} onChange={(value) => updateFilters({ tierSort: value })} />
        <button onClick={() => void load("", "")}><Search size={16} />查询</button>
        <button onClick={() => gatewayPost("trading-fees", "/tiers/refresh-active", undefined, { limit: 1000, productLine: filters.productLine }).then(() => load(filters.scheduleCursor, filters.tierCursor))}>刷新活跃用户 VIP</button>
      </div>
      <div className="two-grid">
        <Panel title="费率计划">
          <div className="stack">
            <DataTable
              rows={records(data?.schedules)}
              columns={["productLine", "feeScheduleId", "userId", "symbol", "sourceType", "tierCode", "makerFeeRatePpm", "takerFeeRatePpm", "status", "effectiveTime", "expireTime"]}
              maxColumns={11}
              onRowClick={selectSchedule}
              actions={(row) => row.status === "DISABLED" ? <StatusBadge value="DISABLED" /> : <button onClick={() => void disableSchedule(row)}>禁用</button>}
            />
            <CursorPager
              page={schedulePageInfo}
              cursor={filters.scheduleCursor}
              onNext={() => void load(schedulePageInfo.nextCursor || "", filters.tierCursor)}
              onReset={() => void load("", filters.tierCursor)}
            />
          </div>
        </Panel>
        <Panel title="VIP 档位">
          <div className="stack">
            <DataTable rows={records(data?.tiers)} maxColumns={9} onRowClick={selectTier} />
            <CursorPager
              page={tierPageInfo}
              cursor={filters.tierCursor}
              onNext={() => void load(filters.scheduleCursor, tierPageInfo.nextCursor || "")}
              onReset={() => void load(filters.scheduleCursor, "")}
            />
          </div>
        </Panel>
        <Panel title="用户当前档位"><KeyValue data={data?.userTier ?? {}} /></Panel>
        <Panel title="新增/更新费率计划">
          <div className="stack">
            <div className="form-grid">
              <TextFilter label="Schedule ID" value={scheduleForm.feeScheduleId} onChange={(value) => updateScheduleForm({ feeScheduleId: value })} />
              <label>产品线<select value={scheduleForm.productLine} onChange={(event) => updateScheduleForm({ productLine: event.target.value })}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <TextFilter label="User ID" value={scheduleForm.userId} onChange={(value) => updateScheduleForm({ userId: value })} />
              <TextFilter label="Symbol" value={scheduleForm.symbol} onChange={(value) => updateScheduleForm({ symbol: value.toUpperCase() })} />
              <label>来源<select value={scheduleForm.sourceType} onChange={(event) => updateScheduleForm({ sourceType: event.target.value })}>{FEE_SOURCE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <TextFilter label="Tier Code" value={scheduleForm.tierCode} onChange={(value) => updateScheduleForm({ tierCode: value.toUpperCase() })} />
              <label>状态<select value={scheduleForm.status} onChange={(event) => updateScheduleForm({ status: event.target.value })}>{FEE_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <TextFilter label="Maker ppm" value={scheduleForm.makerFeeRatePpm} onChange={(value) => updateScheduleForm({ makerFeeRatePpm: value })} />
              <TextFilter label="Taker ppm" value={scheduleForm.takerFeeRatePpm} onChange={(value) => updateScheduleForm({ takerFeeRatePpm: value })} />
              <TextFilter label="生效时间 ISO" value={scheduleForm.effectiveTime} onChange={(value) => updateScheduleForm({ effectiveTime: value })} />
              <TextFilter label="过期时间 ISO" value={scheduleForm.expireTime} onChange={(value) => updateScheduleForm({ expireTime: value })} />
            </div>
            <label>原因<textarea className="json-editor small text-editor" value={scheduleForm.reason} onChange={(event) => updateScheduleForm({ reason: event.target.value })} /></label>
            <details className="raw-toggle">
              <summary>高级 JSON 请求体</summary>
              <textarea className="json-editor small" value={scheduleJson} onChange={(event) => setScheduleJson(event.target.value)} />
            </details>
            <button className="primary" onClick={() => void submitSchedule()}>提交计划</button>
          </div>
        </Panel>
        <Panel title="新增/更新 VIP 档位">
          <div className="stack">
            <div className="form-grid">
              <TextFilter label="Tier Code" value={tierForm.tierCode} onChange={(value) => updateTierForm({ tierCode: value.toUpperCase() })} />
              <label>来源<select value={tierForm.sourceType} onChange={(event) => updateTierForm({ sourceType: event.target.value })}>{FEE_SOURCE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>资格模式<select value={tierForm.qualificationMode} onChange={(event) => updateTierForm({ qualificationMode: event.target.value })}>{FEE_TIER_QUALIFICATION_MODES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>状态<select value={tierForm.status} onChange={(event) => updateTierForm({ status: event.target.value })}>{FEE_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <TextFilter label="30d Volume" value={tierForm.min30dVolumeUnits} onChange={(value) => updateTierForm({ min30dVolumeUnits: value })} />
              <TextFilter label="Asset Balance" value={tierForm.minAssetBalanceUnits} onChange={(value) => updateTierForm({ minAssetBalanceUnits: value })} />
              <TextFilter label="Maker ppm" value={tierForm.makerFeeRatePpm} onChange={(value) => updateTierForm({ makerFeeRatePpm: value })} />
              <TextFilter label="Taker ppm" value={tierForm.takerFeeRatePpm} onChange={(value) => updateTierForm({ takerFeeRatePpm: value })} />
              <TextFilter label="优先级" value={tierForm.priority} onChange={(value) => updateTierForm({ priority: value })} />
            </div>
            <details className="raw-toggle">
              <summary>高级 JSON 请求体</summary>
              <textarea className="json-editor small" value={tierJson} onChange={(event) => setTierJson(event.target.value)} />
            </details>
            <button className="primary" onClick={() => void submitTier()}>提交档位</button>
          </div>
        </Panel>
      </div>
    </Page>
  );
}

function feeScheduleFormTemplate() {
  return {
    feeScheduleId: "",
    productLine: "LINEAR_PERPETUAL",
    userId: "",
    symbol: "BTC-USDT",
    makerFeeRatePpm: "200",
    takerFeeRatePpm: "500",
    sourceType: "USER_OVERRIDE",
    tierCode: "",
    reason: "Manual fee override",
    status: "ACTIVE",
    effectiveTime: "",
    expireTime: ""
  };
}

function feeTierFormTemplate() {
  return {
    tierCode: "VIP1",
    sourceType: "VIP",
    qualificationMode: "VOLUME_OR_BALANCE",
    min30dVolumeUnits: "1000000000000",
    minAssetBalanceUnits: "100000000000",
    makerFeeRatePpm: "180",
    takerFeeRatePpm: "450",
    priority: "100",
    status: "ACTIVE"
  };
}

function feeScheduleFormFromRecord(row: UnknownRecord) {
  return {
    feeScheduleId: fieldText(row.feeScheduleId),
    productLine: enumOrDefault(row.productLine, PRODUCT_LINES.filter(Boolean), "LINEAR_PERPETUAL"),
    userId: fieldText(row.userId),
    symbol: fieldText(row.symbol),
    makerFeeRatePpm: fieldText(row.makerFeeRatePpm),
    takerFeeRatePpm: fieldText(row.takerFeeRatePpm),
    sourceType: enumOrDefault(row.sourceType, FEE_SOURCE_TYPES, "USER_OVERRIDE"),
    tierCode: fieldText(row.tierCode),
    reason: fieldText(row.reason) || "Manual fee override",
    status: enumOrDefault(row.status, FEE_STATUSES, "ACTIVE"),
    effectiveTime: fieldText(row.effectiveTime),
    expireTime: fieldText(row.expireTime)
  };
}

function feeTierFormFromRecord(row: UnknownRecord) {
  return {
    tierCode: fieldText(row.tierCode),
    sourceType: enumOrDefault(row.sourceType, FEE_SOURCE_TYPES, "VIP"),
    qualificationMode: enumOrDefault(row.qualificationMode, FEE_TIER_QUALIFICATION_MODES, "VOLUME_OR_BALANCE"),
    min30dVolumeUnits: fieldText(row.min30dVolumeUnits),
    minAssetBalanceUnits: fieldText(row.minAssetBalanceUnits),
    makerFeeRatePpm: fieldText(row.makerFeeRatePpm),
    takerFeeRatePpm: fieldText(row.takerFeeRatePpm),
    priority: fieldText(row.priority),
    status: enumOrDefault(row.status, FEE_STATUSES, "ACTIVE")
  };
}

function feeSchedulePayload(form: ReturnType<typeof feeScheduleFormTemplate>): UnknownRecord {
  return {
    feeScheduleId: optionalNumber(form.feeScheduleId),
    productLine: form.productLine,
    userId: numberField(form.userId, "User ID"),
    symbol: textOrNull(form.symbol.toUpperCase()),
    makerFeeRatePpm: numberField(form.makerFeeRatePpm, "Maker ppm"),
    takerFeeRatePpm: numberField(form.takerFeeRatePpm, "Taker ppm"),
    sourceType: form.sourceType,
    tierCode: textOrNull(form.tierCode.toUpperCase()),
    reason: form.reason.trim(),
    status: form.status,
    effectiveTime: textOrNull(form.effectiveTime),
    expireTime: textOrNull(form.expireTime)
  };
}

function feeTierPayload(form: ReturnType<typeof feeTierFormTemplate>): UnknownRecord {
  return {
    tierCode: form.tierCode.trim().toUpperCase(),
    sourceType: form.sourceType,
    qualificationMode: form.qualificationMode,
    min30dVolumeUnits: numberField(form.min30dVolumeUnits, "30d Volume"),
    minAssetBalanceUnits: numberField(form.minAssetBalanceUnits, "Asset Balance"),
    makerFeeRatePpm: numberField(form.makerFeeRatePpm, "Maker ppm"),
    takerFeeRatePpm: numberField(form.takerFeeRatePpm, "Taker ppm"),
    priority: numberField(form.priority, "优先级"),
    status: form.status
  };
}

function MarketMakerPage() {
  const [strategies, setStrategies] = useState<UnknownRecord[]>([]);
  const [metrics, setMetrics] = useState<UnknownRecord | null>(null);
  const [pnl, setPnl] = useState<UnknownRecord | null>(null);
  const [runLogs, setRunLogs] = useState<UnknownRecord[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState("");
  const [insightFilters, setInsightFilters] = useState({
    productLine: "LINEAR_PERPETUAL",
    strategyId: "",
    symbol: "",
    accountId: "",
    eventType: "",
    windowHours: "24",
    limit: "100",
    logCursor: "",
    logSort: "createdAt.desc"
  });
  const [logPageInfo, setLogPageInfo] = useState(cursorInfo());
  const [strategyConfig, setStrategyConfig] = useState<UnknownRecord | null>(null);
  const [configJson, setConfigJson] = useState(JSON.stringify(marketMakerConfigTemplate(), null, 2));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateInsightFilters(patch: Partial<typeof insightFilters>) {
    setInsightFilters((current) => ({ ...current, ...patch, logCursor: "" }));
  }

  async function load(nextLogCursor = insightFilters.logCursor) {
    setLoading(true);
    setError("");
    try {
      const insightParams = marketMakerInsightParams(insightFilters);
      const logParams = { ...insightParams, cursor: nextLogCursor, sort: insightFilters.logSort };
      const [strategyResponse, metricsResponse, pnlResponse, logResponse] = await Promise.all([
        gatewayGet<{ strategies?: UnknownRecord[]; items?: UnknownRecord[] }>("market-maker", "/strategies", insightParams),
        gatewayGet<UnknownRecord>("market-maker", "/metrics", { productLine: insightFilters.productLine, limit: 200 }),
        gatewayGet<UnknownRecord>("market-maker", "/pnl-attribution", insightParams),
        gatewayGet<{ events?: UnknownRecord[]; count?: number; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("market-maker", "/strategy-logs", logParams)
      ]);
      const nextStrategies = strategyResponse.strategies ?? strategyResponse.items ?? [];
      setStrategies(nextStrategies);
      if (nextStrategies.length && (!selectedStrategyId || !nextStrategies.some((item) => String(item.strategyId ?? item.id ?? "") === selectedStrategyId))) {
        const nextStrategyId = String(nextStrategies[0].strategyId ?? nextStrategies[0].id ?? "");
        setSelectedStrategyId(nextStrategyId);
      } else if (!nextStrategies.length) {
        setSelectedStrategyId("");
      }
      setMetrics(metricsResponse);
      setPnl(pnlResponse);
      setRunLogs(logResponse.events ?? []);
      setLogPageInfo(cursorInfo(logResponse));
      setInsightFilters((current) => ({ ...current, logCursor: nextLogCursor || "" }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function action(strategyId: unknown, op: "pause" | "resume") {
    if (!strategyId) return;
    setLoading(true);
    setError("");
    try {
      await gatewayPost("market-maker", `/strategies/${strategyId}/${op}`, undefined, { productLine: insightFilters.productLine });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadConfig(strategyId = selectedStrategyId) {
    if (!strategyId) {
      setError("请选择策略。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await gatewayGet<UnknownRecord>(
        "market-maker",
        `/strategies/${encodeURIComponent(strategyId)}/config`,
        { productLine: insightFilters.productLine }
      );
      setStrategyConfig(response);
      setConfigJson(JSON.stringify(marketMakerConfigPayload(response), null, 2));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!selectedStrategyId) {
      setError("请选择策略。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await gatewayPost<UnknownRecord>(
        "market-maker",
        `/strategies/${encodeURIComponent(selectedStrategyId)}/config`,
        JSON.parse(configJson),
        { productLine: insightFilters.productLine }
      );
      setStrategyConfig(response);
      setConfigJson(JSON.stringify(marketMakerConfigPayload(response), null, 2));
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function clearConfig() {
    if (!selectedStrategyId) {
      setError("请选择策略。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await gatewayPost<UnknownRecord>(
        "market-maker",
        `/strategies/${encodeURIComponent(selectedStrategyId)}/config`,
        { ...marketMakerConfigTemplate(), reason: "Reset market-maker strategy override" },
        { productLine: insightFilters.productLine }
      );
      setStrategyConfig(response);
      setConfigJson(JSON.stringify(marketMakerConfigPayload(response), null, 2));
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function runOnce() {
    setLoading(true);
    setError("");
    try {
      await gatewayPost("market-maker", "/run-once", { productLine: insightFilters.productLine }, { productLine: insightFilters.productLine });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const totals = objectValue(metrics?.totals);
  const metricRows = records(metrics?.rows as UnknownRecord[] | undefined).map((row) => ({
    ...row,
    inventoryUsage: ppmPercent(row.inventoryUsagePpm),
    quoteCoverage: ppmPercent(row.quoteCoveragePpm),
    spreadPpmText: ppmPercent(row.spreadPpm)
  }));
  const anomalies = records(metrics?.anomalies as UnknownRecord[] | undefined);
  const warnings = records(metrics?.warnings as UnknownRecord[] | undefined);
  const pnlTotals = objectValue(pnl?.totals);
  const pnlRows = records(pnl?.rows as UnknownRecord[] | undefined);

  return (
    <Page title="做市管理" onRefresh={load} loading={loading} error={error}>
      <div className="metrics">
        <Metric label="策略数" value={totals.strategyCount ?? strategies.length} tone="muted" />
        <Metric label="运行中" value={totals.runningStrategies ?? 0} tone="ok" />
        <Metric label="降级/暂停" value={`${totals.degradedStrategies ?? 0}/${totals.pausedStrategies ?? 0}`} tone={Number(totals.degradedStrategies ?? 0) > 0 ? "warn" : "muted"} />
        <Metric label="拒单数" value={totals.rejectedOrders ?? 0} tone={Number(totals.rejectedOrders ?? 0) > 0 ? "warn" : "ok"} />
        <Metric label="严重异常" value={totals.criticalAnomalies ?? 0} tone={Number(totals.criticalAnomalies ?? 0) > 0 ? "danger" : "ok"} />
        <Metric label="告警总数" value={totals.anomalyCount ?? anomalies.length} tone={anomalies.length > 0 ? "warn" : "ok"} />
      </div>
      <div className="button-row">
        <button className="primary" onClick={() => void runOnce()}><RefreshCw size={16} />运行一次</button>
      </div>
      <Panel title="收益归因与运行日志筛选">
        <div className="filters">
          <label>产品线<select value={insightFilters.productLine} onChange={(event) => {
            setSelectedStrategyId("");
            setStrategyConfig(null);
            updateInsightFilters({ productLine: event.target.value });
          }}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <TextFilter label="Strategy" value={insightFilters.strategyId} onChange={(value) => updateInsightFilters({ strategyId: value })} />
          <TextFilter label="Symbol" value={insightFilters.symbol} onChange={(value) => updateInsightFilters({ symbol: value.toUpperCase() })} />
          <TextFilter label="Account ID" value={insightFilters.accountId} onChange={(value) => updateInsightFilters({ accountId: value })} />
          <label>事件类型
            <select value={insightFilters.eventType} onChange={(event) => updateInsightFilters({ eventType: event.target.value })}>
              {MARKET_MAKER_EVENT_TYPES.map((item) => <option key={item || "ALL"} value={item}>{item || "全部"}</option>)}
            </select>
          </label>
          <TextFilter label="Window Hours" value={insightFilters.windowHours} onChange={(value) => updateInsightFilters({ windowHours: value })} />
          <TextFilter label="Limit" value={insightFilters.limit} onChange={(value) => updateInsightFilters({ limit: value })} />
          <SortSelect label="日志排序" value={insightFilters.logSort} options={CREATED_AT_SORTS} onChange={(value) => updateInsightFilters({ logSort: value })} />
          <button onClick={() => void load("")}><Search size={16} />查询归因</button>
        </div>
      </Panel>
      <div className="metrics">
        <Metric label="归因行数" value={pnlTotals.rowCount ?? pnlRows.length} tone="muted" />
        <Metric label="总成交" value={pnlTotals.totalTrades ?? 0} tone="ok" />
        <Metric label="Maker/Taker" value={`${pnlTotals.makerTrades ?? 0}/${pnlTotals.takerTrades ?? 0}`} tone="muted" />
        <Metric label="净手续费" value={pnlTotals.netFeeUnits ?? 0} tone={Number(pnlTotals.netFeeUnits ?? 0) >= 0 ? "ok" : "warn"} />
        <Metric label="当前已实现 PnL" value={pnlTotals.currentRealizedPnlUnits ?? 0} tone={Number(pnlTotals.currentRealizedPnlUnits ?? 0) >= 0 ? "ok" : "warn"} />
        <Metric label="运行日志" value={runLogs.length} tone={runLogs.some((row) => row.eventType === "CYCLE_FAILED" || row.eventType === "TRADE_REJECTED") ? "warn" : "muted"} />
      </div>
      <TwoColumn>
        <Panel title="策略控制">
          <DataTable rows={strategies} columns={["productLine", "strategyId", "status", "configuredEnabled", "runtimePaused", "cycleSequence", "submittedOrders", "canceledOrders", "rejectedOrders", "lastTraceId", "lastError"]} actions={(row) => (
            <div className="button-row compact-row">
              <button onClick={() => void action(row.strategyId ?? row.id, "pause")}>暂停</button>
              <button onClick={() => void action(row.strategyId ?? row.id, "resume")}>恢复</button>
            </div>
          )} />
        </Panel>
        <Panel title="异常列表">
          <DataTable rows={anomalies} columns={["severity", "type", "productLine", "strategyId", "symbol", "accountId", "metricValue", "threshold", "summary"]} />
        </Panel>
      </TwoColumn>
      <Panel title="策略参数编辑">
        <div className="filters">
          <label>策略<select value={selectedStrategyId} onChange={(event) => {
            const value = event.target.value;
            setSelectedStrategyId(value);
            void loadConfig(value);
          }}>
            <option value="">请选择</option>
            {strategies.map((strategy) => {
              const strategyId = String(strategy.strategyId ?? strategy.id ?? "");
              return <option key={`${strategy.productLine ?? insightFilters.productLine}:${strategyId}`} value={strategyId}>{strategyId}</option>;
            })}
          </select></label>
          <button onClick={() => void loadConfig()}><Search size={16} />读取配置</button>
          <button className="primary" onClick={() => void saveConfig()}>保存覆盖</button>
          <button onClick={() => void clearConfig()}>清除覆盖</button>
        </div>
        <TwoColumn>
          <div>
            <h4>当前配置</h4>
            <KeyValue data={objectValue(strategyConfig?.effective)} />
          </div>
          <div>
            <h4>基线配置</h4>
            <KeyValue data={objectValue(strategyConfig?.configured)} />
          </div>
        </TwoColumn>
        <textarea className="json-editor small" value={configJson} onChange={(event) => setConfigJson(event.target.value)} />
      </Panel>
      <TwoColumn>
        <Panel title="做市收益归因">
          <DataTable
            rows={pnlRows}
            columns={[
              "strategyId",
              "productLine",
              "symbol",
              "accountId",
              "marginMode",
              "orderCount",
              "rejectedOrders",
              "makerTrades",
              "takerTrades",
              "totalQuantitySteps",
              "totalNotionalTicks",
              "netFeeUnits",
              "currentRealizedPnlUnits",
              "signedInventorySteps",
              "firstTradeAt",
              "lastTradeAt"
            ]}
          />
        </Panel>
        <Panel title="策略运行日志">
          <div className="stack">
            <DataTable
              rows={runLogs}
              columns={[
                "createdAt",
                "productLine",
                "strategyId",
                "symbol",
                "accountId",
                "eventType",
                "cycleSequence",
                "submittedOrders",
                "canceledOrders",
                "rejectedOrders",
                "skippedReason",
                "errorMessage",
                "traceId"
              ]}
            />
            <CursorPager
              page={logPageInfo}
              cursor={insightFilters.logCursor}
              onNext={() => void load(logPageInfo.nextCursor || "")}
              onReset={() => void load("")}
            />
          </div>
        </Panel>
      </TwoColumn>
      <Panel title="做市质量指标">
        <DataTable
          rows={metricRows}
          columns={[
            "strategyId",
            "productLine",
            "symbol",
            "accountId",
            "strategyStatus",
            "qualityStatus",
            "signedInventorySteps",
            "inventoryUsage",
            "ownedOpenOrders",
            "desiredQuoteCount",
            "matchedDesiredQuotes",
            "missingDesiredQuotes",
            "staleOwnedOrders",
            "offTargetOwnedOrders",
            "spreadTicks",
            "spreadPpmText",
            "quoteCoverage",
            "lastTraceId",
            "error"
          ]}
        />
      </Panel>
      {warnings.length > 0 && (
        <Panel title="指标采集警告">
          <DataTable rows={warnings} columns={["productLine", "strategyId", "symbol", "accountId", "message"]} />
        </Panel>
      )}
    </Page>
  );
}

function RuntimeConfigPanel({ title, service, path, template, productLine }: {
  title: string;
  service: string;
  path: string;
  template: UnknownRecord;
  productLine?: string;
}) {
  const [config, setConfig] = useState<UnknownRecord | null>(null);
  const [json, setJson] = useState(JSON.stringify(template, null, 2));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setConfig(await gatewayGet<UnknownRecord>(service, path, { productLine }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setLoading(true);
    setError("");
    try {
      const response = await gatewayPost<UnknownRecord>(service, path, JSON.parse(json), { productLine });
      setConfig(response);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [service, path, productLine]);

  return (
    <Panel title={title}>
      <div className="stack">
        {error && <div className="alert danger">{error}</div>}
        <JsonBlock value={config ?? {}} />
        <textarea className="json-editor small" value={json} onChange={(event) => setJson(event.target.value)} />
        <div className="button-row">
          <button onClick={() => void load()} disabled={loading}>读取</button>
          <button className="primary" onClick={() => void save()} disabled={loading}>保存</button>
        </div>
      </div>
    </Panel>
  );
}

function SecurityPage() {
  const [roles, setRoles] = useState<UnknownRecord[]>([]);
  const [permissions, setPermissions] = useState<UnknownRecord[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [assignedText, setAssignedText] = useState("");
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [roleResponse, permissionResponse] = await Promise.all([adminRoles(), adminPermissions()]);
      setRoles(roleResponse.roles);
      setPermissions(permissionResponse.permissions);
      const nextRole = selectedRole || String(roleResponse.roles[0]?.roleCode ?? "");
      if (nextRole) {
        setSelectedRole(nextRole);
        await loadRolePermissions(nextRole);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadRolePermissions(roleCode: string) {
    const response = await getRolePermissions(roleCode);
    setAssigned(response.permissions);
    setAssignedText(response.permissions.join("\n"));
  }

  async function selectRole(roleCode: string) {
    setSelectedRole(roleCode);
    setError("");
    try {
      await loadRolePermissions(roleCode);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function savePermissions() {
    if (!selectedRole) return;
    const next = assignedText.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
    setLoading(true);
    setError("");
    try {
      const response = await replaceRolePermissions(selectedRole, next);
      setAssigned(response.permissions);
      setAssignedText(response.permissions.join("\n"));
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const assignedRows = assigned.map((permissionCode) => ({ permissionCode }));

  return (
    <Page title="权限治理" onRefresh={load} loading={loading} error={error}>
      <div className="metrics">
        <Metric label="角色数" value={roles.length} tone="ok" />
        <Metric label="权限点" value={permissions.length} tone="ok" />
        <Metric label="当前角色" value={selectedRole || "-"} tone="muted" />
        <Metric label="已授权" value={assigned.length} tone="muted" />
        <Metric label="写权限" value={assigned.filter((item) => item.endsWith(".write")).length} tone="warn" />
        <Metric label="通配权限" value={assigned.filter((item) => item.includes("*")).length} tone="danger" />
      </div>
      <TwoColumn>
        <Panel title="角色">
          <DataTable
            rows={roles}
            columns={["roleCode", "roleName", "permissionCount", "createdAt"]}
            onRowClick={(row) => void selectRole(String(row.roleCode ?? ""))}
            actions={(row) => row.roleCode === selectedRole ? <StatusBadge value="SELECTED" /> : <button onClick={() => void selectRole(String(row.roleCode ?? ""))}>选择</button>}
          />
        </Panel>
        <Panel title="角色权限">
          {selectedRole ? (
            <div className="stack">
              <KeyValue data={{ roleCode: selectedRole, permissions: assigned.length }} />
              <textarea className="json-editor small" value={assignedText} onChange={(event) => setAssignedText(event.target.value)} />
              <button className="primary" onClick={() => void savePermissions()} disabled={selectedRole === "SUPER_ADMIN"}>保存权限</button>
              <DataTable rows={assignedRows} columns={["permissionCode"]} />
            </div>
          ) : <Empty text="选择角色" />}
        </Panel>
      </TwoColumn>
      <Panel title="权限目录">
        <DataTable rows={permissions} columns={["permissionCode", "permissionName", "description", "createdAt"]} />
      </Panel>
    </Page>
  );
}

function ApprovalsPage() {
  const [filters, setFilters] = useState({ status: "PENDING", requesterUserId: "", approverUserId: "", service: "", limit: "200", cursor: "", sort: "requestedAt.desc" });
  const [rows, setRows] = useState<UnknownRecord[]>([]);
  const [pageInfo, setPageInfo] = useState(cursorInfo());
  const [decisionReason, setDecisionReason] = useState("Reviewed by admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextCursor = filters.cursor) {
    setLoading(true);
    setError("");
    try {
      const response = await approvalRequests({
        ...filters,
        cursor: nextCursor,
        limit: Number(filters.limit) || 200
      });
      setRows(response.approvals);
      setPageInfo(cursorInfo(response));
      setFilters((current) => ({ ...current, cursor: nextCursor }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function decide(row: UnknownRecord, decision: "approve" | "reject") {
    const approvalId = row.approvalId;
    if (approvalId === undefined || approvalId === null) return;
    const reason = decisionReason.trim();
    if (!reason) {
      setError(decision === "approve" ? "请输入审批意见。" : "请输入驳回原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (decision === "approve") {
        await approveApproval(String(approvalId), reason);
      } else {
        await rejectApproval(String(approvalId), reason);
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <Page title="审批中心" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <label>状态
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, cursor: "" })}>
            <option value="">全部</option>
            <option>PENDING</option>
            <option>APPROVED</option>
            <option>REJECTED</option>
            <option>CONSUMED</option>
          </select>
        </label>
        <TextFilter label="申请人 ID" value={filters.requesterUserId} onChange={(value) => setFilters({ ...filters, requesterUserId: value, cursor: "" })} />
        <TextFilter label="审批人 ID" value={filters.approverUserId} onChange={(value) => setFilters({ ...filters, approverUserId: value, cursor: "" })} />
        <TextFilter label="服务" value={filters.service} onChange={(value) => setFilters({ ...filters, service: value, cursor: "" })} />
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => setFilters({ ...filters, limit: value, cursor: "" })} />
        <TextFilter label="审批意见" value={decisionReason} onChange={setDecisionReason} />
        <SortSelect value={filters.sort} options={REQUESTED_AT_SORTS} onChange={(value) => setFilters({ ...filters, sort: value, cursor: "" })} />
        <button onClick={() => void load("")}><Search size={16} />查询</button>
      </div>
      <CursorPager
        page={pageInfo}
        cursor={filters.cursor}
        onNext={() => void load(pageInfo.nextCursor || "")}
        onReset={() => void load("")}
      />
      <DataTable rows={rows} maxColumns={12} actions={(row) => (
        row.status === "PENDING"
          ? <div className="button-row compact-row">
            <button className="primary" onClick={() => void decide(row, "approve")}>批准</button>
            <button onClick={() => void decide(row, "reject")}>驳回</button>
          </div>
          : <StatusBadge value={String(row.status ?? "")} />
      )} />
    </Page>
  );
}

function ExportsPage() {
  const [filters, setFilters] = useState({ status: "", exportType: "", limit: "100", cursor: "", sort: "requestedAt.desc" });
  const [rows, setRows] = useState<UnknownRecord[]>([]);
  const [pageInfo, setPageInfo] = useState(cursorInfo());
  const [createState, setCreateState] = useState({
    exportType: "USERS",
    paramsJson: JSON.stringify(EXPORT_PARAM_TEMPLATES.USERS, null, 2)
  });
  const [selected, setSelected] = useState<UnknownRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextCursor = filters.cursor) {
    setLoading(true);
    setError("");
    try {
      const response = await exportJobs({
        ...filters,
        cursor: nextCursor,
        limit: Number(filters.limit) || 100
      });
      setRows(response.exports);
      setPageInfo(cursorInfo(response));
      setFilters((current) => ({ ...current, cursor: nextCursor }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function createJob() {
    setLoading(true);
    setError("");
    try {
      const created = await createExportJob({
        exportType: createState.exportType,
        params: exportParams(createState.paramsJson)
      });
      setSelected(created);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function download(row: UnknownRecord) {
    const exportId = row.exportId;
    if (exportId === undefined || exportId === null) return;
    setLoading(true);
    setError("");
    try {
      await downloadExportFile(String(exportId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function chooseType(exportType: string) {
    setCreateState({
      exportType,
      paramsJson: JSON.stringify(EXPORT_PARAM_TEMPLATES[exportType] ?? {}, null, 2)
    });
  }

  useEffect(() => { void load(); }, []);

  const succeeded = rows.filter((row) => row.status === "SUCCEEDED").length;
  const running = rows.filter((row) => row.status === "RUNNING" || row.status === "PENDING").length;
  const failed = rows.filter((row) => row.status === "FAILED").length;

  return (
    <Page title="导出中心" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <label>状态
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, cursor: "" })}>
            {EXPORT_STATUSES.map((status) => <option key={status || "ALL"} value={status}>{status || "全部"}</option>)}
          </select>
        </label>
        <label>类型
          <select value={filters.exportType} onChange={(event) => setFilters({ ...filters, exportType: event.target.value, cursor: "" })}>
            <option value="">全部</option>
            {EXPORT_TYPES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => setFilters({ ...filters, limit: value, cursor: "" })} />
        <SortSelect value={filters.sort} options={REQUESTED_AT_SORTS} onChange={(value) => setFilters({ ...filters, sort: value, cursor: "" })} />
        <button onClick={() => void load("")}><Search size={16} />查询</button>
      </div>
      <CursorPager
        page={pageInfo}
        cursor={filters.cursor}
        onNext={() => void load(pageInfo.nextCursor || "")}
        onReset={() => void load("")}
      />
      <div className="metrics">
        <Metric label="任务数" value={rows.length} tone="ok" />
        <Metric label="已完成" value={succeeded} tone="ok" />
        <Metric label="运行中" value={running} tone={running ? "warn" : "muted"} />
        <Metric label="失败" value={failed} tone={failed ? "danger" : "ok"} />
        <Metric label="总行数" value={rows.reduce((sum, row) => sum + Number(row.rowCount ?? 0), 0)} tone="muted" />
        <Metric label="总字节" value={rows.reduce((sum, row) => sum + Number(row.byteSize ?? 0), 0)} tone="muted" />
      </div>
      <TwoColumn>
        <Panel title="创建导出任务">
          <div className="stack">
            <label>导出类型
              <select value={createState.exportType} onChange={(event) => chooseType(event.target.value)}>
                {EXPORT_TYPES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <textarea
              className="json-editor"
              value={createState.paramsJson}
              onChange={(event) => setCreateState({ ...createState, paramsJson: event.target.value })}
            />
            <button className="primary" onClick={() => void createJob()}><Download size={16} />创建任务</button>
          </div>
        </Panel>
        <Panel title="任务详情">
          {selected ? <KeyValue data={selected} /> : <Empty text="选择导出任务查看详情" />}
        </Panel>
      </TwoColumn>
      <Panel title="导出任务">
        <DataTable
          rows={rows}
          columns={["exportId", "exportType", "status", "rowCount", "byteSize", "requestedByUsername", "requestedAt", "finishedAt", "expiresAt", "errorMessage"]}
          onRowClick={(row) => setSelected(row)}
          actions={(row) => row.status === "SUCCEEDED"
            ? <button onClick={() => void download(row)}><Download size={14} />下载</button>
            : <StatusBadge value={String(row.status ?? "UNKNOWN")} />}
        />
      </Panel>
    </Page>
  );
}

function QueryTasksPage() {
  const [filters, setFilters] = useState({ status: "", queryType: "", limit: "100", cursor: "", sort: "requestedAt.desc" });
  const [rows, setRows] = useState<UnknownRecord[]>([]);
  const [pageInfo, setPageInfo] = useState(cursorInfo());
  const [limits, setLimits] = useState<UnknownRecord>({});
  const [createState, setCreateState] = useState({
    queryType: "SYSTEM_OPERATION_LATENCY",
    paramsJson: JSON.stringify(QUERY_TASK_PARAM_TEMPLATES.SYSTEM_OPERATION_LATENCY, null, 2)
  });
  const [archiveState, setArchiveState] = useState({
    olderThanDays: "",
    limit: "500",
    reason: "Archive expired query task results"
  });
  const [selected, setSelected] = useState<UnknownRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextCursor = filters.cursor) {
    setLoading(true);
    setError("");
    try {
      const [response, quota] = await Promise.all([
        queryTasks({
        ...filters,
        cursor: nextCursor,
        limit: Number(filters.limit) || 100
        }),
        queryTaskLimits()
      ]);
      setRows(response.tasks);
      setPageInfo(cursorInfo(response));
      setFilters((current) => ({ ...current, cursor: nextCursor }));
      setLimits(quota);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function createTask() {
    setLoading(true);
    setError("");
    try {
      const created = await createQueryTask({
        queryType: createState.queryType,
        params: exportParams(createState.paramsJson)
      });
      setSelected(created);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function archiveExpired() {
    setLoading(true);
    setError("");
    try {
      const response = await archiveExpiredQueryTasks({
        olderThanDays: archiveState.olderThanDays ? Number(archiveState.olderThanDays) : undefined,
        limit: Number(archiveState.limit) || 500,
        reason: archiveState.reason
      });
      setSelected(response);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function openTask(row: UnknownRecord) {
    const queryTaskId = row.queryTaskId;
    if (queryTaskId === undefined || queryTaskId === null) return;
    setLoading(true);
    setError("");
    try {
      setSelected(await queryTask(String(queryTaskId)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function chooseType(queryType: string) {
    setCreateState({
      queryType,
      paramsJson: JSON.stringify(QUERY_TASK_PARAM_TEMPLATES[queryType] ?? {}, null, 2)
    });
  }

  useEffect(() => { void load(); }, []);

  const succeeded = rows.filter((row) => row.status === "SUCCEEDED").length;
  const running = rows.filter((row) => row.status === "RUNNING" || row.status === "PENDING").length;
  const failed = rows.filter((row) => row.status === "FAILED").length;
  const archived = rows.filter((row) => row.status === "ARCHIVED").length;
  const parsedResult = parseQueryTaskResult(selected?.resultJson);
  const resultRows = records(parsedResult?.rows as UnknownRecord[] | undefined);
  const resultSummary = objectValue(parsedResult?.summary);

  return (
    <Page title="查询任务" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <label>状态
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, cursor: "" })}>
            {JOB_STATUSES.map((status) => <option key={status || "ALL"} value={status}>{status || "全部"}</option>)}
          </select>
        </label>
        <label>查询类型
          <select value={filters.queryType} onChange={(event) => setFilters({ ...filters, queryType: event.target.value, cursor: "" })}>
            <option value="">全部</option>
            {QUERY_TASK_TYPES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => setFilters({ ...filters, limit: value, cursor: "" })} />
        <SortSelect value={filters.sort} options={REQUESTED_AT_SORTS} onChange={(value) => setFilters({ ...filters, sort: value, cursor: "" })} />
        <button onClick={() => void load("")}><Search size={16} />查询</button>
      </div>
      <CursorPager
        page={pageInfo}
        cursor={filters.cursor}
        onNext={() => void load(pageInfo.nextCursor || "")}
        onReset={() => void load("")}
      />
      <div className="metrics">
        <Metric label="任务数" value={rows.length} tone="ok" />
        <Metric label="已完成" value={succeeded} tone="ok" />
        <Metric label="运行中" value={running} tone={running ? "warn" : "muted"} />
        <Metric label="失败" value={failed} tone={failed ? "danger" : "ok"} />
        <Metric label="已归档" value={archived} tone="muted" />
        <Metric label="总行数" value={rows.reduce((sum, row) => sum + Number(row.rowCount ?? 0), 0)} tone="muted" />
        <Metric label="总字节" value={rows.reduce((sum, row) => sum + Number(row.byteSize ?? 0), 0)} tone="muted" />
        <Metric label="我的活跃配额" value={`${limits.activeTasksForUser ?? 0}/${limits.maxActiveTasksPerUser ?? "-"}`} tone={Number(limits.activeTasksForUser ?? 0) >= Number(limits.maxActiveTasksPerUser ?? 999) ? "warn" : "ok"} />
        <Metric label="全局活跃配额" value={`${limits.activeTasksGlobal ?? 0}/${limits.maxActiveTasksGlobal ?? "-"}`} tone={Number(limits.activeTasksGlobal ?? 0) >= Number(limits.maxActiveTasksGlobal ?? 999) ? "warn" : "muted"} />
        <Metric label="可归档" value={limits.expiredTasksReadyToArchive ?? 0} tone={Number(limits.expiredTasksReadyToArchive ?? 0) > 0 ? "warn" : "ok"} />
        <Metric label="保留字节" value={limits.retainedResultBytes ?? 0} tone={Number(limits.retainedResultBytes ?? 0) >= Number(limits.maxRetainedResultBytes ?? 999999999999) ? "danger" : "muted"} />
      </div>
      <Panel title="配额与归档">
        <div className="filters">
          <TextFilter
            label="归档完成天数"
            value={archiveState.olderThanDays}
            onChange={(value) => setArchiveState({ ...archiveState, olderThanDays: value })}
          />
          <TextFilter
            label="Limit"
            value={archiveState.limit}
            onChange={(value) => setArchiveState({ ...archiveState, limit: value })}
          />
          <TextFilter
            label="Reason"
            value={archiveState.reason}
            onChange={(value) => setArchiveState({ ...archiveState, reason: value })}
          />
          <button onClick={() => void archiveExpired()}><Database size={16} />归档过期结果</button>
        </div>
        <KeyValue data={{
          createdByUserInWindow: limits.createdByUserInWindow,
          maxCreatedByUserInWindow: limits.maxCreatedByUserInWindow,
          creationWindowSeconds: limits.creationWindowSeconds,
          maxRetainedResultBytes: limits.maxRetainedResultBytes
        }} />
      </Panel>
      <TwoColumn>
        <Panel title="创建查询任务">
          <div className="stack">
            <label>查询类型
              <select value={createState.queryType} onChange={(event) => chooseType(event.target.value)}>
                {QUERY_TASK_TYPES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <textarea
              className="json-editor"
              value={createState.paramsJson}
              onChange={(event) => setCreateState({ ...createState, paramsJson: event.target.value })}
            />
            <button className="primary" onClick={() => void createTask()}><BookOpen size={16} />创建任务</button>
          </div>
        </Panel>
        <Panel title="任务详情">
          {selected ? <KeyValue data={selected} /> : <Empty text="选择查询任务查看详情" />}
        </Panel>
      </TwoColumn>
      {selected && (
        <Panel title="查询结果">
          {selected.status === "ARCHIVED" && <Empty text="结果已归档，保留任务元数据" />}
          {selected.status !== "SUCCEEDED" && selected.status !== "ARCHIVED" && <Empty text="任务完成后显示结果" />}
          {selected.status === "SUCCEEDED" && (
            <div className="stack">
              <KeyValue data={{ generatedAt: parsedResult?.generatedAt, ...resultSummary }} />
              <DataTable rows={resultRows} maxColumns={12} />
              <JsonBlock value={parsedResult ?? {}} />
            </div>
          )}
        </Panel>
      )}
      <Panel title="查询任务">
        <DataTable
          rows={rows}
          columns={["queryTaskId", "queryType", "status", "rowCount", "byteSize", "requestedByUsername", "requestedAt", "finishedAt", "expiresAt", "archivedAt", "archiveReason", "errorMessage"]}
          onRowClick={(row) => void openTask(row)}
          actions={(row) => <button onClick={() => void openTask(row)}><Search size={14} />查看</button>}
        />
      </Panel>
    </Page>
  );
}

function AlertsPage() {
  const [ruleFilters, setRuleFilters] = useState({ domain: "", enabled: "", limit: "100", cursor: "", sort: "updatedAt.desc" });
  const [eventFilters, setEventFilters] = useState({ status: "OPEN", severity: "", domain: "", limit: "100", cursor: "", sort: "lastSeenAt.desc" });
  const [channelFilters, setChannelFilters] = useState({ domain: "", enabled: "", limit: "100", cursor: "", sort: "updatedAt.desc" });
  const [deliveryFilters, setDeliveryFilters] = useState({ status: "", channelId: "", eventId: "", limit: "100", cursor: "", sort: "createdAt.desc" });
  const [rulePageInfo, setRulePageInfo] = useState(cursorInfo());
  const [eventPageInfo, setEventPageInfo] = useState(cursorInfo());
  const [channelPageInfo, setChannelPageInfo] = useState(cursorInfo());
  const [deliveryPageInfo, setDeliveryPageInfo] = useState(cursorInfo());
  const [rules, setRules] = useState<UnknownRecord[]>([]);
  const [events, setEvents] = useState<UnknownRecord[]>([]);
  const [channels, setChannels] = useState<UnknownRecord[]>([]);
  const [deliveries, setDeliveries] = useState<UnknownRecord[]>([]);
  const [selectedRule, setSelectedRule] = useState<UnknownRecord | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<UnknownRecord | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<UnknownRecord | null>(null);
  const [ruleForm, setRuleForm] = useState(alertRuleFormFromRecord(ALERT_RULE_TEMPLATE));
  const [channelForm, setChannelForm] = useState(alertChannelFormFromRecord(ALERT_CHANNEL_TEMPLATE));
  const [ruleJson, setRuleJson] = useState(() => JSON.stringify(alertRulePayload(alertRuleFormFromRecord(ALERT_RULE_TEMPLATE)), null, 2));
  const [channelJson, setChannelJson] = useState(() => JSON.stringify(alertChannelPayload(alertChannelFormFromRecord(ALERT_CHANNEL_TEMPLATE)), null, 2));
  const [evaluation, setEvaluation] = useState<UnknownRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateRuleFilters(patch: Partial<typeof ruleFilters>) {
    setRuleFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateEventFilters(patch: Partial<typeof eventFilters>) {
    setEventFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateChannelFilters(patch: Partial<typeof channelFilters>) {
    setChannelFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  function updateDeliveryFilters(patch: Partial<typeof deliveryFilters>) {
    setDeliveryFilters((current) => ({ ...current, ...patch, cursor: "" }));
  }

  async function load(nextRuleCursor = ruleFilters.cursor,
                      nextEventCursor = eventFilters.cursor,
                      nextChannelCursor = channelFilters.cursor,
                      nextDeliveryCursor = deliveryFilters.cursor) {
    setLoading(true);
    setError("");
    try {
      const [ruleResponse, eventResponse, channelResponse, deliveryResponse] = await Promise.all([
        alertRules({
          domain: ruleFilters.domain,
          enabled: ruleFilters.enabled,
          limit: Number(ruleFilters.limit) || 100,
          cursor: nextRuleCursor,
          sort: ruleFilters.sort
        }),
        alertEvents({
          status: eventFilters.status,
          severity: eventFilters.severity,
          domain: eventFilters.domain,
          limit: Number(eventFilters.limit) || 100,
          cursor: nextEventCursor,
          sort: eventFilters.sort
        }),
        alertChannels({
          domain: channelFilters.domain,
          enabled: channelFilters.enabled,
          limit: Number(channelFilters.limit) || 100,
          cursor: nextChannelCursor,
          sort: channelFilters.sort
        }),
        alertDeliveries({
          status: deliveryFilters.status,
          channelId: deliveryFilters.channelId,
          eventId: deliveryFilters.eventId,
          limit: Number(deliveryFilters.limit) || 100,
          cursor: nextDeliveryCursor,
          sort: deliveryFilters.sort
        })
      ]);
      setRules(ruleResponse.rules ?? []);
      setEvents(eventResponse.events ?? []);
      setChannels(channelResponse.channels ?? []);
      setDeliveries(deliveryResponse.deliveries ?? []);
      setRulePageInfo(cursorInfo(ruleResponse));
      setEventPageInfo(cursorInfo(eventResponse));
      setChannelPageInfo(cursorInfo(channelResponse));
      setDeliveryPageInfo(cursorInfo(deliveryResponse));
      setRuleFilters((current) => ({ ...current, cursor: nextRuleCursor || "" }));
      setEventFilters((current) => ({ ...current, cursor: nextEventCursor || "" }));
      setChannelFilters((current) => ({ ...current, cursor: nextChannelCursor || "" }));
      setDeliveryFilters((current) => ({ ...current, cursor: nextDeliveryCursor || "" }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveRule() {
    setLoading(true);
    setError("");
    try {
      const body = jsonObject(ruleJson);
      const ruleId = selectedRule?.alertRuleId;
      const saved = ruleId === undefined || ruleId === null
        ? await createAlertRule(body)
        : await updateAlertRule(String(ruleId), body);
      const next = alertRuleFormFromRecord(alertRuleEditable(saved));
      setSelectedRule(saved);
      setRuleForm(next);
      setRuleJson(JSON.stringify(alertRulePayload(next), null, 2));
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function toggleRule(row: UnknownRecord) {
    const ruleId = row.alertRuleId;
    if (ruleId === undefined || ruleId === null) return;
    setLoading(true);
    setError("");
    try {
      if (row.enabled) {
        await disableAlertRule(String(ruleId));
      } else {
        await enableAlertRule(String(ruleId));
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveChannel() {
    setLoading(true);
    setError("");
    try {
      const body = jsonObject(channelJson);
      const channelId = selectedChannel?.alertChannelId;
      const saved = channelId === undefined || channelId === null
        ? await createAlertChannel(body)
        : await updateAlertChannel(String(channelId), body);
      const next = alertChannelFormFromRecord(alertChannelEditable(saved));
      setSelectedChannel(saved);
      setChannelForm(next);
      setChannelJson(JSON.stringify(alertChannelPayload(next), null, 2));
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function toggleChannel(row: UnknownRecord) {
    const channelId = row.alertChannelId;
    if (channelId === undefined || channelId === null) return;
    setLoading(true);
    setError("");
    try {
      if (row.enabled) {
        await disableAlertChannel(String(channelId));
      } else {
        await enableAlertChannel(String(channelId));
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function evaluate() {
    setLoading(true);
    setError("");
    try {
      const response = await evaluateAlerts();
      setEvaluation(response);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function acknowledge(row: UnknownRecord) {
    const eventId = row.alertEventId;
    if (eventId === undefined || eventId === null) return;
    setLoading(true);
    setError("");
    try {
      const response = await acknowledgeAlertEvent(String(eventId));
      setSelectedEvent(response);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function retryDelivery(row: UnknownRecord) {
    const deliveryId = row.alertDeliveryId;
    if (deliveryId === undefined || deliveryId === null) return;
    setLoading(true);
    setError("");
    try {
      await retryAlertDelivery(String(deliveryId));
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function editRule(row: UnknownRecord | null) {
    const next = alertRuleFormFromRecord(row ? alertRuleEditable(row) : ALERT_RULE_TEMPLATE);
    setSelectedRule(row);
    setRuleForm(next);
    setRuleJson(JSON.stringify(alertRulePayload(next), null, 2));
  }

  function editChannel(row: UnknownRecord | null) {
    const next = alertChannelFormFromRecord(row ? alertChannelEditable(row) : ALERT_CHANNEL_TEMPLATE);
    setSelectedChannel(row);
    setChannelForm(next);
    setChannelJson(JSON.stringify(alertChannelPayload(next), null, 2));
  }

  function updateRuleForm(patch: Partial<ReturnType<typeof alertRuleFormFromRecord>>) {
    const next = { ...ruleForm, ...patch };
    setRuleForm(next);
    setRuleJson(JSON.stringify(alertRulePayload(next), null, 2));
  }

  function updateChannelForm(patch: Partial<ReturnType<typeof alertChannelFormFromRecord>>) {
    const next = { ...channelForm, ...patch };
    setChannelForm(next);
    setChannelJson(JSON.stringify(alertChannelPayload(next), null, 2));
  }

  useEffect(() => { void load(); }, []);

  const openEvents = events.filter((row) => row.status === "OPEN").length;
  const criticalEvents = events.filter((row) => row.severity === "CRITICAL").length;
  const enabledRules = rules.filter((row) => row.enabled).length;
  const enabledChannels = channels.filter((row) => row.enabled).length;
  const pendingDeliveries = deliveries.filter((row) => row.deliveryStatus === "PENDING").length;
  const failedDeliveries = deliveries.filter((row) => row.deliveryStatus === "FAILED").length;

  return (
    <Page title="告警中心" onRefresh={load} loading={loading} error={error}>
      <div className="metrics">
        <Metric label="规则数" value={rules.length} tone="muted" />
        <Metric label="启用规则" value={enabledRules} tone="ok" />
        <Metric label="事件数" value={events.length} tone="muted" />
        <Metric label="OPEN" value={openEvents} tone={openEvents ? "warn" : "ok"} />
        <Metric label="CRITICAL" value={criticalEvents} tone={criticalEvents ? "danger" : "ok"} />
        <Metric label="通知渠道" value={`${enabledChannels}/${channels.length}`} tone={enabledChannels ? "ok" : "warn"} />
        <Metric label="待投递/失败" value={`${pendingDeliveries}/${failedDeliveries}`} tone={failedDeliveries ? "danger" : pendingDeliveries ? "warn" : "ok"} />
        <Metric label="最近评估触发" value={evaluation?.triggeredEvents ?? "-"} tone={Number(evaluation?.triggeredEvents ?? 0) > 0 ? "warn" : "muted"} />
      </div>
      <TwoColumn>
        <Panel title="告警规则">
          <div className="stack">
            <div className="filters compact">
              <label>域<select value={ruleFilters.domain} onChange={(event) => updateRuleFilters({ domain: event.target.value })}>{ALERT_DOMAINS.map((item) => <option key={item || "ALL"} value={item}>{item || "全部"}</option>)}</select></label>
              <label>启用<select value={ruleFilters.enabled} onChange={(event) => updateRuleFilters({ enabled: event.target.value })}><option value="">全部</option><option value="true">启用</option><option value="false">停用</option></select></label>
              <TextFilter label="Limit" value={ruleFilters.limit} onChange={(value) => updateRuleFilters({ limit: value })} />
              <SortSelect label="排序" value={ruleFilters.sort} options={ALERT_CONFIG_SORTS} onChange={(value) => updateRuleFilters({ sort: value })} />
              <button onClick={() => void load("", eventFilters.cursor, channelFilters.cursor, deliveryFilters.cursor)}><Search size={16} />查询</button>
              <button onClick={() => editRule(null)}>新建</button>
              <button className="primary" onClick={() => void evaluate()}><Bell size={16} />手动评估</button>
            </div>
            <CursorPager
              page={rulePageInfo}
              cursor={ruleFilters.cursor}
              onNext={() => void load(rulePageInfo.nextCursor || "", eventFilters.cursor, channelFilters.cursor, deliveryFilters.cursor)}
              onReset={() => void load("", eventFilters.cursor, channelFilters.cursor, deliveryFilters.cursor)}
            />
            <DataTable
              rows={rules}
              columns={["alertRuleId", "ruleCode", "domain", "metricKey", "target", "conditionOperator", "thresholdValue", "severity", "enabled", "updatedAt"]}
              onRowClick={(row) => editRule(row)}
              actions={(row) => <button onClick={() => void toggleRule(row)}>{row.enabled ? "停用" : "启用"}</button>}
            />
          </div>
        </Panel>
        <Panel title={selectedRule ? "编辑规则" : "新建规则"}>
          <div className="stack">
            <div className="form-grid">
              <TextFilter label="规则编码" value={ruleForm.ruleCode} onChange={(value) => updateRuleForm({ ruleCode: value.toUpperCase() })} />
              <TextFilter label="规则名称" value={ruleForm.ruleName} onChange={(value) => updateRuleForm({ ruleName: value })} />
              <label>域<select value={ruleForm.domain} onChange={(event) => updateRuleForm({ domain: event.target.value })}>{ALERT_EDIT_DOMAINS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <TextFilter label="指标键" value={ruleForm.metricKey} onChange={(value) => updateRuleForm({ metricKey: value.toUpperCase() })} />
              <TextFilter label="目标" value={ruleForm.target} onChange={(value) => updateRuleForm({ target: value.toUpperCase() })} />
              <label>条件<select value={ruleForm.conditionOperator} onChange={(event) => updateRuleForm({ conditionOperator: event.target.value })}>{ALERT_OPERATORS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <TextFilter label="阈值" value={ruleForm.thresholdValue} onChange={(value) => updateRuleForm({ thresholdValue: value })} />
              <label>级别<select value={ruleForm.severity} onChange={(event) => updateRuleForm({ severity: event.target.value })}>{ALERT_EDIT_SEVERITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <TextFilter label="窗口秒数" value={ruleForm.windowSeconds} onChange={(value) => updateRuleForm({ windowSeconds: value })} />
              <TextFilter label="冷却秒数" value={ruleForm.cooldownSeconds} onChange={(value) => updateRuleForm({ cooldownSeconds: value })} />
            </div>
            <label className="toggle">
              <input type="checkbox" checked={ruleForm.enabled === "true"} onChange={(event) => updateRuleForm({ enabled: String(event.target.checked) })} />
              启用规则
            </label>
            <label>说明<textarea className="json-editor small text-editor" value={ruleForm.description} onChange={(event) => updateRuleForm({ description: event.target.value })} /></label>
            <details className="raw-toggle">
              <summary>高级 JSON 请求体</summary>
              <textarea className="json-editor small" value={ruleJson} onChange={(event) => setRuleJson(event.target.value)} />
            </details>
            <button className="primary" onClick={() => void saveRule()}>{selectedRule ? "保存规则" : "创建规则"}</button>
            {evaluation && <JsonBlock value={evaluation} />}
          </div>
        </Panel>
      </TwoColumn>
      <TwoColumn>
        <Panel title="通知渠道">
          <div className="stack">
            <div className="filters compact">
              <label>域<select value={channelFilters.domain} onChange={(event) => updateChannelFilters({ domain: event.target.value })}>{ALERT_DOMAINS.map((item) => <option key={item || "ALL"} value={item}>{item || "全部"}</option>)}</select></label>
              <label>启用<select value={channelFilters.enabled} onChange={(event) => updateChannelFilters({ enabled: event.target.value })}><option value="">全部</option><option value="true">启用</option><option value="false">停用</option></select></label>
              <TextFilter label="Limit" value={channelFilters.limit} onChange={(value) => updateChannelFilters({ limit: value })} />
              <SortSelect label="排序" value={channelFilters.sort} options={ALERT_CONFIG_SORTS} onChange={(value) => updateChannelFilters({ sort: value })} />
              <button onClick={() => void load(ruleFilters.cursor, eventFilters.cursor, "", deliveryFilters.cursor)}><Search size={16} />查询</button>
              <button onClick={() => editChannel(null)}>新建</button>
            </div>
            <CursorPager
              page={channelPageInfo}
              cursor={channelFilters.cursor}
              onNext={() => void load(ruleFilters.cursor, eventFilters.cursor, channelPageInfo.nextCursor || "", deliveryFilters.cursor)}
              onReset={() => void load(ruleFilters.cursor, eventFilters.cursor, "", deliveryFilters.cursor)}
            />
            <DataTable
              rows={channels}
              columns={["alertChannelId", "channelCode", "channelName", "channelType", "domain", "minSeverity", "enabled", "endpoint", "updatedAt"]}
              onRowClick={(row) => editChannel(row)}
              actions={(row) => <button onClick={() => void toggleChannel(row)}>{row.enabled ? "停用" : "启用"}</button>}
            />
          </div>
        </Panel>
        <Panel title={selectedChannel ? "编辑通知渠道" : "新建通知渠道"}>
          <div className="stack">
            <div className="form-grid">
              <TextFilter label="渠道编码" value={channelForm.channelCode} onChange={(value) => updateChannelForm({ channelCode: value.toUpperCase() })} />
              <TextFilter label="渠道名称" value={channelForm.channelName} onChange={(value) => updateChannelForm({ channelName: value })} />
              <label>类型<select value={channelForm.channelType} onChange={(event) => updateChannelForm({ channelType: event.target.value })}>{ALERT_CHANNEL_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>域<select value={channelForm.domain} onChange={(event) => updateChannelForm({ domain: event.target.value })}>{ALERT_DOMAINS.map((item) => <option key={item || "ALL"} value={item}>{item || "不限"}</option>)}</select></label>
              <label>最低级别<select value={channelForm.minSeverity} onChange={(event) => updateChannelForm({ minSeverity: event.target.value })}>{ALERT_EDIT_SEVERITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <TextFilter label="Endpoint" value={channelForm.endpoint} onChange={(value) => updateChannelForm({ endpoint: value })} />
            </div>
            <label className="toggle">
              <input type="checkbox" checked={channelForm.enabled === "true"} onChange={(event) => updateChannelForm({ enabled: String(event.target.checked) })} />
              启用渠道
            </label>
            <label>说明<textarea className="json-editor small text-editor" value={channelForm.description} onChange={(event) => updateChannelForm({ description: event.target.value })} /></label>
            <details className="raw-toggle">
              <summary>高级 JSON 请求体</summary>
              <textarea className="json-editor small" value={channelJson} onChange={(event) => setChannelJson(event.target.value)} />
            </details>
            <button className="primary" onClick={() => void saveChannel()}>{selectedChannel ? "保存渠道" : "创建渠道"}</button>
          </div>
        </Panel>
      </TwoColumn>
      <Panel title="通知投递">
        <div className="stack">
          <div className="filters compact">
            <label>状态<select value={deliveryFilters.status} onChange={(event) => updateDeliveryFilters({ status: event.target.value })}>{ALERT_DELIVERY_STATUSES.map((item) => <option key={item || "ALL"} value={item}>{item || "全部"}</option>)}</select></label>
            <TextFilter label="Channel ID" value={deliveryFilters.channelId} onChange={(value) => updateDeliveryFilters({ channelId: value })} />
            <TextFilter label="Event ID" value={deliveryFilters.eventId} onChange={(value) => updateDeliveryFilters({ eventId: value })} />
            <TextFilter label="Limit" value={deliveryFilters.limit} onChange={(value) => updateDeliveryFilters({ limit: value })} />
            <SortSelect label="排序" value={deliveryFilters.sort} options={ALERT_DELIVERY_SORTS} onChange={(value) => updateDeliveryFilters({ sort: value })} />
            <button onClick={() => void load(ruleFilters.cursor, eventFilters.cursor, channelFilters.cursor, "")}><Search size={16} />查询</button>
          </div>
          <DataTable
            rows={deliveries}
            columns={["alertDeliveryId", "alertEventId", "channelCode", "channelType", "deliveryStatus", "attemptCount", "ruleCode", "domain", "severity", "eventStatus", "createdAt", "errorMessage"]}
            actions={(row) => ["FAILED", "SKIPPED"].includes(String(row.deliveryStatus ?? "")) ? <button onClick={() => void retryDelivery(row)}>重试</button> : <StatusBadge value={String(row.deliveryStatus ?? "")} />}
          />
          <CursorPager
            page={deliveryPageInfo}
            cursor={deliveryFilters.cursor}
            onNext={() => void load(ruleFilters.cursor, eventFilters.cursor, channelFilters.cursor, deliveryPageInfo.nextCursor || "")}
            onReset={() => void load(ruleFilters.cursor, eventFilters.cursor, channelFilters.cursor, "")}
          />
        </div>
      </Panel>
      <TwoColumn>
        <Panel title="告警事件">
          <div className="stack">
            <div className="filters compact">
              <label>状态<select value={eventFilters.status} onChange={(event) => updateEventFilters({ status: event.target.value })}>{ALERT_STATUSES.map((item) => <option key={item || "ALL"} value={item}>{item || "全部"}</option>)}</select></label>
              <label>级别<select value={eventFilters.severity} onChange={(event) => updateEventFilters({ severity: event.target.value })}>{ALERT_SEVERITIES.map((item) => <option key={item || "ALL"} value={item}>{item || "全部"}</option>)}</select></label>
              <label>域<select value={eventFilters.domain} onChange={(event) => updateEventFilters({ domain: event.target.value })}>{ALERT_DOMAINS.map((item) => <option key={item || "ALL"} value={item}>{item || "全部"}</option>)}</select></label>
              <TextFilter label="Limit" value={eventFilters.limit} onChange={(value) => updateEventFilters({ limit: value })} />
              <SortSelect label="排序" value={eventFilters.sort} options={ALERT_EVENT_SORTS} onChange={(value) => updateEventFilters({ sort: value })} />
              <button onClick={() => void load(ruleFilters.cursor, "", channelFilters.cursor, deliveryFilters.cursor)}><Search size={16} />查询</button>
            </div>
            <DataTable
              rows={events}
              columns={["alertEventId", "ruleCode", "domain", "metricKey", "target", "severity", "status", "currentValue", "thresholdValue", "occurrences", "lastSeenAt"]}
              onRowClick={(row) => setSelectedEvent(row)}
              actions={(row) => row.status === "OPEN" ? <button onClick={() => void acknowledge(row)}>确认</button> : <StatusBadge value={String(row.status ?? "")} />}
            />
            <CursorPager
              page={eventPageInfo}
              cursor={eventFilters.cursor}
              onNext={() => void load(ruleFilters.cursor, eventPageInfo.nextCursor || "", channelFilters.cursor, deliveryFilters.cursor)}
              onReset={() => void load(ruleFilters.cursor, "", channelFilters.cursor, deliveryFilters.cursor)}
            />
          </div>
        </Panel>
        <Panel title="事件详情">
          {selectedEvent ? <KeyValue data={selectedEvent} /> : <Empty text="选择告警事件查看详情" />}
        </Panel>
      </TwoColumn>
    </Page>
  );
}

function SystemPage() {
  const [health, setHealth] = useState<UnknownRecord | null>(null);
  const [routes, setRoutes] = useState<UnknownRecord | null>(null);
  const [metrics, setMetrics] = useState<UnknownRecord | null>(null);
  const [observability, setObservability] = useState<UnknownRecord | null>(null);
  const [mfa, setMfa] = useState<UnknownRecord | null>(null);
  const [mfaEnrollment, setMfaEnrollment] = useState<UnknownRecord | null>(null);
  const [includePublicRoutes, setIncludePublicRoutes] = useState(true);
  const [windowMinutes, setWindowMinutes] = useState("60");
  const [mfaCode, setMfaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [healthResponse, routesResponse, metricsResponse, observabilityResponse, mfaResponse] = await Promise.all([
        systemHealth({ includePublicRoutes }),
        systemRoutes(),
        systemMetrics({ windowMinutes: Number(windowMinutes) || 60 }),
        systemObservability(),
        mfaStatus()
      ]);
      setHealth(healthResponse);
      setRoutes(routesResponse);
      setMetrics(metricsResponse);
      setObservability(observabilityResponse);
      setMfa(mfaResponse);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const healthRows = records(health?.services as UnknownRecord[] | undefined);
  const publicRoutes = records(routes?.publicRoutes as UnknownRecord[] | undefined);
  const adminRoutes = records(routes?.adminRoutes as UnknownRecord[] | undefined);
  const outboxMetrics = objectValue(metrics?.outbox);
  const adminOperations = objectValue(metrics?.adminOperations);
  const loginMetric = objectValue(metrics?.logins);
  const approvalMetric = objectValue(metrics?.approvals);
  const outboxRows = records(outboxMetrics.modules as UnknownRecord[] | undefined);
  const operationServiceRows = records(adminOperations.services as UnknownRecord[] | undefined);
  const metricWarnings = records(metrics?.warnings as UnknownRecord[] | undefined);
  const observabilityWarnings = records(observability?.warnings as UnknownRecord[] | undefined);
  const kafkaMetrics = objectValue(observability?.kafka);
  const kafkaGroupRows = records(kafkaMetrics.groups as UnknownRecord[] | undefined);
  const webSocketMetrics = objectValue(observability?.webSocket);
  const webSocketChannelRows = records(webSocketMetrics.channels as UnknownRecord[] | undefined);
  const prometheusMetrics = objectValue(observability?.prometheus);
  const prometheusRows = records(prometheusMetrics.targets as UnknownRecord[] | undefined);
  const mfaEnabled = Boolean(mfa?.enabled);

  async function startMfaEnrollment() {
    setLoading(true);
    setError("");
    try {
      setMfaEnrollment(await enrollMfa());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirmMfaEnrollment() {
    const code = mfaCode.trim();
    if (!code) {
      setError("请输入认证器中显示的 6 位动态码。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setMfa(await confirmMfa(code.trim()));
      setMfaEnrollment(null);
      setMfaCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function turnOffMfa() {
    const code = mfaCode.trim();
    if (!code) {
      setError("请输入当前 2FA 动态码以关闭 MFA。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setMfa(await disableMfa(code.trim()));
      setMfaEnrollment(null);
      setMfaCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="系统监控" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <label className="inline-check">
          <input
            type="checkbox"
            checked={includePublicRoutes}
            onChange={(event) => setIncludePublicRoutes(event.target.checked)}
          />
          包含普通前端路由
        </label>
        <TextFilter label="指标窗口(分钟)" value={windowMinutes} onChange={setWindowMinutes} />
        <button onClick={load}><RefreshCw size={16} />巡检</button>
      </div>
      <div className="metrics">
        <Metric label="服务数" value={health?.count ?? 0} tone="ok" />
        <Metric label="UP" value={health?.up ?? 0} tone="ok" />
        <Metric label="DOWN" value={health?.down ?? 0} tone={Number(health?.down ?? 0) > 0 ? "danger" : "ok"} />
        <Metric label="UNKNOWN" value={health?.unknown ?? 0} tone={Number(health?.unknown ?? 0) > 0 ? "warn" : "ok"} />
        <Metric label="路由数" value={publicRoutes.length + adminRoutes.length} tone="ok" />
        <Metric label="更新时间" value={formatDate(String(health?.generatedAt ?? ""))} tone="muted" />
      </div>
      <Panel title="运行指标聚合">
        <div className="metrics">
          <Metric label="Outbox 待发布" value={outboxMetrics.totalPending ?? 0} tone={Number(outboxMetrics.totalPending ?? 0) > 0 ? "warn" : "ok"} />
          <Metric label="Outbox 失败" value={outboxMetrics.totalFailed ?? 0} tone={Number(outboxMetrics.totalFailed ?? 0) > 0 ? "danger" : "ok"} />
          <Metric label="后台操作失败率" value={`${compactNumber(Number(adminOperations.failureRatePpm ?? 0) / 10000)}%`} tone={Number(adminOperations.failed ?? 0) > 0 ? "warn" : "ok"} />
          <Metric label="后台写操作" value={adminOperations.writes ?? 0} tone="muted" />
          <Metric label="后台 P50" value={`${compactNumber(adminOperations.p50DurationMs ?? 0)} ms`} tone="muted" />
          <Metric label="后台 P95" value={`${compactNumber(adminOperations.p95DurationMs ?? 0)} ms`} tone={Number(adminOperations.p95DurationMs ?? 0) > 1000 ? "warn" : "ok"} />
          <Metric label="后台 P99" value={`${compactNumber(adminOperations.p99DurationMs ?? 0)} ms`} tone={Number(adminOperations.p99DurationMs ?? 0) > 3000 ? "danger" : "muted"} />
          <Metric label="登录失败" value={loginMetric.failed ?? 0} tone={Number(loginMetric.failed ?? 0) > 0 ? "warn" : "ok"} />
          <Metric label="待审批" value={approvalMetric.pending ?? 0} tone={Number(approvalMetric.pending ?? 0) > 0 ? "warn" : "ok"} />
        </div>
        {metricWarnings.length > 0 && (
          <div className="alert danger">
            <DataTable rows={metricWarnings} columns={["module", "source", "message"]} />
          </div>
        )}
      </Panel>
      <Panel title="基础设施可观测性">
        <div className="metrics">
          <Metric label="Kafka Lag" value={kafkaMetrics.enabled === false ? "DISABLED" : kafkaMetrics.totalLag ?? 0} tone={Number(kafkaMetrics.totalLag ?? 0) > 0 ? "warn" : "ok"} />
          <Metric label="Kafka 最大 Lag" value={kafkaMetrics.maxLag ?? 0} tone={Number(kafkaMetrics.maxLag ?? 0) > 0 ? "warn" : "ok"} />
          <Metric label="WebSocket 连接" value={webSocketMetrics.activeConnections ?? 0} tone={webSocketMetrics.status === "DOWN" ? "danger" : "ok"} />
          <Metric label="WebSocket 订阅" value={webSocketMetrics.totalSubscriptions ?? 0} tone="muted" />
          <Metric label="Prometheus UP" value={prometheusMetrics.up ?? 0} tone={Number(prometheusMetrics.down ?? 0) > 0 ? "warn" : "ok"} />
          <Metric label="Prometheus DOWN" value={prometheusMetrics.down ?? 0} tone={Number(prometheusMetrics.down ?? 0) > 0 ? "danger" : "ok"} />
        </div>
        {observabilityWarnings.length > 0 && (
          <div className="alert danger">
            <DataTable rows={observabilityWarnings} columns={["module", "source", "message"]} />
          </div>
        )}
      </Panel>
      <TwoColumn>
        <Panel title="Kafka Consumer Lag">
          <DataTable
            rows={kafkaGroupRows}
            columns={["groupId", "state", "partitionCount", "totalLag", "maxLag", "truncated", "error"]}
          />
        </Panel>
        <Panel title="WebSocket 连接分布">
          <KeyValue data={{
            status: webSocketMetrics.status ?? "",
            targetUrl: webSocketMetrics.targetUrl ?? "",
            activeConnections: webSocketMetrics.activeConnections ?? 0,
            authenticatedConnections: webSocketMetrics.authenticatedConnections ?? 0,
            anonymousConnections: webSocketMetrics.anonymousConnections ?? 0,
            uniqueTopics: webSocketMetrics.uniqueTopics ?? 0,
            latencyMs: webSocketMetrics.latencyMs ?? 0,
            error: webSocketMetrics.error ?? ""
          }} />
          <DataTable rows={webSocketChannelRows} columns={["channel", "topicCount", "subscriberCount"]} />
        </Panel>
      </TwoColumn>
      <Panel title="Prometheus 指标代理">
        <DataTable
          rows={prometheusRows}
          columns={["service", "status", "httpStatus", "latencyMs", "sampleCount", "metricFamilies", "truncated", "url", "error"]}
        />
      </Panel>
      <TwoColumn>
        <Panel title="Outbox Backlog">
          <DataTable
            rows={outboxRows}
            columns={["module", "tableName", "total", "pending", "failed", "maxAttempts", "oldestPendingAgeSeconds", "lastError", "error"]}
          />
        </Panel>
        <Panel title="后台 API 错误率">
          <DataTable
            rows={operationServiceRows}
            columns={["service", "total", "failed", "failureRatePpm", "p50DurationMs", "p95DurationMs", "p99DurationMs", "lastSeenAt"]}
          />
        </Panel>
      </TwoColumn>
      <Panel title="管理员安全">
        <div className="stack">
          <KeyValue data={{
            mfaEnabled,
            verifiedAt: mfa?.verifiedAt ?? "",
            policy: "SERVER_CONFIG"
          }} />
          <div className="button-row">
            <TextFilter label="2FA 动态码" value={mfaCode} onChange={(value) => setMfaCode(value.replace(/\D/g, "").slice(0, 6))} />
            <button onClick={() => void startMfaEnrollment()}><Shield size={16} />绑定 2FA</button>
            <button className="primary" onClick={() => void confirmMfaEnrollment()} disabled={!mfaEnrollment}>确认绑定</button>
            <button onClick={() => void turnOffMfa()} disabled={!mfaEnabled}>关闭 2FA</button>
          </div>
          {mfaEnrollment && (
            <div className="profile-section wide">
              <h4>绑定密钥</h4>
              <KeyValue data={{
                secret: mfaEnrollment.secret,
                otpauthUri: mfaEnrollment.otpauthUri,
                generatedAt: mfaEnrollment.generatedAt
              }} />
            </div>
          )}
        </div>
      </Panel>
      <Panel title="服务健康巡检">
        <DataTable
          rows={healthRows}
          columns={["service", "routeType", "status", "httpStatus", "latencyMs", "baseUrl", "healthUrl", "targetPrefix", "error"]}
          actions={(row) => <StatusBadge value={String(row.status ?? "UNKNOWN")} />}
        />
      </Panel>
      <TwoColumn>
        <Panel title="后台路由">
          <DataTable rows={adminRoutes} columns={["service", "baseUrl", "targetPrefix", "privateRoute", "basicAuthConfigured"]} />
        </Panel>
        <Panel title="普通路由">
          <DataTable rows={publicRoutes} columns={["service", "baseUrl", "targetPrefix", "privateRoute", "basicAuthConfigured"]} />
        </Panel>
      </TwoColumn>
    </Page>
  );
}

function AuditPage() {
  const [loginFilters, setLoginFilters] = useState({ userId: "", result: "", limit: "200", cursor: "", sort: "createdAt.desc" });
  const [operationFilters, setOperationFilters] = useState({ adminUserId: "", service: "", method: "", success: "", limit: "200", cursor: "", sort: "createdAt.desc" });
  const [traceFilters, setTraceFilters] = useState({ traceId: "", limit: "50" });
  const [loginRows, setLoginRows] = useState<UnknownRecord[]>([]);
  const [operationRows, setOperationRows] = useState<UnknownRecord[]>([]);
  const [loginPageInfo, setLoginPageInfo] = useState(cursorInfo());
  const [operationPageInfo, setOperationPageInfo] = useState(cursorInfo());
  const [traceResult, setTraceResult] = useState<UnknownRecord | null>(null);
  const [selectedTraceEvent, setSelectedTraceEvent] = useState<UnknownRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextLoginCursor = loginFilters.cursor, nextOperationCursor = operationFilters.cursor) {
    setLoading(true);
    setError("");
    try {
      const [loginResponse, operationResponse] = await Promise.all([
        loginLogs({ ...loginFilters, cursor: nextLoginCursor, limit: Number(loginFilters.limit) || 200 }),
        operationLogs({
          ...operationFilters,
          cursor: nextOperationCursor,
          success: operationFilters.success,
          limit: Number(operationFilters.limit) || 200
        })
      ]);
      setLoginRows(loginResponse.logs);
      setOperationRows(operationResponse.logs);
      setLoginPageInfo(cursorInfo(loginResponse));
      setOperationPageInfo(cursorInfo(operationResponse));
      setLoginFilters((current) => ({ ...current, cursor: nextLoginCursor }));
      setOperationFilters((current) => ({ ...current, cursor: nextOperationCursor }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function findTrace() {
    const traceId = traceFilters.traceId.trim();
    if (!traceId) {
      setError("请输入 TraceId。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await traceTimeline(traceId, { limit: Number(traceFilters.limit) || 50 });
      setTraceResult(response);
      setSelectedTraceEvent(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const traceSections = records(traceResult?.sections as UnknownRecord[] | undefined);
  const traceTimelineRows = records(traceResult?.timeline as UnknownRecord[] | undefined);
  const traceWarnings = records(traceResult?.warnings as UnknownRecord[] | undefined);

  return (
    <Page title="审计日志" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <TextFilter label="登录 User ID" value={loginFilters.userId} onChange={(value) => setLoginFilters({ ...loginFilters, userId: value, cursor: "" })} />
        <label>登录结果<select value={loginFilters.result} onChange={(event) => setLoginFilters({ ...loginFilters, result: event.target.value, cursor: "" })}><option value="">全部</option><option>SUCCESS</option><option>FAILED</option></select></label>
        <SortSelect label="登录排序" value={loginFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => setLoginFilters({ ...loginFilters, sort: value, cursor: "" })} />
        <TextFilter label="管理员 ID" value={operationFilters.adminUserId} onChange={(value) => setOperationFilters({ ...operationFilters, adminUserId: value, cursor: "" })} />
        <TextFilter label="服务" value={operationFilters.service} onChange={(value) => setOperationFilters({ ...operationFilters, service: value, cursor: "" })} />
        <label>方法<select value={operationFilters.method} onChange={(event) => setOperationFilters({ ...operationFilters, method: event.target.value, cursor: "" })}><option value="">全部</option><option>GET</option><option>POST</option><option>PATCH</option><option>PUT</option><option>DELETE</option></select></label>
        <label>操作结果<select value={operationFilters.success} onChange={(event) => setOperationFilters({ ...operationFilters, success: event.target.value, cursor: "" })}><option value="">全部</option><option value="true">成功</option><option value="false">失败</option></select></label>
        <SortSelect label="操作排序" value={operationFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => setOperationFilters({ ...operationFilters, sort: value, cursor: "" })} />
        <button onClick={() => void load("", "")}><Search size={16} />查询</button>
      </div>
      <Panel title="TraceId 全链路查询">
        <div className="filters">
          <TextFilter label="TraceId" value={traceFilters.traceId} onChange={(value) => setTraceFilters({ ...traceFilters, traceId: value })} />
          <TextFilter label="每源 Limit" value={traceFilters.limit} onChange={(value) => setTraceFilters({ ...traceFilters, limit: value })} />
          <button className="primary" onClick={() => void findTrace()}><Search size={16} />追踪</button>
        </div>
        {traceResult && (
          <>
            <div className="metrics">
              <Metric label="TraceId" value={String(traceResult.traceId ?? "")} tone="muted" />
              <Metric label="事件数" value={traceResult.totalEvents ?? 0} tone={Number(traceResult.totalEvents ?? 0) > 0 ? "ok" : "warn"} />
              <Metric label="数据源" value={traceSections.filter((section) => Number(section.count ?? 0) > 0).length} tone="ok" />
              <Metric label="Warnings" value={traceWarnings.length} tone={traceWarnings.length > 0 ? "warn" : "ok"} />
            </div>
            {traceWarnings.length > 0 && (
              <div className="alert danger">
                <DataTable rows={traceWarnings} columns={["source", "tableName", "message"]} />
              </div>
            )}
            <TwoColumn>
              <Panel title="数据源命中">
                <DataTable rows={traceSections} columns={["source", "tableName", "count", "error"]} />
              </Panel>
              <Panel title="事件详情">
                {selectedTraceEvent ? <KeyValue data={objectValue(selectedTraceEvent.data)} /> : <Empty text="选择时间线事件查看原始字段" />}
              </Panel>
            </TwoColumn>
            <DataTable
              rows={traceTimelineRows}
              columns={["eventTime", "source", "tableName", "recordId", "subject", "summary"]}
              onRowClick={(row) => setSelectedTraceEvent(row)}
            />
          </>
        )}
      </Panel>
      <TwoColumn>
        <Panel title="登录日志">
          <CursorPager
            page={loginPageInfo}
            cursor={loginFilters.cursor}
            onNext={() => void load(loginPageInfo.nextCursor || "", operationFilters.cursor)}
            onReset={() => void load("", operationFilters.cursor)}
          />
          <DataTable rows={loginRows} maxColumns={8} />
        </Panel>
        <Panel title="管理员操作日志">
          <CursorPager
            page={operationPageInfo}
            cursor={operationFilters.cursor}
            onNext={() => void load(loginFilters.cursor, operationPageInfo.nextCursor || "")}
            onReset={() => void load(loginFilters.cursor, "")}
          />
          <DataTable
            rows={operationRows}
            columns={["createdAt", "adminUsername", "service", "httpMethod", "responseStatus", "durationMs", "success", "requestPath", "traceId", "errorMessage"]}
          />
        </Panel>
      </TwoColumn>
    </Page>
  );
}

function Page({ title, children, onRefresh, loading, error }: { title: string; children: React.ReactNode; onRefresh?: () => void | Promise<void>; loading?: boolean; error?: string | null }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>{title}</h2>
          <p>所有写操作都要求后台 gateway 角色校验，并由下游 admin 路径处理。</p>
        </div>
        {onRefresh && <button onClick={() => void onRefresh()} disabled={loading}><RefreshCw size={16} />刷新</button>}
      </div>
      {error && <div className="alert danger">{error}</div>}
      {children}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title"><BookOpen size={16} /><h3>{title}</h3></div>
      {children}
    </section>
  );
}

function DataTable({ rows, columns, maxColumns = 10, onRowClick, actions }: {
  rows: UnknownRecord[];
  columns?: string[];
  maxColumns?: number;
  onRowClick?: (row: UnknownRecord) => void;
  actions?: (row: UnknownRecord) => React.ReactNode;
}) {
  const visibleColumns = useMemo(() => {
    if (columns?.length) return columns;
    const keys = new Set<string>();
    for (const row of rows.slice(0, 20)) Object.keys(row).forEach((key) => keys.add(key));
    return Array.from(keys).slice(0, maxColumns);
  }, [columns, maxColumns, rows]);

  if (!rows.length) return <Empty text="暂无数据" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {visibleColumns.map((column) => <th key={column}>{column}</th>)}
            {actions && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ? String(row.id) : row.orderId ? String(row.orderId) : row.exportId ? String(row.exportId) : index} onClick={() => onRowClick?.(row)} className={onRowClick ? "clickable" : ""}>
              {visibleColumns.map((column) => <td key={column}>{formatValue(row[column])}</td>)}
              {actions && <td onClick={(event) => event.stopPropagation()}>{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyValue({ data }: { data: UnknownRecord }) {
  const entries = Object.entries(data);
  if (!entries.length) return <Empty text="暂无详情" />;
  return (
    <div className="kv">
      {entries.map(([key, value]) => (
        <div key={key}>
          <span>{key}</span>
          <strong>{formatValue(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: unknown; tone: StatusTone }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{formatValue(value)}</strong>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const tone = value === "TRADING" || value === "NORMAL" || value === "SUCCESS" || value === "SUCCEEDED" || value === "UP" ? "ok"
    : value.includes("DISABLED") || value === "HALT" || value === "FAILED" ? "danger"
      : "warn";
  return <span className={`status ${tone}`}>{value}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json-block">{JSON.stringify(value, null, 2)}</pre>;
}

function TextFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

const REQUESTED_AT_SORTS = ["requestedAt.desc", "requestedAt.asc"];
const CREATED_AT_SORTS = ["createdAt.desc", "createdAt.asc"];
const UPDATED_AT_SORTS = ["updatedAt.desc", "updatedAt.asc"];
const EVENT_TIME_SORTS = ["eventTime.desc", "eventTime.asc"];
const FEE_SCHEDULE_SORTS = ["updatedAt.desc", "updatedAt.asc", "createdAt.desc", "createdAt.asc", "effectiveTime.desc", "effectiveTime.asc"];
const FEE_TIER_SORTS = ["priority.desc", "priority.asc"];
const ALERT_CONFIG_SORTS = ["updatedAt.desc", "updatedAt.asc", "createdAt.desc", "createdAt.asc"];
const ALERT_EVENT_SORTS = ["lastSeenAt.desc", "lastSeenAt.asc", "createdAt.desc", "createdAt.asc"];
const ALERT_DELIVERY_SORTS = ["createdAt.desc", "createdAt.asc", "updatedAt.desc", "updatedAt.asc"];
const SUPPORT_TICKET_SORTS = ["updatedAt.desc", "updatedAt.asc", "createdAt.desc", "createdAt.asc"];
const SUPPORT_NOTE_SORTS = ["createdAt.asc", "createdAt.desc"];
const ACCOUNT_VALUATION_SORTS = ["valuationValue.desc", "valuationValue.asc"];
const ACCOUNT_SNAPSHOT_SORTS = ["snapshotDate.desc", "snapshotDate.asc"];
const COMPLIANCE_RISK_TAG_SORTS = ["createdAt.desc", "createdAt.asc", "updatedAt.desc", "updatedAt.asc"];
const COMPLIANCE_AML_CASE_SORTS = ["updatedAt.desc", "updatedAt.asc", "createdAt.desc", "createdAt.asc"];
const INSTRUMENT_SORTS = ["symbol.asc", "symbol.desc", "updatedAt.desc", "updatedAt.asc", "createdAt.desc", "createdAt.asc"];
const INSTRUMENT_VERSION_SORTS = ["version.desc", "version.asc"];
const ADL_QUEUE_SORT = "priorityScorePpm.desc";

function SortSelect({ label = "排序", value, options, onChange }: {
  label?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>{label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function cursorInfo(page?: { nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number } | null) {
  return {
    nextCursor: String(page?.nextCursor ?? ""),
    hasMore: Boolean(page?.hasMore),
    sort: String(page?.sort ?? ""),
    limit: Number(page?.limit ?? 0)
  };
}

function CursorPager({ page, cursor, onNext, onReset }: {
  page: ReturnType<typeof cursorInfo>;
  cursor: string;
  onNext: () => void;
  onReset: () => void;
}) {
  return (
    <div className="button-row compact-row">
      <button onClick={onReset} disabled={!cursor && !page.hasMore}><RefreshCw size={14} />首页</button>
      <button className="primary" onClick={onNext} disabled={!page.hasMore || !page.nextCursor}>下一页</button>
      <StatusBadge value={page.hasMore ? "HAS_MORE" : "END"} />
      <span className="muted mono">limit={page.limit || "-"} sort={page.sort || "-"}</span>
    </div>
  );
}

function TwoColumn({ children }: { children: React.ReactNode }) {
  return <div className="two-grid">{children}</div>;
}

function marketMakerConfigTemplate(): UnknownRecord {
  return {
    enabled: null,
    baseQuantitySteps: null,
    marginMode: null,
    spreadTicks: null,
    levelSpacingTicks: null,
    maxInventorySteps: null,
    maxInventorySkewPpm: null,
    orderLevels: null,
    reason: ""
  };
}

function marketMakerConfigPayload(config: UnknownRecord | null): UnknownRecord {
  const override = objectValue(config?.override);
  const payload = marketMakerConfigTemplate();
  for (const key of Object.keys(payload)) {
    if (key !== "reason") {
      payload[key] = override[key] ?? null;
    }
  }
  return payload;
}

function marketMakerInsightParams(filters: {
  productLine: string;
  strategyId: string;
  symbol: string;
  accountId: string;
  eventType: string;
  windowHours: string;
  limit: string;
  logCursor?: string;
  logSort?: string;
}): Record<string, unknown> {
  const params: Record<string, unknown> = {
    windowHours: Number(filters.windowHours) || 24,
    limit: Number(filters.limit) || 100
  };
  if (filters.strategyId.trim()) params.strategyId = filters.strategyId.trim();
  if (filters.productLine.trim()) params.productLine = filters.productLine.trim();
  if (filters.symbol.trim()) params.symbol = filters.symbol.trim().toUpperCase();
  if (filters.accountId.trim()) params.accountId = filters.accountId.trim();
  if (filters.eventType.trim()) params.eventType = filters.eventType.trim();
  return params;
}

function routeFromHash(): RouteKey {
  const key = window.location.hash.replace(/^#\/?/, "") as RouteKey;
  return NAV.some((item) => item.key === key) ? key : "dashboard";
}

function navigate(route: RouteKey) {
  window.location.hash = route;
}

function loadable<T>() {
  return { loading: false, error: null, data: null } as { loading: boolean; error: string | null; data: T | null };
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function records<T extends UnknownRecord>(items: T[] | undefined | null): UnknownRecord[] {
  return items ? [...items] : [];
}

function numberField(value: string, field: string) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(`${field} 必须是数字。`);
  }
  return normalized;
}

function optionalNumber(value: string) {
  return value.trim() ? numberField(value, "ID") : undefined;
}

function fieldText(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function enumOrDefault(value: unknown, allowed: string[], fallback: string) {
  const normalized = fieldText(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function objectValue(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function parseQueryTaskResult(value: unknown): UnknownRecord | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as UnknownRecord;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return objectValue(parsed);
  } catch {
    return null;
  }
}

function extractRows(value: unknown, arrayKeys: string[] = []): UnknownRecord[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as UnknownRecord[];
  const object = objectValue(value);
  for (const key of arrayKeys) {
    const nested = object[key];
    if (Array.isArray(nested)) {
      return nested.filter((item) => item && typeof item === "object") as UnknownRecord[];
    }
  }
  return Object.keys(object).length ? [object] : [];
}

function ppmPercent(value: unknown): string {
  return `${compactNumber(Number(value ?? 0) / 10_000)}%`;
}

function detailUserId(detail: UnknownRecord | null): string {
  const user = objectValue(detail?.user);
  const userId = user.userId;
  return userId === undefined || userId === null || userId === "" ? "" : String(userId);
}

function exportParams(value: string): Record<string, string> {
  const parsed = JSON.parse(value || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("导出参数必须是 JSON object。");
  }
  const params: Record<string, string> = {};
  for (const [key, item] of Object.entries(parsed as Record<string, unknown>)) {
    if (item === undefined || item === null || item === "") continue;
    params[key] = String(item);
  }
  return params;
}

function jsonObject(value: string): UnknownRecord {
  const parsed = JSON.parse(value || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("内容必须是 JSON object。");
  }
  return parsed as UnknownRecord;
}

function alertRuleFormFromRecord(row: UnknownRecord) {
  return {
    ruleCode: fieldText(row.ruleCode).toUpperCase(),
    ruleName: fieldText(row.ruleName),
    domain: enumOrDefault(row.domain, ALERT_EDIT_DOMAINS, "SYSTEM"),
    metricKey: fieldText(row.metricKey).toUpperCase(),
    target: fieldText(row.target).toUpperCase(),
    conditionOperator: enumOrDefault(row.conditionOperator, ALERT_OPERATORS, "GT"),
    thresholdValue: fieldText(row.thresholdValue),
    severity: enumOrDefault(row.severity, ALERT_EDIT_SEVERITIES, "WARN"),
    enabled: String(row.enabled ?? true),
    windowSeconds: fieldText(row.windowSeconds),
    cooldownSeconds: fieldText(row.cooldownSeconds),
    description: fieldText(row.description)
  };
}

function alertChannelFormFromRecord(row: UnknownRecord) {
  return {
    channelCode: fieldText(row.channelCode).toUpperCase(),
    channelName: fieldText(row.channelName),
    channelType: enumOrDefault(row.channelType, ALERT_CHANNEL_TYPES, "WEBHOOK"),
    enabled: String(row.enabled ?? true),
    domain: enumOrDefault(row.domain, ALERT_DOMAINS, ""),
    minSeverity: enumOrDefault(row.minSeverity, ALERT_EDIT_SEVERITIES, "WARN"),
    endpoint: fieldText(row.endpoint),
    description: fieldText(row.description)
  };
}

function alertRulePayload(form: ReturnType<typeof alertRuleFormFromRecord>): UnknownRecord {
  return {
    ruleCode: form.ruleCode.trim().toUpperCase(),
    ruleName: form.ruleName.trim(),
    domain: form.domain,
    metricKey: form.metricKey.trim().toUpperCase(),
    target: textOrNull(form.target.toUpperCase()),
    conditionOperator: form.conditionOperator,
    thresholdValue: numberField(form.thresholdValue, "阈值"),
    severity: form.severity,
    enabled: form.enabled === "true",
    windowSeconds: numberField(form.windowSeconds, "窗口秒数"),
    cooldownSeconds: numberField(form.cooldownSeconds, "冷却秒数"),
    description: textOrNull(form.description)
  };
}

function alertChannelPayload(form: ReturnType<typeof alertChannelFormFromRecord>): UnknownRecord {
  return {
    channelCode: form.channelCode.trim().toUpperCase(),
    channelName: form.channelName.trim(),
    channelType: form.channelType,
    enabled: form.enabled === "true",
    domain: textOrNull(form.domain),
    minSeverity: form.minSeverity,
    endpoint: textOrNull(form.endpoint),
    description: textOrNull(form.description)
  };
}

function alertRuleEditable(row: UnknownRecord): UnknownRecord {
  return {
    ruleCode: row.ruleCode ?? "",
    ruleName: row.ruleName ?? "",
    domain: row.domain ?? "SYSTEM",
    metricKey: row.metricKey ?? "",
    target: row.target ?? "",
    conditionOperator: row.conditionOperator ?? "GT",
    thresholdValue: row.thresholdValue ?? 0,
    severity: row.severity ?? "WARN",
    enabled: row.enabled ?? true,
    windowSeconds: row.windowSeconds ?? 300,
    cooldownSeconds: row.cooldownSeconds ?? 300,
    description: row.description ?? ""
  };
}

function alertChannelEditable(row: UnknownRecord): UnknownRecord {
  return {
    channelCode: row.channelCode ?? "",
    channelName: row.channelName ?? "",
    channelType: row.channelType ?? "WEBHOOK",
    enabled: row.enabled ?? true,
    domain: row.domain ?? "",
    minSeverity: row.minSeverity ?? "WARN",
    endpoint: row.endpoint ?? "",
    description: row.description ?? ""
  };
}

function unwrapWallet<T>(response: WalletResponse<T>): T {
  if (response && typeof response === "object" && "code" in response && "data" in response) {
    const wrapped = response as { code?: number; message?: string; data?: T };
    if (wrapped.code !== undefined && wrapped.code !== 0) {
      throw new Error(wrapped.message || `wallet response code ${wrapped.code}`);
    }
    return wrapped.data as T;
  }
  return response as T;
}

function walletPageRows<K extends string>(page: WalletCursorPage<K> | UnknownRecord[] | null | undefined, key: K): UnknownRecord[] {
  if (Array.isArray(page)) {
    return records(page);
  }
  return records(page?.[key] ?? page?.items);
}

function walletTableNames(admin: WalletAdminConfig | null): string[] {
  const metadata = admin?.tables ?? {};
  const rows = admin?.rows ?? {};
  const names = new Set([...Object.keys(metadata), ...Object.keys(rows)]);
  return Array.from(names);
}

function walletMetadata(admin: WalletAdminConfig | null, table: string): UnknownRecord {
  if (!admin || !table) return {};
  return (admin.tables?.[table] ?? {}) as UnknownRecord;
}

function walletRows(admin: WalletAdminConfig | null, table: string): UnknownRecord[] {
  if (!admin || !table) return [];
  return records(admin.rows?.[table]);
}

function walletIdColumn(admin: WalletAdminConfig | null, table: string): string {
  const metadata = walletMetadata(admin, table);
  return typeof metadata.idColumn === "string" && metadata.idColumn ? metadata.idColumn : "id";
}

function walletEditableColumns(admin: WalletAdminConfig | null, table: string): string[] {
  const metadata = walletMetadata(admin, table);
  return Array.isArray(metadata.editableColumns)
    ? metadata.editableColumns.map(String)
    : [];
}

interface DashboardData {
  instruments: Instrument[];
  candidates: UnknownRecord[];
  liquidations: UnknownRecord[];
  insurance: UnknownRecord[];
  adl: UnknownRecord[];
  makers: UnknownRecord[];
  funding: UnknownRecord | null;
}

interface AccountData {
  balances: BalanceRecord[];
  productBalances: BalanceRecord[];
  positions: PositionRecord[];
  ledger: UnknownRecord[];
  productLedger: UnknownRecord[];
  transfers: UnknownRecord[];
  adjustments: UnknownRecord[];
  assetValuation: UnknownRecord | null;
  assetSnapshots: UnknownRecord[];
  assetSnapshotAlerts: UnknownRecord[];
}

interface RiskData {
  highRiskAccounts: UnknownRecord[];
  riskRules: UnknownRecord[];
  candidates: UnknownRecord[];
  liquidations: UnknownRecord[];
  adlQueue: UnknownRecord[];
  adlEvents: UnknownRecord[];
}

interface FundingData {
  latest: UnknownRecord;
  history: UnknownRecord[];
  payments: UnknownRecord[];
  settlement: UnknownRecord;
  balances: UnknownRecord[];
  ledger: UnknownRecord[];
  coverages: UnknownRecord[];
}

interface FeesData {
  schedules: UnknownRecord[];
  tiers: UnknownRecord[];
  userTier: UnknownRecord;
}

type WalletResponse<T> = T | { code?: number; message?: string; data?: T };
type WalletCursorPage<K extends string> = {
  count?: number;
  items?: UnknownRecord[];
  nextCursor?: string | null;
  hasMore?: boolean;
  sort?: string;
  limit?: number;
} & Partial<Record<K, UnknownRecord[]>>;

interface WalletDashboard extends UnknownRecord {
  project?: UnknownRecord;
  runtime?: UnknownRecord;
}

interface WalletAdminConfig extends UnknownRecord {
  tables?: Record<string, UnknownRecord>;
  rows?: Record<string, UnknownRecord[]>;
  secretStatus?: UnknownRecord[];
}
