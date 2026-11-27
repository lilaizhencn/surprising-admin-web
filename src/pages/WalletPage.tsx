import { Select } from "../components/CustomSelect";
import { useState, useEffect, useRef } from "react";
import { type RouteTarget, type UnknownRecord } from "../types";
import { gatewayGet, walletFinanceSummary, walletOperationsOverview, walletOperationAddresses, walletOperationBalances, walletOperationExceptions, walletFinanceDeposits, walletFinanceWithdrawals, walletFinanceWithdrawalReviews, approveWalletWithdrawal, rejectWalletWithdrawal } from "../api/admin";
import { CustodyWithdrawalsPanel } from "../features/CustodyWithdrawalsPanel";
import { Search } from "lucide-react";
import { cursorInfo, Page, Metric, Panel, TextFilter, SortSelect, DataTable, CursorPager, TabBar, ExportCsvButton } from "../components/AdminUi";
import { errorMessage, records, fieldText } from "../lib/adminData";
import { sumDecimals } from "../lib/decimals";
import { UPDATED_AT_SORTS, CREATED_AT_SORTS } from "../lib/queryOptions";

const WALLET_WITHDRAWAL_STATUSES = [
  "",
  "PENDING_REVIEW",
  "FROZEN",
  "SIGNING",
  "SENT",
  "CONFIRMING",
  "CONFIRMED",
  "FAILED",
  "BROADCAST_UNKNOWN",
  "REJECTED"
];

const WALLET_OPERATION_EVENT_TYPES = ["", "DEPOSIT", "WITHDRAWAL", "COLLECTION"];

const WALLET_OPERATION_EXCEPTION_STATUSES = [
  "",
  "PENDING_REVIEW",
  "DETECTED",
  "CREATED",
  "SIGNING",
  "SENT",
  "FAILED",
  "BROADCAST_UNKNOWN",
  "REJECTED"
];

