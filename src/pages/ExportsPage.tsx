import { useState, useEffect } from "react";
import { type UnknownRecord } from "../types";
import { exportJobs, createExportJob, downloadExportFile } from "../api/admin";
import { Search, Download } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, CursorPager, Metric, TwoColumn, Panel, KeyValue, Empty, DataTable, StatusBadge } from "../components/AdminUi";
import { errorMessage } from "../lib/adminData";
import { exportParams } from "../lib/formValues";
import { REQUESTED_AT_SORTS } from "../lib/queryOptions";

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

const EXPORT_PARAM_TEMPLATES: Record<string, Record<string, string>> = {
  USERS: { query: "", status: "", limit: "1000" },
  LOGIN_LOGS: { userId: "", result: "", limit: "1000" },
  ADMIN_OPERATIONS: { adminUserId: "", service: "", method: "", success: "", limit: "1000" },
  COMPLIANCE_USERS: { userId: "", kycStatus: "", tagCode: "", limit: "1000" },
  ORDERS: { userId: "", orderId: "", instrumentId: "", status: "", createdAfter: "", createdBefore: "", limit: "1000" },
  TRIGGER_ORDERS: { userId: "", triggerOrderId: "", instrumentId: "", status: "", createdAfter: "", createdBefore: "", limit: "1000" },
  MATCH_TRADES: { userId: "", orderId: "", instrumentId: "", takerSide: "", createdAfter: "", createdBefore: "", limit: "1000" },
  ACCOUNT_BALANCES: { userId: "", asset: "", nonZeroOnly: "true", limit: "1000" },
  PRODUCT_BALANCES: { userId: "", accountType: "", asset: "", nonZeroOnly: "true", limit: "1000" },
  POSITIONS: { userId: "", instrumentId: "", marginMode: "", openOnly: "true", limit: "1000" },
  ACCOUNT_LEDGER: { userId: "", asset: "", instrumentId: "", orderId: "", referenceType: "", createdAfter: "", createdBefore: "", limit: "1000" },
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

export default function ExportsPage() {
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
      <CursorPager loading={loading}
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
          onRowClick={(row) => setSelected(row)} rowActionLabel="查看任务" label="导出任务" isSelected={(row) => selected != null && String(row.exportId) === String(selected.exportId)}
          actions={(row) => row.status === "SUCCEEDED"
            ? <button onClick={() => void download(row)}><Download size={14} />下载</button>
            : <StatusBadge value={String(row.status ?? "UNKNOWN")} />}
        />
      </Panel>
    </Page>
  );
}
