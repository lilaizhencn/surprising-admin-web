import { assetCode } from "../lib/formValues";
import { useState, useEffect, useRef } from "react";
import { gatewayGet, accountAdjustments, accountAssetValuation, accountAssetSnapshots, alertEvents, gatewayPost, createAccountAssetSnapshot } from "../api/admin";
import { type UnknownRecord } from "../types";
import { positiveInt64, int64String } from "../lib/integers";
import { Search } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, Panel, DataTable, Metric, CursorPager } from "../components/AdminUi";
import { productLineForAccountType, ACCOUNT_TYPES } from "../lib/products";
import { records, errorMessage, objectValue } from "../lib/adminData";
import { accountReadPage, readAccountSections, type AccountRead } from "../lib/accountReads";
import { CREATED_AT_SORTS } from "../lib/queryOptions";

export default function AccountsPage() {
  const [userId, setUserId] = useState("");
  const [accountType, setAccountType] = useState("USDT_PERPETUAL");
  const [asset, setAsset] = useState("USDT");
  const [fundingProductLine, setFundingProductLine] = useState("SPOT");
  const productLine = productLineForAccountType(accountType) || fundingProductLine;
  const [accountRead, setAccountRead] = useState<{ scope: string; sections: Record<string, AccountRead> } | null>(null);
  const [reportRead, setReportRead] = useState<{ scope: string; sections: Record<string, AccountRead> } | null>(null);
  const accountAbort = useRef<AbortController | null>(null);
  const reportAbort = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const [adjust, setAdjust] = useState({ amountUnits: "", referenceId: "", reason: "" });
  const [adjustmentFilters, setAdjustmentFilters] = useState({
    adminUserId: "",
    adjustmentKind: "",
    referenceId: "",
    limit: "100",
    cursor: "",
    sort: "createdAt.desc"
  });
  const [ledgerFilters, setLedgerFilters] = useState({
    limit: "100",
    sort: "createdAt.desc",
    ledgerCursor: "",
    productLedgerCursor: "",
    transferCursor: ""
  });
  const [ledgerPageInfo, setLedgerPageInfo] = useState(cursorInfo());
  const [productLedgerPageInfo, setProductLedgerPageInfo] = useState(cursorInfo());
  const [transferPageInfo, setTransferPageInfo] = useState(cursorInfo());
  const [adjustmentPageInfo, setAdjustmentPageInfo] = useState(cursorInfo());
  const [reportFilters, setReportFilters] = useState({
    valuationAsset: "USDT",
    userId: "",
    accountType: "",
    asset: "",
    snapshotDate: new Date().toISOString().slice(0, 10),
    limit: "100",
    valuationCursor: "",
    valuationSort: "valuationValue.desc",
    snapshotCursor: "",
    snapshotSort: "snapshotDate.desc"
  });
  const [valuationPageInfo, setValuationPageInfo] = useState(cursorInfo());
  const [snapshotPageInfo, setSnapshotPageInfo] = useState(cursorInfo());
  const [accountLoading, setAccountLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [writeLoading, setLoading] = useState(false);
  const loading = accountLoading || reportLoading || writeLoading;
  const accountScope = JSON.stringify([userId, accountType, productLine, asset, ledgerFilters.limit, ledgerFilters.sort, adjustmentFilters.adminUserId, adjustmentFilters.adjustmentKind, adjustmentFilters.referenceId, adjustmentFilters.limit, adjustmentFilters.sort]);
  const reportScope = JSON.stringify([reportFilters.valuationAsset, reportFilters.userId, reportFilters.accountType, reportFilters.asset, reportFilters.snapshotDate, reportFilters.limit, reportFilters.valuationSort, reportFilters.snapshotSort]);
  const accountSections = accountRead?.scope === accountScope ? accountRead.sections : {};
  const reportSections = reportRead?.scope === reportScope ? reportRead.sections : {};
  const data = {
    balances: accountSections.balances?.response?.balances,
    productBalances: accountSections.productBalances?.response?.balances,
    positions: accountSections.positions?.response?.positions,
    ledger: accountSections.ledger?.response?.entries,
    productLedger: accountSections.productLedger?.response?.entries,
    transfers: accountSections.transfers?.response?.transfers,
    adjustments: accountSections.adjustments?.response?.adjustments,
    assetValuation: reportSections.assetValuation?.response,
    assetSnapshots: reportSections.assetSnapshots?.response?.snapshots,
    assetSnapshotAlerts: records(reportSections.assetSnapshotAlerts?.response?.events as UnknownRecord[] | undefined).filter(row => row.metricKey === "ACCOUNT_ASSET_SNAPSHOT_DIFF_PPM")
  };
  function sectionState(key: string, report = false) {
    const sections = report ? reportSections : accountSections;
    const skipped = !report && ["productBalances", "positions", "productLedger", "transfers"].includes(key) && accountType === "FUNDING";
    return {
      loading: (report ? reportLoading : accountLoading) && !skipped,
      error: sections[key]?.error || "",
      emptyText: skipped ? "请选择产品账户查看该产品数据。" : sections[key]?.response ? "暂无数据" : report ? "请查询以加载报表。" : "请输入用户 ID 并查询。"
    };
  }
  const [error, setError] = useState("");

  function resetListCursors() {
    setLedgerFilters((current) => ({
      ...current,
      ledgerCursor: "",
      productLedgerCursor: "",
      transferCursor: ""
    }));
    setAdjustmentFilters((current) => ({ ...current, cursor: "" }));
  }

  function updateLedgerFilters(patch: Partial<typeof ledgerFilters>) {
    setLedgerFilters((current) => ({
      ...current,
      ...patch,
      ledgerCursor: "",
      productLedgerCursor: "",
      transferCursor: ""
    }));
  }

  function updateAdjustmentFilters(patch: Partial<typeof adjustmentFilters>) {
    setAdjustmentFilters((current) => ({
      ...current,
      ...patch,
      cursor: ""
    }));
  }

  function updateReportFilters(patch: Partial<typeof reportFilters>) {
    setReportFilters((current) => ({
      ...current,
      ...patch,
      valuationCursor: "",
      snapshotCursor: ""
    }));
  }

  async function load(nextLedgerCursor = ledgerFilters.ledgerCursor,
                      nextProductLedgerCursor = ledgerFilters.productLedgerCursor,
                      nextTransferCursor = ledgerFilters.transferCursor,
                      nextAdjustmentCursor = adjustmentFilters.cursor) {
    accountAbort.current?.abort();
    const controller = new AbortController();
    accountAbort.current = controller;
    setError("");
    try {
      const owner = positiveInt64(userId, "用户 ID");
      const selectedAsset = asset ? assetCode(asset) : undefined;
      const query = { userId: owner, productLine };
      const list = { ...query, asset: selectedAsset, limit: Number(ledgerFilters.limit) || 100, sort: ledgerFilters.sort };
      setAccountRead(null);
      setAccountLoading(true);
      const reads = {
        balances: { request: gatewayGet("account", "/balances", query, controller.signal), array: "balances" },
        ledger: { request: gatewayGet("account", "/ledger", { ...list, cursor: nextLedgerCursor }, controller.signal), array: "entries" },
        adjustments: { request: accountAdjustments({
          ...query, asset: selectedAsset, adminUserId: adjustmentFilters.adminUserId || undefined,
          adjustmentKind: adjustmentFilters.adjustmentKind || undefined, referenceId: adjustmentFilters.referenceId || undefined,
          limit: Number(adjustmentFilters.limit) || 100, cursor: nextAdjustmentCursor, sort: adjustmentFilters.sort,
          ...(adjustmentFilters.adjustmentKind === "PRODUCT" ? { accountType } : {})
        }, controller.signal), array: "adjustments" },
        ...(accountType !== "FUNDING" ? {
          productBalances: { request: gatewayGet("account", "/product-balances", { ...query, accountType }, controller.signal), array: "balances" },
          positions: { request: gatewayGet("account", "/positions", query, controller.signal), array: "positions" },
          productLedger: { request: gatewayGet("account", "/product-ledger", { ...list, accountType, cursor: nextProductLedgerCursor }, controller.signal), array: "entries" },
          transfers: { request: gatewayGet("account", "/transfers", { ...list, accountType, cursor: nextTransferCursor }, controller.signal), array: "transfers" }
        } : {})
      };
      const sections = await readAccountSections(Object.fromEntries(Object.entries(reads).map(([key, read]) => [key, { ...read, expected: { userId: owner, productLine } }])));
      if (controller.signal.aborted) return;
      setAccountRead({ scope: accountScope, sections });
      setLedgerPageInfo(accountReadPage(sections.ledger));
      setProductLedgerPageInfo(accountReadPage(sections.productLedger));
      setTransferPageInfo(accountReadPage(sections.transfers));
      setAdjustmentPageInfo(accountReadPage(sections.adjustments));
      setLedgerFilters(current => ({ ...current, ledgerCursor: nextLedgerCursor, productLedgerCursor: nextProductLedgerCursor, transferCursor: nextTransferCursor }));
      setAdjustmentFilters(current => ({ ...current, cursor: nextAdjustmentCursor }));
    } catch (err) { if (!controller.signal.aborted) setError(errorMessage(err)); }
    finally { if (!controller.signal.aborted) setAccountLoading(false); }
  }

  async function loadReports(nextValuationCursor = reportFilters.valuationCursor, nextSnapshotCursor = reportFilters.snapshotCursor) {
    reportAbort.current?.abort();
    const controller = new AbortController();
    reportAbort.current = controller;
    setReportLoading(true);
    setReportRead(null);
    const common = {
      valuationAsset: reportFilters.valuationAsset || "USDT", accountType: reportFilters.accountType || undefined,
      asset: reportFilters.asset || undefined, limit: Number(reportFilters.limit) || 100
    };
    const sections = await readAccountSections({
      assetValuation: { request: accountAssetValuation({ ...common, userId: reportFilters.userId || undefined, nonZeroOnly: "true", cursor: nextValuationCursor, sort: reportFilters.valuationSort }, controller.signal), array: "rows", optionalArrays: ["warnings"] },
      assetSnapshots: { request: accountAssetSnapshots({ ...common, snapshotDate: reportFilters.snapshotDate || undefined, cursor: nextSnapshotCursor, sort: reportFilters.snapshotSort }, controller.signal), array: "snapshots" },
      assetSnapshotAlerts: { request: alertEvents({ status: "OPEN", domain: "SYSTEM", limit: 100 }, controller.signal), array: "events" }
    });
    if (controller.signal.aborted) return;
    setReportRead({ scope: reportScope, sections });
    setValuationPageInfo(accountReadPage(sections.assetValuation));
    setSnapshotPageInfo(accountReadPage(sections.assetSnapshots));
    setReportFilters(current => ({ ...current, valuationCursor: nextValuationCursor, snapshotCursor: nextSnapshotCursor }));
    setReportLoading(false);
  }

  async function refresh() {
    await Promise.all([userId.trim() ? load() : Promise.resolve(), loadReports()]);
  }

  async function adjustBalance(product: boolean) {
    if (writing.current) return;
    writing.current = true;
    setLoading(true); setError("");
    try {
      const body = {
        userId: positiveInt64(userId, "用户 ID"),
        ...(product ? { accountType } : {}),
        asset: assetCode(asset),
        amountUnits: int64String(adjust.amountUnits, "调整金额"),
        referenceId: adjust.referenceId.trim(),
        reason: adjust.reason.trim()
      };
      if (!body.referenceId || !body.reason) throw new Error("请填写唯一业务编号和调整原因。");
      if (product && !productLineForAccountType(accountType)) throw new Error("请选择产品账户类型。");
      if (!window.confirm(`确认调整用户 ${body.userId} 的 ${productLine} / ${product ? accountType : "基础账户"} ${body.asset} 余额 ${body.amountUnits} 最小单位？`)) return;
      await gatewayPost("account", product ? "/product-balance-adjustments" : "/balance-adjustments", body, productLine ? { productLine } : {});
      setAdjust({ amountUnits: "", referenceId: "", reason: "" });
      await Promise.all([load("", "", "", ""), loadReports("", "")]);
    } catch (err) { setError(errorMessage(err)); }
    finally { writing.current = false; setLoading(false); }
  }

  async function generateAssetSnapshot() {
    if (writing.current) return;
    writing.current = true;
    setLoading(true);
    setError("");
    try {
      await createAccountAssetSnapshot({
        valuationAsset: reportFilters.valuationAsset || "USDT",
        snapshotDate: reportFilters.snapshotDate || undefined
      });
      await loadReports("", "");
    } catch (err) {
      setError(errorMessage(err));
    } finally { writing.current = false; setLoading(false); }
  }

  useEffect(() => { accountAbort.current?.abort(); setAccountLoading(false); return () => accountAbort.current?.abort(); }, [accountScope]);
  useEffect(() => { reportAbort.current?.abort(); setReportLoading(false); return () => reportAbort.current?.abort(); }, [reportScope]);
  useEffect(() => { setAdjust({ amountUnits: "", referenceId: "", reason: "" }); }, [userId, accountType, asset, productLine]);
  useEffect(() => { void loadReports(); return () => { accountAbort.current?.abort(); reportAbort.current?.abort(); }; }, []);

  const valuationRows = records(data?.assetValuation?.rows as UnknownRecord[] | undefined);
  const valuationTotals = objectValue(data?.assetValuation?.totals);
  const valuationWarnings = records(data?.assetValuation?.warnings as UnknownRecord[] | undefined);
  const snapshotAlerts = records(data?.assetSnapshotAlerts);

  return (
    <Page title="账户资产" onRefresh={refresh} description="按用户与产品线核对余额、流水和人工调整；全局估值报表独立查询。" loading={loading} error={error}>
      <fieldset className="account-fields" disabled={writeLoading}>
      <div className="filters">
        <TextFilter label="User ID" value={userId} onChange={(value) => { setUserId(value); resetListCursors(); }} />
        <label>账户类型<select aria-label="账户类型" value={accountType} onChange={(event) => { setAccountType(event.target.value); resetListCursors(); }}>{ACCOUNT_TYPES.filter(Boolean).map((item) => <option key={item}>{item}</option>)}</select></label>
        {accountType === "FUNDING" && <label>资金账户产品线<select aria-label="资金账户产品线" value={fundingProductLine} onChange={event => { setFundingProductLine(event.target.value); resetListCursors(); }}>{["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"].map(line => <option key={line}>{line}</option>)}</select></label>}
        <TextFilter label="Asset" value={asset} onChange={(value) => { setAsset(value.toUpperCase()); resetListCursors(); }} />
        <TextFilter label="流水 Limit" value={ledgerFilters.limit} onChange={(value) => updateLedgerFilters({ limit: value })} />
        <SortSelect label="流水排序" value={ledgerFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => updateLedgerFilters({ sort: value })} />
        <button onClick={() => void load("", "", "", "")}><Search size={16} />查询</button>
      </div>
      <p className="muted">当前产品线：{productLine}。基础余额与流水也按此产品线查询。</p>
      <div className="three-grid">
        <Panel title="基础余额"><DataTable {...sectionState("balances")} rows={records(data?.balances as UnknownRecord[] | undefined)} /></Panel>
        <Panel title="产品余额"><DataTable {...sectionState("productBalances")} rows={records(data?.productBalances as UnknownRecord[] | undefined)} /></Panel>
        <Panel title="持仓"><DataTable {...sectionState("positions")} rows={records(data?.positions as UnknownRecord[] | undefined)} maxColumns={8} /></Panel>
      </div>
      <Panel title="资产估值报表">
        <div className="filters">
          <TextFilter
            label="计价资产"
            value={reportFilters.valuationAsset}
            onChange={(value) => updateReportFilters({ valuationAsset: value.toUpperCase() })}
          />
          <TextFilter
            label="User ID"
            value={reportFilters.userId}
            onChange={(value) => updateReportFilters({ userId: value })}
          />
          <label>账户类型
            <select
              value={reportFilters.accountType}
              onChange={(event) => updateReportFilters({ accountType: event.target.value })}
            >
              {["", "BASIC", ...ACCOUNT_TYPES.filter(Boolean)].map((item) => <option key={item || "ALL"} value={item}>{item || "全部"}</option>)}
            </select>
          </label>
          <TextFilter
            label="Asset"
            value={reportFilters.asset}
            onChange={(value) => updateReportFilters({ asset: value.toUpperCase() })}
          />
          <TextFilter
            label="快照日期"
            value={reportFilters.snapshotDate}
            onChange={(value) => updateReportFilters({ snapshotDate: value })}
          />
          <TextFilter
            label="Limit"
            value={reportFilters.limit}
            onChange={(value) => updateReportFilters({ limit: value })}
          />
          <SortSelect
            label="估值排序"
            value={reportFilters.valuationSort}
            options={ACCOUNT_VALUATION_SORTS}
            onChange={(value) => updateReportFilters({ valuationSort: value })}
          />
          <SortSelect
            label="快照排序"
            value={reportFilters.snapshotSort}
            options={ACCOUNT_SNAPSHOT_SORTS}
            onChange={(value) => updateReportFilters({ snapshotSort: value })}
          />
          <button onClick={() => void loadReports("", "")}><Search size={16} />查询</button>
          <button className="primary" onClick={() => void generateAssetSnapshot()}>生成快照</button>
        </div>
        <div className="metrics">
          <Metric label="估值合计" value={valuationTotals.totalValue ?? "—"} tone={valuationTotals.totalValue == null ? "muted" : "ok"} />
          <Metric label="账户行" value={valuationTotals.rows ?? "—"} tone="muted" />
          <Metric label="用户数" value={valuationTotals.uniqueUsers ?? "—"} tone="muted" />
          <Metric label="已计价" value={valuationTotals.pricedRows ?? "—"} tone={valuationTotals.pricedRows == null ? "muted" : "ok"} />
          <Metric label="缺汇率" value={valuationTotals.missingRateRows ?? "—"} tone={valuationTotals.missingRateRows == null ? "muted" : Number(valuationTotals.missingRateRows) > 0 ? "warn" : "ok"} />
          <Metric label="快照差异告警" value={reportSections.assetSnapshotAlerts?.response ? snapshotAlerts.length : "—"} tone={!reportSections.assetSnapshotAlerts?.response ? "muted" : snapshotAlerts.length ? "danger" : "ok"} />
        </div>
        {valuationWarnings.length > 0 && (
          <DataTable rows={valuationWarnings} columns={["area", "message"]} />
        )}
        <CursorPager
          loading={loading}
          page={valuationPageInfo}
          cursor={reportFilters.valuationCursor}
          onNext={() => void loadReports(valuationPageInfo.nextCursor || "", reportFilters.snapshotCursor)}
          onReset={() => void loadReports("", reportFilters.snapshotCursor)}
        />
        <DataTable
          {...sectionState("assetValuation", true)} rows={valuationRows}
          columns={[
            "accountType",
            "userId",
            "asset",
            "availableUnits",
            "lockedUnits",
            "equityUnits",
            "scaleUnits",
            "valuationRate",
            "valuationValue",
            "valuationSource",
            "rateUpdatedAt",
            "balanceUpdatedAt"
          ]}
          maxColumns={12}
        />
      </Panel>
      <Panel title="日终资产快照">
        {reportSections.assetSnapshotAlerts?.error && <div className="alert danger" role="alert">快照告警读取失败：{reportSections.assetSnapshotAlerts.error}</div>}
        {snapshotAlerts.length > 0 && (
          <DataTable
            rows={snapshotAlerts}
            columns={["severity", "target", "currentValue", "thresholdValue", "message", "lastSeenAt", "occurrences"]}
          />
        )}
        <CursorPager
          loading={loading}
          page={snapshotPageInfo}
          cursor={reportFilters.snapshotCursor}
          onNext={() => void loadReports(reportFilters.valuationCursor, snapshotPageInfo.nextCursor || "")}
          onReset={() => void loadReports(reportFilters.valuationCursor, "")}
        />
        <DataTable
          {...sectionState("assetSnapshots", true)} rows={records(data?.assetSnapshots as UnknownRecord[] | undefined)}
          columns={[
            "snapshotDate",
            "valuationAsset",
            "accountType",
            "asset",
            "totalAvailableUnits",
            "totalLockedUnits",
            "totalEquityUnits",
            "valuationRate",
            "totalValue",
            "valuationSource",
            "userCount",
            "createdAt"
          ]}
          maxColumns={12}
        />
      </Panel>
      <Panel title="人工调整">
        <div className="filters">
          <label>金额 Units<input value={adjust.amountUnits} onChange={(event) => setAdjust({ ...adjust, amountUnits: event.target.value })} /></label>
          <label>Reference ID<input value={adjust.referenceId} onChange={(event) => setAdjust({ ...adjust, referenceId: event.target.value })} /></label>
          <label>原因<input value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} /></label>
          <button disabled={loading} onClick={() => void adjustBalance(false)}>调整基础余额</button>
          <button className="primary" disabled={loading} onClick={() => void adjustBalance(true)}>调整产品余额</button>
        </div>
      </Panel>
      <Panel title="人工调整追溯">
        <div className="filters">
          <label>类型
            <select
              value={adjustmentFilters.adjustmentKind}
              onChange={(event) => updateAdjustmentFilters({ adjustmentKind: event.target.value })}
            >
              <option value="">全部</option>
              <option value="BASIC">BASIC</option>
              <option value="PRODUCT">PRODUCT</option>
            </select>
          </label>
          <TextFilter
            label="管理员 ID"
            value={adjustmentFilters.adminUserId}
            onChange={(value) => updateAdjustmentFilters({ adminUserId: value })}
          />
          <TextFilter
            label="Reference ID"
            value={adjustmentFilters.referenceId}
            onChange={(value) => updateAdjustmentFilters({ referenceId: value })}
          />
          <TextFilter
            label="Limit"
            value={adjustmentFilters.limit}
            onChange={(value) => updateAdjustmentFilters({ limit: value })}
          />
          <SortSelect label="排序" value={adjustmentFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => updateAdjustmentFilters({ sort: value })} />
          <button onClick={() => void load(ledgerFilters.ledgerCursor, ledgerFilters.productLedgerCursor, ledgerFilters.transferCursor, "")}><Search size={16} />查询</button>
        </div>
        <CursorPager
          loading={loading}
          page={adjustmentPageInfo}
          cursor={adjustmentFilters.cursor}
          onNext={() => void load(
            ledgerFilters.ledgerCursor,
            ledgerFilters.productLedgerCursor,
            ledgerFilters.transferCursor,
            adjustmentPageInfo.nextCursor || ""
          )}
          onReset={() => void load(ledgerFilters.ledgerCursor, ledgerFilters.productLedgerCursor, ledgerFilters.transferCursor, "")}
        />
        <DataTable
          {...sectionState("adjustments")} rows={records(data?.adjustments as UnknownRecord[] | undefined)}
          columns={[
            "adjustmentId",
            "adjustmentKind",
            "adminUserId",
            "adminUsername",
            "userId",
            "accountType",
            "asset",
            "amountUnits",
            "balanceAfterUnits",
            "referenceId",
            "reason",
            "createdAt"
          ]}
          maxColumns={12}
        />
      </Panel>
      <div className="three-grid">
        <Panel title="基础流水">
          <CursorPager
            loading={loading}
            page={ledgerPageInfo}
            cursor={ledgerFilters.ledgerCursor}
            onNext={() => void load(ledgerPageInfo.nextCursor || "", ledgerFilters.productLedgerCursor, ledgerFilters.transferCursor, adjustmentFilters.cursor)}
            onReset={() => void load("", ledgerFilters.productLedgerCursor, ledgerFilters.transferCursor, adjustmentFilters.cursor)}
          />
          <DataTable {...sectionState("ledger")} rows={records(data?.ledger as UnknownRecord[] | undefined)} maxColumns={9} />
        </Panel>
        <Panel title="产品流水">
          <CursorPager
            loading={loading}
            page={productLedgerPageInfo}
            cursor={ledgerFilters.productLedgerCursor}
            onNext={() => void load(ledgerFilters.ledgerCursor, productLedgerPageInfo.nextCursor || "", ledgerFilters.transferCursor, adjustmentFilters.cursor)}
            onReset={() => void load(ledgerFilters.ledgerCursor, "", ledgerFilters.transferCursor, adjustmentFilters.cursor)}
          />
          <DataTable {...sectionState("productLedger")} rows={records(data?.productLedger as UnknownRecord[] | undefined)} maxColumns={9} />
        </Panel>
        <Panel title="划转记录">
          <CursorPager
            loading={loading}
            page={transferPageInfo}
            cursor={ledgerFilters.transferCursor}
            onNext={() => void load(ledgerFilters.ledgerCursor, ledgerFilters.productLedgerCursor, transferPageInfo.nextCursor || "", adjustmentFilters.cursor)}
            onReset={() => void load(ledgerFilters.ledgerCursor, ledgerFilters.productLedgerCursor, "", adjustmentFilters.cursor)}
          />
          <DataTable {...sectionState("transfers")} rows={records(data?.transfers as UnknownRecord[] | undefined)} maxColumns={9} />
        </Panel>
      </div>
      </fieldset>
    </Page>
  );
}

const ACCOUNT_VALUATION_SORTS = ["valuationValue.desc", "valuationValue.asc"];

const ACCOUNT_SNAPSHOT_SORTS = ["snapshotDate.desc", "snapshotDate.asc"];
