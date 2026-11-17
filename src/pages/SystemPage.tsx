import { useState, useEffect } from "react";
import { type UnknownRecord } from "../types";
import { systemHealth, systemRoutes, systemMetrics, systemObservability, mfaStatus, enrollMfa, confirmMfa, disableMfa } from "../api/admin";
import { RefreshCw, Shield } from "lucide-react";
import { formatDate, compactNumber } from "../config";
import { errorMessage, records, objectValue } from "../lib/adminData";
import { Page, TextFilter, Metric, Panel, DataTable, TwoColumn, KeyValue, StatusBadge, TabBar } from "../components/AdminUi";

export default function SystemPage() {
  const [tab, setTab] = useState<"health" | "observability" | "security">("health");
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
      <TabBar
        active={tab}
        onChange={setTab}
        items={[
          { key: "health", label: "服务健康与路由拓扑", count: healthRows.length },
          { key: "observability", label: "基础设施与可观测性", count: kafkaGroupRows.length + prometheusRows.length },
          { key: "security", label: "管理员安全与 2FA", count: mfaEnabled ? "已启用" : "未绑定" }
        ]}
      />
      {tab === "health" && (<>
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
      </>)}
      {tab === "observability" && (<>
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
      </>)}
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
