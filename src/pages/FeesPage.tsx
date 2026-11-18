import { Select } from "../components/CustomSelect";
import { FEE_STATUSES, FEE_SOURCE_TYPES, feeScheduleFormTemplate, feeScheduleFormFromRecord, feeSchedulePayload } from "../features/fees/feeScheduleForm";
import { useState, useEffect } from "react";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { gatewayGet, gatewayPost, adminVipLevels, adminUserVipStatus, adminUpdateUserVip } from "../api/admin";
import { type UnknownRecord } from "../types";
import { Search, Award } from "lucide-react";
import { positiveInt64, positiveInt32 } from "../lib/integers";
import { cursorInfo, Page, TextFilter, SortSelect, Panel, DataTable, StatusBadge, CursorPager, KeyValue, TabBar, Empty, ExportCsvButton } from "../components/AdminUi";
import { errorMessage, fieldText, records, ppmPercent } from "../lib/adminData";
import { jsonObject } from "../lib/formValues";
import { PRODUCT_LINES } from "../lib/products";

export default function FeesPage() {
  const { confirm, dialog } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState<"schedules" | "vip">("schedules");
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

  // VIP 管理状态
  const [vipLevels, setVipLevels] = useState<Array<UnknownRecord>>([]);
  const [vipUserId, setVipUserId] = useState("");
  const [vipStatus, setVipStatus] = useState<UnknownRecord | null>(null);
  const [vipFormLevel, setVipFormLevel] = useState(1);
  const [vipMakerDiscount, setVipMakerDiscount] = useState("0");
  const [vipTakerDiscount, setVipTakerDiscount] = useState("0");
  const [vipReason, setVipReason] = useState("");

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
      const [schedules, effective, levels] = await Promise.all([
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
          : Promise.resolve(null),
        adminVipLevels(filters.productLine)
      ]);
      setData({
        schedules: schedules.schedules ?? schedules.items ?? [],
        effective: effective ?? {}
      });
      setVipLevels(Array.isArray(levels) ? (levels as unknown as UnknownRecord[]) : []);
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

  async function loadVipLevels(productLine = filters.productLine) {
    setLoading(true); setError("");
    try {
      const levels = await adminVipLevels(productLine);
      setVipLevels(Array.isArray(levels) ? (levels as unknown as UnknownRecord[]) : []);
    } catch (err) {
      setVipLevels([]);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadUserVip(productLine = filters.productLine) {
    if (!vipUserId.trim()) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const status = await adminUserVipStatus(vipUserId.trim(), productLine);
      setVipStatus(status as unknown as UnknownRecord);
      setVipFormLevel(Number(status.currentLevel) || 0);
      setVipMakerDiscount(String(status.makerFeeDiscountPpm ?? 0));
      setVipTakerDiscount(String(status.takerFeeDiscountPpm ?? 0));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitVipOverride() {
    if (!vipUserId.trim()) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const makerDiscount = vipMakerDiscount.trim() ? Number(vipMakerDiscount) : undefined;
      const takerDiscount = vipTakerDiscount.trim() ? Number(vipTakerDiscount) : undefined;
      await adminUpdateUserVip({
        userId: vipUserId.trim(),
        productLine: filters.productLine,
        vipLevel: Number(vipFormLevel),
        makerFeeDiscountPpm: makerDiscount !== undefined && Number.isFinite(makerDiscount) ? makerDiscount : undefined,
        takerFeeDiscountPpm: takerDiscount !== undefined && Number.isFinite(takerDiscount) ? takerDiscount : undefined,
        reason: vipReason.trim() || "运营手动调整 VIP 梯级"
      });
      setNotice(`用户 ${vipUserId} 在 ${filters.productLine} 的 VIP 等级已更新为 VIP${vipFormLevel}。`);
      await loadUserVip(filters.productLine);
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
      if (!(await confirm({ title: "确认保存费率计划", description: `用户 ${payload.userId} 在 ${productLine} / ${payload.instrumentId ?? "全部合约"} 的费率计划将被保存。` }))) return;
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
      if (!(await confirm({ title: `确认禁用费率计划 ${feeScheduleId}`, description: `${productLine} 的该费率计划禁用后，将重新解析该用户的有效费率。`, danger: true }))) return;
      await gatewayPost("trading-fees", `/schedules/${feeScheduleId}/disable`, undefined, { productLine });
      await load(filters.scheduleCursor);
      setNotice("费率计划已禁用。");
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return (
    <Page title="费率与 VIP 运营管理" onRefresh={load} loading={loading} error={error}>
      {notice && <p role="status">{notice}</p>}

      <TabBar
        label="费率与 VIP 管理视图"
        active={activeTab}
        onChange={setActiveTab}
        items={[
          { key: "schedules", label: "交易费率计划", count: records(data?.schedules).length },
          { key: "vip", label: "VIP 动态阶梯与做市返佣", count: vipLevels.length }
        ]}
      />

      {activeTab === "schedules" ? (
        <>
          <div className="filters">
            <label>产品线<Select value={filters.productLine} onChange={(event) => updateFilters({ productLine: event.target.value })}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
            <TextFilter label="User ID" value={filters.userId} onChange={(value) => updateFilters({ userId: value })} />
            <TextFilter label="币对 ID" value={filters.instrumentId} onChange={(value) => updateFilters({ instrumentId: value.toUpperCase() })} />
            <label>状态<Select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}><option value="">全部</option><option>ACTIVE</option><option>DISABLED</option></Select></label>
            <TextFilter label="Limit" value={filters.limit} onChange={(value) => updateFilters({ limit: value })} />
            <SortSelect label="计划排序" value={filters.scheduleSort} options={FEE_SCHEDULE_SORTS} onChange={(value) => updateFilters({ scheduleSort: value })} />
            <button onClick={() => void load("")}><Search size={16} />查询</button>
            <ExportCsvButton
              rows={records(data?.schedules)}
              columns={["productLine", "feeScheduleId", "userId", "instrumentId", "sourceType", "tierCode", "makerFeeRatePpm", "takerFeeRatePpm", "status", "effectiveTime", "expireTime"]}
              filename={`fee-schedules-${filters.productLine.toLowerCase()}.csv`}
              label="导出费率 CSV"
            />
          </div>
          <div className="two-grid">
            <Panel title="费率计划">
              <div className="stack">
                <DataTable
                  rows={records(data?.schedules)}
                  columns={["productLine", "feeScheduleId", "userId", "instrumentId", "sourceType", "tierCode", "makerFeeRatePpm", "takerFeeRatePpm", "status", "effectiveTime", "expireTime"]}
                  maxColumns={11}
                  onRowClick={selectSchedule} rowActionLabel="编辑费率" label="费率计划" isSelected={(row) => String(row.feeScheduleId) === scheduleForm.feeScheduleId}
                  actions={(row) => row.status === "DISABLED" ? <StatusBadge value="DISABLED" /> : <button disabled={loading} onClick={() => void disableSchedule(row)}>禁用</button>}
                />
                <CursorPager loading={loading}
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
                  <label>产品线<Select value={scheduleForm.productLine} onChange={(event) => updateScheduleForm({ productLine: event.target.value })}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
                  <TextFilter label="User ID" value={scheduleForm.userId} onChange={(value) => updateScheduleForm({ userId: value })} />
                  <TextFilter label="币对 ID" value={scheduleForm.instrumentId} onChange={(value) => updateScheduleForm({ instrumentId: value.toUpperCase() })} />
                  <label>来源<Select value={scheduleForm.sourceType} onChange={(event) => updateScheduleForm({ sourceType: event.target.value })}>{FEE_SOURCE_TYPES.map((item) => <option key={item}>{item}</option>)}</Select></label>
                  <TextFilter label="档位标签（可选）" value={scheduleForm.tierCode} onChange={(value) => updateScheduleForm({ tierCode: value.toUpperCase() })} />
                  <label>状态<Select value={scheduleForm.status} onChange={(event) => updateScheduleForm({ status: event.target.value })}>{FEE_STATUSES.map((item) => <option key={item}>{item}</option>)}</Select></label>
                  <TextFilter label={`Maker ppm (${ppmPercent(scheduleForm.makerFeeRatePpm || 0)})`} value={scheduleForm.makerFeeRatePpm} onChange={(value) => updateScheduleForm({ makerFeeRatePpm: value })} />
                  <TextFilter label={`Taker ppm (${ppmPercent(scheduleForm.takerFeeRatePpm || 0)})`} value={scheduleForm.takerFeeRatePpm} onChange={(value) => updateScheduleForm({ takerFeeRatePpm: value })} />
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
        </>
      ) : (
        <div className="two-grid">
          <Panel title={`VIP 阶梯标准 · ${filters.productLine}`}>
            <div className="stack">
              <div className="filters compact">
                <label>
                  产品线
                  <Select
                    value={filters.productLine}
                    onChange={(event) => {
                      const nextLine = event.target.value;
                      updateFilters({ productLine: nextLine });
                      void loadVipLevels(nextLine);
                      if (vipUserId.trim()) void loadUserVip(nextLine);
                    }}
                  >
                    {PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </label>
                <ExportCsvButton
                  rows={vipLevels}
                  columns={["level", "name", "minVolume30d", "makerFeeRatePpm", "takerFeeRatePpm", "makerFeeDiscountPpm", "takerFeeDiscountPpm"]}
                  filename={`vip-levels-${filters.productLine.toLowerCase()}.csv`}
                  label="导出 VIP 阶梯"
                />
              </div>
              <p>系统按用户近 30 天结算交易量动态评估等级（10,000 ppm = 1%）。</p>
              {vipLevels.length === 0 ? (
                <Empty text={`产品线 ${filters.productLine} 暂无已配置的 VIP 阶梯数据`} />
              ) : (
                <DataTable
                  rows={vipLevels}
                  columns={["level", "name", "minVolume30d", "makerFeeRatePpm", "takerFeeRatePpm"]}
                  maxColumns={5}
                />
              )}
            </div>
          </Panel>

          <Panel title="用户 VIP 查验与人工调级">
            <div className="stack">
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                <TextFilter label="用户 ID" value={vipUserId} onChange={setVipUserId} />
                <button className="primary" disabled={loading || !vipUserId.trim()} onClick={() => void loadUserVip(filters.productLine)}>
                  <Search size={16} /> 查询 VIP 状态
                </button>
              </div>

              {vipStatus && (
                <div style={{ marginTop: "12px", padding: "10px", background: "rgba(0,198,255,0.06)", borderRadius: "6px" }}>
                  <KeyValue data={vipStatus} />
                </div>
              )}

              <hr style={{ margin: "16px 0", borderColor: "rgba(255,255,255,0.1)" }} />

              <h4>人工调级与做市商特批 ({filters.productLine})</h4>
              <div className="form-grid">
                <label>
                  指定 VIP 等级
                  <Select value={vipFormLevel} onChange={(e) => setVipFormLevel(Number(e.target.value))}>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                      <option key={lvl} value={lvl}>
                        VIP {lvl} {lvl === 9 ? "(做市商负费率)" : ""}
                      </option>
                    ))}
                  </Select>
                </label>
                <TextFilter label={`Maker 额外折扣 (${ppmPercent(vipMakerDiscount || 0)})`} value={vipMakerDiscount} onChange={setVipMakerDiscount} />
                <TextFilter label={`Taker 额外折扣 (${ppmPercent(vipTakerDiscount || 0)})`} value={vipTakerDiscount} onChange={setVipTakerDiscount} />
              </div>
              <label>
                审批原因/调级理由
                <textarea
                  className="json-editor small text-editor"
                  value={vipReason}
                  onChange={(e) => setVipReason(e.target.value)}
                  placeholder="例如：特邀做市商流动性协议特批"
                />
              </label>
              <button className="primary" disabled={loading || !vipUserId} onClick={() => void submitVipOverride()}>
                <Award size={14} style={{ marginRight: "4px" }} />
                确认调级并生效
              </button>
            </div>
          </Panel>
        </div>
      )}
      {dialog}
    </Page>
  );
}

const FEE_SCHEDULE_SORTS = ["updatedAt.desc", "updatedAt.asc", "createdAt.desc", "createdAt.asc", "effectiveTime.desc", "effectiveTime.asc"];

interface FeesData {
  schedules: UnknownRecord[];
  effective: UnknownRecord;
}
