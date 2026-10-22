import { assetCode } from "../lib/formValues";
import { useState, useEffect } from "react";
import { gatewayGet, gatewayPost } from "../api/admin";
import { type UnknownRecord } from "../types";
import { int64String } from "../lib/integers";
import { Search } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, Panel, KeyValue, CursorPager, DataTable, TwoColumn } from "../components/AdminUi";
import { errorMessage, records } from "../lib/adminData";
import { PRODUCT_LINES } from "../lib/products";
import { EVENT_TIME_SORTS, CREATED_AT_SORTS } from "../lib/queryOptions";
import { RuntimeConfigPanel } from "../components/RuntimeConfigPanel";

const isFundingProductLine = (productLine: string) => !productLine || productLine === "LINEAR_PERPETUAL" || productLine === "INVERSE_PERPETUAL";

export default function FundingInsurancePage() {
  const [instrumentId, setInstrumentId] = useState("");
  const [asset, setAsset] = useState("USDT");
  const [fundingUserId, setFundingUserId] = useState("");
  const [listFilters, setListFilters] = useState({
    productLine: "LINEAR_PERPETUAL",
    limit: "100",
    rateSort: "eventTime.desc",
    paymentSort: "createdAt.desc",
    insuranceSort: "createdAt.desc",
    rateCursor: "",
    paymentCursor: "",
    ledgerCursor: "",
    coverageCursor: ""
  });
  const [ratePageInfo, setRatePageInfo] = useState(cursorInfo());
  const [paymentPageInfo, setPaymentPageInfo] = useState(cursorInfo());
  const [ledgerPageInfo, setLedgerPageInfo] = useState(cursorInfo());
  const [coveragePageInfo, setCoveragePageInfo] = useState(cursorInfo());
  const [data, setData] = useState<FundingData | null>(null);
  const [adjust, setAdjust] = useState({ amountUnits: "", referenceId: "", reason: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function resetFundingCursors() {
    setListFilters((current) => ({
      ...current,
      rateCursor: "",
      paymentCursor: "",
      ledgerCursor: "",
      coverageCursor: ""
    }));
  }

  function updateListFilters(patch: Partial<typeof listFilters>) {
    setListFilters((current) => ({
      ...current,
      ...patch,
      rateCursor: "",
      paymentCursor: "",
      ledgerCursor: "",
      coverageCursor: ""
    }));
  }

  async function load(
    nextRateCursor = listFilters.rateCursor,
    nextPaymentCursor = listFilters.paymentCursor,
    nextLedgerCursor = listFilters.ledgerCursor,
    nextCoverageCursor = listFilters.coverageCursor
  ) {
    setLoading(true);
    setError("");
    try {
      const productLine = listFilters.productLine;
      const shouldLoadFunding = isFundingProductLine(productLine);
      const paymentRequest = fundingUserId.trim() && shouldLoadFunding
        ? gatewayGet<{ payments?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("funding", "/admin/payments", {
          userId: fundingUserId.trim(),
          instrumentId,
          productLine,
          limit: Number(listFilters.limit) || 100,
          cursor: nextPaymentCursor,
          sort: listFilters.paymentSort
        })
        : Promise.resolve({ payments: [], items: [], nextCursor: null, hasMore: false, sort: listFilters.paymentSort, limit: Number(listFilters.limit) || 100 });
      const [latest, history, settlement, payments, balances, ledger, coverages] = await Promise.all([
        shouldLoadFunding ? gatewayGet<UnknownRecord>("funding", "/admin/rates/latest", { instrumentId, productLine }) : Promise.resolve({}),
        shouldLoadFunding ? gatewayGet<{ rates?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("funding", "/admin/rates/history", {
          instrumentId,
          productLine,
          limit: Number(listFilters.limit) || 100,
          cursor: nextRateCursor,
          sort: listFilters.rateSort
        }) : Promise.resolve({ rates: [], items: [], nextCursor: null, hasMore: false, sort: listFilters.rateSort, limit: Number(listFilters.limit) || 100 }),
        shouldLoadFunding ? gatewayGet<UnknownRecord>("funding", "/admin/settlements/latest", { instrumentId, productLine }) : Promise.resolve({}),
        paymentRequest,
        gatewayGet<{ balances?: UnknownRecord[]; items?: UnknownRecord[] }>("insurance-admin", "/balances", { asset, productLine }),
        gatewayGet<{ entries?: UnknownRecord[]; ledger?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("insurance-admin", "/ledger", {
          asset,
          productLine,
          limit: Number(listFilters.limit) || 100,
          cursor: nextLedgerCursor,
          sort: listFilters.insuranceSort
        }),
        gatewayGet<{ coverages?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>("insurance-admin", "/coverages", {
          asset,
          productLine,
          limit: Number(listFilters.limit) || 100,
          cursor: nextCoverageCursor,
          sort: listFilters.insuranceSort
        })
      ]);
      setData({
        latest,
        history: history.rates ?? history.items ?? [],
        payments: payments.payments ?? payments.items ?? [],
        settlement,
        balances: balances.balances ?? balances.items ?? [],
        ledger: ledger.entries ?? ledger.ledger ?? ledger.items ?? [],
        coverages: coverages.coverages ?? coverages.items ?? []
      });
      setRatePageInfo(cursorInfo(history));
      setPaymentPageInfo(cursorInfo(payments));
      setLedgerPageInfo(cursorInfo(ledger));
      setCoveragePageInfo(cursorInfo(coverages));
      setListFilters((current) => ({
        ...current,
        rateCursor: nextRateCursor,
        paymentCursor: nextPaymentCursor,
        ledgerCursor: nextLedgerCursor,
        coverageCursor: nextCoverageCursor
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function adjustFund() {
    if (loading) return;
    setLoading(true); setError("");
    try {
      const amountUnits = int64String(adjust.amountUnits, "调整金额");
      const selectedAsset = assetCode(asset);
      if (!adjust.referenceId.trim() || !adjust.reason.trim()) throw new Error("请填写唯一业务编号和调整原因。");
      if (!window.confirm(`确认调整 ${listFilters.productLine || "全部产品线"} ${selectedAsset} 保险基金 ${amountUnits} 最小单位？`)) return;
      await gatewayPost("insurance-admin", "/fund-adjustments", {
        asset: selectedAsset, amountUnits, referenceId: adjust.referenceId.trim(), reason: adjust.reason.trim()
      }, { productLine: listFilters.productLine });
      setAdjust({ amountUnits: "", referenceId: "", reason: "" });
      await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return (
    <Page title="资金费与保险基金" onRefresh={() => load()} loading={loading} error={error}>
      <div className="filters">
        <label>产品线<select value={listFilters.productLine} onChange={(event) => updateListFilters({ productLine: event.target.value })}>{PRODUCT_LINES.map((item) => <option key={item} value={item}>{item || "全部"}</option>)}</select></label>
        <TextFilter label="币对 ID" value={instrumentId} onChange={(value) => { setInstrumentId(value.toUpperCase()); resetFundingCursors(); }} />
        <TextFilter label="Asset" value={asset} onChange={(value) => { setAsset(value.toUpperCase()); resetFundingCursors(); }} />
        <TextFilter label="付款 User ID" value={fundingUserId} onChange={(value) => { setFundingUserId(value); resetFundingCursors(); }} />
        <TextFilter label="Limit" value={listFilters.limit} onChange={(value) => updateListFilters({ limit: value })} />
        <SortSelect label="费率排序" value={listFilters.rateSort} options={EVENT_TIME_SORTS} onChange={(value) => updateListFilters({ rateSort: value })} />
        <SortSelect label="付款排序" value={listFilters.paymentSort} options={CREATED_AT_SORTS} onChange={(value) => updateListFilters({ paymentSort: value })} />
        <SortSelect label="保险排序" value={listFilters.insuranceSort} options={CREATED_AT_SORTS} onChange={(value) => updateListFilters({ insuranceSort: value })} />
        <button onClick={() => void load()}><Search size={16} />查询</button>
      </div>
      <div className="two-grid">
        <Panel title="最新资金费"><KeyValue data={data?.latest ?? {}} /></Panel>
        <Panel title="最新结算"><KeyValue data={data?.settlement ?? {}} /></Panel>
        <Panel title="资金费历史">
          <CursorPager
            page={ratePageInfo}
            cursor={listFilters.rateCursor}
            onNext={() => void load(ratePageInfo.nextCursor || "", listFilters.paymentCursor, listFilters.ledgerCursor, listFilters.coverageCursor)}
            onReset={() => void load("", listFilters.paymentCursor, listFilters.ledgerCursor, listFilters.coverageCursor)}
          />
          <DataTable rows={records(data?.history)} maxColumns={9} />
        </Panel>
        <Panel title="资金费付款">
          <CursorPager
            page={paymentPageInfo}
            cursor={listFilters.paymentCursor}
            onNext={() => void load(listFilters.rateCursor, paymentPageInfo.nextCursor || "", listFilters.ledgerCursor, listFilters.coverageCursor)}
            onReset={() => void load(listFilters.rateCursor, "", listFilters.ledgerCursor, listFilters.coverageCursor)}
          />
          <DataTable rows={records(data?.payments)} maxColumns={9} />
        </Panel>
        <Panel title="保险基金余额"><DataTable rows={records(data?.balances)} /></Panel>
        <Panel title="保险基金流水">
          <CursorPager
            page={ledgerPageInfo}
            cursor={listFilters.ledgerCursor}
            onNext={() => void load(listFilters.rateCursor, listFilters.paymentCursor, ledgerPageInfo.nextCursor || "", listFilters.coverageCursor)}
            onReset={() => void load(listFilters.rateCursor, listFilters.paymentCursor, "", listFilters.coverageCursor)}
          />
          <DataTable rows={records(data?.ledger)} maxColumns={9} />
        </Panel>
        <Panel title="亏损覆盖">
          <CursorPager
            page={coveragePageInfo}
            cursor={listFilters.coverageCursor}
            onNext={() => void load(listFilters.rateCursor, listFilters.paymentCursor, listFilters.ledgerCursor, coveragePageInfo.nextCursor || "")}
            onReset={() => void load(listFilters.rateCursor, listFilters.paymentCursor, listFilters.ledgerCursor, "")}
          />
          <DataTable rows={records(data?.coverages)} maxColumns={9} />
        </Panel>
      </div>
      <Panel title="保险基金人工调整">
        <div className="filters">
          <label>金额 Units<input value={adjust.amountUnits} onChange={(event) => setAdjust({ ...adjust, amountUnits: event.target.value })} /></label>
          <label>Reference ID<input value={adjust.referenceId} onChange={(event) => setAdjust({ ...adjust, referenceId: event.target.value })} /></label>
          <label>原因<input value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} /></label>
          <button className="primary" disabled={loading} onClick={() => void adjustFund()}>调整保险基金</button>
        </div>
      </Panel>
      <TwoColumn>
        {isFundingProductLine(listFilters.productLine) && (
          <RuntimeConfigPanel key={`funding-${listFilters.productLine}`} title="资金费运行时配置" service="funding" path="/admin/runtime-config" template={{ calculationEnabled: false, settlementEnabled: false }} productLine={listFilters.productLine} />
        )}
        <RuntimeConfigPanel key={`insurance-admin-${listFilters.productLine}`} title="保险基金运行时配置" service="insurance-admin" path="/runtime-config" template={{ coverageEnabled: false }} productLine={listFilters.productLine} />
      </TwoColumn>
    </Page>
  );
}

interface FundingData {
  latest: UnknownRecord;
  history: UnknownRecord[];
  payments: UnknownRecord[];
  settlement: UnknownRecord;
  balances: UnknownRecord[];
  ledger: UnknownRecord[];
  coverages: UnknownRecord[];
}
