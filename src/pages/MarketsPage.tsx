import { useState, useEffect, useRef, useMemo } from "react";
import { type Asset } from "../AssetsPage";
import { request, parseApiJson } from "../api/client";
import { type UnknownRecord, type Instrument } from "../types";
import { type InstrumentChange, instruments as instrumentList, marketHealth, instrumentChanges, instrumentLatest, gatewayGet, updateInstrumentStatus, upsertInstrument, gatewayPost } from "../api/admin";
import { validateInstrumentForm, InstrumentConfigurationFields } from "../InstrumentConfigurationFields";
import { ProductLineAccess } from "../ProductLineAccess";
import { OrderBusinessSettings } from "../OrderBusinessSettings";
import { Search } from "lucide-react";
import { MakerBusinessSettings } from "../MakerBusinessSettings";
import { InstrumentMakerSettings } from "../InstrumentMakerSettings";
import { compactNumber } from "../config";
import { errorMessage, objectValue, extractRows, ppmPercent } from "../lib/adminData";
import { cursorInfo, Page, SortSelect, TextFilter, Panel, DataTable, CursorPager, Metric, Empty, TwoColumn } from "../components/AdminUi";
import { INSTRUMENT_STATUSES } from "../lib/products";
import { INSTRUMENT_SORTS } from "../lib/queryOptions";
import { DraftTextField, DraftSelectField, DraftOptionalTextField, DraftOptionalSelectField, DraftOptionalNumberField, DraftNumberField, DraftCsvField, DraftCheckboxField } from "../features/instruments/InstrumentDraftFields";

const INSTRUMENT_TYPES = ["SPOT", "PERPETUAL", "DELIVERY", "OPTION"];

