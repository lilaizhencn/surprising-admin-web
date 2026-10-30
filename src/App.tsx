import { LayoutDashboard, LifeBuoy, MessageSquare, Users, Database, BarChart3, Clock3, ClipboardList, SlidersHorizontal, WalletCards, Scale, Gauge, CircleDollarSign, Activity, BadgeCheck, CheckCircle2, Download, BookOpen, Bell, Megaphone, Server, FileText, Shield } from "lucide-react";
import { type RouteKey, type AuthSession } from "./types";
import { type AdminApprovalRequestContext, type AdminApprovalDecision, setApprovalRequestHandler, login } from "./api/admin";
import { useState, useEffect, useRef } from "react";
import { loadSession, saveSession, validateSession, logoutBrowserSession } from "./api/client";
import { KeyValue, StatusBadge } from "./components/AdminUi";
import { errorMessage } from "./lib/adminData";
import { lazy, Suspense } from "react";
import { PageErrorBoundary } from "./components/PageErrorBoundary";
import { ConsoleShell } from "./components/ConsoleShell";
const AssetsPage = lazy(() => import("./AssetsPage").then(module => ({ default: module.AssetsPage })));
const C2cBusinessPage = lazy(() => import("./C2cBusinessPage").then(module => ({ default: module.C2cBusinessPage })));
const MaintenancePage = lazy(() => import("./MaintenancePage"));
const AnnouncementsPage = lazy(() => import("./AnnouncementsPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const SupportPage = lazy(() => import("./pages/SupportPage"));
const MarketsPage = lazy(() => import("./pages/MarketsPage"));
const LifecyclePage = lazy(() => import("./pages/LifecyclePage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const CompliancePage = lazy(() => import("./pages/CompliancePage"));
const RiskPage = lazy(() => import("./pages/RiskPage"));
const FundingInsurancePage = lazy(() => import("./pages/FundingInsurancePage"));
const AffiliatePage = lazy(() => import("./pages/AffiliatePage"));
const FeesPage = lazy(() => import("./pages/FeesPage"));
const MarketMakerPage = lazy(() => import("./pages/MarketMakerPage"));
const SecurityPage = lazy(() => import("./pages/SecurityPage"));
const ApprovalsPage = lazy(() => import("./pages/ApprovalsPage"));
const ExportsPage = lazy(() => import("./pages/ExportsPage"));
const QueryTasksPage = lazy(() => import("./pages/QueryTasksPage"));
const AlertsPage = lazy(() => import("./pages/AlertsPage"));
const SystemPage = lazy(() => import("./pages/SystemPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));

const NAV = [
  { key: "dashboard", label: "总览", icon: LayoutDashboard },
  { key: "support", label: "客服工作台", icon: LifeBuoy },
  { key: "c2c", label: "C2C 运营", icon: MessageSquare },
  { key: "users", label: "用户权限", icon: Users },
  { key: "assets", label: "币种配置", icon: Database },
  { key: "markets", label: "产品市场", icon: BarChart3 },
  { key: "lifecycle", label: "交割行权", icon: Clock3 },
  { key: "orders", label: "订单审计", icon: ClipboardList },
  { key: "maintenance", label: "交易维护", icon: SlidersHorizontal },
  { key: "accounts", label: "账户资产", icon: WalletCards },
  { key: "wallet", label: "钱包运营", icon: Database },
  { key: "compliance", label: "合规风控", icon: Scale },
  { key: "risk", label: "风控强平", icon: Gauge },
  { key: "funding", label: "资金保险", icon: CircleDollarSign },
  { key: "affiliate", label: "邀请与 KOL", icon: Users },
  { key: "fees", label: "费率配置", icon: SlidersHorizontal },
  { key: "maker", label: "做市管理", icon: Activity },
  { key: "security", label: "权限治理", icon: BadgeCheck },
  { key: "approvals", label: "审批中心", icon: CheckCircle2 },
  { key: "exports", label: "导出中心", icon: Download },
  { key: "queries", label: "查询任务", icon: BookOpen },
  { key: "alerts", label: "告警中心", icon: Bell },
  { key: "announcements", label: "公告中心", icon: Megaphone },
  { key: "legal", label: "协议管理", icon: FileText },
  { key: "system", label: "系统监控", icon: Server },
  { key: "audit", label: "审计日志", icon: FileText }
] satisfies Array<{ key: RouteKey; label: string; icon: typeof LayoutDashboard }>;

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
    const changed = () => setSession(loadSession());
    window.addEventListener("surprising-admin.session-changed", changed);
    const stored = (event: StorageEvent) => { if (event.key === "surprising-admin.session" || event.key === null) changed(); };
    window.addEventListener("storage", stored);
    return () => { window.removeEventListener("surprising-admin.session-changed", changed); window.removeEventListener("storage", stored); };
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
  useEffect(() => {
    setApprovalPrompt(current => { current?.resolve(null); return null; });
  }, [session?.user.userId]);

  if (!session) {
    return <LoginScreen onLogin={(next) => {
      saveSession(next);
      setSession(next);
    }} />;
  }

  if (!consoleRole) {
    return <ForbiddenScreen session={session} onLogout={() => {
      void logoutBrowserSession().then(() => setSession(null)).catch(error => window.alert(errorMessage(error)));
    }} />;
  }

  const visibleNav = fullAdminRole ? NAV : NAV.filter((item) => item.key === "support" || item.key === "c2c");
  const activeRoute = visibleNav.some((item) => item.key === route) ? route : visibleNav[0].key;

  return (
    <ConsoleShell items={visibleNav} route={activeRoute} session={session} onNavigate={navigate} onLogout={() => {
      void logoutBrowserSession().then(() => setSession(null)).catch(error => window.alert(errorMessage(error)));
    }}>
        <div key={String(session.user.userId)}>
          <PageErrorBoundary key={activeRoute}>
          <Suspense fallback={<p role="status">正在加载页面…</p>}>
          {activeRoute === "dashboard" && <DashboardPage />}
          {activeRoute === "support" && <SupportPage />}
          {activeRoute === "c2c" && <C2cBusinessPage session={session} />}
          {activeRoute === "users" && <UsersPage />}
          {activeRoute === "assets" && <AssetsPage />}
          {activeRoute === "markets" && <MarketsPage />}
          {activeRoute === "lifecycle" && <LifecyclePage />}
          {activeRoute === "orders" && <OrdersPage />}
          {activeRoute === "maintenance" && <MaintenancePage />}
          {activeRoute === "accounts" && <AccountsPage />}
          {activeRoute === "wallet" && <WalletPage />}
          {activeRoute === "compliance" && <CompliancePage />}
          {activeRoute === "risk" && <RiskPage />}
          {activeRoute === "funding" && <FundingInsurancePage />}
          {activeRoute === "affiliate" && <AffiliatePage />}
          {activeRoute === "fees" && <FeesPage />}
          {activeRoute === "maker" && <MarketMakerPage />}
          {activeRoute === "security" && <SecurityPage />}
          {activeRoute === "approvals" && <ApprovalsPage />}
          {activeRoute === "exports" && <ExportsPage />}
          {activeRoute === "queries" && <QueryTasksPage />}
          {activeRoute === "alerts" && <AlertsPage />}
          {activeRoute === "announcements" && <AnnouncementsPage />}
          {activeRoute === "legal" && <LegalPage />}
          {activeRoute === "system" && <SystemPage />}
          {activeRoute === "audit" && <AuditPage />}
          </Suspense>
          </PageErrorBoundary>
        </div>
      {approvalPrompt && <ApprovalRequestDialog prompt={approvalPrompt} setPrompt={setApprovalPrompt} />}
    </ConsoleShell>
  );
}

function ApprovalRequestDialog({ prompt, setPrompt }: {
  prompt: ApprovalPromptState;
  setPrompt: React.Dispatch<React.SetStateAction<ApprovalPromptState | null>>;
}) {
  const approvalInputRef = useRef<HTMLInputElement>(null);
  const approvalDialogRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    approvalInputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(approvalDialogRef.current?.querySelectorAll<HTMLElement>("button, input, textarea, select, [href], [tabindex]:not([tabindex='-1'])") ?? [])
          .filter((element) => !element.hasAttribute("disabled"));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

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
      <form ref={approvalDialogRef} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="approval-dialog-title" onSubmit={submit}>
        <div className="modal-heading">
          <h2 id="approval-dialog-title">敏感操作审批</h2>
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
            <input ref={approvalInputRef} value={prompt.approvalId} onChange={(event) => update({ approvalId: event.target.value, error: "" })} />
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
    if (loading) return;
    setLoading(true);
      setError("");
    try {
      const session = validateSession(await login(username, password, totpCode));
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
          <input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          密码
          <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        <label>
          2FA 动态码
          <input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
        </label>
        {error && <div className="alert danger" role="alert">{error}</div>}
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
        <p>{session.user.username || session.user.email || `用户 ${session.user.userId}`} 的角色为 {session.user.roles.join(", ") || "空"}。后台访问需要 ADMIN 或 SUPER_ADMIN。</p>
        <button className="primary" onClick={onLogout}>退出</button>
      </div>
    </div>
  );
}

function routeFromHash(): RouteKey {
  const key = window.location.hash.replace(/^#\/?/, "") as RouteKey;
  return NAV.some((item) => item.key === key) ? key : "dashboard";
}

function navigate(route: RouteKey) {
  window.location.hash = route;
}
