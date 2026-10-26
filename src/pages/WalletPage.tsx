import { parseApiJson } from "../api/client";
import { useState, useEffect, useRef } from "react";
import { type UnknownRecord } from "../types";
import { gatewayGet, walletFinanceSummary, walletOperationsOverview, walletOperationAddresses, walletOperationBalances, walletOperationExceptions, walletFinanceDeposits, walletFinanceWithdrawals, walletFinanceWithdrawalReviews, approveWalletWithdrawal, rejectWalletWithdrawal, gatewayPatch } from "../api/admin";
import { CustodyWithdrawalsPanel } from "../features/CustodyWithdrawalsPanel";
import { Search } from "lucide-react";
import { cursorInfo, Page, Metric, Panel, TextFilter, SortSelect, DataTable, CursorPager, TwoColumn, KeyValue } from "../components/AdminUi";
import { errorMessage, records, fieldText } from "../lib/adminData";
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

export default function WalletPage() {
  const reads = useRef<AbortController | null>(null);
  const [withdrawalsRevision, setWithdrawalsRevision] = useState(0);
  const [dashboard, setDashboard] = useState<WalletDashboard | null>(null);
  const [admin, setAdmin] = useState<WalletAdminConfig | null>(null);
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
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedRow, setSelectedRow] = useState<UnknownRecord | null>(null);
  const [updateJson, setUpdateJson] = useState("{}");
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
      setDashboard(null); setAdmin(null); setFinance(null); setOperations(null);
      const [
        dashboardResponse,
        adminResponse,
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
        gatewayGet<WalletResponse<WalletAdminConfig>>("wallet-admin", "/config", { limit: 200 }, controller.signal),
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
      const nextAdmin = unwrapWallet(adminResponse);
      const tableNames = walletTableNames(nextAdmin);
      setDashboard(nextDashboard);
      setAdmin(nextAdmin);
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
      setSelectedTable((current) => current && tableNames.includes(current) ? current : tableNames[0] ?? "");
      setSelectedRow(null);
      setUpdateJson("{}");
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

  function beginEdit(row: UnknownRecord) {
    const editable = walletEditableColumns(admin, selectedTable);
    const updates: UnknownRecord = {};
    for (const column of editable) {
      if (Object.prototype.hasOwnProperty.call(row, column)) {
        updates[column] = row[column];
      }
    }
    setSelectedRow(row);
    setUpdateJson(JSON.stringify(updates, null, 2));
  }

  async function saveConfigUpdate() {
    if (!selectedTable || !selectedRow) return;
    const idColumn = walletIdColumn(admin, selectedTable);
    const id = selectedRow[idColumn];
    if (id === undefined || id === null || id === "") {
      setError(`当前行缺少主键字段 ${idColumn}`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const updates = parseApiJson<UnknownRecord>(updateJson);
      await gatewayPatch<WalletResponse<UnknownRecord>>(
        "wallet-admin",
        `/config/${selectedTable}/${encodeURIComponent(String(id))}`,
        { updates }
      );
      await load();
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
  const tableNames = walletTableNames(admin);
  const tableRows = walletRows(admin, selectedTable);
  const tableMeta = walletMetadata(admin, selectedTable);
  const editableColumns = walletEditableColumns(admin, selectedTable);

  return (
    <Page title="钱包运营" onRefresh={async () => { setWithdrawalsRevision(value => value + 1); await load(); }} loading={loading} error={error}>
      <CustodyWithdrawalsPanel refreshKey={withdrawalsRevision}/>
      {loading || !dashboard || !admin || !finance || !operations ? <Panel title="托管钱包连接状态"><p role="status">{loading ? "正在同步托管钱包运营数据…" : "托管钱包运营数据尚未就绪，平台提现申请可在上方独立查询。"}</p></Panel> : <>
      <div className="metrics">
        <Metric label="启用链" value={counts.enabledChains ?? "—"} tone="ok" />
        <Metric label="启用 Token" value={counts.enabledTokens ?? "—"} tone="ok" />
        <Metric label="RPC 节点" value={counts.enabledRpcNodes ?? "—"} tone="warn" />
        <Metric label="地址数" value={counts.addresses ?? "—"} tone="ok" />
        <Metric label="充值记录" value={counts.deposits ?? "—"} tone="ok" />
        <Metric label="提现记录" value={counts.withdrawals ?? "—"} tone="warn" />
      </div>

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
              <select value={operationFilters.eventType} onChange={(event) => updateOperationFilters({ eventType: event.target.value })}>
                {WALLET_OPERATION_EVENT_TYPES.map((type) => <option key={type} value={type}>{type || "ALL"}</option>)}
              </select>
            </label>
            <label>异常状态
              <select value={operationFilters.exceptionStatus} onChange={(event) => updateOperationFilters({ exceptionStatus: event.target.value })}>
                {WALLET_OPERATION_EXCEPTION_STATUSES.map((status) => <option key={status} value={status}>{status || "ALL"}</option>)}
              </select>
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
              <select value={withdrawalFilters.depositStatus} onChange={(event) => updateWithdrawalFilters({ depositStatus: event.target.value })}>
                <option value="">ALL</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="PENDING">PENDING</option>
                <option value="FAILED">FAILED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="BROADCAST_UNKNOWN">BROADCAST_UNKNOWN</option>
              </select>
            </label>
            <label>已入账
              <select value={withdrawalFilters.depositCredited} onChange={(event) => updateWithdrawalFilters({ depositCredited: event.target.value })}>
                <option value="">ALL</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label>状态
              <select value={withdrawalFilters.status} onChange={(event) => updateWithdrawalFilters({ status: event.target.value })}>
                {WALLET_WITHDRAWAL_STATUSES.map((status) => <option key={status} value={status}>{status || "ALL"}</option>)}
              </select>
            </label>
            <label>审核结果
              <select value={withdrawalFilters.decision} onChange={(event) => updateWithdrawalFilters({ decision: event.target.value })}>
                <option value="">ALL</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
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
              <h3>充值记录</h3>
              <CursorPager
                page={financeDepositPageInfo}
                cursor={withdrawalFilters.depositCursor}
                onNext={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, financeDepositPageInfo.nextCursor || "", withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
                onReset={() => void load(operationFilters.addressCursor, operationFilters.balanceCursor, operationFilters.exceptionCursor, "", withdrawalFilters.withdrawalCursor, withdrawalFilters.reviewCursor)}
              />
              <DataTable rows={financeDeposits} maxColumns={10} />
            </div>
            <div className="stack">
              <h3>提现审核队列</h3>
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
            <h3>提现审核记录</h3>
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

      <TwoColumn>
        <Panel title="项目状态">
          <KeyValue data={(dashboard?.project ?? {}) as UnknownRecord} />
        </Panel>
        <Panel title="安全与密钥状态">
          <DataTable rows={records(admin?.secretStatus)} maxColumns={6} />
        </Panel>
      </TwoColumn>

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

      <Panel title="充值提现异常流水">
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

      <Panel title="钱包配置治理">
        <div className="stack">
          <div className="filters">
            <label>配置表
              <select value={selectedTable} onChange={(event) => {
                setSelectedTable(event.target.value);
                setSelectedRow(null);
                setUpdateJson("{}");
              }}>
                {tableNames.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
            <label>主键<input value={walletIdColumn(admin, selectedTable)} readOnly /></label>
            <label>可编辑字段<input value={editableColumns.join(", ")} readOnly /></label>
          </div>
          <KeyValue data={tableMeta} />
          <DataTable rows={tableRows} maxColumns={10} actions={(row) => (
            <button onClick={() => beginEdit(row)}>编辑</button>
          )} />
          <div className="two-grid">
            <textarea className="json-editor small" value={updateJson} onChange={(event) => setUpdateJson(event.target.value)} />
            <div className="stack">
              <KeyValue data={selectedRow ?? {}} />
              <button className="primary" disabled={!selectedRow || loading} onClick={() => void saveConfigUpdate()}>
                保存配置更新
              </button>
            </div>
          </div>
        </div>
      </Panel>
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

function walletTableNames(admin: WalletAdminConfig | null): string[] {
  const metadata = admin?.tables ?? {};
  const rows = admin?.rows ?? {};
  const names = new Set([...Object.keys(metadata), ...Object.keys(rows)]);
  return Array.from(names);
}

function walletMetadata(admin: WalletAdminConfig | null, table: string): UnknownRecord {
  if (!admin || !table) return {};
  return (admin.tables?.[table] ?? {}) as UnknownRecord;
}

function walletRows(admin: WalletAdminConfig | null, table: string): UnknownRecord[] {
  if (!admin || !table) return [];
  return records(admin.rows?.[table]);
}

function walletIdColumn(admin: WalletAdminConfig | null, table: string): string {
  const metadata = walletMetadata(admin, table);
  return typeof metadata.idColumn === "string" && metadata.idColumn ? metadata.idColumn : "id";
}

function walletEditableColumns(admin: WalletAdminConfig | null, table: string): string[] {
  const metadata = walletMetadata(admin, table);
  return Array.isArray(metadata.editableColumns)
    ? metadata.editableColumns.map(String)
    : [];
}

type WalletResponse<T> = T | { code?: number; message?: string; data?: T };

interface WalletDashboard extends UnknownRecord {
  project?: UnknownRecord;
  runtime?: UnknownRecord;
}

interface WalletAdminConfig extends UnknownRecord {
  tables?: Record<string, UnknownRecord>;
  rows?: Record<string, UnknownRecord[]>;
  secretStatus?: UnknownRecord[];
}

type WalletCursorPage<K extends string> = {
  count?: number;
  items?: UnknownRecord[];
  nextCursor?: string | null;
  hasMore?: boolean;
  sort?: string;
  limit?: number;
} & Partial<Record<K, UnknownRecord[]>>;
