import { useState, useRef, useEffect } from "react";
import { type UnknownRecord, type OrderRecord } from "../types";
import { tradingMetrics, gatewayGet, gatewayPost } from "../api/admin";
import { optionalPositiveInt64 } from "../lib/integers";
import { Search } from "lucide-react";
import { formatDate } from "../config";
import { cursorInfo, Page, TextFilter, SortSelect, Panel, JsonBlock, TwoColumn, CursorPager, DataTable, Empty, Metric, KeyValue } from "../components/AdminUi";
import { errorMessage, objectValue, extractRows, ppmPercent } from "../lib/adminData";
import { PRODUCT_LINES } from "../lib/products";
import { CREATED_AT_SORTS, EVENT_TIME_SORTS } from "../lib/queryOptions";

const ORDER_STATUSES = ["", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_REQUESTED", "CANCELED", "FILLED", "REJECTED"];

const TRIGGER_ORDER_STATUSES = ["", "PENDING", "TRIGGERING", "TRIGGERED", "TRIGGER_FAILED", "CANCELED", "EXPIRED"];

const AUDIT_STATUS_FILTERS = Array.from(new Set([...ORDER_STATUSES, ...TRIGGER_ORDER_STATUSES]));

export default function OrdersPage() {
  const [filters, setFilters] = useState({
    productLine: "LINEAR_PERPETUAL",
    userId: "",
    instrumentId: "",
    status: "",
    orderId: "",
    limit: "100",
    orderCursor: "",
    triggerCursor: "",
    tradeCursor: "",
    orderSort: "createdAt.desc",
    triggerSort: "createdAt.desc",
    tradeSort: "eventTime.desc"
  });
  const [metricsWindowMinutes, setMetricsWindowMinutes] = useState("1440");
  const [metrics, setMetrics] = useState<UnknownRecord | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [orderPageInfo, setOrderPageInfo] = useState(cursorInfo());
  const [timeline, setTimeline] = useState<UnknownRecord | null>(null);
  const [triggerOrders, setTriggerOrders] = useState<UnknownRecord[]>([]);
  const [triggerPageInfo, setTriggerPageInfo] = useState(cursorInfo());
  const [triggerTimeline, setTriggerTimeline] = useState<UnknownRecord | null>(null);
  const [cancelPreview, setCancelPreview] = useState<UnknownRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("Admin operation cancel");
  const [trades, setTrades] = useState<UnknownRecord[]>([]);
  const [tradePageInfo, setTradePageInfo] = useState(cursorInfo());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const queryScope = JSON.stringify({ ...filters, orderCursor: "", triggerCursor: "", tradeCursor: "", metricsWindowMinutes });
  const activeScope = useRef(queryScope);
  activeScope.current = queryScope;
  const listRequest = useRef(0);
  const detailRequest = useRef({ ORDER: 0, TRIGGER: 0 });

  function clearReadResults() {
    setOrders([]); setTriggerOrders([]); setTrades([]);
    setOrderPageInfo(cursorInfo()); setTriggerPageInfo(cursorInfo()); setTradePageInfo(cursorInfo());
    setMetrics(null); setTimeline(null); setTriggerTimeline(null); setCancelPreview(null);
  }

  function updateFilters(patch: Partial<typeof filters>) {
    ++listRequest.current; ++detailRequest.current.ORDER; ++detailRequest.current.TRIGGER;
    clearReadResults(); setError(""); setLoading(false);

    setFilters((current) => ({
      ...current,
      ...patch,
      orderCursor: "",
      triggerCursor: "",
      tradeCursor: ""
    }));
  }

  async function load(nextOrderCursor = filters.orderCursor,
                      nextTriggerCursor = filters.triggerCursor,
                      nextTradeCursor = filters.tradeCursor) {
    if (activeScope.current !== queryScope) return false;
    const request = ++listRequest.current;
    ++detailRequest.current.ORDER; ++detailRequest.current.TRIGGER;
    clearReadResults();
    setLoading(true);
    setError("");
    try {
      const orderStatus = ORDER_STATUSES.includes(filters.status) ? filters.status : "";
      const triggerStatus = TRIGGER_ORDER_STATUSES.includes(filters.status) ? filters.status : "";
      const [metricsResponse, response, triggerResponse, tradeResponse] = await Promise.allSettled([
        tradingMetrics({ windowMinutes: Number(metricsWindowMinutes) || 1440, productLine: filters.productLine, limit: 20 }),
        gatewayGet<{ orders?: OrderRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("trading-orders", "", {
          userId: filters.userId,
          instrumentId: filters.instrumentId,
          status: orderStatus,
          orderId: filters.orderId,
          productLine: filters.productLine,
          limit: Number(filters.limit) || 100,
          cursor: nextOrderCursor,
          sort: filters.orderSort
        }),
        gatewayGet<{ orders?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("trading-trigger", "", {
          userId: filters.userId,
          instrumentId: filters.instrumentId,
          status: triggerStatus,
          triggerOrderId: filters.orderId,
          productLine: filters.productLine,
          limit: Number(filters.limit) || 100,
          cursor: nextTriggerCursor,
          sort: filters.triggerSort
        }),
        gatewayGet<{ trades?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("trading-orders", "/trades", {
          userId: filters.userId,
          instrumentId: filters.instrumentId,
          orderId: filters.orderId,
          productLine: filters.productLine,
          limit: Number(filters.limit) || 100,
          cursor: nextTradeCursor,
          sort: filters.tradeSort
        })
      ]);
      if (request !== listRequest.current || activeScope.current !== queryScope) return false;
      if (metricsResponse.status === "fulfilled") setMetrics(metricsResponse.value);
      if (response.status === "fulfilled") {
        setOrders(response.value.orders ?? []); setOrderPageInfo(cursorInfo(response.value));
      }
      if (triggerResponse.status === "fulfilled") {
        setTriggerOrders(triggerResponse.value.orders ?? []); setTriggerPageInfo(cursorInfo(triggerResponse.value));
      }
      if (tradeResponse.status === "fulfilled") {
        setTrades(tradeResponse.value.trades ?? []); setTradePageInfo(cursorInfo(tradeResponse.value));
      }
      const failures = [
        ["交易统计", metricsResponse], ["普通订单", response], ["条件单", triggerResponse], ["成交列表", tradeResponse]
      ] as const;
      setError(failures.flatMap(([name, result]) => result.status === "rejected" ? [`${name}：${errorMessage(result.reason)}`] : []).join("；"));
      setFilters((current) => ({
        ...current,
        orderCursor: response.status === "fulfilled" ? nextOrderCursor : "",
        triggerCursor: triggerResponse.status === "fulfilled" ? nextTriggerCursor : "",
        tradeCursor: tradeResponse.status === "fulfilled" ? nextTradeCursor : ""
      }));
      return failures.every(([, result]) => result.status === "fulfilled");
    } catch (err) {
      if (request === listRequest.current && activeScope.current === queryScope) setError(errorMessage(err));
      return false;
    } finally {
      if (request === listRequest.current && activeScope.current === queryScope) setLoading(false);
    }
  }

  async function loadTimeline(value: unknown, kind: "ORDER" | "TRIGGER" = "ORDER") {
    if (activeScope.current !== queryScope) return;
    const request = ++detailRequest.current[kind];
    const setResult = kind === "TRIGGER" ? setTriggerTimeline : setTimeline;
    setResult(null);
    try {
      const id = String(value ?? "");
      if (!/^[1-9]\d*$/.test(id) || typeof value === "number" && !Number.isSafeInteger(value))
        throw new Error("订单 ID 无效，未发起查询。");
      const response = await gatewayGet<UnknownRecord>(kind === "TRIGGER" ? "trading-trigger" : "trading-orders",
        `/${encodeURIComponent(id)}/timeline`, { productLine: filters.productLine });
      if (request === detailRequest.current[kind] && activeScope.current === queryScope) setResult(response);
    } catch (err) {
      if (request === detailRequest.current[kind] && activeScope.current === queryScope) setError(errorMessage(err));
    }
  }

  async function cancelOrder(orderId: unknown) {
    if (!orderId) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setError("请输入后台撤单原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await gatewayPost("trading-orders", `/${orderId}/cancel`, { reason }, { productLine: filters.productLine });
      await load("", filters.triggerCursor, filters.tradeCursor);
      await loadTimeline(orderId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function batchCancel() {
    const reason = cancelReason.trim();
    if (!reason) {
      setError("请输入批量撤单原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await gatewayPost<UnknownRecord>("trading-orders", "/cancel", {
        userId: optionalPositiveInt64(filters.userId, "用户 ID"),
        instrumentId: filters.instrumentId || undefined,
        limit: Number(filters.limit) || 100,
        reason
      }, { productLine: filters.productLine });
      setTimeline(response);
      await load("", filters.triggerCursor, filters.tradeCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function previewCancelImpact() {
    setLoading(true);
    setError("");
    try {
      const response = await gatewayGet<UnknownRecord>("trading-orders", "/cancel-preview", {
        userId: optionalPositiveInt64(filters.userId, "用户 ID"),
        instrumentId: filters.instrumentId || undefined,
        productLine: filters.productLine,
        limit: Number(filters.limit) || 100
      });
      setCancelPreview(response);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function cancelByInstrumentId() {
    if (!filters.instrumentId) {
      setError("按合约 ID 撤单需要先输入合约 ID。");
      return;
    }
    const reason = cancelReason.trim();
    if (!reason) {
      setError("请输入按合约 ID 撤单原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await gatewayPost<UnknownRecord>("trading-orders", "/cancel-by-instrument", {
        instrumentId: filters.instrumentId,
        limit: Number(filters.limit) || 100,
        reason
      }, { productLine: filters.productLine });
      setTimeline(response);
      await load("", filters.triggerCursor, filters.tradeCursor);
      await previewCancelImpact();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => { ++listRequest.current; ++detailRequest.current.ORDER; ++detailRequest.current.TRIGGER; };
  }, []);

  return (
    <Page title="订单审计" onRefresh={async () => { await load(); }} loading={loading} error={error}>
      <div className="filters">
        <label>产品线<select value={filters.productLine} onChange={(event) => updateFilters({ productLine: event.target.value })}>{PRODUCT_LINES.map((item) => <option key={item} value={item}>{item || "全部"}</option>)}</select></label>
        <TextFilter label="User ID" value={filters.userId} onChange={(value) => updateFilters({ userId: value })} />
        <TextFilter label="币对 ID" value={filters.instrumentId} onChange={(value) => updateFilters({ instrumentId: value.toUpperCase() })} />
        <TextFilter label="Order / Trigger ID" value={filters.orderId} onChange={(value) => updateFilters({ orderId: value })} />
        <label>状态<select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}>{AUDIT_STATUS_FILTERS.map((item) => <option key={item} value={item}>{item || "全部"}</option>)}</select></label>
        <label>统计窗口<select value={metricsWindowMinutes} onChange={(event) => { updateFilters({}); setMetricsWindowMinutes(event.target.value); }}>
          <option value="60">1 小时</option>
          <option value="360">6 小时</option>
          <option value="1440">24 小时</option>
          <option value="10080">7 天</option>
        </select></label>
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => updateFilters({ limit: value })} />
        <SortSelect label="订单排序" value={filters.orderSort} options={CREATED_AT_SORTS} onChange={(value) => updateFilters({ orderSort: value })} />
        <SortSelect label="条件单排序" value={filters.triggerSort} options={CREATED_AT_SORTS} onChange={(value) => updateFilters({ triggerSort: value })} />
        <SortSelect label="成交排序" value={filters.tradeSort} options={EVENT_TIME_SORTS} onChange={(value) => updateFilters({ tradeSort: value })} />
        <TextFilter label="撤单原因" value={cancelReason} onChange={setCancelReason} />
        <button onClick={() => void load("", "", "")}><Search size={16} />查询</button>
        <button onClick={() => void previewCancelImpact()}>预览撤单影响</button>
        <button className="primary" onClick={() => void batchCancel()}>批量撤单</button>
        <button className="primary" onClick={() => void cancelByInstrumentId()}>按合约 ID 撤单</button>
      </div>
      {metrics && <TradingMetricsOverview metrics={metrics} />}
      {cancelPreview && <Panel title="撤单影响预览"><JsonBlock value={cancelPreview} /></Panel>}
      <TwoColumn>
        <Panel title="订单列表">
          <CursorPager
            page={orderPageInfo}
            cursor={filters.orderCursor}
            onNext={() => void load(orderPageInfo.nextCursor || "", filters.triggerCursor, filters.tradeCursor)}
            onReset={() => void load("", filters.triggerCursor, filters.tradeCursor)}
          />
          <DataTable
            rows={orders as unknown as UnknownRecord[]}
            columns={["orderId", "userId", "instrumentId", "side", "positionSide", "orderType", "priceTicks", "quantitySteps", "remainingQuantitySteps", "status", "createdAt"]}
            onRowClick={(row) => void loadTimeline(row.orderId)}
            actions={(row) => <button onClick={() => void cancelOrder(row.orderId)}>撤单</button>}
          />
        </Panel>
        <Panel title="订单时间线">
          {timeline ? <JsonBlock value={timeline} /> : <Empty text="选择订单查看事件、撮合结果和成交" />}
        </Panel>
      </TwoColumn>
      <TwoColumn>
        <Panel title="条件单列表">
          <CursorPager
            page={triggerPageInfo}
            cursor={filters.triggerCursor}
            onNext={() => void load(filters.orderCursor, triggerPageInfo.nextCursor || "", filters.tradeCursor)}
            onReset={() => void load(filters.orderCursor, "", filters.tradeCursor)}
          />
          <DataTable
            rows={triggerOrders}
            columns={["triggerOrderId", "userId", "instrumentId", "ocoGroupId", "side", "positionSide", "triggerType", "priceSource", "triggerPriceTicks", "activationPriceTicks", "callbackRatePpm", "highestPriceTicks", "lowestPriceTicks", "orderType", "quantitySteps", "status", "placedOrderId", "createdAt"]}
            onRowClick={(row) => void loadTimeline(row.triggerOrderId, "TRIGGER")}
          />
        </Panel>
        <Panel title="条件单时间线">
          {triggerTimeline ? <JsonBlock value={triggerTimeline} /> : <Empty text="选择条件单查看触发、执行和拒绝原因" />}
        </Panel>
      </TwoColumn>
      <Panel title="成交审计">
        <CursorPager
          page={tradePageInfo}
          cursor={filters.tradeCursor}
          onNext={() => void load(filters.orderCursor, filters.triggerCursor, tradePageInfo.nextCursor || "")}
          onReset={() => void load(filters.orderCursor, filters.triggerCursor, "")}
        />
        <DataTable
          rows={trades}
          columns={["productLine", "tradeId", "instrumentId", "takerUserId", "makerUserId", "takerSide", "takerPositionSide", "makerPositionSide", "priceTicks", "quantitySteps", "takerOrderId", "makerOrderId", "eventTime"]}
        />
      </Panel>
    </Page>
  );
}

function TradingMetricsOverview({ metrics }: { metrics: UnknownRecord }) {
  const orders = objectValue(metrics.orders);
  const trades = objectValue(metrics.trades);
  const commands = objectValue(metrics.commands);
  const triggerOrders = objectValue(metrics.triggerOrders);
  const positions = objectValue(metrics.positions);
  const symbols = extractRows(metrics.symbols);
  const commandStatuses = extractRows(metrics.commandBreakdown);
  const positionSymbols = extractRows(positions.symbols);
  const warnings = extractRows(metrics.warnings);

  return (
    <div className="stack">
      <p className="muted">产品线 {String(metrics.productLine)} · 采样 {formatDate(metrics.generatedAt)} · 窗口起点 {formatDate(metrics.windowStart)}。账户命令含订单、条件单、算法及余额/持仓设置；批量按一条计，不含网关校验失败。数量按合约分列。</p>
      <div className="metrics">
        <Metric label="已提交下单命令" value={orders.submittedCommands} tone="muted" />
        <Metric label="下单命令拒绝率" value={ppmPercent(orders.rejectRatePpm)} tone={Number(orders.rejectedCommands) > 0 ? "warn" : "ok"} />
        <Metric label="窗口内成交" value={trades.trades} tone="ok" />
        <Metric label="当前未完成委托" value={orders.openOrders} tone={Number(orders.openOrders) > 0 ? "warn" : "muted"} />
        <Metric label="账户命令拒绝率" value={ppmPercent(commands.rejectRatePpm)} tone={Number(commands.rejected) > 0 ? "warn" : "ok"} />
        <Metric label="条件单待触发" value={triggerOrders.pending} tone={Number(triggerOrders.expiredPending) > 0 ? "danger" : "muted"} />
        <Metric label="持仓账户" value={positions.usersWithPositions} tone="muted" />
      </div>
      <TwoColumn>
        <Panel title="合约成交排名">
          <DataTable
            rows={symbols}
            columns={[
              "instrumentId",
              "trades",
              "openOrders",
              "openQuantitySteps",
              "longQuantitySteps",
              "shortQuantitySteps",
              "lastTradePriceTicks",
              "lastTradeAt"
            ]}
          />
        </Panel>
        <Panel title="账户命令状态">
          <DataTable rows={commandStatuses} columns={["commandType", "status", "resultCode", "commands"]} />
        </Panel>
      </TwoColumn>
      <TwoColumn>
        <Panel title="持仓集中度">
          <DataTable
            rows={positionSymbols}
            columns={[
              "instrumentId",
              "openPositions",
              "users",
              "longPositions",
              "shortPositions",
              "longQuantitySteps",
              "shortQuantitySteps"
            ]}
          />
        </Panel>
        <Panel title="交易链路状态">
          <KeyValue data={{
            generatedAt: metrics.generatedAt,
            windowMinutes: metrics.windowMinutes,
            orderCommandAccounts: orders.uniqueUsers,
            uniqueTradeParticipants: trades.uniqueParticipants,
            accountCommands: commands.total,
            commandAccounts: commands.uniqueAccounts,
            rejectedAccountCommands: commands.rejected,
            triggerExpiredPending: triggerOrders.expiredPending,
            asOfLogPosition: metrics.asOfLogPosition,
            dataAgeMs: metrics.dataAgeMs,
            windowStart: metrics.windowStart,
            lastTradeAt: trades.lastTradeAt,
            currentPositionEntries: positions.openPositions
          }} />
        </Panel>
      </TwoColumn>
      {warnings.length > 0 && (
        <Panel title="指标告警">
          <DataTable rows={warnings} columns={["area", "source", "message"]} />
        </Panel>
      )}
    </div>
  );
}
