import { assetCode } from "../lib/formValues";
import { useState, useEffect } from "react";
import { gatewayGet, accountAdjustments, accountAssetValuation, accountAssetSnapshots, alertEvents, gatewayPost, createAccountAssetSnapshot } from "../api/admin";
import { type BalanceRecord, type PositionRecord, type UnknownRecord } from "../types";
import { positiveInt64, int64String } from "../lib/integers";
import { Search } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, Panel, DataTable, Metric, CursorPager } from "../components/AdminUi";
import { productLineForAccountType, ACCOUNT_TYPES } from "../lib/products";
import { records, errorMessage, objectValue } from "../lib/adminData";
import { CREATED_AT_SORTS } from "../lib/queryOptions";

export default function AccountsPage() {
  const [userId, setUserId] = useState("1001");
  const [accountType, setAccountType] = useState("USDT_PERPETUAL");
  const [asset, setAsset] = useState("USDT");
  const [data, setData] = useState<AccountData | null>(null);
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
  const [loading, setLoading] = useState(false);
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
                      nextAdjustmentCursor = adjustmentFilters.cursor,
                      nextValuationCursor = reportFilters.valuationCursor,
                      nextSnapshotCursor = reportFilters.snapshotCursor) {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const productLine = productLineForAccountType(accountType);
      const adjustmentParams = {
        userId,
        asset,
        adminUserId: adjustmentFilters.adminUserId || undefined,
        adjustmentKind: adjustmentFilters.adjustmentKind || undefined,
        referenceId: adjustmentFilters.referenceId || undefined,
        limit: Number(adjustmentFilters.limit) || 100,
        cursor: nextAdjustmentCursor,
        sort: adjustmentFilters.sort,
        ...(adjustmentFilters.adjustmentKind === "PRODUCT" ? { accountType, productLine } : {})
      };
      const reportParams = {
        valuationAsset: reportFilters.valuationAsset || "USDT",
        userId: reportFilters.userId || undefined,
        accountType: reportFilters.accountType || undefined,
        asset: reportFilters.asset || undefined,
        nonZeroOnly: "true",
        limit: Number(reportFilters.limit) || 100,
        cursor: nextValuationCursor,
        sort: reportFilters.valuationSort
      };
      const snapshotParams = {
        snapshotDate: reportFilters.snapshotDate || undefined,
        valuationAsset: reportFilters.valuationAsset || "USDT",
        accountType: reportFilters.accountType || undefined,
        asset: reportFilters.asset || undefined,
        limit: Number(reportFilters.limit) || 100,
        cursor: nextSnapshotCursor,
        sort: reportFilters.snapshotSort
      };
      const [
        balances,
        productBalances,
        positions,
        ledger,
        productLedger,
        transfers,
        adjustments,
        assetValuation,
        assetSnapshots,
        snapshotAlerts
      ] = await Promise.all([
        gatewayGet<{ balances?: BalanceRecord[] }>("account", "/balances", { userId }),
        gatewayGet<{ balances?: BalanceRecord[] }>("account", "/product-balances", { userId, accountType, productLine }),
        gatewayGet<{ positions?: PositionRecord[] }>("account", "/positions", { userId, productLine }),
        gatewayGet<{ entries?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>(
          "account",
          "/ledger",
          {
            userId,
            asset,
            limit: Number(ledgerFilters.limit) || 100,
            cursor: nextLedgerCursor,
            sort: ledgerFilters.sort
          }
        ),
        gatewayGet<{ entries?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>(
          "account",
          "/product-ledger",
          {
            userId,
            accountType,
            asset,
            productLine,
            limit: Number(ledgerFilters.limit) || 100,
            cursor: nextProductLedgerCursor,
            sort: ledgerFilters.sort
          }
        ),
        gatewayGet<{ transfers?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>(
          "account",
          "/transfers",
          {
            userId,
            accountType,
            asset,
            productLine,
            limit: Number(ledgerFilters.limit) || 100,
            cursor: nextTransferCursor,
            sort: ledgerFilters.sort
          }
        ),
        accountAdjustments(adjustmentParams),
        accountAssetValuation(reportParams),
        accountAssetSnapshots(snapshotParams),
        alertEvents({ status: "OPEN", domain: "SYSTEM", limit: 100 })
      ]);
      setData({
        balances: balances.balances ?? [],
        productBalances: productBalances.balances ?? [],
        positions: positions.positions ?? [],
        ledger: ledger.entries ?? [],
        productLedger: productLedger.entries ?? [],
        transfers: transfers.transfers ?? [],
        adjustments: adjustments.adjustments ?? [],
        assetValuation,
        assetSnapshots: assetSnapshots.snapshots ?? [],
        assetSnapshotAlerts: records(snapshotAlerts.events)
          .filter((row) => row.metricKey === "ACCOUNT_ASSET_SNAPSHOT_DIFF_PPM")
      });
      setLedgerPageInfo(cursorInfo(ledger));
      setProductLedgerPageInfo(cursorInfo(productLedger));
      setTransferPageInfo(cursorInfo(transfers));
      setAdjustmentPageInfo(cursorInfo(adjustments));
      setValuationPageInfo(cursorInfo(assetValuation));
      setSnapshotPageInfo(cursorInfo(assetSnapshots));
      setLedgerFilters((current) => ({
        ...current,
        ledgerCursor: nextLedgerCursor,
        productLedgerCursor: nextProductLedgerCursor,
        transferCursor: nextTransferCursor
      }));
      setAdjustmentFilters((current) => ({ ...current, cursor: nextAdjustmentCursor }));
      setReportFilters((current) => ({
        ...current,
        valuationCursor: nextValuationCursor,
        snapshotCursor: nextSnapshotCursor
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function adjustBalance(product: boolean) {
    if (loading) return;
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
      const productLine = product ? productLineForAccountType(accountType) : "";
      if (product && !productLine) throw new Error("请选择产品账户类型。");
      if (!window.confirm(`确认调整用户 ${body.userId} 的 ${product ? accountType : "基础账户"} ${body.asset} 余额 ${body.amountUnits} 最小单位？`)) return;
      await gatewayPost("account", product ? "/product-balance-adjustments" : "/balance-adjustments", body, productLine ? { productLine } : {});
      setAdjust({ amountUnits: "", referenceId: "", reason: "" });
      await load("", "", "", "", "", "");
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }

  async function generateAssetSnapshot() {
    setLoading(true);
    setError("");
    try {
      await createAccountAssetSnapshot({
        valuationAsset: reportFilters.valuationAsset || "USDT",
        snapshotDate: reportFilters.snapshotDate || undefined
      });
      await load("", "", "", "", "", "");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const valuationRows = records(data?.assetValuation?.rows as UnknownRecord[] | undefined);
  const valuationTotals = objectValue(data?.assetValuation?.totals);
  const valuationWarnings = records(data?.assetValuation?.warnings as UnknownRecord[] | undefined);
  const snapshotAlerts = records(data?.assetSnapshotAlerts);

  return (
    <Page title="账户资产" onRefresh={load} loading={loading} error={error}>
      <div className="filters">
        <TextFilter label="User ID" value={userId} onChange={(value) => { setUserId(value); resetListCursors(); }} />
        <label>账户类型<select value={accountType} onChange={(event) => { setAccountType(event.target.value); resetListCursors(); }}>{ACCOUNT_TYPES.filter(Boolean).map((item) => <option key={item}>{item}</option>)}</select></label>
        <TextFilter label="Asset" value={asset} onChange={(value) => { setAsset(value.toUpperCase()); resetListCursors(); }} />
        <TextFilter label="流水 Limit" value={ledgerFilters.limit} onChange={(value) => updateLedgerFilters({ limit: value })} />
        <SortSelect label="流水排序" value={ledgerFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => updateLedgerFilters({ sort: value })} />
        <button onClick={() => void load("", "", "", "", reportFilters.valuationCursor, reportFilters.snapshotCursor)}><Search size={16} />查询</button>
      </div>
      <div className="three-grid">
        <Panel title="基础余额"><DataTable rows={records(data?.balances)} /></Panel>
        <Panel title="产品余额"><DataTable rows={records(data?.productBalances)} /></Panel>
        <Panel title="持仓"><DataTable rows={records(data?.positions)} maxColumns={8} /></Panel>
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
          <button onClick={() => void load("", "", "", "", "", "")}><Search size={16} />查询</button>
          <button className="primary" onClick={() => void generateAssetSnapshot()}>生成快照</button>
        </div>
        <div className="metrics">
          <Metric label="估值合计" value={valuationTotals.totalValue ?? "0"} tone="ok" />
          <Metric label="账户行" value={valuationTotals.rows ?? 0} tone="muted" />
          <Metric label="用户数" value={valuationTotals.uniqueUsers ?? 0} tone="muted" />
          <Metric label="已计价" value={valuationTotals.pricedRows ?? 0} tone="ok" />
          <Metric label="缺汇率" value={valuationTotals.missingRateRows ?? 0} tone={Number(valuationTotals.missingRateRows ?? 0) > 0 ? "warn" : "ok"} />
          <Metric label="快照差异告警" value={snapshotAlerts.length} tone={snapshotAlerts.length ? "danger" : "ok"} />
        </div>
        {valuationWarnings.length > 0 && (
          <DataTable rows={valuationWarnings} columns={["area", "message"]} />
        )}
        <CursorPager
          page={valuationPageInfo}
          cursor={reportFilters.valuationCursor}
          onNext={() => void load(
            ledgerFilters.ledgerCursor,
            ledgerFilters.productLedgerCursor,
            ledgerFilters.transferCursor,
            adjustmentFilters.cursor,
            valuationPageInfo.nextCursor || "",
            reportFilters.snapshotCursor
          )}
          onReset={() => void load(
            ledgerFilters.ledgerCursor,
            ledgerFilters.productLedgerCursor,
            ledgerFilters.transferCursor,
            adjustmentFilters.cursor,
            "",
            reportFilters.snapshotCursor
          )}
        />
        <DataTable
          rows={valuationRows}
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
        {snapshotAlerts.length > 0 && (
          <DataTable
            rows={snapshotAlerts}
            columns={["severity", "target", "currentValue", "thresholdValue", "message", "lastSeenAt", "occurrences"]}
          />
        )}
        <CursorPager
          page={snapshotPageInfo}
          cursor={reportFilters.snapshotCursor}
          onNext={() => void load(
            ledgerFilters.ledgerCursor,
            ledgerFilters.productLedgerCursor,
            ledgerFilters.transferCursor,
            adjustmentFilters.cursor,
            reportFilters.valuationCursor,
            snapshotPageInfo.nextCursor || ""
          )}
          onReset={() => void load(
            ledgerFilters.ledgerCursor,
            ledgerFilters.productLedgerCursor,
            ledgerFilters.transferCursor,
            adjustmentFilters.cursor,
            reportFilters.valuationCursor,
            ""
          )}
        />
        <DataTable
          rows={records(data?.assetSnapshots)}
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
          rows={records(data?.adjustments)}
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
            page={ledgerPageInfo}
            cursor={ledgerFilters.ledgerCursor}
            onNext={() => void load(ledgerPageInfo.nextCursor || "", ledgerFilters.productLedgerCursor, ledgerFilters.transferCursor, adjustmentFilters.cursor)}
            onReset={() => void load("", ledgerFilters.productLedgerCursor, ledgerFilters.transferCursor, adjustmentFilters.cursor)}
          />
          <DataTable rows={records(data?.ledger)} maxColumns={9} />
        </Panel>
        <Panel title="产品流水">
          <CursorPager
            page={productLedgerPageInfo}
            cursor={ledgerFilters.productLedgerCursor}
            onNext={() => void load(ledgerFilters.ledgerCursor, productLedgerPageInfo.nextCursor || "", ledgerFilters.transferCursor, adjustmentFilters.cursor)}
            onReset={() => void load(ledgerFilters.ledgerCursor, "", ledgerFilters.transferCursor, adjustmentFilters.cursor)}
          />
          <DataTable rows={records(data?.productLedger)} maxColumns={9} />
        </Panel>
        <Panel title="划转记录">
          <CursorPager
            page={transferPageInfo}
            cursor={ledgerFilters.transferCursor}
            onNext={() => void load(ledgerFilters.ledgerCursor, ledgerFilters.productLedgerCursor, transferPageInfo.nextCursor || "", adjustmentFilters.cursor)}
            onReset={() => void load(ledgerFilters.ledgerCursor, ledgerFilters.productLedgerCursor, "", adjustmentFilters.cursor)}
          />
          <DataTable rows={records(data?.transfers)} maxColumns={9} />
        </Panel>
      </div>
    </Page>
  );
}

const ACCOUNT_VALUATION_SORTS = ["valuationValue.desc", "valuationValue.asc"];

const ACCOUNT_SNAPSHOT_SORTS = ["snapshotDate.desc", "snapshotDate.asc"];

interface AccountData {
  balances: BalanceRecord[];
  productBalances: BalanceRecord[];
  positions: PositionRecord[];
  ledger: UnknownRecord[];
  productLedger: UnknownRecord[];
  transfers: UnknownRecord[];
  adjustments: UnknownRecord[];
  assetValuation: UnknownRecord | null;
  assetSnapshots: UnknownRecord[];
  assetSnapshotAlerts: UnknownRecord[];
}
