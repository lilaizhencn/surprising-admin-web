import { Select } from "../components/CustomSelect";
import { useState, useEffect } from "react";
import { type UnknownRecord } from "../types";
import { loginLogs, operationLogs } from "../api/admin";
import { Search } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, TwoColumn, Panel, CursorPager, DataTable, ExportCsvButton } from "../components/AdminUi";
import { errorMessage } from "../lib/adminData";
import { CREATED_AT_SORTS } from "../lib/queryOptions";

export default function AuditPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [loginFilters, setLoginFilters] = useState({ userId: "", result: "", limit: "200", cursor: "", sort: "createdAt.desc" });
  const [operationFilters, setOperationFilters] = useState({ adminUserId: "", service: "", method: "", success: "", limit: "200", cursor: "", sort: "createdAt.desc" });
  const [loginRows, setLoginRows] = useState<UnknownRecord[]>([]);
  const [operationRows, setOperationRows] = useState<UnknownRecord[]>([]);
  const [loginPageInfo, setLoginPageInfo] = useState(cursorInfo());
  const [operationPageInfo, setOperationPageInfo] = useState(cursorInfo());
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

  const body = (
    <div className="stack">
      <div className="filters">
        <TextFilter label="登录 User ID" value={loginFilters.userId} onChange={(value) => setLoginFilters({ ...loginFilters, userId: value, cursor: "" })} />
        <label>登录结果<Select value={loginFilters.result} onChange={(event) => setLoginFilters({ ...loginFilters, result: event.target.value, cursor: "" })}><option value="">全部</option><option>SUCCESS</option><option>FAILED</option></Select></label>
        <SortSelect label="登录排序" value={loginFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => setLoginFilters({ ...loginFilters, sort: value, cursor: "" })} />
        <TextFilter label="管理员 ID" value={operationFilters.adminUserId} onChange={(value) => setOperationFilters({ ...operationFilters, adminUserId: value, cursor: "" })} />
        <TextFilter label="服务" value={operationFilters.service} onChange={(value) => setOperationFilters({ ...operationFilters, service: value, cursor: "" })} />
        <label>方法<Select value={operationFilters.method} onChange={(event) => setOperationFilters({ ...operationFilters, method: event.target.value, cursor: "" })}><option value="">全部</option><option>GET</option><option>POST</option><option>PATCH</option><option>PUT</option><option>DELETE</option></Select></label>
        <label>操作结果<Select value={operationFilters.success} onChange={(event) => setOperationFilters({ ...operationFilters, success: event.target.value, cursor: "" })}><option value="">全部</option><option value="true">成功</option><option value="false">失败</option></Select></label>
        <SortSelect label="操作排序" value={operationFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => setOperationFilters({ ...operationFilters, sort: value, cursor: "" })} />
        <button onClick={() => void load("", "")}><Search size={16} />查询</button>
      </div>
      <TwoColumn>
        <Panel title="登录日志">
          <div className="button-row" style={{ marginBottom: 8 }}>
            <ExportCsvButton rows={loginRows} filename="audit-login-logs.csv" label="导出登录日志" />
          </div>
          <CursorPager
            page={loginPageInfo}
            cursor={loginFilters.cursor}
            onNext={() => void load(loginPageInfo.nextCursor || "", operationFilters.cursor)}
            onReset={() => void load("", operationFilters.cursor)}
          />
          <DataTable rows={loginRows} maxColumns={8} />
        </Panel>
        <Panel title="管理员操作日志">
          <div className="button-row" style={{ marginBottom: 8 }}>
            <ExportCsvButton
              rows={operationRows}
              columns={["createdAt", "adminUsername", "service", "httpMethod", "responseStatus", "durationMs", "success", "requestPath", "errorMessage"]}
              filename="audit-operation-logs.csv"
              label="导出操作日志"
            />
          </div>
          <CursorPager
            page={operationPageInfo}
            cursor={operationFilters.cursor}
            onNext={() => void load(loginFilters.cursor, operationPageInfo.nextCursor || "")}
            onReset={() => void load(loginFilters.cursor, "")}
          />
          <DataTable
            rows={operationRows}
            columns={["createdAt", "adminUsername", "service", "httpMethod", "responseStatus", "durationMs", "success", "requestPath", "errorMessage"]}
          />
        </Panel>
      </TwoColumn>
    </div>
  );

  if (embedded) {
    return (
      <div className="stack">
        {error && <div className="alert danger state-alert" role="alert"><span>{error}</span><button onClick={() => void load()}>重新加载</button></div>}
        {body}
      </div>
    );
  }

  return (
    <Page title="审计日志" onRefresh={load} loading={loading} error={error}>
      {body}
    </Page>
  );
}
