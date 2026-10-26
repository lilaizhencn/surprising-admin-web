import { useState, useEffect } from "react";
import { type UnknownRecord } from "../types";
import { queryTasks, queryTaskLimits, createQueryTask, archiveExpiredQueryTasks, queryTask } from "../api/admin";
import { Search, Database, BookOpen } from "lucide-react";
import { parseApiJson } from "../api/client";
import { cursorInfo, Page, TextFilter, SortSelect, CursorPager, Metric, Panel, KeyValue, TwoColumn, Empty, DataTable, JsonBlock } from "../components/AdminUi";
import { errorMessage, records, objectValue } from "../lib/adminData";
import { exportParams } from "../lib/formValues";
import { REQUESTED_AT_SORTS } from "../lib/queryOptions";

const QUERY_TASK_PARAM_TEMPLATES: Record<string, Record<string, string>> = {
  SYSTEM_OPERATION_LATENCY: { service: "", windowMinutes: "1440", limit: "100" },
  OUTBOX_BACKLOG: {},
  APPROVAL_BACKLOG: { service: "", limit: "100" },
  ALERT_DELIVERY_FAILURES: { status: "", limit: "100" },
  ORDER_AUDIT_SEARCH: {
    userId: "",
    orderId: "",
    clientOrderId: "",
    instrumentId: "",
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
    instrumentId: "",
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
    instrumentId: "",
    takerSide: "",
    createdAfter: "",
    createdBefore: "",
    limit: "1000"
  }
};

const QUERY_TASK_TYPES = Object.keys(QUERY_TASK_PARAM_TEMPLATES);

const JOB_STATUSES = ["", "PENDING", "RUNNING", "SUCCEEDED", "FAILED", "ARCHIVED"];

export default function QueryTasksPage() {
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
          onRowClick={(row) => void openTask(row)} rowActionLabel="查看任务" label="查询任务"
        />
      </Panel>
    </Page>
  );
}

function parseQueryTaskResult(value: unknown): UnknownRecord | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as UnknownRecord;
  if (typeof value !== "string") return null;
  try {
    const parsed = parseApiJson<unknown>(value);
    return objectValue(parsed);
  } catch {
    return null;
  }
}
