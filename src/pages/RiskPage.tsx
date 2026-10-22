import { safeInteger } from "../lib/integers";
import { useState, useEffect } from "react";
import { type UnknownRecord } from "../types";
import { gatewayGet, gatewayPost } from "../api/admin";
import { Search } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, TwoColumn, Panel, DataTable, CursorPager, KeyValue } from "../components/AdminUi";
import { ADL_QUEUE_SORT, EVENT_TIME_SORTS, CREATED_AT_SORTS } from "../lib/queryOptions";
import { errorMessage, records, objectValue } from "../lib/adminData";
import { PRODUCT_LINES } from "../lib/products";
import { RuntimeConfigPanel } from "../components/RuntimeConfigPanel";

export default function RiskPage() {
  const [asset, setAsset] = useState("USDT");
  const [userId, setUserId] = useState("");
  const [listFilters, setListFilters] = useState({
    productLine: "LINEAR_PERPETUAL",
    limit: "100",
    candidateSort: "eventTime.asc",
    highRiskSort: "eventTime.desc",
    liquidationSort: "createdAt.desc",
    adlEventSort: "createdAt.desc",
    candidateCursor: "",
    highRiskCursor: "",
    liquidationCursor: "",
    adlQueueCursor: "",
    adlEventCursor: ""
  });
  const [candidatePageInfo, setCandidatePageInfo] = useState(cursorInfo());
  const [highRiskPageInfo, setHighRiskPageInfo] = useState(cursorInfo());
  const [liquidationPageInfo, setLiquidationPageInfo] = useState(cursorInfo());
  const [adlQueuePageInfo, setAdlQueuePageInfo] = useState(cursorInfo());
  const [adlEventPageInfo, setAdlEventPageInfo] = useState(cursorInfo());
  const [data, setData] = useState<RiskData | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<UnknownRecord | null>(null);
  const [timeline, setTimeline] = useState<UnknownRecord | null>(null);
  const [riskRuleForm, setRiskRuleForm] = useState({
    warningMarginRatioPpm: "",
    liquidationMarginRatioPpm: "",
    scanDelayMs: "",
    scanBatchSize: "",
    scanEnabled: true,
    reason: ""
  });
  const [cancelCandidateReason, setCancelCandidateReason] = useState("Manual liquidation candidate cancel");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function resetRiskCursors() {
    setListFilters((current) => ({
      ...current,
      candidateCursor: "",
      highRiskCursor: "",
      liquidationCursor: "",
      adlQueueCursor: "",
      adlEventCursor: ""
    }));
  }

  function updateRiskFilters(patch: Partial<typeof listFilters>) {
    setListFilters((current) => ({
      ...current,
      ...patch,
      candidateCursor: "",
      highRiskCursor: "",
      liquidationCursor: "",
      adlQueueCursor: "",
      adlEventCursor: ""
    }));
  }

  async function load(
    nextCandidateCursor = listFilters.candidateCursor,
    nextHighRiskCursor = listFilters.highRiskCursor,
    nextLiquidationCursor = listFilters.liquidationCursor,
    nextAdlQueueCursor = listFilters.adlQueueCursor,
    nextAdlEventCursor = listFilters.adlEventCursor
  ) {
    setLoading(true);
    setError("");
    try {
      const limit = Number(listFilters.limit) || 100;
      const [candidates, liquidations, adlQueue, adlEvents, rules, highRisk] = await Promise.all([
        gatewayGet<{ candidates?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("risk-admin", "/liquidation-candidates", {
          status: "NEW",
          productLine: listFilters.productLine,
          limit,
          cursor: nextCandidateCursor,
          sort: listFilters.candidateSort
        }),
        gatewayGet<{ orders?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("liquidation-admin", "/orders", {
          userId,
          productLine: listFilters.productLine,
          limit,
          cursor: nextLiquidationCursor,
          sort: listFilters.liquidationSort
        }),
        gatewayGet<{ positions?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("adl", "/admin/queue", {
          asset,
          productLine: listFilters.productLine,
          limit,
          cursor: nextAdlQueueCursor,
          sort: ADL_QUEUE_SORT
        }),
        gatewayGet<{ events?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("adl", "/admin/events", {
          userId,
          asset,
          productLine: listFilters.productLine,
          limit,
          cursor: nextAdlEventCursor,
          sort: listFilters.adlEventSort
        }),
        gatewayGet<{ rules?: UnknownRecord[]; items?: UnknownRecord[] }>("risk-admin", "/rules", { productLine: listFilters.productLine }),
        gatewayGet<{ accounts?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("risk-admin", "/high-risk-accounts", {
          productLine: listFilters.productLine,
          limit,
          cursor: nextHighRiskCursor,
          sort: listFilters.highRiskSort
        })
      ]);
      const ruleRows = rules.rules ?? rules.items ?? [];
      setData({
        candidates: candidates.candidates ?? candidates.items ?? [],
        liquidations: liquidations.orders ?? liquidations.items ?? [],
        adlQueue: adlQueue.positions ?? adlQueue.items ?? [],
        adlEvents: adlEvents.events ?? adlEvents.items ?? [],
        riskRules: ruleRows,
        highRiskAccounts: highRisk.accounts ?? highRisk.items ?? []
      });
      setCandidatePageInfo(cursorInfo(candidates));
      setHighRiskPageInfo(cursorInfo(highRisk));
      setLiquidationPageInfo(cursorInfo(liquidations));
      setAdlQueuePageInfo(cursorInfo(adlQueue));
      setAdlEventPageInfo(cursorInfo(adlEvents));
      setListFilters((current) => ({
        ...current,
        candidateCursor: nextCandidateCursor,
        highRiskCursor: nextHighRiskCursor,
        liquidationCursor: nextLiquidationCursor,
        adlQueueCursor: nextAdlQueueCursor,
        adlEventCursor: nextAdlEventCursor
      }));
      setRiskRuleForm((current) => {
        if (current.warningMarginRatioPpm || current.liquidationMarginRatioPpm || current.scanDelayMs || current.scanBatchSize) {
          return current;
        }
        const marginRule = ruleRows.find((row) => row.ruleCode === "GLOBAL_MARGIN_POLICY");
        const scanRule = ruleRows.find((row) => row.ruleCode === "RISK_SCAN_CONTROL");
        return {
          warningMarginRatioPpm: String(marginRule?.warningMarginRatioPpm ?? ""),
          liquidationMarginRatioPpm: String(marginRule?.liquidationMarginRatioPpm ?? ""),
          scanDelayMs: String(scanRule?.scanDelayMs ?? ""),
          scanBatchSize: String(scanRule?.scanBatchSize ?? ""),
          scanEnabled: Boolean(scanRule?.enabled ?? true),
          reason: current.reason
        };
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeline(candidate: UnknownRecord) {
    const candidateId = candidate.candidateId;
    if (candidateId === undefined || candidateId === null) return;
    setSelectedCandidate(candidate);
    setLoading(true);
    setError("");
    try {
      const response = await gatewayGet<UnknownRecord>(
        "liquidation-admin",
        `/candidates/${encodeURIComponent(String(candidateId))}/timeline`,
        { limit: 200, productLine: listFilters.productLine }
      );
      setTimeline(response);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function cancelCandidate() {
    const candidateId = selectedCandidate?.candidateId ?? timeline?.candidateId;
    if (candidateId === undefined || candidateId === null) {
      setError("请选择爆仓候选。");
      return;
    }
    const reason = cancelCandidateReason.trim();
    if (!reason) {
      setError("请输入取消强平候选原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await gatewayPost(
        "liquidation-admin",
        `/candidates/${encodeURIComponent(String(candidateId))}/cancel`,
        { reason },
        { productLine: listFilters.productLine }
      );
      await load();
      await loadTimeline({ candidateId });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function updateMarginRule() {
    setLoading(true);
    setError("");
    try {
      const warning = safeInteger(riskRuleForm.warningMarginRatioPpm, "warningMarginRatioPpm");
      const liquidation = safeInteger(riskRuleForm.liquidationMarginRatioPpm, "liquidationMarginRatioPpm");
      const reason = riskRuleForm.reason.trim();
      if (!reason) {
        throw new Error("请输入风控规则变更原因。");
      }
      await gatewayPost("risk-admin", "/rules/GLOBAL_MARGIN_POLICY", {
        ruleName: "Global margin thresholds",
        enabled: true,
        warningMarginRatioPpm: warning,
        liquidationMarginRatioPpm: liquidation,
        reason
      }, { productLine: listFilters.productLine });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function updateScanRule() {
    setLoading(true);
    setError("");
    try {
      const scanDelayMs = safeInteger(riskRuleForm.scanDelayMs, "scanDelayMs");
      const scanBatchSize = safeInteger(riskRuleForm.scanBatchSize, "scanBatchSize");
      const reason = riskRuleForm.reason.trim();
      if (!reason) {
        throw new Error("请输入风控规则变更原因。");
      }
      await gatewayPost("risk-admin", "/rules/RISK_SCAN_CONTROL", {
        ruleName: "Risk scan control",
        enabled: riskRuleForm.scanEnabled,
        scanDelayMs,
        scanBatchSize,
        reason
      }, { productLine: listFilters.productLine });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const timelineRows = records(timeline?.timeline as UnknownRecord[] | undefined);

  return (
    <Page title="风控强平" onRefresh={() => load()} loading={loading} error={error}>
      <div className="filters">
        <label>产品线<select value={listFilters.productLine} onChange={(event) => updateRiskFilters({ productLine: event.target.value })}>{PRODUCT_LINES.map((item) => <option key={item} value={item}>{item || "全部"}</option>)}</select></label>
        <TextFilter label="Asset" value={asset} onChange={(value) => { setAsset(value.toUpperCase()); resetRiskCursors(); }} />
        <TextFilter label="User ID" value={userId} onChange={(value) => { setUserId(value); resetRiskCursors(); }} />
        <TextFilter label="Limit" value={listFilters.limit} onChange={(value) => updateRiskFilters({ limit: value })} />
        <SortSelect label="候选排序" value={listFilters.candidateSort} options={EVENT_TIME_SORTS} onChange={(value) => updateRiskFilters({ candidateSort: value })} />
        <SortSelect label="账户排序" value={listFilters.highRiskSort} options={EVENT_TIME_SORTS} onChange={(value) => updateRiskFilters({ highRiskSort: value })} />
        <SortSelect label="订单排序" value={listFilters.liquidationSort} options={CREATED_AT_SORTS} onChange={(value) => updateRiskFilters({ liquidationSort: value })} />
        <SortSelect label="ADL 事件排序" value={listFilters.adlEventSort} options={CREATED_AT_SORTS} onChange={(value) => updateRiskFilters({ adlEventSort: value })} />
        <button onClick={() => { resetRiskCursors(); void load("", "", "", "", ""); }}><Search size={16} />查询</button>
      </div>
      <TwoColumn>
        <Panel title="高风险账户">
          <div className="stack">
            <DataTable
              rows={records(data?.highRiskAccounts)}
              columns={["riskLevel", "userId", "settleAsset", "status", "marginRatioPpm", "equityUnits", "maintenanceMarginUnits", "activeCandidateCount", "topSymbol", "topPositionMarginRatioPpm", "eventTime"]}
            />
            <CursorPager
              page={highRiskPageInfo}
              cursor={listFilters.highRiskCursor}
              onNext={() => void load(listFilters.candidateCursor, highRiskPageInfo.nextCursor, listFilters.liquidationCursor, listFilters.adlQueueCursor, listFilters.adlEventCursor)}
              onReset={() => void load(listFilters.candidateCursor, "", listFilters.liquidationCursor, listFilters.adlQueueCursor, listFilters.adlEventCursor)}
            />
          </div>
        </Panel>
        <Panel title="风控规则">
          <div className="stack">
            <DataTable
              rows={records(data?.riskRules)}
              columns={["ruleCode", "ruleType", "enabled", "warningMarginRatioPpm", "liquidationMarginRatioPpm", "scanDelayMs", "scanBatchSize", "source", "updatedAt"]}
            />
            <div className="filters">
              <TextFilter label="Warning PPM" value={riskRuleForm.warningMarginRatioPpm} onChange={(value) => setRiskRuleForm((current) => ({ ...current, warningMarginRatioPpm: value }))} />
              <TextFilter label="Liquidation PPM" value={riskRuleForm.liquidationMarginRatioPpm} onChange={(value) => setRiskRuleForm((current) => ({ ...current, liquidationMarginRatioPpm: value }))} />
              <button className="primary" onClick={() => void updateMarginRule()}>更新阈值</button>
            </div>
            <div className="filters">
              <label className="toggle"><input type="checkbox" checked={riskRuleForm.scanEnabled} onChange={(event) => setRiskRuleForm((current) => ({ ...current, scanEnabled: event.target.checked }))} />扫描启用</label>
              <TextFilter label="Scan Delay MS" value={riskRuleForm.scanDelayMs} onChange={(value) => setRiskRuleForm((current) => ({ ...current, scanDelayMs: value }))} />
              <TextFilter label="Batch Size" value={riskRuleForm.scanBatchSize} onChange={(value) => setRiskRuleForm((current) => ({ ...current, scanBatchSize: value }))} />
              <button className="primary" onClick={() => void updateScanRule()}>更新扫描</button>
            </div>
            <TextFilter label="Reason" value={riskRuleForm.reason} onChange={(value) => setRiskRuleForm((current) => ({ ...current, reason: value }))} />
          </div>
        </Panel>
      </TwoColumn>
      <div className="two-grid">
        <Panel title="爆仓候选">
          <div className="stack">
            <DataTable
              rows={records(data?.candidates)}
              maxColumns={10}
              onRowClick={(row) => void loadTimeline(row)}
            />
            <CursorPager
              page={candidatePageInfo}
              cursor={listFilters.candidateCursor}
              onNext={() => void load(candidatePageInfo.nextCursor, listFilters.highRiskCursor, listFilters.liquidationCursor, listFilters.adlQueueCursor, listFilters.adlEventCursor)}
              onReset={() => void load("", listFilters.highRiskCursor, listFilters.liquidationCursor, listFilters.adlQueueCursor, listFilters.adlEventCursor)}
            />
          </div>
        </Panel>
        <Panel title="强平订单">
          <div className="stack">
            <DataTable rows={records(data?.liquidations)} maxColumns={10} />
            <CursorPager
              page={liquidationPageInfo}
              cursor={listFilters.liquidationCursor}
              onNext={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, liquidationPageInfo.nextCursor, listFilters.adlQueueCursor, listFilters.adlEventCursor)}
              onReset={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, "", listFilters.adlQueueCursor, listFilters.adlEventCursor)}
            />
          </div>
        </Panel>
        <Panel title="ADL 队列">
          <div className="stack">
            <DataTable rows={records(data?.adlQueue)} maxColumns={10} />
            <CursorPager
              page={adlQueuePageInfo}
              cursor={listFilters.adlQueueCursor}
              onNext={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, listFilters.liquidationCursor, adlQueuePageInfo.nextCursor, listFilters.adlEventCursor)}
              onReset={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, listFilters.liquidationCursor, "", listFilters.adlEventCursor)}
            />
          </div>
        </Panel>
        <Panel title="ADL 事件">
          <div className="stack">
            <DataTable rows={records(data?.adlEvents)} maxColumns={10} />
            <CursorPager
              page={adlEventPageInfo}
              cursor={listFilters.adlEventCursor}
              onNext={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, listFilters.liquidationCursor, listFilters.adlQueueCursor, adlEventPageInfo.nextCursor)}
              onReset={() => void load(listFilters.candidateCursor, listFilters.highRiskCursor, listFilters.liquidationCursor, listFilters.adlQueueCursor, "")}
            />
          </div>
        </Panel>
      </div>
      <TwoColumn>
        <Panel title="强平时间线">
          <div className="stack">
            <div className="button-row">
              <TextFilter label="取消原因" value={cancelCandidateReason} onChange={setCancelCandidateReason} />
              <button onClick={() => selectedCandidate && void loadTimeline(selectedCandidate)} disabled={!selectedCandidate}><Search size={16} />刷新时间线</button>
              <button className="danger" onClick={() => void cancelCandidate()} disabled={!selectedCandidate && !timeline}>取消候选</button>
            </div>
            <DataTable rows={timelineRows} columns={["eventTime", "source", "eventType", "subject", "summary"]} />
          </div>
        </Panel>
        <Panel title="时间线详情">
          <KeyValue data={objectValue(timeline?.candidate)} />
          {records(timeline?.orders as UnknownRecord[] | undefined).length > 0 && (
            <DataTable rows={records(timeline?.orders as UnknownRecord[] | undefined)} maxColumns={8} />
          )}
        </Panel>
      </TwoColumn>
      <div className="three-grid">
        <RuntimeConfigPanel key={`risk-${listFilters.productLine}`} title="风控运行时配置" service="risk" path="/admin/runtime-config" template={{ calculationEnabled: false, coordinationEnabled: false }} productLine={listFilters.productLine} />
        <RuntimeConfigPanel key={`liquidation-${listFilters.productLine}`} title="强平运行时配置" service="liquidation" path="/admin/runtime-config" template={{ executionEnabled: false }} productLine={listFilters.productLine} />
        <RuntimeConfigPanel key={`adl-${listFilters.productLine}`} title="ADL 运行时配置" service="adl" path="/admin/runtime-config" template={{ scannerEnabled: false }} productLine={listFilters.productLine} />
      </div>
    </Page>
  );
}

interface RiskData {
  highRiskAccounts: UnknownRecord[];
  riskRules: UnknownRecord[];
  candidates: UnknownRecord[];
  liquidations: UnknownRecord[];
  adlQueue: UnknownRecord[];
  adlEvents: UnknownRecord[];
}
