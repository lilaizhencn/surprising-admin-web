import { useState, useEffect } from "react";
import { type Instrument, type UnknownRecord, type PositionRecord, type ProductLine } from "../types";
import { instruments as instrumentList, gatewayGet } from "../api/admin";
import { Search } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, Metric, TwoColumn, Panel, CursorPager, DataTable, KeyValue, Empty } from "../components/AdminUi";
import { accountTypeForProductLine, defaultAssetForProductLine, productLineForInstrument, INSTRUMENT_STATUSES, ACCOUNT_TYPES } from "../lib/products";
import { errorMessage } from "../lib/adminData";
import { INSTRUMENT_SORTS, CREATED_AT_SORTS } from "../lib/queryOptions";

const LIFECYCLE_PRODUCT_LINES = ["LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"] as const;

export default function LifecyclePage() {
  const [filters, setFilters] = useState({
    productLine: "LINEAR_DELIVERY",
    status: "",
    instrumentId: "",
    userId: "",
    accountType: "USDT_DELIVERY",
    asset: "USDT",
    limit: "100",
    instrumentCursor: "",
    ledgerCursor: "",
    sort: "updatedAt.desc",
    ledgerSort: "createdAt.desc"
  });
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrumentPageInfo, setInstrumentPageInfo] = useState(cursorInfo());
  const [ledger, setLedger] = useState<UnknownRecord[]>([]);
  const [ledgerPageInfo, setLedgerPageInfo] = useState(cursorInfo());
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateFilters(patch: Partial<typeof filters>) {
    setFilters((current) => {
      const nextProductLine = patch.productLine ?? current.productLine;
      const nextAccountType = patch.productLine ? accountTypeForProductLine(nextProductLine) : current.accountType;
      const nextAsset = patch.productLine ? defaultAssetForProductLine(nextProductLine) : current.asset;
      return {
        ...current,
        ...patch,
        accountType: patch.accountType ?? nextAccountType,
        asset: patch.asset ?? nextAsset,
        instrumentCursor: "",
        ledgerCursor: ""
      };
    });
  }

  async function load(nextInstrumentCursor = filters.instrumentCursor, nextLedgerCursor = filters.ledgerCursor) {
    setLoading(true);
    setError("");
    try {
      const instrumentType = lifecycleInstrumentType(filters.productLine);
      const productLine = filters.productLine as ProductLine;
      const referenceType = lifecycleReferenceType(filters.productLine);
      const [instrumentResponse, ledgerResponse, positionResponse] = await Promise.all([
        instrumentList({
          productLine,
          type: instrumentType,
          status: filters.status,
          limit: Number(filters.limit) || 100,
          cursor: nextInstrumentCursor,
          sort: filters.sort
        }),
        gatewayGet<{ entries?: UnknownRecord[]; records?: UnknownRecord[]; items?: UnknownRecord[]; nextCursor?: string | null; hasMore?: boolean; sort?: string; limit?: number }>(
          "account",
          "/product-ledger",
          {
            userId: filters.userId,
            accountType: filters.accountType,
            asset: filters.asset,
            referenceType,
            productLine,
            limit: Number(filters.limit) || 100,
            cursor: nextLedgerCursor,
            sort: filters.ledgerSort
          }
        ),
        filters.userId
          ? gatewayGet<{ positions?: PositionRecord[]; items?: PositionRecord[] }>("account", "/positions", {
            userId: filters.userId,
            productLine
          }).catch(() => ({ positions: [] as PositionRecord[], items: [] as PositionRecord[] }))
          : Promise.resolve({ positions: [] as PositionRecord[], items: [] as PositionRecord[] })
      ]);
      const rawInstruments = instrumentResponse.instruments ?? instrumentResponse.items ?? [];
      const productInstruments = rawInstruments
        .filter((item) => productLineForInstrument(item) === productLine)
        .filter((item) => !filters.instrumentId || String(item.instrumentId).includes(filters.instrumentId.trim()));
      setInstruments(productInstruments);
      setInstrumentPageInfo(cursorInfo(instrumentResponse));
      setLedger(ledgerResponse.entries ?? ledgerResponse.records ?? ledgerResponse.items ?? []);
      setLedgerPageInfo(cursorInfo(ledgerResponse));
      setPositions(positionResponse.positions ?? positionResponse.items ?? []);
      setSelected((current) => current
        ? productInstruments.find((item) => item.instrumentId === current.instrumentId) ?? productInstruments[0] ?? null
        : productInstruments[0] ?? null);
      setFilters((current) => ({
        ...current,
        instrumentCursor: nextInstrumentCursor,
        ledgerCursor: nextLedgerCursor
      }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load("", ""); }, []);

  const closedCount = instruments.filter((item) => item.status === "CLOSED").length;
  const settlingCount = instruments.filter((item) => ["PRE_TRADING", "SETTLING"].includes(String(item.status ?? ""))).length;
  const ledgerNet = ledger.reduce((sum, row) => sum + numericValue(row.amountUnits), 0);
  const referenceType = lifecycleReferenceType(filters.productLine);

  return (
    <Page title="交割 / 行权核查" onRefresh={() => load(filters.instrumentCursor, filters.ledgerCursor)} loading={loading} error={error}>
      <div className="filters">
        <label>产品线<select value={filters.productLine} onChange={(event) => updateFilters({ productLine: event.target.value })}>
          {LIFECYCLE_PRODUCT_LINES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>状态<select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}>
          <option value="">全部</option>
          {INSTRUMENT_STATUSES.map((item) => <option key={item}>{item}</option>)}
        </select></label>
        <TextFilter label="币对 ID" value={filters.instrumentId} onChange={(value) => updateFilters({ instrumentId: value.toUpperCase() })} />
        <TextFilter label="User ID" value={filters.userId} onChange={(value) => updateFilters({ userId: value })} />
        <label>账户类型<select value={filters.accountType} onChange={(event) => updateFilters({ accountType: event.target.value })}>{ACCOUNT_TYPES.filter(Boolean).map((item) => <option key={item}>{item}</option>)}</select></label>
        <TextFilter label="Asset" value={filters.asset} onChange={(value) => updateFilters({ asset: value.toUpperCase() })} />
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => updateFilters({ limit: value })} />
        <SortSelect label="产品排序" value={filters.sort} options={INSTRUMENT_SORTS} onChange={(value) => updateFilters({ sort: value })} />
        <SortSelect label="流水排序" value={filters.ledgerSort} options={CREATED_AT_SORTS} onChange={(value) => updateFilters({ ledgerSort: value })} />
        <button onClick={() => void load("", "")}><Search size={16} />查询</button>
      </div>
      <div className="metrics">
        <Metric label="生命周期产品" value={instruments.length} tone="muted" />
        <Metric label="待处理/交割中" value={settlingCount} tone={settlingCount > 0 ? "warn" : "ok"} />
        <Metric label="已关闭" value={closedCount} tone="ok" />
        <Metric label="流水类型" value={referenceType} tone="muted" />
        <Metric label="流水条数" value={ledger.length} tone={ledger.length ? "warn" : "muted"} />
        <Metric label="流水净额" value={ledgerNet} tone={ledgerNet === 0 ? "ok" : "warn"} />
      </div>
      <TwoColumn>
        <Panel title="交割 / 行权产品">
          <CursorPager
            page={instrumentPageInfo}
            cursor={filters.instrumentCursor}
            onNext={() => void load(instrumentPageInfo.nextCursor || "", filters.ledgerCursor)}
            onReset={() => void load("", filters.ledgerCursor)}
          />
          <DataTable
            rows={instruments as unknown as UnknownRecord[]}
            columns={["instrumentId", "status", "instrumentType", "contractType", "settleAsset", "expiryTime", "deliveryTime", "underlyingInstrumentId", "strikePriceUnits", "optionType", "settlementMethod", "updatedAt"]}
            maxColumns={13}
            onRowClick={(row) => setSelected(row as unknown as Instrument)}
          />
        </Panel>
        <Panel title="选中产品核查">
          {selected ? (
            <KeyValue data={{
              instrumentId: selected.instrumentId,
              productLine: productLineForInstrument(selected),
              status: selected.status,
              expiryTime: selected.expiryTime ?? "",
              deliveryTime: selected.deliveryTime ?? "",
              settlementMethod: selected.settlementMethod ?? "",
              underlyingInstrumentId: selected.underlyingInstrumentId ?? "",
              underlyingProductLine: selected.underlyingProductLine ?? "",
              strikePriceUnits: selected.strikePriceUnits ?? "",
              optionType: selected.optionType ?? "",
              changeId: selected.changeId ?? ""
            }} />
          ) : <Empty text="选择一个交割或期权产品" />}
        </Panel>
      </TwoColumn>
      <TwoColumn>
        <Panel title={`${referenceType} 产品流水`}>
          <CursorPager
            page={ledgerPageInfo}
            cursor={filters.ledgerCursor}
            onNext={() => void load(filters.instrumentCursor, ledgerPageInfo.nextCursor || "")}
            onReset={() => void load(filters.instrumentCursor, "")}
          />
          <DataTable
            rows={ledger}
            columns={["ledgerId", "userId", "accountType", "asset", "amountUnits", "balanceAfterUnits", "referenceType", "referenceId", "instrumentId", "createdAt"]}
            maxColumns={10}
          />
        </Panel>
        <Panel title="用户持仓残留">
          {filters.userId ? (
            <DataTable
              rows={positions as unknown as UnknownRecord[]}
              columns={["userId", "instrumentId", "positionSide", "marginMode", "signedQuantitySteps", "entryPriceTicks", "realizedPnlUnits", "updatedAt"]}
              maxColumns={8}
            />
          ) : <Empty text="输入 User ID 后核查生命周期产品是否仍有持仓" />}
        </Panel>
      </TwoColumn>
    </Page>
  );
}

function lifecycleInstrumentType(productLine: string) {
  return productLine === "OPTION" ? "OPTION" : "DELIVERY";
}

function lifecycleReferenceType(productLine: string) {
  return productLine === "OPTION" ? "OPTION_EXERCISE" : "DELIVERY_SETTLEMENT";
}

function numericValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
