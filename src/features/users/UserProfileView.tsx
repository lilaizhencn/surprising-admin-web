import { type UnknownRecord } from "../../types";
import { RefreshCw } from "lucide-react";
import { objectValue, extractRows } from "../../lib/adminData";
import { PRODUCT_LINES } from "../../lib/products";
import { Empty, Metric, DataTable, JsonBlock } from "../../components/AdminUi";

export function UserProfileView({
  profile,
  settleAsset,
  onSettleAssetChange,
  productLine,
  onProductLineChange,
  onRefresh,
  showAudit = true,
  showRaw = true,
  refreshLabel = "刷新聚合详情"
}: {
  profile: UnknownRecord | null;
  settleAsset: string;
  onSettleAssetChange: (value: string) => void;
  productLine?: string;
  onProductLineChange?: (value: string) => void;
  onRefresh: () => void;
  showAudit?: boolean;
  showRaw?: boolean;
  refreshLabel?: string;
}) {
  const account = objectValue(profile?.account);
  const trading = objectValue(profile?.trading);
  const risk = objectValue(profile?.risk);
  const balances = extractRows(account.balances, ["balances", "items"]);
  const productBalances = extractRows(account.productBalances, ["balances", "items"]);
  const positions = extractRows(account.positions, ["positions", "items"]);
  const accountLedger = extractRows(account.accountLedger, ["ledger", "records", "items"]);
  const productLedger = extractRows(account.productLedger, ["ledger", "records", "items"]);
  const transfers = extractRows(account.transfers, ["transfers", "records", "items"]);
  const orders = extractRows(trading.orders, ["orders", "items"]);
  const trades = extractRows(trading.trades, ["trades", "items"]);
  const triggerOrders = extractRows(trading.triggerOrders, ["orders", "items"]);
  const riskAccount = extractRows(risk.accountLatest);
  const riskPositions = extractRows(risk.positionsLatest, ["positions", "items"]);
  const sessions = extractRows(profile?.sessions, ["sessions"]);
  const logs = extractRows(profile?.loginLogs, ["logs"]);
  const errors = extractRows(profile?.errors);

  return (
    <div className="stack">
      <div className="filters compact">
        {onProductLineChange && (
          <label>产品线<select value={productLine ?? ""} onChange={(event) => onProductLineChange(event.target.value)}>{PRODUCT_LINES.filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        )}
        <label>结算资产<input value={settleAsset} onChange={(event) => onSettleAssetChange(event.target.value.toUpperCase())} /></label>
        <button onClick={onRefresh}><RefreshCw size={16} />{refreshLabel}</button>
      </div>
      {!profile ? <Empty text="正在等待聚合数据" /> : (
        <>
          <div className="metrics">
            <Metric label="余额条目" value={balances.length + productBalances.length} tone="muted" />
            <Metric label="持仓条目" value={positions.length} tone={positions.length > 0 ? "warn" : "ok"} />
            <Metric label="订单条目" value={orders.length + triggerOrders.length} tone="muted" />
            <Metric label="成交条目" value={trades.length} tone="muted" />
            {showAudit && <Metric label="活动会话" value={sessions.filter((item) => item.active).length} tone="muted" />}
            <Metric label="聚合错误" value={errors.length} tone={errors.length ? "danger" : "ok"} />
          </div>
          {errors.length > 0 && (
            <div className="alert danger">
              <DataTable rows={errors} columns={["service", "section", "httpStatus", "message", "targetUri"]} />
            </div>
          )}
          <div className="profile-sections">
            <ProfileSection title="资金余额">
              <DataTable rows={balances} columns={["userId", "asset", "availableUnits", "lockedUnits", "equityUnits", "updatedAt"]} />
            </ProfileSection>
            <ProfileSection title="产品账户">
              <DataTable rows={productBalances} columns={["userId", "accountType", "asset", "availableUnits", "lockedUnits", "equityUnits", "updatedAt"]} />
            </ProfileSection>
            <ProfileSection title="合约持仓">
              <DataTable rows={positions} columns={["userId", "instrumentId", "marginMode", "positionSide", "signedQuantitySteps", "entryPriceTicks", "updatedAt"]} />
            </ProfileSection>
            <ProfileSection title="风险快照">
              <DataTable rows={[...riskAccount, ...riskPositions]} maxColumns={8} />
            </ProfileSection>
            <ProfileSection title="普通订单">
              <DataTable rows={orders} columns={["orderId", "userId", "instrumentId", "side", "positionSide", "orderType", "status", "remainingQuantitySteps", "updatedAt"]} />
            </ProfileSection>
            <ProfileSection title="触发订单">
              <DataTable rows={triggerOrders} columns={["triggerOrderId", "userId", "instrumentId", "side", "positionSide", "triggerType", "status", "triggerPriceTicks", "activationPriceTicks", "callbackRatePpm", "updatedAt"]} />
            </ProfileSection>
            <ProfileSection title="成交明细">
              <DataTable rows={trades} columns={["tradeId", "orderId", "userId", "instrumentId", "priceTicks", "quantitySteps", "createdAt"]} />
            </ProfileSection>
            <ProfileSection title="资金流水">
              <DataTable rows={[...accountLedger, ...productLedger, ...transfers]} maxColumns={8} />
            </ProfileSection>
            {showAudit && (
              <ProfileSection title="登录审计" wide>
                <DataTable rows={logs} columns={["loginId", "userId", "result", "reason", "ipAddress", "userAgent", "createdAt"]} />
              </ProfileSection>
            )}
          </div>
          {showRaw && (
            <details className="raw-toggle">
              <summary>原始聚合响应</summary>
              <JsonBlock value={profile} />
            </details>
          )}
        </>
      )}
    </div>
  );
}

function ProfileSection({ title, wide = false, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`profile-section${wide ? " wide" : ""}`}>
      <h4>{title}</h4>
      {children}
    </div>
  );
}
