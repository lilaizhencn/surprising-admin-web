import { useState, useEffect } from "react";
import { type UnknownRecord } from "../types";
import { gatewayGet, gatewayPost } from "../api/admin";
import { RefreshCw, Search } from "lucide-react";
import { positiveInt64 } from "../lib/integers";
import { cursorInfo, Page, Metric, Panel, TextFilter, SortSelect, TwoColumn, DataTable, CursorPager, KeyValue } from "../components/AdminUi";
import { errorMessage, objectValue, records, ppmPercent } from "../lib/adminData";
import { PRODUCT_LINES } from "../lib/products";
import { CREATED_AT_SORTS } from "../lib/queryOptions";

const MARKET_MAKER_EVENT_TYPES = ["", "CYCLE_SUCCESS", "CYCLE_FAILED", "QUOTE_RECONCILED", "TRADE_SUBMITTED", "TRADE_REJECTED", "SKIPPED"];

export default function MarketMakerPage() {
  const [strategies, setStrategies] = useState<UnknownRecord[]>([]);
  const [metrics, setMetrics] = useState<UnknownRecord | null>(null);
  const [pnl, setPnl] = useState<UnknownRecord | null>(null);
  const [runLogs, setRunLogs] = useState<UnknownRecord[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState("");
  const [insightFilters, setInsightFilters] = useState({
    productLine: "LINEAR_PERPETUAL",
    strategyId: "",
    instrumentId: "",
    accountId: "",
    eventType: "",
    windowHours: "24",
    limit: "100",
    logCursor: "",
    logSort: "createdAt.desc"
  });
  const [logPageInfo, setLogPageInfo] = useState(cursorInfo());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateInsightFilters(patch: Partial<typeof insightFilters>) {
    setInsightFilters((current) => ({ ...current, ...patch, logCursor: "" }));
  }

  async function load(nextLogCursor = insightFilters.logCursor) {
    setLoading(true);
    setError("");
    try {
      const insightParams = marketMakerInsightParams(insightFilters);
      const logParams = { ...insightParams, cursor: nextLogCursor, sort: insightFilters.logSort };
      const [strategyResponse, metricsResponse, pnlResponse, logResponse] = await Promise.all([
        gatewayGet<{ strategies?: UnknownRecord[]; items?: UnknownRecord[] }>("market-maker", "/strategies", insightParams),
        gatewayGet<UnknownRecord>("market-maker", "/metrics", { productLine: insightFilters.productLine, limit: 200 }),
        gatewayGet<UnknownRecord>("market-maker", "/pnl-attribution", insightParams),
        gatewayGet<{ events?: UnknownRecord[]; count?: number; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("market-maker", "/strategy-logs", logParams)
      ]);
      const nextStrategies = strategyResponse.strategies ?? strategyResponse.items ?? [];
      setStrategies(nextStrategies);
      if (nextStrategies.length && (!selectedStrategyId || !nextStrategies.some((item) => String(item.strategyId ?? item.id ?? "") === selectedStrategyId))) {
        const nextStrategyId = String(nextStrategies[0].strategyId ?? nextStrategies[0].id ?? "");
        setSelectedStrategyId(nextStrategyId);
      } else if (!nextStrategies.length) {
        setSelectedStrategyId("");
      }
      setMetrics(metricsResponse);
      setPnl(pnlResponse);
      setRunLogs(logResponse.events ?? []);
      setLogPageInfo(cursorInfo(logResponse));
      setInsightFilters((current) => ({ ...current, logCursor: nextLogCursor || "" }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function action(strategyId: unknown, op: "pause" | "resume") {
    if (!strategyId) return;
    setLoading(true);
    setError("");
    try {
      await gatewayPost("market-maker", `/strategies/${strategyId}/${op}`, undefined, { productLine: insightFilters.productLine });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function runOnce() {
    setLoading(true);
    setError("");
    try {
      await gatewayPost("market-maker", "/run-once", { productLine: insightFilters.productLine }, { productLine: insightFilters.productLine });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const totals = objectValue(metrics?.totals);
  const metricRows: UnknownRecord[] = records(metrics?.rows as UnknownRecord[] | undefined).map((row) => ({
    ...row,
    inventoryUsage: ppmPercent(row.inventoryUsagePpm),
    quoteCoverage: ppmPercent(row.quoteCoveragePpm),
    spreadPpmText: ppmPercent(row.spreadPpm)
  }));
  const liquidityRows = metricRows.filter((row) => row.liquidity != null).map((row) => {
    const liquidity = objectValue(row.liquidity);
    return { strategyId: row.strategyId, productLine: row.productLine, instrumentId: row.instrumentId,
      accountId: row.accountId, slippage: ppmPercent(liquidity.slippagePpm),
      targetNotionalUnits: liquidity.targetNotionalUnits,
      bidNotionalWithinBandUnits: liquidity.bidNotionalWithinBandUnits,
      askNotionalWithinBandUnits: liquidity.askNotionalWithinBandUnits,
      fresh: liquidity.fresh, bookEventTime: liquidity.bookEventTime, bookSequence: liquidity.bookSequence };
  });
  const anomalies = records(metrics?.anomalies as UnknownRecord[] | undefined);
  const warnings = records(metrics?.warnings as UnknownRecord[] | undefined);
  const pnlTotals = objectValue(pnl?.totals);
  const pnlRows = records(pnl?.rows as UnknownRecord[] | undefined);

  return (
    <Page title="做市管理" onRefresh={load} loading={loading} error={error}>
      <div className="metrics">
        <Metric label="策略数" value={totals.strategyCount ?? strategies.length} tone="muted" />
        <Metric label="运行中" value={totals.runningStrategies ?? 0} tone="ok" />
        <Metric label="降级/暂停" value={`${totals.degradedStrategies ?? 0}/${totals.pausedStrategies ?? 0}`} tone={Number(totals.degradedStrategies ?? 0) > 0 ? "warn" : "muted"} />
        <Metric label="拒单数" value={totals.rejectedOrders ?? 0} tone={Number(totals.rejectedOrders ?? 0) > 0 ? "warn" : "ok"} />
        <Metric label="严重异常" value={totals.criticalAnomalies ?? 0} tone={Number(totals.criticalAnomalies ?? 0) > 0 ? "danger" : "ok"} />
        <Metric label="告警总数" value={totals.anomalyCount ?? anomalies.length} tone={anomalies.length > 0 ? "warn" : "ok"} />
      </div>
      <div className="button-row">
        <button className="primary" onClick={() => void runOnce()}><RefreshCw size={16} />运行一次</button>
      </div>
      <Panel title="收益归因与运行日志筛选">
        <div className="filters">
          <label>产品线<select value={insightFilters.productLine} onChange={(event) => {
            setSelectedStrategyId("");
            updateInsightFilters({ productLine: event.target.value });
          }}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <TextFilter label="Strategy" value={insightFilters.strategyId} onChange={(value) => updateInsightFilters({ strategyId: value })} />
          <TextFilter label="币对 ID" value={insightFilters.instrumentId} onChange={(value) => updateInsightFilters({ instrumentId: value.toUpperCase() })} />
          <TextFilter label="Account ID" value={insightFilters.accountId} onChange={(value) => updateInsightFilters({ accountId: value })} />
          <label>事件类型
            <select value={insightFilters.eventType} onChange={(event) => updateInsightFilters({ eventType: event.target.value })}>
              {MARKET_MAKER_EVENT_TYPES.map((item) => <option key={item || "ALL"} value={item}>{item || "全部"}</option>)}
            </select>
          </label>
          <TextFilter label="Window Hours" value={insightFilters.windowHours} onChange={(value) => updateInsightFilters({ windowHours: value })} />
          <TextFilter label="Limit" value={insightFilters.limit} onChange={(value) => updateInsightFilters({ limit: value })} />
          <SortSelect label="日志排序" value={insightFilters.logSort} options={CREATED_AT_SORTS} onChange={(value) => updateInsightFilters({ logSort: value })} />
          <button onClick={() => void load("")}><Search size={16} />查询归因</button>
        </div>
      </Panel>
      <div className="metrics">
        <Metric label="归因行数" value={pnlTotals.rowCount ?? pnlRows.length} tone="muted" />
        <Metric label="总成交" value={pnlTotals.totalTrades ?? 0} tone="ok" />
        <Metric label="Maker/Taker" value={`${pnlTotals.makerTrades ?? 0}/${pnlTotals.takerTrades ?? 0}`} tone="muted" />
        <Metric label="净手续费" value={pnlTotals.netFeeUnits ?? 0} tone={Number(pnlTotals.netFeeUnits ?? 0) >= 0 ? "ok" : "warn"} />
        <Metric label="当前已实现 PnL" value={pnlTotals.currentRealizedPnlUnits ?? 0} tone={Number(pnlTotals.currentRealizedPnlUnits ?? 0) >= 0 ? "ok" : "warn"} />
        <Metric label="运行日志" value={runLogs.length} tone={runLogs.some((row) => row.eventType === "CYCLE_FAILED" || row.eventType === "TRADE_REJECTED") ? "warn" : "muted"} />
      </div>
      <TwoColumn>
        <Panel title="策略控制">
          <DataTable rows={strategies} columns={["productLine", "strategyId", "status", "configuredEnabled", "runtimePaused", "cycleSequence", "submittedOrders", "canceledOrders", "rejectedOrders", "lastError"]} actions={(row) => (
            <div className="button-row compact-row">
              <button onClick={() => void action(row.strategyId ?? row.id, "pause")}>暂停</button>
              <button onClick={() => void action(row.strategyId ?? row.id, "resume")}>恢复</button>
            </div>
          )} />
        </Panel>
        <Panel title="异常列表">
          <DataTable rows={anomalies} columns={["severity", "type", "productLine", "strategyId", "instrumentId", "accountId", "metricValue", "threshold", "summary"]} />
        </Panel>
      </TwoColumn>
      <Panel title="做市配置维护"><p>在合约页面统一维护策略、行情来源和公共报价参数。</p><a href="#markets">进入合约配置</a></Panel>
      <TwoColumn>
        <Panel title="做市收益归因">
          <DataTable
            rows={pnlRows}
            columns={[
              "strategyId",
              "productLine",
              "instrumentId",
              "accountId",
              "marginMode",
              "orderCount",
              "rejectedOrders",
              "makerTrades",
              "takerTrades",
              "totalQuantitySteps",
              "totalNotionalTicks",
              "netFeeUnits",
              "currentRealizedPnlUnits",
              "signedInventorySteps",
              "firstTradeAt",
              "lastTradeAt"
            ]}
          />
        </Panel>
        <Panel title="策略运行日志">
          <div className="stack">
            <DataTable
              rows={runLogs}
              columns={[
                "createdAt",
                "productLine",
                "strategyId",
                "instrumentId",
                "accountId",
                "eventType",
                "cycleSequence",
                "submittedOrders",
                "canceledOrders",
                "rejectedOrders",
                "skippedReason",
                "errorMessage",
              ]}
            />
            <CursorPager
              page={logPageInfo}
              cursor={insightFilters.logCursor}
              onNext={() => void load(logPageInfo.nextCursor || "")}
              onReset={() => void load("")}
            />
          </div>
        </Panel>
      </TwoColumn>
      <MakerLeveragePanel key={insightFilters.productLine} productLine={insightFilters.productLine} strategies={strategies} />
      <Panel title="价格带内可成交深度">
        <p>金额为合约报价资产的最小单位；滑点相对当前最优买卖价，不含价差和手续费。过期盘口不能作为可成交容量。</p>
        <DataTable rows={liquidityRows} columns={["strategyId", "productLine", "instrumentId", "accountId", "slippage",
          "targetNotionalUnits", "bidNotionalWithinBandUnits", "askNotionalWithinBandUnits", "fresh", "bookEventTime", "bookSequence"]} />
      </Panel>
      <Panel title="做市质量指标">
        <DataTable
          rows={metricRows}
          columns={[
            "strategyId",
            "productLine",
            "instrumentId",
            "accountId",
            "strategyStatus",
            "qualityStatus",
            "signedInventorySteps",
            "inventoryUsage",
            "ownedOpenOrders",
            "desiredQuoteCount",
            "matchedDesiredQuotes",
            "missingDesiredQuotes",
            "staleOwnedOrders",
            "offTargetOwnedOrders",
            "spreadTicks",
            "spreadPpmText",
            "quoteCoverage",
            "error"
          ]}
        />
      </Panel>
      {warnings.length > 0 && (
        <Panel title="指标采集警告">
          <DataTable rows={warnings} columns={["productLine", "strategyId", "instrumentId", "accountId", "message"]} />
        </Panel>
      )}
    </Page>
  );
}

function MakerLeveragePanel({ productLine, strategies }: { productLine: string; strategies: UnknownRecord[] }) {
  const choices = strategies.filter((strategy) => strategy.productLine === productLine).flatMap((strategy) => {
    const accounts = Array.isArray(strategy.accountIds) ? strategy.accountIds : [];
    const instruments = Array.isArray(strategy.instrumentIds) ? strategy.instrumentIds : [];
    return accounts.flatMap((account) => instruments.map((instrument) => ({
      key: `${account}:${instrument}`, userId: String(account), instrumentId: String(instrument),
      label: `${strategy.strategyId} / 账号 ${account} / 合约 ${instrument}`
    })));
  });
  const [selected, setSelected] = useState("");
  const [multiple, setMultiple] = useState("5");
  const [repriceCrossMargin, setRepriceCrossMargin] = useState(false);
  const [reason, setReason] = useState("");
  const [setting, setSetting] = useState<UnknownRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const choice = choices.find((item) => item.key === selected);
  async function submit(save: boolean) {
    if (!choice) { setError("请选择做市账号和合约"); return; }
    const leveragePpm = Number(multiple) * 1_000_000;
    if (save && (!Number.isSafeInteger(leveragePpm) || leveragePpm < 1_000_000 || !reason.trim())) {
      setError("请填写至少 1 倍的有效杠杆和调整原因"); return;
    }
    if (save && !window.confirm(`确认将 ${productLine} ${choice.label} 的全仓杠杆调整为 ${multiple} 倍？${repriceCrossMargin ? "将从可用余额补足持仓保证金；存在挂单、资金不足或提高杠杆时拒绝。" : "保证金仍由交易核心校验。"}`)) return;
    setBusy(true); setError("");
    try {
      const params = { productLine, userId: positiveInt64(choice.userId, "做市用户 ID"), instrumentId: choice.instrumentId, marginMode: "CROSS" };
      const response = save
        ? await gatewayPost<UnknownRecord>("trading-leverage", "/settings", { ...params, leveragePpm, reason: reason.trim(), repriceCrossMargin }, { productLine })
        : await gatewayGet<UnknownRecord>("trading-leverage", "/settings", params);
      setSetting(response);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <Panel title="做市账号全仓杠杆">
    <div className="filters">
      <label>账号与合约<select value={selected} onChange={(event) => { setSelected(event.target.value); setSetting(null); }}>
        <option value="">请选择</option>
        {choices.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
      </select></label>
      <TextFilter label="杠杆倍数" value={multiple} onChange={setMultiple} />
      <TextFilter label="调整原因" value={reason} onChange={setReason} />
      <label><input type="checkbox" checked={repriceCrossMargin} onChange={(event) => setRepriceCrossMargin(event.target.checked)} />降低杠杆并补足持仓保证金</label>
      <button disabled={busy || !choice} onClick={() => void submit(false)}>读取</button>
      <button disabled={busy || !choice} className="primary" onClick={() => void submit(true)}>调整杠杆</button>
    </div>
    {repriceCrossMargin && <p>请先暂停该策略并撤完该账户该合约的全仓挂单；调整成功后再恢复报价。</p>}
    {error && <div className="alert danger">{error}</div>}
    {setting && <KeyValue data={setting} />}
  </Panel>;
}

function marketMakerInsightParams(filters: {
  productLine: string;
  strategyId: string;
  instrumentId: string;
  accountId: string;
  eventType: string;
  windowHours: string;
  limit: string;
  logCursor?: string;
  logSort?: string;
}): Record<string, unknown> {
  const params: Record<string, unknown> = {
    windowHours: Number(filters.windowHours) || 24,
    limit: Number(filters.limit) || 100
  };
  if (filters.strategyId.trim()) params.strategyId = filters.strategyId.trim();
  if (filters.productLine.trim()) params.productLine = filters.productLine.trim();
  if (filters.instrumentId.trim()) params.instrumentId = filters.instrumentId.trim().toUpperCase();
  if (filters.accountId.trim()) params.accountId = filters.accountId.trim();
  if (filters.eventType.trim()) params.eventType = filters.eventType.trim();
  return params;
}