const CONTRACT_TYPES = ["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "VANILLA_OPTION"];

const OPTION_TYPES = ["CALL", "PUT"];

const OPTION_EXERCISE_STYLES = ["EUROPEAN", "AMERICAN"];

const SETTLEMENT_METHODS = ["CASH", "PHYSICAL"];

const CONTRACT_TYPES_BY_INSTRUMENT: Record<string, string[]> = {
  SPOT: ["SPOT"],
  PERPETUAL: ["LINEAR_PERPETUAL", "INVERSE_PERPETUAL"],
  DELIVERY: ["LINEAR_DELIVERY", "INVERSE_DELIVERY"],
  OPTION: ["VANILLA_OPTION"]
};

export default function MarketsPage() {
  const [assetOptions, setAssetOptions] = useState<Asset[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    request<Asset[]>("/api/v1/admin/assets?listedOnly=true", { signal: abort.signal }).then(setAssetOptions)
      .catch(e => { if (!abort.signal.aborted) setError(errorMessage(e)); });
    return () => abort.abort();
  }, []);
  const [filters, setFilters] = useState({ productLine: "", status: "", type: "", limit: "100", cursor: "", sort: "symbol.asc" });
  const [coreSync, setCoreSync] = useState<UnknownRecord | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [saving, setSaving] = useState(false);
  const auditRequest = useRef(0);
  const [healthPeriod, setHealthPeriod] = useState("1m");
  const [staleSeconds, setStaleSeconds] = useState("120");
  const [items, setItems] = useState<Instrument[]>([]);
  const [page, setPage] = useState(cursorInfo(null));
  const [changes, setChanges] = useState<InstrumentChange[]>([]);
  const [health, setHealth] = useState<UnknownRecord | null>(null);
  const [healthError, setHealthError] = useState("");
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

  async function load(nextCursor = filters.cursor, preferred = selected) {
    setLoading(true);
    setError("");
    try {
      const [instrumentResult, healthResult] = await Promise.allSettled([
        instrumentList({
          productLine: filters.productLine,
          type: filters.type,
          status: filters.status,
          limit: Number(filters.limit) || 100,
          cursor: nextCursor,
          sort: filters.sort
        }),
        marketHealth({ period: healthPeriod, staleSeconds: Number(staleSeconds) || 120, limit: 100 })
      ]);
      if (instrumentResult.status === "rejected") throw instrumentResult.reason;
      const response = instrumentResult.value;
      setHealth(healthResult.status === "fulfilled" ? healthResult.value : null);
      setHealthError(healthResult.status === "rejected" ? "暂时无法获取行情健康状态；合约配置可继续维护。" : "");
      const rows = response.instruments ?? response.items ?? [];
      setItems(rows);
      setPage(cursorInfo(response));
      setFilters((current) => ({ ...current, cursor: nextCursor }));
      const nextSelected = preferred?.symbol
        ? rows.find((row) => String(row.instrumentId) === String(preferred.instrumentId) && row.contractType === preferred.contractType) ?? preferred ?? rows[0] ?? null
        : rows[0] ?? null;
      setSelected(nextSelected);
      if (nextSelected?.symbol) {
        await loadChanges(nextSelected);
      } else {
        setChanges([]);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadChanges(instrument: Instrument, append = false) {
    const requestId = ++auditRequest.current;
    setHistoryLoading(true);
    if (!append) setChanges([]);
    try {
      const line = instrument.contractType === "VANILLA_OPTION" ? "OPTION" : instrument.contractType;
      if (!line) throw new Error("产品线缺失，无法查询操作日志");
      const rows = await instrumentChanges(instrument.instrumentId, line, append ? changes.at(-1)?.changeId ?? "0" : "0");
      if (requestId === auditRequest.current) setChanges(current => append ? [...current, ...rows] : rows);
    } catch (err) {
      if (requestId === auditRequest.current) setError(errorMessage(err));
    } finally {
      if (requestId === auditRequest.current) setHistoryLoading(false);
    }
  }

  async function selectInstrument(row: Instrument) {
    setLoading(true);
    setError("");
    try {
      const detail = await instrumentLatest(row.instrumentId, row.contractType === "VANILLA_OPTION" ? "OPTION" : row.contractType);
      setSelected(detail);
      await loadChanges(detail);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { setJson(selected ? JSON.stringify(selected, null, 2) : ""); }, [selected]);

  useEffect(() => {
    if (!selected?.instrumentId) { setCoreSync(null); return; }
    let active = true;
    const instrumentId = selected.instrumentId;
    const productLine = selected.contractType === "VANILLA_OPTION" ? "OPTION" : selected.contractType;
    setCoreSync(null);
    const refresh = async () => {
      try {
        const state = await gatewayGet<UnknownRecord>("trading-orders", `/instrument-sync/${encodeURIComponent(String(instrumentId))}`, { productLine });
        if (active) setCoreSync(state);
      } catch (err) { if (active) setCoreSync({ state: "UNKNOWN", error: errorMessage(err) }); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected?.instrumentId, selected?.contractType, selected?.lastChangeId]);

  async function changeStatus(next: string) {
    if (!selected || saving) return;
    setSaving(true);
    try {
      if (json !== JSON.stringify(selected, null, 2)) throw new Error("请先保存或放弃未保存的配置修改，再切换交易状态。");
      if (!window.confirm(`确认将 ${selected.symbol} 的状态改为 ${next}？`)) return;
      if (!changeReason.trim()) throw new Error("请填写修改原因");
      const updated = await updateInstrumentStatus(selected.instrumentId, next, selected.contractType === "VANILLA_OPTION" ? "OPTION" : selected.contractType, changeReason.trim(), selected.lastChangeId);
      setSelected(updated);
      await load(filters.cursor, updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally { setSaving(false); }
  }

  async function upsert() {
    if (saving) return;
    setSaving(true);
    try {
      const parsed = parseApiJson<unknown>(json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("产品配置必须是 JSON object。");
      }
      const body = normalizeInstrumentDraft(parsed as UnknownRecord, "instrumentType");
      validateInstrumentForm(body);
      if (!body.instrumentId) delete body.instrumentId;
      if (!changeReason.trim()) throw new Error("请填写修改原因");
      delete body.changeId;
      delete body.lastChangeId;
      for (const field of ["baseAsset", "quoteAsset", "settleAsset", "contractValueAsset", "createdAt", "updatedAt"]) delete body[field];
      const updated = await upsertInstrument(body, changeReason.trim(), selected?.lastChangeId ?? 0);
      setSelected(updated);
      await load("", updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally { setSaving(false); }
  }

  function updateDraftField(field: string, value: unknown) {
    const base = draft ?? objectValue(selected);
    setJson(JSON.stringify(normalizeInstrumentDraft({ ...base, [field]: value }, field), null, 2));
  }

  return (
    <Page title="产品与市场" description="在一个页面完成合约配置、上线、交易开关和做市维护。" onRefresh={() => load(filters.cursor)} loading={loading} error={error}>
      <ProductLineAccess />
      <PriceSettingsPanel key={filters.productLine} productLine={filters.productLine} />
      <OrderBusinessSettings key={filters.productLine} productLine={filters.productLine} />
      <div className="filters">
        <label>产品线<select value={filters.productLine} onChange={event => updateFilters({ productLine: event.target.value })}>
          <option value="">全部产品线</option>
          {["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"].map(line => <option key={line}>{line}</option>)}
        </select></label>
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
      {healthError && <div role="status" className="alert">{healthError}</div>}
      {health && <MarketHealthOverview health={health} />}
      <div className="instrument-workspace">
        <Panel title="交易产品">
          <button disabled={!filters.productLine} title={filters.productLine ? "新增当前产品线合约" : "请先选择产品线"} onClick={() => { setSelected({ instrumentId: 0, symbol: "", baseAssetId: 0, quoteAssetId: 0, settleAssetId: 0, contractValueAssetId: 0, instrumentType: filters.productLine === "SPOT" ? "SPOT" : filters.productLine === "OPTION" ? "OPTION" : filters.productLine.endsWith("DELIVERY") ? "DELIVERY" : "PERPETUAL", contractType: filters.productLine === "OPTION" ? "VANILLA_OPTION" : filters.productLine, status: "DRAFT", supportedOrderTypes: ["LIMIT"], supportedTimeInForce: ["GTC"], riskLimitBrackets: [], indexSources: [] }); setChanges([]); setChangeReason(""); }}>新增合约</button>
          <p>保存草稿 → 上线展示 → 开启交易。配置保存后自动同步，交易核心确认后生效。</p>
          <DataTable rows={items as unknown as UnknownRecord[]} columns={["symbol", "status", "instrumentType", "contractType", "settleAsset", "expiryTime", "maxLeveragePpm", "makerFeeRatePpm", "takerFeeRatePpm", "updatedAt"]} onRowClick={(row) => void selectInstrument(row as unknown as Instrument)} />
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
              <div className="metrics instrument-summary">
                <Metric label="当前产品" value={selected.symbol} tone="muted" />
                <Metric label="生效状态" value={coreSync?.state === "APPLIED" && String(coreSync.appliedChangeId) === String(selected.lastChangeId) ? "已确认" : coreSync?.state === "BLOCKED" ? "受阻，自动重试" : coreSync?.state === "UNKNOWN" ? "查询失败" : "待确认"} tone="muted" />
                <Metric label="状态" value={selected.status ?? "-"} tone={selected.status === "TRADING" ? "ok" : "warn"} />
                <Metric label="指数源" value={selected.indexSources?.length ?? 0} tone="muted" />
                <Metric label="到期时间" value={selected.expiryTime ?? "-"} tone="muted" />
                <Metric label="期权方向" value={selected.optionType ?? "-"} tone="muted" />
              </div>
              <div className="button-row">
                {[ ["PRE_TRADING", "上线展示"], ["TRADING", "开启交易"], ["HALT", "暂停交易"] ].map(([status, label]) => <button key={status} disabled={saving || !selected.instrumentId || selected.status === status || selected.status === "CLOSED" || selected.status === "SETTLING"} onClick={() => void changeStatus(status)}>{label}</button>)}
                <button onClick={() => { setSelected({ ...selected, instrumentId: 0, symbol: "", status: "DRAFT", lastChangeId: undefined, changeId: undefined }); setChanges([]); }}>复制为新合约</button>
              </div>
              <div className="instrument-save-actions">
              <TextFilter label="修改原因（必填）" value={changeReason} onChange={setChangeReason} />
              <details><summary>本次修改预览</summary><DataTable rows={Object.keys(draft ?? {}).filter(key => JSON.stringify(draft?.[key]) !== JSON.stringify(selected[key])).map(key => ({ 字段: key, 修改前: JSON.stringify(selected[key]) ?? "未设置", 修改后: JSON.stringify(draft?.[key]) ?? "未设置" }))} columns={["字段", "修改前", "修改后"]} /></details>
              <button className="primary" disabled={saving} onClick={() => void upsert()}>{saving ? "正在保存…" : "保存产品配置"}</button>
              <button disabled={saving} onClick={() => { if (window.confirm("放弃未保存的修改？")) setJson(JSON.stringify(selected, null, 2)); }}>放弃修改</button>
              </div>
              {draftState.error && <div className="alert danger">{draftState.error}</div>}
              <div className="profile-sections">
                <InstrumentSection title="基础信息">
                  <div className="form-grid">
                    <DraftTextField label="币对 ID" field="symbol" draft={draft} update={updateDraftField} upper />
                    <DraftSelectField label="产品类型" field="instrumentType" draft={draft} update={updateDraftField} options={INSTRUMENT_TYPES} />
                    <DraftSelectField label="合约类型" field="contractType" draft={draft} update={updateDraftField} options={CONTRACT_TYPES} />
                    <DraftSelectField label="状态" field="status" draft={draft} update={updateDraftField} options={INSTRUMENT_STATUSES} />
                    <label>基础币<select disabled={Boolean(draft?.instrumentId)} value={String(draft?.baseAssetId ?? "")} onChange={e => updateDraftField("baseAssetId", e.target.value)}>
                      <option value="">选择已上线币种</option>{assetOptions.map(a => <option key={a.assetId} value={a.assetId}>{a.asset} · {a.displayName}</option>)}
                      {draft?.baseAssetId && !assetOptions.some(a => a.assetId === draft.baseAssetId) ? <option value={String(draft.baseAssetId)}>{String(draft.baseAsset ?? draft.baseAssetId)}（已停用）</option> : null}
                    </select></label>
                    <label>计价币<select disabled={Boolean(draft?.instrumentId)} value={String(draft?.quoteAssetId ?? "")} onChange={e => updateDraftField("quoteAssetId", e.target.value)}>
                      <option value="">选择已上线币种</option>{assetOptions.map(a => <option key={a.assetId} value={a.assetId}>{a.asset} · {a.displayName}</option>)}
                      {draft?.quoteAssetId && !assetOptions.some(a => a.assetId === draft.quoteAssetId) ? <option value={String(draft.quoteAssetId)}>{String(draft.quoteAsset ?? draft.quoteAssetId)}（已停用）</option> : null}
                    </select></label>
                    <label>结算币<select disabled={Boolean(draft?.instrumentId)} value={String(draft?.settleAssetId ?? "")} onChange={e => updateDraftField("settleAssetId", e.target.value)}>
                      <option value="">选择已上线币种</option>{assetOptions.map(a => <option key={a.assetId} value={a.assetId}>{a.asset} · {a.displayName}</option>)}
                      {draft?.settleAssetId && !assetOptions.some(a => a.assetId === draft.settleAssetId) ? <option value={String(draft.settleAssetId)}>{String(draft.settleAsset ?? draft.settleAssetId)}（已停用）</option> : null}
                    </select></label>
                    <label>合约价值资产<select disabled={Boolean(draft?.instrumentId)} value={String(draft?.contractValueAssetId ?? "")} onChange={e => updateDraftField("contractValueAssetId", e.target.value)}>
                      <option value="">选择已上线币种</option>{assetOptions.map(a => <option key={a.assetId} value={a.assetId}>{a.asset} · {a.displayName}</option>)}
                      {draft?.contractValueAssetId && !assetOptions.some(a => a.assetId === draft.contractValueAssetId) ? <option value={String(draft.contractValueAssetId)}>{String(draft.contractValueAsset ?? draft.contractValueAssetId)}（已停用）</option> : null}
                    </select></label>
                  </div>
                </InstrumentSection>
                <InstrumentSection title="交割与期权">
                  <div className="form-grid">
                    <DraftOptionalTextField label="到期时间 ISO" field="expiryTime" draft={draft} update={updateDraftField} />
                    <DraftOptionalTextField label="交割时间 ISO" field="deliveryTime" draft={draft} update={updateDraftField} />
                    <DraftOptionalTextField label="标的币对永久 ID" field="underlyingInstrumentId" draft={draft} update={updateDraftField} />
                    <DraftOptionalSelectField label="标的产品线" field="underlyingProductLine" draft={draft} update={updateDraftField} options={["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY"]} />
                    <DraftOptionalNumberField label="行权价 units" field="strikePriceUnits" draft={draft} update={updateDraftField} />
                    <DraftOptionalSelectField label="期权方向" field="optionType" draft={draft} update={updateDraftField} options={OPTION_TYPES} />
                    <DraftOptionalSelectField label="行权方式" field="optionExerciseStyle" draft={draft} update={updateDraftField} options={OPTION_EXERCISE_STYLES} />
                    <DraftOptionalSelectField label="结算方式" field="settlementMethod" draft={draft} update={updateDraftField} options={SETTLEMENT_METHODS} />
                  </div>
                </InstrumentSection>
                <InstrumentSection title="交易规则">
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
                </InstrumentSection>
                <InstrumentSection title="风险与资金费">
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
                </InstrumentSection>
                <InstrumentSection title="费用与合约面值">
                  <div className="form-grid">
                    <DraftNumberField label="Maker fee ppm" field="makerFeeRatePpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="Taker fee ppm" field="takerFeeRatePpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="合约乘数 ppm" field="contractMultiplierPpm" draft={draft} update={updateDraftField} />
                    <DraftNumberField label="Notional multiplier" field="notionalMultiplierUnits" draft={draft} update={updateDraftField} />
                  </div>
                </InstrumentSection>
              </div>
              <InstrumentConfigurationFields draft={draft} update={updateDraftField} />
              <MakerBusinessSettings productLine={selected.contractType === "VANILLA_OPTION" ? "OPTION" : selected.contractType} instrumentId={selected.instrumentId} reason={changeReason} />
              <InstrumentMakerSettings key={`${selected.contractType}:${selected.instrumentId}`} instrument={selected} reason={changeReason} />
              {coreSync?.error != null && <p role="status">配置同步：{String(coreSync.error)}</p>}
              <InstrumentSection title="配置操作日志" wide>
                <button onClick={() => void loadChanges(selected)} disabled={historyLoading}>刷新操作日志</button>
                {changes.map(change => <details key={change.changeId} className="raw-toggle">
                  <summary>{change.changedAt} · {change.operatorId} · {change.reason}</summary>
                  <DataTable rows={instrumentChangeRows(change)} columns={["字段", "修改前", "修改后"]} />
                </details>)}
                {!historyLoading && changes.length === 0 && <Empty text="暂无操作日志" />}
                {changes.length > 0 && changes.length % 50 === 0 && <button disabled={historyLoading} onClick={() => void loadChanges(selected, true)}>加载更早日志</button>}
              </InstrumentSection>
            </div>
          ) : <Empty text="选择一个产品" />}
        </Panel>
      </div>
    </Page>
  );
}

function InstrumentSection({ title, children }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return <details className="profile-section instrument-section" open={title === "基础信息"}><summary>{title}</summary>{children}</details>;
}

function parseInstrumentDraft(json: string): { value: UnknownRecord | null; error: string } {
  if (!json.trim()) return { value: null, error: "" };
  try {
    const parsed = parseApiJson<unknown>(json);
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
    next.underlyingInstrumentId = null;
    next.underlyingProductLine = null;
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
              "instrumentId",
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
              "instrumentId",
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

function PriceSettingsPanel({ productLine }: { productLine: string }) {
  const [config, setConfig] = useState<UnknownRecord | null>(null);
  const [fields, setFields] = useState<Record<string, UnknownRecord>>({});
  const [draft, setDraft] = useState<UnknownRecord>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() {
    if (!productLine) return;
    setLoading(true); setError("");
    try {
      const response = await gatewayGet<UnknownRecord>("price-index", "/admin/business-settings", { productLine });
      const saved = response.config as UnknownRecord;
      setConfig(saved); setFields(response.fields as Record<string, UnknownRecord>);
      setDraft(Object.fromEntries(Object.entries(saved.settings as UnknownRecord).map(([key, value]) =>
        [key, Array.isArray(value) ? value.join(",") : value])));
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { setConfig(null); setDraft({}); setFields({}); setError(""); }, [productLine]);
  async function save() {
    if (!config) return;
    setLoading(true); setError("");
    try {
      if (!reason.trim() || reason.length > 1000) throw new Error("请填写 1 至 1000 字的修改原因。");
      const settings: UnknownRecord = {};
      for (const [key, field] of Object.entries(fields)) {
        const value = draft[key];
        if (field.kind === "boolean") { settings[key] = Boolean(value); continue; }
        if (field.kind === "text") {
          const text = String(value ?? "").trim();
          if (text.length < Number(field.minimum) || text.length > Number(field.maximum)) throw new Error(`${field.label}长度不符合要求。`);
          settings[key] = text; continue;
        }
        if (field.kind === "list") {
          const list = String(value ?? "").split(/[,，\s]+/).filter(Boolean);
          if (list.length > Number(field.maximum) || list.some(item => !/^[A-Z][A-Z0-9]{1,15}$/.test(item)) || new Set(list).size !== list.length)
            throw new Error(`${field.label}须填写不重复的大写币种代码。`);
          settings[key] = list; continue;
        }
        const number = Number(value);
        if (!String(value).trim() || !Number.isFinite(number) || number < Number(field.minimum) || number > Number(field.maximum)
          || (field.kind !== "decimal" && !Number.isSafeInteger(number))) throw new Error(`${field.label}范围为 ${field.minimum} 至 ${field.maximum}。`);
        settings[key] = number;
      }
      for (const prefix of ["fiat", "stable"]) {
        if (!settings[`${prefix}Enabled`]) continue;
        let url: URL;
        try { url = new URL(String(settings[`${prefix}BaseUrl`])); } catch { throw new Error("启用汇率来源前请填写完整 HTTP(S) 地址。"); }
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
          || !String(settings[`${prefix}Path`]).startsWith("/")) throw new Error("汇率来源地址或路径不合法。");
      }
      if (settings.stableEnabled && !settings.fiatEnabled) throw new Error("稳定币汇率需要同时启用法币汇率。");
      if (settings.fiatEnabled && !(settings.fiatQuoteCurrencies as string[]).length) throw new Error("启用法币汇率前请填写报价币种。");
      if (!window.confirm(`确认更新 ${productLine} 的价格业务设置？保存后热生效。`)) return;
      await gatewayPost("price-index", "/admin/business-settings", { settings, expectedVersion: config.version, reason: reason.trim() }, { productLine });
      await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  return <details className="panel"><summary>产品线价格与汇率设置</summary><div className="stack">
    <p>选择产品线后读取设置。合约专属行情来源在下方合约表单维护；此处控制本产品线的指数、标记价和汇率公共参数。</p>
    {error && <div role="alert" className="alert danger">{error}</div>}
    <button disabled={!productLine || loading} onClick={() => void load()}>读取 {productLine || "所选产品线"} 设置</button>
    {config && <><p>版本 {String(config.version)} · 保存后无需重启；版本冲突时重新读取后再修改。</p>
      <div className="form-grid">{Object.entries(fields).map(([key, field]) => <label key={key}>{String(field.label)}
        {field.kind === "boolean" ? <input type="checkbox" checked={Boolean(draft[key])} onChange={e => setDraft(current => ({ ...current, [key]: e.target.checked }))} />
          : <input type={["integer", "duration", "decimal"].includes(String(field.kind)) ? "number" : "text"}
              min={Number(field.minimum)} max={Number(field.maximum)} step={field.kind === "decimal" ? "any" : 1}
              value={String(draft[key] ?? "")} onChange={e => setDraft(current => ({ ...current, [key]: e.target.value }))} />}
        <small>{String(field.help)}{["integer", "duration", "decimal"].includes(String(field.kind)) && `。范围 ${field.minimum}–${field.maximum}`}</small>
      </label>)}</div>
      <label>修改原因<input required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className="primary" disabled={loading} onClick={() => void save()}>保存价格设置</button></>}
  </div></details>;
}

function instrumentChangeRows(change: InstrumentChange): UnknownRecord[] {
  try {
    const before = change.beforeValues ? JSON.parse(change.beforeValues) as UnknownRecord : {};
    const after = JSON.parse(change.afterValues) as UnknownRecord;
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter(key => !["changeId", "change_id", "createdAt", "updatedAt", "created_at", "updated_at"].includes(key))
      .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map(key => ({ "字段": key, "修改前": JSON.stringify(before[key]) ?? "—", "修改后": JSON.stringify(after[key]) ?? "—" }));
  } catch { return [{ "字段": "日志内容", "修改前": change.beforeValues ?? "—", "修改后": change.afterValues }]; }
}
