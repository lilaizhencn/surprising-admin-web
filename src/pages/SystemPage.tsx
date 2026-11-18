import { useState, useEffect } from "react";
import { type UnknownRecord } from "../types";
import {
  systemHealth,
  systemRoutes,
  adminWebSocketMetrics,
  operationLogs,
  loginLogs,
  mfaStatus,
  enrollMfa,
  confirmMfa,
  disableMfa
} from "../api/admin";
import { RefreshCw, Shield } from "lucide-react";
import { formatDate, compactNumber } from "../config";
import { errorMessage, records } from "../lib/adminData";
import { Page, TextFilter, Metric, Panel, DataTable, TwoColumn, KeyValue, StatusBadge, TabBar, ExportCsvButton } from "../components/AdminUi";

export default function SystemPage() {
  const [tab, setTab] = useState<"health" | "security">("health");
  const [health, setHealth] = useState<UnknownRecord | null>(null);
  const [routes, setRoutes] = useState<UnknownRecord | null>(null);
  const [wsMetrics, setWsMetrics] = useState<UnknownRecord | null>(null);
  const [opLogs, setOpLogs] = useState<UnknownRecord[]>([]);
  const [recentLogins, setRecentLogins] = useState<UnknownRecord[]>([]);
  const [mfa, setMfa] = useState<UnknownRecord | null>(null);
  const [mfaEnrollment, setMfaEnrollment] = useState<UnknownRecord | null>(null);
  const [includePublicRoutes, setIncludePublicRoutes] = useState(true);
  const [mfaCode, setMfaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [healthResponse, routesResponse, mfaResponse] = await Promise.all([
        systemHealth({ includePublicRoutes }),
        systemRoutes(),
        mfaStatus()
      ]);
      setHealth(healthResponse);
      setRoutes(routesResponse);
      setMfa(mfaResponse);

      const [wsRes, opsRes, loginsRes] = await Promise.allSettled([
        adminWebSocketMetrics(),
        operationLogs({ limit: 100 }),
        loginLogs({ limit: 100 })
      ]);
      setWsMetrics(wsRes.status === "fulfilled" ? wsRes.value : null);
      setOpLogs(opsRes.status === "fulfilled" && Array.isArray(opsRes.value.logs) ? opsRes.value.logs : []);
      setRecentLogins(loginsRes.status === "fulfilled" && Array.isArray(loginsRes.value.logs) ? loginsRes.value.logs : []);
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
  const failedOps = opLogs.filter((item) => item.success === false).length;
  const failedLogins = recentLogins.filter((item) => item.result && item.result !== "SUCCESS").length;
  const mfaEnabled = Boolean(mfa?.enabled);

  const wsChannelsObj = wsMetrics?.channels && typeof wsMetrics.channels === "object" && !Array.isArray(wsMetrics.channels)
    ? (wsMetrics.channels as Record<string, unknown>)
    : {};
  const wsChannelRows: UnknownRecord[] = Array.isArray(wsMetrics?.channels)
    ? records(wsMetrics.channels as UnknownRecord[])
    : Object.entries(wsChannelsObj).map(([channel, count]) => ({
        channel,
        subscriberCount: Number(count ?? 0)
      }));
  const wsFailureRatePpm = opLogs.length > 0 ? Math.round((failedOps / opLogs.length) * 1_000_000) : 0;

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
      setMfa(await confirmMfa(code));
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
      setMfa(await disableMfa(code));
      setMfaEnrollment(null);
      setMfaCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="系统监控与管理员安全" description="查看 Gateway 实时服务健康、路由拓扑、WebSocket 连接统计及管理员 2FA 安全设置。" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <label className="inline-check">
          <input
            type="checkbox"
            checked={includePublicRoutes}
            onChange={(event) => setIncludePublicRoutes(event.target.checked)}
          />
          包含普通前端路由
        </label>
        <button onClick={() => void load()}><RefreshCw size={16} />巡检</button>
      </div>
      <div className="metrics">
        <Metric label="服务数" value={health?.count ?? 0} tone="ok" />
        <Metric label="UP" value={health?.up ?? 0} tone="ok" />
        <Metric label="DOWN" value={health?.down ?? 0} tone={Number(health?.down ?? 0) > 0 ? "danger" : "ok"} />
        <Metric label="UNKNOWN" value={health?.unknown ?? 0} tone={Number(health?.unknown ?? 0) > 0 ? "warn" : "ok"} />
        <Metric label="WebSocket 活跃连接" value={wsMetrics?.activeConnections ?? wsMetrics?.connections ?? 0} tone="ok" />
        <Metric label="近期写操作 / 失败" value={`${opLogs.length} / ${failedOps}`} tone={failedOps > 0 ? "warn" : "ok"} />
        <Metric label="操作失败率" value={`${compactNumber(wsFailureRatePpm / 10000)}%`} tone={failedOps > 0 ? "warn" : "ok"} />
        <Metric label="近期登录失败" value={failedLogins} tone={failedLogins > 0 ? "warn" : "ok"} />
        <Metric label="更新时间" value={formatDate(String(health?.generatedAt ?? ""))} tone="muted" />
      </div>
      <TabBar
        active={tab}
        onChange={setTab}
        items={[
          { key: "health", label: "服务健康、WebSocket 与路由", count: healthRows.length },
          { key: "security", label: "管理员安全与 2FA", count: mfaEnabled ? "已启用" : "未绑定" }
        ]}
      />
      {tab === "health" && (
        <div className="stack">
          <Panel title="服务健康巡检">
            <div className="stack">
              <div className="button-row">
                <ExportCsvButton
                  rows={healthRows}
                  columns={["service", "routeType", "status", "httpStatus", "latencyMs", "baseUrl", "healthUrl", "targetPrefix", "error"]}
                  filename="system-health.csv"
                  label="导出健康巡检 CSV"
                />
              </div>
              <DataTable
                rows={healthRows}
                columns={["service", "routeType", "status", "httpStatus", "latencyMs", "baseUrl", "healthUrl", "targetPrefix", "error"]}
                actions={(row) => <StatusBadge value={String(row.status ?? "UNKNOWN")} />}
              />
            </div>
          </Panel>

          <Panel title="WebSocket 实时连接与订阅频道">
            <div className="stack">
              {wsMetrics ? (
                <KeyValue
                  data={{
                    activeConnections: wsMetrics.activeConnections ?? wsMetrics.connections ?? 0,
                    authenticatedConnections: wsMetrics.authenticatedConnections ?? 0,
                    anonymousConnections: wsMetrics.anonymousConnections ?? 0,
                    uniqueTopics: wsMetrics.uniqueTopics ?? wsMetrics.topics ?? wsChannelRows.length,
                    totalSubscriptions: wsMetrics.totalSubscriptions ?? 0
                  }}
                />
              ) : (
                <p className="muted">WebSocket 统计接口暂未返回数据。</p>
              )}
              <DataTable rows={wsChannelRows} columns={["channel", "subscriberCount"]} emptyText="当前无活跃订阅频道" />
            </div>
          </Panel>

          <TwoColumn>
            <Panel title="后台路由">
              <div className="stack">
                <div className="button-row">
                  <ExportCsvButton
                    rows={adminRoutes}
                    columns={["service", "baseUrl", "targetPrefix", "privateRoute", "basicAuthConfigured"]}
                    filename="admin-routes.csv"
                    label="导出后台路由"
                  />
                </div>
                <DataTable rows={adminRoutes} columns={["service", "baseUrl", "targetPrefix", "privateRoute", "basicAuthConfigured"]} />
              </div>
            </Panel>
            <Panel title="普通路由">
              <div className="stack">
                <div className="button-row">
                  <ExportCsvButton
                    rows={publicRoutes}
                    columns={["service", "baseUrl", "targetPrefix", "privateRoute", "basicAuthConfigured"]}
                    filename="public-routes.csv"
                    label="导出普通路由"
                  />
                </div>
                <DataTable rows={publicRoutes} columns={["service", "baseUrl", "targetPrefix", "privateRoute", "basicAuthConfigured"]} />
              </div>
            </Panel>
          </TwoColumn>
        </div>
      )}
      {tab === "security" && (
        <Panel title="管理员安全 (2FA)">
          <div className="stack">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`pla-badge ${mfaEnabled ? "ok" : "muted"}`}>
                  <Shield size={13} aria-hidden="true" />
                  {mfaEnabled ? "2FA 已启用" : "2FA 未绑定"}
                </span>
                {mfa?.verifiedAt ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    最近验证：{formatDate(String(mfa.verifiedAt))}
                  </span>
                ) : null}
              </div>
              <div className="button-row">
                {!mfaEnabled && !mfaEnrollment && (
                  <button type="button" className="primary" onClick={() => void startMfaEnrollment()}>
                    <Shield size={15} />
                    开始绑定 2FA
                  </button>
                )}
                {mfaEnabled && (
                  <button type="button" onClick={() => void turnOffMfa()}>
                    关闭 2FA
                  </button>
                )}
              </div>
            </div>

            {(mfaEnrollment || mfaEnabled) && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                <TextFilter
                  label="6 位动态验证码"
                  value={mfaCode}
                  onChange={(value) => setMfaCode(value.replace(/\D/g, "").slice(0, 6))}
                />
                {mfaEnrollment && (
                  <button type="button" className="primary" onClick={() => void confirmMfaEnrollment()}>
                    确认绑定
                  </button>
                )}
              </div>
            )}

            {mfaEnrollment && (
              <div className="profile-section wide" style={{ padding: 14, borderRadius: 10, border: "1px solid var(--color-border-soft)", background: "var(--color-surface-muted)" }}>
                <h4 style={{ margin: "0 0 8px" }}>绑定密钥（在 Google Authenticator / 1Password 中添加）</h4>
                <KeyValue data={{
                  secret: mfaEnrollment.secret,
                  otpauthUri: mfaEnrollment.otpauthUri,
                  generatedAt: mfaEnrollment.generatedAt
                }} />
              </div>
            )}
          </div>
        </Panel>
      )}
    </Page>
  );
}
