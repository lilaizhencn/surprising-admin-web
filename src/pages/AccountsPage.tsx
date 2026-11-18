import { Select } from "../components/CustomSelect";
import { assetCode } from "../lib/formValues";
import { useState, useEffect, useRef } from "react";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { gatewayGet, accountAdjustments, gatewayPost } from "../api/admin";
import { type UnknownRecord } from "../types";
import { positiveInt64, int64String } from "../lib/integers";
import { Search } from "lucide-react";
import { cursorInfo, Page, TextFilter, SortSelect, Panel, DataTable, CursorPager, TabBar, ExportCsvButton } from "../components/AdminUi";
import { productLineForAccountType, ACCOUNT_TYPES } from "../lib/products";
import { records, errorMessage } from "../lib/adminData";
import { accountReadPage, readAccountSections, type AccountRead } from "../lib/accountReads";
import { CREATED_AT_SORTS } from "../lib/queryOptions";

export default function AccountsPage() {
  const { confirm, dialog } = useConfirmDialog();
  const [tab, setTab] = useState<"balances" | "adjustments">("balances");
  const [userId, setUserId] = useState("");
  const [accountType, setAccountType] = useState("USDT_PERPETUAL");
  const [asset, setAsset] = useState("USDT");
  const [fundingProductLine, setFundingProductLine] = useState("SPOT");
  const productLine = productLineForAccountType(accountType) || fundingProductLine;
  const [accountRead, setAccountRead] = useState<{ scope: string; sections: Record<string, AccountRead> } | null>(null);
  const accountAbort = useRef<AbortController | null>(null);
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
  const [accountLoading, setAccountLoading] = useState(false);
  const [writeLoading, setLoading] = useState(false);
  const loading = accountLoading || writeLoading;
  const accountScope = JSON.stringify([userId, accountType, productLine, asset, ledgerFilters.limit, ledgerFilters.sort, adjustmentFilters.adminUserId, adjustmentFilters.adjustmentKind, adjustmentFilters.referenceId, adjustmentFilters.limit, adjustmentFilters.sort]);
  const accountSections = accountRead?.scope === accountScope ? accountRead.sections : {};
  const data = {
    balances: accountSections.balances?.response?.balances,
    productBalances: accountSections.productBalances?.response?.balances,
    positions: accountSections.positions?.response?.positions,
    ledger: accountSections.ledger?.response?.entries,
    productLedger: accountSections.productLedger?.response?.entries,
    transfers: accountSections.transfers?.response?.transfers,
    adjustments: accountSections.adjustments?.response?.adjustments
  };
  function sectionState(key: string) {
    const skipped = ["productBalances", "positions", "productLedger", "transfers"].includes(key) && accountType === "FUNDING";
    return {
      loading: accountLoading && !skipped,
      error: accountSections[key]?.error || "",
      emptyText: skipped ? "请选择产品账户查看该产品数据。" : accountSections[key]?.response ? "暂无数据" : "请输入用户 ID 并查询。"
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

  async function refresh() {
    if (userId.trim()) await load();
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
      if (!(await confirm({ title: "确认余额调整", description: `确认调整用户 ${body.userId} 的 ${productLine} / ${product ? accountType : "基础账户"} ${body.asset} 余额 ${body.amountUnits} 最小单位？` }))) return;
      await gatewayPost("account", product ? "/product-balance-adjustments" : "/balance-adjustments", body, productLine ? { productLine } : {});
      setAdjust({ amountUnits: "", referenceId: "", reason: "" });
      await load("", "", "", "");
    } catch (err) { setError(errorMessage(err)); }
    finally { writing.current = false; setLoading(false); }
  }

  useEffect(() => { accountAbort.current?.abort(); setAccountLoading(false); return () => accountAbort.current?.abort(); }, [accountScope]);
  useEffect(() => { setAdjust({ amountUnits: "", referenceId: "", reason: "" }); }, [userId, accountType, asset, productLine]);
  useEffect(() => () => { accountAbort.current?.abort(); }, []);

  return (
    <Page title="账户资产" onRefresh={refresh} description="按用户与产品线核对余额、持仓、流水与人工调账追溯。" loading={loading} error={error}>
      <fieldset className="account-fields" disabled={writeLoading}>
      <TabBar
        active={tab}
        onChange={setTab}
        items={[
          { key: "balances", label: "余额、持仓与流水", count: records(data?.balances as UnknownRecord[] | undefined).length + records(data?.productBalances as UnknownRecord[] | undefined).length },
          { key: "adjustments", label: "人工调账与审计追溯", count: records(data?.adjustments as UnknownRecord[] | undefined).length }
        ]}
      />
      <div className="filters">
        <TextFilter label="User ID" value={userId} onChange={(value) => { setUserId(value); resetListCursors(); }} />
        <label>账户类型<Select aria-label="账户类型" value={accountType} onChange={(event) => { setAccountType(event.target.value); resetListCursors(); }}>{ACCOUNT_TYPES.filter(Boolean).map((item) => <option key={item}>{item}</option>)}</Select></label>
        {accountType === "FUNDING" && <label>资金账户产品线<Select aria-label="资金账户产品线" value={fundingProductLine} onChange={event => { setFundingProductLine(event.target.value); resetListCursors(); }}>{["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"].map(line => <option key={line}>{line}</option>)}</Select></label>}
        <TextFilter label="Asset" value={asset} onChange={(value) => { setAsset(value.toUpperCase()); resetListCursors(); }} />
        <TextFilter label="流水 Limit" value={ledgerFilters.limit} onChange={(value) => updateLedgerFilters({ limit: value })} />
        <SortSelect label="流水排序" value={ledgerFilters.sort} options={CREATED_AT_SORTS} onChange={(value) => updateLedgerFilters({ sort: value })} />
        <button onClick={() => void load("", "", "", "")}><Search size={16} />查询</button>
      </div>
      <p className="muted">当前产品线：{productLine}。基础余额与流水也按此产品线查询。</p>
      {tab === "balances" && (
      <div className="three-grid">
        <Panel title="基础余额">
          <div className="stack">
            <div className="button-row"><ExportCsvButton rows={records(data?.balances as UnknownRecord[] | undefined)} filename="account-balances.csv" /></div>
            <DataTable {...sectionState("balances")} rows={records(data?.balances as UnknownRecord[] | undefined)} />
          </div>
        </Panel>
        <Panel title="产品余额">
          <div className="stack">
            <div className="button-row"><ExportCsvButton rows={records(data?.productBalances as UnknownRecord[] | undefined)} filename="account-product-balances.csv" /></div>
            <DataTable {...sectionState("productBalances")} rows={records(data?.productBalances as UnknownRecord[] | undefined)} />
          </div>
        </Panel>
        <Panel title="持仓">
          <div className="stack">
            <div className="button-row"><ExportCsvButton rows={records(data?.positions as UnknownRecord[] | undefined)} filename="account-positions.csv" /></div>
            <DataTable {...sectionState("positions")} rows={records(data?.positions as UnknownRecord[] | undefined)} maxColumns={8} />
          </div>
        </Panel>
      </div>
      )}
      {tab === "adjustments" && (<>
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
            <Select
              value={adjustmentFilters.adjustmentKind}
              onChange={(event) => updateAdjustmentFilters({ adjustmentKind: event.target.value })}
            >
              <option value="">全部</option>
              <option value="BASIC">BASIC</option>
              <option value="PRODUCT">PRODUCT</option>
            </Select>
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
          <ExportCsvButton
            rows={records(data?.adjustments as UnknownRecord[] | undefined)}
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
            filename="account-adjustments.csv"
          />
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
      </>)}
      {tab === "balances" && (
      <div className="three-grid">
        <Panel title="基础流水">
          <div className="button-row" style={{ marginBottom: 8 }}>
            <ExportCsvButton rows={records(data?.ledger as UnknownRecord[] | undefined)} filename="account-ledger.csv" />
          </div>
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
          <div className="button-row" style={{ marginBottom: 8 }}>
            <ExportCsvButton rows={records(data?.productLedger as UnknownRecord[] | undefined)} filename="account-product-ledger.csv" />
          </div>
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
          <div className="button-row" style={{ marginBottom: 8 }}>
            <ExportCsvButton rows={records(data?.transfers as UnknownRecord[] | undefined)} filename="account-transfers.csv" />
          </div>
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
      )}
      </fieldset>
      {dialog}
    </Page>
  );
}
