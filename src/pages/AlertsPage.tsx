import { safeInteger } from "../lib/integers";
import { useState, useEffect } from "react";
import { type UnknownRecord } from "../types";
import { alertRules, alertEvents, alertChannels, alertDeliveries, createAlertRule, updateAlertRule, disableAlertRule, enableAlertRule, createAlertChannel, updateAlertChannel, disableAlertChannel, enableAlertChannel, evaluateAlerts, acknowledgeAlertEvent, retryAlertDelivery } from "../api/admin";
import { Search, Bell } from "lucide-react";
import { cursorInfo, Page, Metric, TwoColumn, Panel, TextFilter, SortSelect, CursorPager, DataTable, JsonBlock, StatusBadge, KeyValue, Empty } from "../components/AdminUi";
import { errorMessage, fieldText } from "../lib/adminData";
import { finiteDecimal, jsonObject, enumOrDefault, textOrNull } from "../lib/formValues";

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

export default function AlertsPage() {
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
      const body = alertRulePayload(alertRuleFormFromRecord(jsonObject(ruleJson)));
      const ruleId = selectedRule?.alertRuleId;
      const saved = ruleId === undefined || ruleId === null
        ? await createAlertRule(body)
        : await updateAlertRule(String(ruleId), body);
      const next = alertRuleFormFromRecord(alertRuleEditable(saved));
      setSelectedRule(saved);
      setRuleForm(next);
      setRuleJson(JSON.stringify({ ...next, enabled: next.enabled === "true" }, null, 2));
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
    setRuleJson(JSON.stringify({ ...next, enabled: next.enabled === "true" }, null, 2));
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
    setRuleJson(JSON.stringify({ ...next, enabled: next.enabled === "true" }, null, 2));
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

const ALERT_CONFIG_SORTS = ["updatedAt.desc", "updatedAt.asc", "createdAt.desc", "createdAt.asc"];

const ALERT_EVENT_SORTS = ["lastSeenAt.desc", "lastSeenAt.asc", "createdAt.desc", "createdAt.asc"];

const ALERT_DELIVERY_SORTS = ["createdAt.desc", "createdAt.asc", "updatedAt.desc", "updatedAt.asc"];

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
    thresholdValue: finiteDecimal(form.thresholdValue, "阈值"),
    severity: form.severity,
    enabled: form.enabled === "true",
    windowSeconds: safeInteger(form.windowSeconds, "窗口秒数"),
    cooldownSeconds: safeInteger(form.cooldownSeconds, "冷却秒数"),
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