export default function WalletPage({ onNavigate }: { onNavigate?: (route: RouteTarget) => void } = {}) {
  const reads = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<"withdrawals" | "onchain" | "infra">("withdrawals");
  const [withdrawalsRevision, setWithdrawalsRevision] = useState(0);
  const [dashboard, setDashboard] = useState<WalletDashboard | null>(null);
  const [finance, setFinance] = useState<UnknownRecord | null>(null);
  const [operations, setOperations] = useState<UnknownRecord | null>(null);
  const [operationAddresses, setOperationAddresses] = useState<UnknownRecord[]>([]);
  const [operationBalances, setOperationBalances] = useState<UnknownRecord[]>([]);
  const [operationExceptions, setOperationExceptions] = useState<UnknownRecord[]>([]);
  const [financeDeposits, setFinanceDeposits] = useState<UnknownRecord[]>([]);
  const [financeWithdrawals, setFinanceWithdrawals] = useState<UnknownRecord[]>([]);
  const [financeWithdrawalReviews, setFinanceWithdrawalReviews] = useState<UnknownRecord[]>([]);
  const [operationAddressPageInfo, setOperationAddressPageInfo] = useState(cursorInfo());
  const [operationBalancePageInfo, setOperationBalancePageInfo] = useState(cursorInfo());
  const [operationExceptionPageInfo, setOperationExceptionPageInfo] = useState(cursorInfo());
  const [financeDepositPageInfo, setFinanceDepositPageInfo] = useState(cursorInfo());
  const [financeWithdrawalPageInfo, setFinanceWithdrawalPageInfo] = useState(cursorInfo());
  const [financeReviewPageInfo, setFinanceReviewPageInfo] = useState(cursorInfo());
  const [withdrawalReviewReason, setWithdrawalReviewReason] = useState("Manual withdrawal review");
  const [addressQuery, setAddressQuery] = useState({ address: "", chain: "", limit: "100" });
  const [operationFilters, setOperationFilters] = useState({
    chain: "",
    assetSymbol: "",
    userId: "",
    walletRole: "",
    address: "",
    eventType: "",
    exceptionStatus: "",
    limit: "100",
    sort: "updatedAt.desc",
    addressCursor: "",
    balanceCursor: "",
    exceptionCursor: ""
  });
  const [withdrawalFilters, setWithdrawalFilters] = useState({
    chain: "",
    assetSymbol: "",
    depositStatus: "",
    depositCredited: "",
    status: "PENDING_REVIEW",
    decision: "",
    adminUserId: "",
    userId: "",
    orderNo: "",
    limit: "100",
    sort: "updatedAt.desc",
    reviewSort: "createdAt.desc",
    depositCursor: "",
    withdrawalCursor: "",
    reviewCursor: ""
  });
  const [addressTransactions, setAddressTransactions] = useState<UnknownRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateOperationFilters(patch: Partial<typeof operationFilters>) {
    setOperationFilters((current) => ({
      ...current,
      ...patch,
      addressCursor: "",
      balanceCursor: "",
      exceptionCursor: ""
    }));
  }

  function updateWithdrawalFilters(patch: Partial<typeof withdrawalFilters>) {
    setWithdrawalFilters((current) => ({
      ...current,
      ...patch,
      depositCursor: "",
      withdrawalCursor: "",
      reviewCursor: ""
    }));
  }

  async function load(
    nextAddressCursor = operationFilters.addressCursor,
    nextBalanceCursor = operationFilters.balanceCursor,
    nextExceptionCursor = operationFilters.exceptionCursor,
    nextDepositCursor = withdrawalFilters.depositCursor,
    nextWithdrawalCursor = withdrawalFilters.withdrawalCursor,
    nextReviewCursor = withdrawalFilters.reviewCursor
  ) {
    reads.current?.abort();
    const controller = new AbortController();
    reads.current = controller;
    setLoading(true);
    setError("");
    try {
      setDashboard(null); setFinance(null); setOperations(null);
      const [
        dashboardResponse,
        financeResponse,
        operationsResponse,
        addressResponse,
        balanceResponse,
        exceptionResponse,
        depositResponse,
        withdrawalResponse,
        reviewResponse
      ] = await Promise.all([
        gatewayGet<WalletResponse<WalletDashboard>>("wallet", "/dashboard", { limit: 200 }, controller.signal),
        walletFinanceSummary({
          chain: withdrawalFilters.chain,
          assetSymbol: withdrawalFilters.assetSymbol,
          windowHours: 24,
          limit: 100
        }, controller.signal),
        walletOperationsOverview({
          chain: operationFilters.chain,
          assetSymbol: operationFilters.assetSymbol,
          windowHours: 24,
          limit: Number(operationFilters.limit) || 100
        }, controller.signal),
        walletOperationAddresses({
          chain: operationFilters.chain,
          assetSymbol: operationFilters.assetSymbol,
          userId: operationFilters.userId,
          walletRole: operationFilters.walletRole,
          address: operationFilters.address,
          limit: Number(operationFilters.limit) || 100,
          cursor: nextAddressCursor,
          sort: operationFilters.sort
        }, controller.signal),
        walletOperationBalances({
          chain: operationFilters.chain,
          assetSymbol: operationFilters.assetSymbol,
          userId: operationFilters.userId,
          nonZeroOnly: "true",
          limit: Number(operationFilters.limit) || 100,
          cursor: nextBalanceCursor,
          sort: operationFilters.sort
        }, controller.signal),
        walletOperationExceptions({
          eventType: operationFilters.eventType,
          chain: operationFilters.chain,
          assetSymbol: operationFilters.assetSymbol,
          status: operationFilters.exceptionStatus,
          limit: Number(operationFilters.limit) || 100,
          cursor: nextExceptionCursor,
          sort: operationFilters.sort
        }, controller.signal),
        walletFinanceDeposits({
          chain: withdrawalFilters.chain,
          assetSymbol: withdrawalFilters.assetSymbol,
          status: withdrawalFilters.depositStatus,
          credited: withdrawalFilters.depositCredited,
          limit: Number(withdrawalFilters.limit) || 100,
          cursor: nextDepositCursor,
          sort: withdrawalFilters.sort
        }, controller.signal),
        walletFinanceWithdrawals({
          chain: withdrawalFilters.chain,
          assetSymbol: withdrawalFilters.assetSymbol,
          status: withdrawalFilters.status,
          userId: withdrawalFilters.userId,
          orderNo: withdrawalFilters.orderNo,
          limit: Number(withdrawalFilters.limit) || 100,
          cursor: nextWithdrawalCursor,
          sort: withdrawalFilters.sort
        }, controller.signal),
        walletFinanceWithdrawalReviews({
          chain: withdrawalFilters.chain,
          assetSymbol: withdrawalFilters.assetSymbol,
          decision: withdrawalFilters.decision,
          adminUserId: withdrawalFilters.adminUserId,
          userId: withdrawalFilters.userId,
          orderNo: withdrawalFilters.orderNo,
          limit: Number(withdrawalFilters.limit) || 100,
          cursor: nextReviewCursor,
          sort: withdrawalFilters.reviewSort
        }, controller.signal)
      ]);
      if (controller.signal.aborted) return;
      const nextDashboard = unwrapWallet(dashboardResponse);
      setDashboard(nextDashboard);
      setFinance(unwrapWallet(financeResponse) ?? null);
      setOperations(unwrapWallet(operationsResponse) ?? null);
      const addressPage = unwrapWallet(addressResponse);
      const balancePage = unwrapWallet(balanceResponse);
      const exceptionPage = unwrapWallet(exceptionResponse);
      const depositPage = unwrapWallet(depositResponse);
      const withdrawalPage = unwrapWallet(withdrawalResponse);
      const reviewPage = unwrapWallet(reviewResponse);
      setOperationAddresses(walletPageRows(addressPage, "addresses"));
      setOperationBalances(walletPageRows(balancePage, "balances"));
      setOperationExceptions(walletPageRows(exceptionPage, "events"));
      setFinanceDeposits(walletPageRows(depositPage, "deposits"));
      setFinanceWithdrawals(walletPageRows(withdrawalPage, "withdrawals"));
      setFinanceWithdrawalReviews(walletPageRows(reviewPage, "reviews"));
      setOperationAddressPageInfo(cursorInfo(addressPage));
      setOperationBalancePageInfo(cursorInfo(balancePage));
      setOperationExceptionPageInfo(cursorInfo(exceptionPage));
      setFinanceDepositPageInfo(cursorInfo(depositPage));
      setFinanceWithdrawalPageInfo(cursorInfo(withdrawalPage));
      setFinanceReviewPageInfo(cursorInfo(reviewPage));
      setOperationFilters((current) => ({
        ...current,
        addressCursor: nextAddressCursor,
        balanceCursor: nextBalanceCursor,
        exceptionCursor: nextExceptionCursor
      }));
      setWithdrawalFilters((current) => ({
        ...current,
        depositCursor: nextDepositCursor,
        withdrawalCursor: nextWithdrawalCursor,
        reviewCursor: nextReviewCursor
      }));
    } catch (err) {
      if (!controller.signal.aborted) setError(errorMessage(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function reviewWithdrawal(row: UnknownRecord, decision: "approve" | "reject") {
    const chain = String(row.chain ?? "");
    const orderNo = String(row.order_no ?? row.orderNo ?? "");
    if (!chain || !orderNo) {
      setError("当前提现记录缺少 chain 或 order_no");
      return;
    }
    const reason = withdrawalReviewReason.trim();
    if (!reason) {
      setError(decision === "approve" ? "请输入提现审核通过原因。" : "请输入提现拒绝原因。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (decision === "approve") {
        await approveWalletWithdrawal(chain, orderNo, reason);
      } else {
        await rejectWalletWithdrawal(chain, orderNo, reason);
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function searchAddressTransactions() {
    if (!addressQuery.address.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await gatewayGet<WalletResponse<UnknownRecord[]>>("wallet", "/dashboard/address-transactions", {
        address: addressQuery.address.trim(),
        chain: addressQuery.chain.trim().toUpperCase(),
        limit: Number(addressQuery.limit) || 100
      });
      setAddressTransactions(unwrapWallet(response) ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); return () => reads.current?.abort(); }, []);

  const runtime = (dashboard?.runtime ?? {}) as UnknownRecord;
  const counts = (runtime.counts ?? {}) as UnknownRecord;
  const financeTotals = (finance?.totals ?? {}) as UnknownRecord;
  const operationTotals = (operations?.totals ?? {}) as UnknownRecord;

  const [listedAssets, setListedAssets] = useState<UnknownRecord[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    import("../api/client").then(({ request }) =>
      request<UnknownRecord[]>("/api/v1/admin/assets", { signal: abort.signal })
        .then(setListedAssets)
        .catch((err) => {
          if (!abort.signal.aborted) {
            setError((prev) => prev || errorMessage(err));
          }
        }),
    );
    return () => abort.abort();
  }, []);

  const assetSummaryRows = (() => {
    const map = new Map<string, { asset: string; name: string; status: string; depositCount: number; depositAmounts: unknown[]; withdrawalCount: number; withdrawalAmounts: unknown[] }>();
    for (const a of listedAssets) {
      const code = String(a.asset ?? a.symbol ?? a.code ?? "");
      if (!code) continue;
      map.set(code, {
        asset: code,
        name: String(a.name ?? a.displayName ?? code),
        status: a.listed === false ? "UNLISTED" : String(a.status ?? "LISTED"),
        depositCount: 0,
        depositAmounts: [],
        withdrawalCount: 0,
        withdrawalAmounts: [],
      });
    }
    for (const d of financeDeposits) {
      const code = String(d.assetSymbol ?? d.asset ?? "");
      if (!code) continue;
      const entry = map.get(code) ?? { asset: code, name: code, status: "LISTED", depositCount: 0, depositAmounts: [], withdrawalCount: 0, withdrawalAmounts: [] };
      entry.depositCount += 1;
      if (d.amount !== undefined && d.amount !== null) {
        entry.depositAmounts.push(d.amount);
      }
      map.set(code, entry);
    }
    for (const w of financeWithdrawals) {
      const code = String(w.assetSymbol ?? w.asset ?? "");
      if (!code) continue;
      const entry = map.get(code) ?? { asset: code, name: code, status: "LISTED", depositCount: 0, depositAmounts: [], withdrawalCount: 0, withdrawalAmounts: [] };
      entry.withdrawalCount += 1;
      if (w.amount !== undefined && w.amount !== null) {
        entry.withdrawalAmounts.push(w.amount);
      }
      map.set(code, entry);
    }
    return [...map.values()].map((item) => ({
      币种: item.asset,
      名称: item.name,
      上线状态: item.status,
      充值笔数: item.depositCount,
      累计充值量: sumDecimals(item.depositAmounts, 4),
      提现笔数: item.withdrawalCount,
      累计提现量: sumDecimals(item.withdrawalAmounts, 4),
    }));
  })();

  return (
    <Page title="钱包运营" onRefresh={async () => { setWithdrawalsRevision(value => value + 1); await load(); }} loading={loading} error={error}>
      <TabBar
        active={tab}
        onChange={setTab}
        items={[
          { key: "withdrawals", label: "提现申请与资金审核", count: assetSummaryRows.length },
          { key: "onchain", label: "链上运营与地址账本", count: operationAddresses.length },
          { key: "infra", label: "公链与 RPC 节点配置" }
        ]}
      />
      {tab === "withdrawals" && (<>
      <Panel title="各币种充提汇总与上线币种管理">
        <div className="stack">
          <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span>共 {assetSummaryRows.length} 个平台币种；可在此查看充提汇总或前往币种配置页上/下线币种。</span>
            <div className="button-row">
              <ExportCsvButton rows={assetSummaryRows} filename="wallet-asset-summary.csv" label="导出汇总 CSV" />
              {onNavigate && (
                <button type="button" className="primary" onClick={() => onNavigate("assets")}>管理平台上线币种 →</button>
              )}
            </div>
          </div>
          <DataTable rows={assetSummaryRows} columns={["币种", "名称", "上线状态", "充值笔数", "累计充值量", "提现笔数", "累计提现量"]} />
        </div>
      </Panel>
      <CustodyWithdrawalsPanel refreshKey={withdrawalsRevision}/>
      </>)}
      {loading || !dashboard || !finance || !operations ? <Panel title="托管钱包连接状态"><p role="status">{loading ? "正在同步托管钱包运营数据…" : "托管钱包运营数据尚未就绪，平台提现申请可在上方独立查询。"}</p></Panel> : <>
      <div className="metrics">
        <Metric label="启用链" value={counts.enabledChains ?? "—"} tone="ok" />
        <Metric label="启用 Token" value={counts.enabledTokens ?? "—"} tone="ok" />
        <Metric label="RPC 节点" value={counts.enabledRpcNodes ?? "—"} tone="warn" />
        <Metric label="地址数" value={counts.addresses ?? "—"} tone="ok" />
        <Metric label="充值记录" value={counts.deposits ?? "—"} tone="ok" />
        <Metric label="提现记录" value={counts.withdrawals ?? "—"} tone="warn" />
      </div>

      {tab === "onchain" && (
      <Panel title="链上运营总览">
        <div className="stack">
          <div className="metrics">
            <Metric label="启用链" value={operationTotals.enabled_chain_count ?? "—"} tone="ok" />
            <Metric label="活跃资产" value={operationTotals.active_asset_count ?? "—"} tone="ok" />
            <Metric label="RPC 节点" value={operationTotals.enabled_rpc_node_count ?? "—"} tone="warn" />
            <Metric label="用户地址" value={operationTotals.user_address_count ?? "—"} tone="ok" />
            <Metric label="热钱包" value={operationTotals.hot_wallet_count ?? "—"} tone="warn" />
            <Metric label="账本总额" value={operationTotals.total_balance ?? "—"} tone="ok" />
            <Metric label="未入账充值" value={operationTotals.pending_credit_deposit_count ?? "—"} tone="danger" />
            <Metric label="异常提现" value={operationTotals.exception_withdrawal_count ?? "—"} tone="danger" />
          </div>
          <div className="filters compact">
            <TextFilter label="Chain" value={operationFilters.chain} onChange={(value) => updateOperationFilters({ chain: value.toUpperCase() })} />
            <TextFilter label="Asset" value={operationFilters.assetSymbol} onChange={(value) => updateOperationFilters({ assetSymbol: value.toUpperCase() })} />
            <TextFilter label="User ID" value={operationFilters.userId} onChange={(value) => updateOperationFilters({ userId: value })} />
            <TextFilter label="Role" value={operationFilters.walletRole} onChange={(value) => updateOperationFilters({ walletRole: value.toUpperCase() })} />
            <TextFilter label="Address" value={operationFilters.address} onChange={(value) => updateOperationFilters({ address: value })} />
            <label>异常类型
              <Select value={operationFilters.eventType} onChange={(event) => updateOperationFilters({ eventType: event.target.value })}>
                {WALLET_OPERATION_EVENT_TYPES.map((type) => <option key={type} value={type}>{type || "ALL"}</option>)}
              </Select>
            </label>
            <label>异常状态
              <Select value={operationFilters.exceptionStatus} onChange={(event) => updateOperationFilters({ exceptionStatus: event.target.value })}>
                {WALLET_OPERATION_EXCEPTION_STATUSES.map((status) => <option key={status} value={status}>{status || "ALL"}</option>)}
              </Select>
            </label>
            <TextFilter label="Limit" value={operationFilters.limit} onChange={(value) => updateOperationFilters({ limit: value })} />
            <SortSelect label="列表排序" value={operationFilters.sort} options={UPDATED_AT_SORTS} onChange={(value) => updateOperationFilters({ sort: value })} />
            <button onClick={() => void load()}><Search size={16} />查询</button>
          </div>
          <div className="three-grid">
            <div className="stack">
              <h3>链状态</h3>
              <DataTable rows={records(operations?.chainStatuses as UnknownRecord[] | undefined)} maxColumns={10} />
            </div>
            <div className="stack">
              <h3>资产账本汇总</h3>
              <DataTable rows={records(operations?.ledgerByAsset as UnknownRecord[] | undefined)} maxColumns={8} />
            </div>
            <div className="stack">
              <h3>热钱包余额</h3>
              <DataTable rows={records(operations?.hotWallets as UnknownRecord[] | undefined)} maxColumns={9} />
            </div>
          </div>
          <div className="two-grid">
            <div className="stack">
              <h3>扫描高度</h3>
              <DataTable rows={records(operations?.scanHeights as UnknownRecord[] | undefined)} maxColumns={7} />
            </div>
            <div className="stack">
              <h3>异常聚合</h3>
              <DataTable rows={records(operations?.exceptionSummary as UnknownRecord[] | undefined)} maxColumns={7} />
            </div>
          </div>
        </div>
      </Panel>
      )}

      {tab === "withdrawals" && (
      <Panel title="资金审核">
        <div className="stack">
          <div className="metrics">
            <Metric label="24h 充值" value={financeTotals.deposit_amount ?? "—"} tone="ok" />
            <Metric label="24h 提现" value={financeTotals.withdrawal_amount ?? "—"} tone="warn" />
            <Metric label="冻结余额" value={financeTotals.locked_balance ?? "—"} tone="warn" />
            <Metric label="待审提现" value={financeTotals.pending_review_count ?? "—"} tone="danger" />
          </div>
          <div className="filters compact">
            <TextFilter label="Chain" value={withdrawalFilters.chain} onChange={(value) => updateWithdrawalFilters({ chain: value.toUpperCase() })} />
            <TextFilter label="Asset" value={withdrawalFilters.assetSymbol} onChange={(value) => updateWithdrawalFilters({ assetSymbol: value.toUpperCase() })} />
            <label>充值状态
              <Select value={withdrawalFilters.depositStatus} onChange={(event) => updateWithdrawalFilters({ depositStatus: event.target.value })}>
                <option value="">ALL</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="PENDING">PENDING</option>
                <option value="FAILED">FAILED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="BROADCAST_UNKNOWN">BROADCAST_UNKNOWN</option>
              </Select>
            </label>
            <label>已入账
              <Select value={withdrawalFilters.depositCredited} onChange={(event) => updateWithdrawalFilters({ depositCredited: event.target.value })}>
                <option value="">ALL</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </Select>
            </label>
            <label>状态
              <Select value={withdrawalFilters.status} onChange={(event) => updateWithdrawalFilters({ status: event.target.value })}>
                {WALLET_WITHDRAWAL_STATUSES.map((status) => <option key={status} value={status}>{status || "ALL"}</option>)}
              </Select>
            </label>
            <label>审核结果
              <Select value={withdrawalFilters.decision} onChange={(event) => updateWithdrawalFilters({ decision: event.target.value })}>
                <option value="">ALL</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
              </Select>
            </label>
            <TextFilter label="Admin ID" value={withdrawalFilters.adminUserId} onChange={(value) => updateWithdrawalFilters({ adminUserId: value })} />
            <TextFilter label="User ID" value={withdrawalFilters.userId} onChange={(value) => updateWithdrawalFilters({ userId: value })} />
            <TextFilter label="Order No" value={withdrawalFilters.orderNo} onChange={(value) => updateWithdrawalFilters({ orderNo: value })} />
            <TextFilter label="Limit" value={withdrawalFilters.limit} onChange={(value) => updateWithdrawalFilters({ limit: value })} />
            <TextFilter label="审核原因" value={withdrawalReviewReason} onChange={setWithdrawalReviewReason} />
            <SortSelect label="资金排序" value={withdrawalFilters.sort} options={UPDATED_AT_SORTS} onChange={(value) => updateWithdrawalFilters({ sort: value })} />
            <SortSelect label="审核排序" value={withdrawalFilters.reviewSort} options={CREATED_AT_SORTS} onChange={(value) => updateWithdrawalFilters({ reviewSort: value })} />
            <button onClick={() => void load()}><Search size={16} />查询</button>
          </div>
          <div className="three-grid">
            <div className="stack">
              <h3>资产汇总</h3>
              <DataTable rows={records(finance?.byAsset as UnknownRecord[] | undefined)} maxColumns={8} />
            </div>
            <div className="stack">
              <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <h3>充值记录</h3>
                <ExportCsvButton rows={financeDeposits} filename="wallet-deposits.csv" />
              </div>
              <CursorPager
                page={financeDepositPageInfo}
                cursor={withdrawalFilters.depositCursor}
                onNext={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, financeDepositPageInfo.nextCursor || "", withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
                onReset={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, "", withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
              />
              <DataTable rows={financeDeposits} maxColumns={10} />
            </div>
            <div className="stack">
              <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <h3>提现审核队列</h3>
                <ExportCsvButton rows={financeWithdrawals} filename="wallet-withdrawals.csv" />
              </div>
              <CursorPager
                page={financeWithdrawalPageInfo}
                cursor={withdrawalFilters.withdrawalCursor}
                onNext={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, financeWithdrawalPageInfo.nextCursor || "", withdrawalFilters.reviewCursor)}
                onReset={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, "", withdrawalFilters.reviewCursor)}
              />
              <DataTable rows={financeWithdrawals} maxColumns={10} actions={(row) => (
                String(row.status) === "PENDING_REVIEW" ? (
                  <>
                    <button onClick={() => void reviewWithdrawal(row, "approve")}>通过</button>
                    <button onClick={() => void reviewWithdrawal(row, "reject")}>拒绝</button>
                  </>
                ) : null
              )} />
            </div>
          </div>
          <div className="stack">
            <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3>提现审核记录</h3>
              <ExportCsvButton
                rows={financeWithdrawalReviews}
                columns={[
                  "review_id",
                  "decision",
                  "admin_user_id",
                  "admin_username",
                  "order_no",
                  "user_id",
                  "chain",
                  "asset_symbol",
                  "amount",
                  "fee",
                  "previous_status",
                  "next_status",
                  "reason",
                  "released_amount",
                  "created_at"
                ]}
                filename="wallet-withdrawal-reviews.csv"
              />
            </div>
            <CursorPager
              page={financeReviewPageInfo}
              cursor={withdrawalFilters.reviewCursor}
              onNext={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, financeReviewPageInfo.nextCursor || "")}
              onReset={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, "")}
            />
            <DataTable
              rows={financeWithdrawalReviews}
              columns={[
                "review_id",
                "decision",
                "admin_user_id",
                "admin_username",
                "order_no",
                "user_id",
                "chain",
                "asset_symbol",
                "amount",
                "fee",
                "previous_status",
                "next_status",
                "reason",
                "released_amount",
                "created_at"
              ]}
              maxColumns={15}
            />
          </div>
        </div>
      </Panel>
      )}

      {tab === "infra" && (
      <div className="three-grid">
        <Panel title="链配置">
          <DataTable rows={walletChainRows(runtime.chainProfiles as UnknownRecord[] | undefined)} maxColumns={9} />
        </Panel>
        <Panel title="RPC 节点">
          <DataTable rows={records(runtime.rpcNodes as UnknownRecord[] | undefined)} maxColumns={9} />
        </Panel>
        <Panel title="资产与 Token">
          <DataTable rows={[
            ...records(runtime.assets as UnknownRecord[] | undefined),
            ...records(runtime.tokens as UnknownRecord[] | undefined)
          ]} maxColumns={9} />
        </Panel>
      </div>
      )}

      {tab === "onchain" && (<>
      <div className="three-grid">
        <Panel title="余额快照">
          <DataTable rows={records(runtime.balances as UnknownRecord[] | undefined)} maxColumns={8} />
        </Panel>
        <Panel title="最近链上流水">
          <DataTable rows={records(runtime.transactions as UnknownRecord[] | undefined)} maxColumns={9} />
        </Panel>
        <Panel title="地址查询">
          <div className="stack">
            <div className="filters compact">
              <TextFilter label="Address" value={addressQuery.address} onChange={(value) => setAddressQuery({ ...addressQuery, address: value })} />
              <TextFilter label="Chain" value={addressQuery.chain} onChange={(value) => setAddressQuery({ ...addressQuery, chain: value.toUpperCase() })} />
              <TextFilter label="Limit" value={addressQuery.limit} onChange={(value) => setAddressQuery({ ...addressQuery, limit: value })} />
              <button onClick={() => void searchAddressTransactions()}><Search size={16} />查询</button>
            </div>
            <DataTable rows={addressTransactions} maxColumns={9} />
          </div>
        </Panel>
      </div>

      <div className="two-grid">
        <Panel title="后台地址账本">
          <div className="button-row" style={{ marginBottom: 8 }}>
            <ExportCsvButton
              rows={operationAddresses}
              columns={["chain", "asset_symbol", "user_id", "biz", "address", "wallet_role", "enabled", "available_balance", "locked_balance", "total_balance", "updated_at"]}
              filename="wallet-addresses.csv"
            />
          </div>
          <CursorPager
            page={operationAddressPageInfo}
            cursor={operationFilters.addressCursor}
            onNext={() => void load(operationAddressPageInfo.nextCursor || "", operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
            onReset={() => void load("", operationFilters.balanceCursor, operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
          />
          <DataTable
            rows={operationAddresses}
            columns={["chain", "asset_symbol", "user_id", "biz", "address", "wallet_role", "enabled", "available_balance", "locked_balance", "total_balance", "updated_at"]}
            maxColumns={11}
          />
        </Panel>
        <Panel title="非零余额账户">
          <div className="button-row" style={{ marginBottom: 8 }}>
            <ExportCsvButton
              rows={operationBalances}
              columns={["chain", "asset_symbol", "user_id", "address", "wallet_role", "available_balance", "locked_balance", "total_balance", "updated_at"]}
              filename="wallet-balances.csv"
            />
          </div>
          <CursorPager
            page={operationBalancePageInfo}
            cursor={operationFilters.balanceCursor}
            onNext={() => void load(operationFilters.addressCursor, operationBalancePageInfo.nextCursor || "", operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
            onReset={() => void load(operationFilters.addressCursor, "", operationFilters.exceptionCursor, withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
          />
          <DataTable
            rows={operationBalances}
            columns={["chain", "asset_symbol", "user_id", "address", "wallet_role", "available_balance", "locked_balance", "total_balance", "updated_at"]}
            maxColumns={9}
          />
        </Panel>
      </div>
      </>)}

      {tab === "withdrawals" && (
      <Panel title="充值提现异常流水">
        <div className="button-row" style={{ marginBottom: 8 }}>
          <ExportCsvButton
            rows={operationExceptions}
            columns={["event_type", "event_id", "order_no", "user_id", "chain", "asset_symbol", "amount", "fee", "status", "reason", "tx_hash", "from_address", "to_address", "updated_at"]}
            filename="wallet-exceptions.csv"
          />
        </div>
        <CursorPager
          page={operationExceptionPageInfo}
          cursor={operationFilters.exceptionCursor}
          onNext={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationExceptionPageInfo.nextCursor || "", withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
          onReset={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, "", withdrawalFilters.depositCursor, withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
        />
        <DataTable
          rows={operationExceptions}
          columns={["event_type", "event_id", "order_no", "user_id", "chain", "asset_symbol", "amount", "fee", "status", "reason", "tx_hash", "from_address", "to_address", "updated_at"]}
          maxColumns={14}
        />
      </Panel>
      )}
      </> }
    </Page>
  );
}

function walletChainRows(items: UnknownRecord[] | undefined | null): UnknownRecord[] {
  return records(items).sort((left, right) => {
    const taskOrder = Number(hasEnabledChainTask(right)) - Number(hasEnabledChainTask(left));
    if (taskOrder !== 0) return taskOrder;

    const profileOrder = Number(right.enabled === true) - Number(left.enabled === true);
    if (profileOrder !== 0) return profileOrder;

    const chainOrder = fieldText(left.chain).localeCompare(fieldText(right.chain));
    return chainOrder !== 0
      ? chainOrder
      : fieldText(left.network).localeCompare(fieldText(right.network));
  });
}

function hasEnabledChainTask(row: UnknownRecord): boolean {
  return row.scanEnabled === true
    || row.withdrawEnabled === true
    || row.collectionEnabled === true
    || row.transferEnabled === true;
}

function unwrapWallet<T>(response: WalletResponse<T>): T {
  if (response && typeof response === "object" && "code" in response && "data" in response) {
    const wrapped = response as { code?: number; message?: string; data?: T };
    if (wrapped.code !== undefined && wrapped.code !== 0) {
      throw new Error(wrapped.message || `wallet response code ${wrapped.code}`);
    }
    return wrapped.data as T;
  }
  return response as T;
}

function walletPageRows<K extends string>(page: WalletCursorPage<K> | UnknownRecord[] | null | undefined, key: K): UnknownRecord[] {
  if (Array.isArray(page)) {
    return records(page);
  }
  return records(page?.[key] ?? page?.items);
}

type WalletResponse<T> = T | { code?: number; message?: string; data?: T };

interface WalletDashboard extends UnknownRecord {
  project?: UnknownRecord;
  runtime?: UnknownRecord;
}

type WalletCursorPage<K extends string> = {
  count?: number;
  items?: UnknownRecord[];
  nextCursor?: string | null;
  hasMore?: boolean;
  sort?: string;
  limit?: number;
} & Partial<Record<K, UnknownRecord[]>>;
