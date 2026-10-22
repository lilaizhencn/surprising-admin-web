import { FEE_STATUSES, FEE_SOURCE_TYPES, feeScheduleFormTemplate, feeScheduleFormFromRecord, feeSchedulePayload } from "../features/fees/feeScheduleForm";
import { useState, useEffect } from "react";
import { gatewayGet, gatewayPost } from "../api/admin";
import { type UnknownRecord } from "../types";
import { Search } from "lucide-react";
import { positiveInt64, positiveInt32 } from "../lib/integers";
import { cursorInfo, Page, TextFilter, SortSelect, Panel, DataTable, StatusBadge, CursorPager, KeyValue } from "../components/AdminUi";
import { errorMessage, fieldText, records } from "../lib/adminData";
import { jsonObject } from "../lib/formValues";
import { PRODUCT_LINES } from "../lib/products";



export default function FeesPage() {
  const [filters, setFilters] = useState({
    productLine: "LINEAR_PERPETUAL",
    status: "",
    userId: "",
    instrumentId: "",
    limit: "200",
    scheduleCursor: "",
    scheduleSort: "updatedAt.desc"
  });
  const [data, setData] = useState<FeesData | null>(null);
  const [schedulePageInfo, setSchedulePageInfo] = useState(cursorInfo());
  const [scheduleForm, setScheduleForm] = useState(feeScheduleFormTemplate());
  const [scheduleJson, setScheduleJson] = useState(() => JSON.stringify(feeScheduleFormTemplate(), null, 2));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...patch, scheduleCursor: "" }));
  }

  async function load(nextScheduleCursor = filters.scheduleCursor) {
    setLoading(true);
    setError("");
    try {
      const limit = Number(filters.limit) || 200;
      const userId = filters.userId.trim() ? positiveInt64(filters.userId, "用户 ID") : undefined;
      const instrumentId = filters.instrumentId.trim() ? positiveInt32(filters.instrumentId, "合约 ID") : undefined;
      const [schedules, effective] = await Promise.all([
        gatewayGet<{ schedules?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("trading-fees", "/schedules", {
          userId,
          instrumentId,
          status: filters.status,
          limit,
          cursor: nextScheduleCursor,
          sort: filters.scheduleSort,
          productLine: filters.productLine
        }),
        userId && instrumentId
          ? gatewayGet<UnknownRecord>("trading-fees", "/effective", {
              userId, instrumentId, productLine: filters.productLine
            })
          : Promise.resolve(null)
      ]);
      setData({
        schedules: schedules.schedules ?? schedules.items ?? [],
        effective: effective ?? {}
      });
      setSchedulePageInfo(cursorInfo(schedules));
      setFilters((current) => ({
        ...current,
        scheduleCursor: nextScheduleCursor || ""
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
    setScheduleJson(JSON.stringify(next, null, 2));
  }

  function selectSchedule(row: UnknownRecord) {
    const next = feeScheduleFormFromRecord(row);
    setScheduleForm(next);
    setScheduleJson(JSON.stringify(next, null, 2));
  }

  async function submitSchedule() {
    if (loading) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const raw = jsonObject(scheduleJson);
      if (!PRODUCT_LINES.some(line => line !== "" && line === raw.productLine) || !FEE_STATUSES.includes(String(raw.status)) || !FEE_SOURCE_TYPES.includes(String(raw.sourceType)))
        throw new Error("请选择有效的产品线、费率状态和来源。");
      const payload = feeSchedulePayload(feeScheduleFormFromRecord(raw));
      const productLine = String(payload.productLine);
      if (!window.confirm(`确认保存用户 ${payload.userId} 在 ${productLine} / ${payload.instrumentId ?? "全部合约"} 的费率计划？`)) return;
      await gatewayPost("trading-fees", "/schedules", payload, { productLine });
      await load();
      setNotice("费率计划已保存。");
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }

  async function disableSchedule(row: UnknownRecord) {
    if (loading) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const feeScheduleId = positiveInt64(row.feeScheduleId ?? row.id, "费率计划 ID");
      const productLine = fieldText(row.productLine) || filters.productLine;
      if (!window.confirm(`确认禁用 ${productLine} 的费率计划 ${feeScheduleId}？禁用后重新解析该用户的有效费率。`)) return;
      await gatewayPost("trading-fees", `/schedules/${feeScheduleId}/disable`, undefined, { productLine });
      await load(filters.scheduleCursor);
      setNotice("费率计划已禁用。");
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return (
    <Page title="费率配置" onRefresh={load} loading={loading} error={error}>
      {notice && <p role="status">{notice}</p>}
      <div className="filters">
        <label>产品线<select value={filters.productLine} onChange={(event) => updateFilters({ productLine: event.target.value })}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <TextFilter label="User ID" value={filters.userId} onChange={(value) => updateFilters({ userId: value })} />
        <TextFilter label="币对 ID" value={filters.instrumentId} onChange={(value) => updateFilters({ instrumentId: value.toUpperCase() })} />
        <label>状态<select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}><option value="">全部</option><option>ACTIVE</option><option>DISABLED</option></select></label>
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => updateFilters({ limit: value })} />
        <SortSelect label="计划排序" value={filters.scheduleSort} options={FEE_SCHEDULE_SORTS} onChange={(value) => updateFilters({ scheduleSort: value })} />
        <button onClick={() => void load("")}><Search size={16} />查询</button>
      </div>
      <div className="two-grid">
        <Panel title="费率计划">
          <div className="stack">
            <DataTable
              rows={records(data?.schedules)}
              columns={["productLine", "feeScheduleId", "userId", "instrumentId", "sourceType", "tierCode", "makerFeeRatePpm", "takerFeeRatePpm", "status", "effectiveTime", "expireTime"]}
              maxColumns={11}
              onRowClick={selectSchedule}
              actions={(row) => row.status === "DISABLED" ? <StatusBadge value="DISABLED" /> : <button disabled={loading} onClick={() => void disableSchedule(row)}>禁用</button>}
            />
            <CursorPager
              page={schedulePageInfo}
              cursor={filters.scheduleCursor}
              onNext={() => void load(schedulePageInfo.nextCursor || "")}
              onReset={() => void load("")}
            />
          </div>
        </Panel>
        <Panel title="用户当前有效费率">
          {filters.userId && filters.instrumentId ? <KeyValue data={data?.effective ?? {}} /> : <p>输入用户 ID 和合约 ID 后查询当前产品线的有效费率。</p>}
        </Panel>
        <Panel title="新增/更新费率计划">
          <p>档位代码仅作为费率计划标签；有效费率按当前用户、产品线和合约解析。</p>
          <div className="stack">
            <div className="form-grid">
              <TextFilter label="Schedule ID" value={scheduleForm.feeScheduleId} onChange={(value) => updateScheduleForm({ feeScheduleId: value })} />
              <label>产品线<select value={scheduleForm.productLine} onChange={(event) => updateScheduleForm({ productLine: event.target.value })}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <TextFilter label="User ID" value={scheduleForm.userId} onChange={(value) => updateScheduleForm({ userId: value })} />
              <TextFilter label="币对 ID" value={scheduleForm.instrumentId} onChange={(value) => updateScheduleForm({ instrumentId: value.toUpperCase() })} />
              <label>来源<select value={scheduleForm.sourceType} onChange={(event) => updateScheduleForm({ sourceType: event.target.value })}>{FEE_SOURCE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <TextFilter label="档位标签（可选）" value={scheduleForm.tierCode} onChange={(value) => updateScheduleForm({ tierCode: value.toUpperCase() })} />
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
            <button className="primary" disabled={loading} onClick={() => void submitSchedule()}>提交计划</button>
          </div>
        </Panel>
      </div>
    </Page>
  );
}

const FEE_SCHEDULE_SORTS = ["updatedAt.desc", "updatedAt.asc", "createdAt.desc", "createdAt.asc", "effectiveTime.desc", "effectiveTime.asc"];


interface FeesData {
  schedules: UnknownRecord[];
  effective: UnknownRecord;
}
