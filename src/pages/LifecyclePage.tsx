import { Select } from "../components/CustomSelect";
import { useState, useEffect, useRef } from "react";
import { type Instrument, type UnknownRecord, type PositionRecord, type ProductLine } from "../types";
import { instruments as instrumentList, gatewayGet } from "../api/admin";
import { Search } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, Metric, TwoColumn, Panel, CursorPager, DataTable, KeyValue, Empty, TabBar, ExportCsvButton } from "../components/AdminUi";
import MaintenancePage from "../MaintenancePage";
import { accountTypeForProductLine, defaultAssetForProductLine, productLineForInstrument, INSTRUMENT_STATUSES, ACCOUNT_TYPES } from "../lib/products";
import { errorMessage } from "../lib/adminData";
import { sumBigIntUnits } from "../lib/decimals";
import { INSTRUMENT_SORTS, CREATED_AT_SORTS } from "../lib/queryOptions";

const LIFECYCLE_PRODUCT_LINES = ["LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"] as const;

export default function LifecyclePage({
  initialTab = "lifecycle",
}: {
  initialTab?: "lifecycle" | "maintenance";
}) {
  const [tab, setTab] = useState<"lifecycle" | "maintenance">(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
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

  const loadSeqRef = useRef(0);

  async function load(nextInstrumentCursor = filters.instrumentCursor, nextLedgerCursor = filters.ledgerCursor) {
    const seq = ++loadSeqRef.current;
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
      if (seq !== loadSeqRef.current) return;
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
      if (seq === loadSeqRef.current) {
        setError(errorMessage(err));
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load("", "");
    return () => { loadSeqRef.current += 1; };
  }, []);

  const closedCount = instruments.filter((item) => item.status === "CLOSED").length;
  const settlingCount = instruments.filter((item) => ["PRE_TRADING", "SETTLING"].includes(String(item.status ?? ""))).length;
  const ledgerNet = sumBigIntUnits(ledger.map((row) => row.amountUnits)).toString();
  const referenceType = lifecycleReferenceType(filters.productLine);

  return (
    <Page
      title="交割行权与交易维护"
      description="统一核查交割/期权产品到期结算，或按交易对执行紧急撤单、平仓与清退维护。"
      onRefresh={tab === "lifecycle" ? () => load(filters.instrumentCursor, filters.ledgerCursor) : undefined}
      loading={tab === "lifecycle" ? loading : false}
      error={tab === "lifecycle" ? error : ""}
    >
      <TabBar
        label="交割与维护视图"
        active={tab}
        onChange={setTab}
        items={[
          { key: "lifecycle", label: "交割与行权核查", count: instruments.length },
          { key: "maintenance", label: "交易维护与清退" }
        ]}
      />
      {tab === "maintenance" ? (
        <MaintenancePage />
      ) : (
        <>
          <div className="filters">
        <label>产品线<Select value={filters.productLine} onChange={(event) => updateFilters({ productLine: event.target.value })}>
          {LIFECYCLE_PRODUCT_LINES.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select></label>
        <label>状态<Select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}>
          <option value="">全部</option>
          {INSTRUMENT_STATUSES.map((item) => <option key={item}>{item}</option>)}
        </Select></label>
        <TextFilter label="币对 ID" value={filters.instrumentId} onChange={(value) => updateFilters({ instrumentId: value.toUpperCase() })} />
        <TextFilter label="User ID" value={filters.userId} onChange={(value) => updateFilters({ userId: value })} />
        <label>账户类型<Select value={filters.accountType} onChange={(event) => updateFilters({ accountType: event.target.value })}>{ACCOUNT_TYPES.filter(Boolean).map((item) => <option key={item}>{item}</option>)}</Select></label>
        <TextFilter label="Asset" value={filters.asset} onChange={(value) => updateFilters({ asset: value.toUpperCase() })} />
        <TextFilter label="Limit" value={filters.limit} onChange={(value) => updateFilters({ limit: value })} />
        <SortSelect label="产品排序" value={filters.sort} options={INSTRUMENT_SORTS} onChange={(value) => updateFilters({ sort: value })} />
        <SortSelect label="流水排序" value={filters.ledgerSort} options={CREATED_AT_SORTS} onChange={(value) => updateFilters({ ledgerSort: value })} />
        <button onClick={() => void load("", "")}><Search size={16} />查询</button>
        <ExportCsvButton
          rows={instruments as unknown as UnknownRecord[]}
          columns={["instrumentId", "status", "instrumentType", "contractType", "settleAsset", "expiryTime", "deliveryTime", "underlyingInstrumentId", "strikePriceUnits", "optionType", "settlementMethod", "updatedAt"]}
          filename={`lifecycle-instruments-${filters.productLine.toLowerCase()}.csv`}
          label="导出产品 CSV"
        />
      </div>
      <div className="metrics">
        <Metric label="生命周期产品" value={instruments.length} tone="muted" />
        <Metric label="待处理/交割中" value={settlingCount} tone={settlingCount > 0 ? "warn" : "ok"} />
        <Metric label="已关闭" value={closedCount} tone="ok" />
        <Metric label="流水类型" value={referenceType} tone="muted" />
        <Metric label="流水条数" value={ledger.length} tone={ledger.length ? "warn" : "muted"} />
        <Metric label="流水净额" value={ledgerNet} tone={ledgerNet === "0" ? "ok" : "warn"} />
      </div>
      <TwoColumn>
        <Panel title="交割 / 行权产品">
          <CursorPager loading={loading}
            page={instrumentPageInfo}
            cursor={filters.instrumentCursor}
            onNext={() => void load(instrumentPageInfo.nextCursor || "", filters.ledgerCursor)}
            onReset={() => void load("", filters.ledgerCursor)}
          />
          <DataTable
            rows={instruments as unknown as UnknownRecord[]}
            columns={["instrumentId", "status", "instrumentType", "contractType", "settleAsset", "expiryTime", "deliveryTime", "underlyingInstrumentId", "strikePriceUnits", "optionType", "settlementMethod", "updatedAt"]}
            maxColumns={13}
            onRowClick={(row) => setSelected(row as unknown as Instrument)} rowActionLabel="核查产品" label="待核查产品" isSelected={(row) => selected != null && String(row.instrumentId) === String(selected.instrumentId)}
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
          <div className="button-row" style={{ marginBottom: 8 }}>
            <ExportCsvButton
              rows={ledger}
              columns={["ledgerId", "userId", "accountType", "asset", "amountUnits", "balanceAfterUnits", "referenceType", "referenceId", "instrumentId", "createdAt"]}
              filename={`lifecycle-ledger-${filters.productLine.toLowerCase()}.csv`}
            />
          </div>
          <CursorPager loading={loading}
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
            <div className="stack">
              <div className="button-row">
                <ExportCsvButton
                  rows={positions as unknown as UnknownRecord[]}
                  columns={["userId", "instrumentId", "positionSide", "marginMode", "signedQuantitySteps", "entryPriceTicks", "realizedPnlUnits", "updatedAt"]}
                  filename={`lifecycle-positions-${filters.userId}.csv`}
                />
              </div>
              <DataTable
                rows={positions as unknown as UnknownRecord[]}
                columns={["userId", "instrumentId", "positionSide", "marginMode", "signedQuantitySteps", "entryPriceTicks", "realizedPnlUnits", "updatedAt"]}
                maxColumns={8}
              />
            </div>
          ) : <Empty text="输入 User ID 后核查生命周期产品是否仍有持仓" />}
        </Panel>
      </TwoColumn>
        </>
      )}
    </Page>
  );
}

function lifecycleInstrumentType(productLine: string) {
  return productLine === "OPTION" ? "OPTION" : "DELIVERY";
}

function lifecycleReferenceType(productLine: string) {
  return productLine === "OPTION" ? "OPTION_EXERCISE" : "DELIVERY_SETTLEMENT";
}
