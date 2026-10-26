import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import {
  actOnCustodyWithdrawal,
  custodyWithdrawalActions,
  custodyWithdrawalStatuses,
  loadCustodyWithdrawals,
  type CustodyWithdrawal,
  type CustodyWithdrawalAction,
} from "../api/custodyWithdrawals";
import { DataTable, Panel } from "../components/AdminUi";
import { ApiError } from "../api/client";
import { errorMessage } from "../lib/adminData";
import "./CustodyWithdrawalsPanel.css";

const statusLabels: Record<string, string> = {
  PENDING_APPROVAL: "待平台审批",
  PROCESSING: "平台处理中",
  DEBIT_UNKNOWN: "资金扣款待确认",
  DEBITED: "已扣款",
  BROADCAST_UNKNOWN: "托管广播待确认",
  SUBMITTED: "已提交托管",
  COMPLETED: "已完成",
  FAILED_PENDING: "失败待核对",
  REFUND_PENDING: "退款待确认",
  REFUNDED: "已退款",
  REJECTED: "已拒绝",
};
const detailFields = [
  ["withdrawalId", "平台申请编号"],
  ["idempotencyKey", "客户请求编号"],
  ["userId", "用户 ID"],
  ["chain", "网络"],
  ["assetSymbol", "资产"],
  ["amount", "提现金额"],
  ["amountUnits", "金额（最小单位）"],
  ["toAddress", "完整收款地址"],
  ["status", "平台状态"],
  ["walletWithdrawalId", "托管提现编号"],
  ["externalReference", "托管关联编号"],
  ["errorCode", "错误代码"],
  ["errorMessage", "处理说明"],
  ["createdAt", "申请时间"],
  ["updatedAt", "更新时间"],
  ["submittedAt", "提交托管时间"],
  ["completedAt", "完成时间"],
  ["adminUserId", "操作人 ID"],
  ["adminUsername", "操作人"],
  ["adminReason", "操作原因"],
] as const;
const actionLabels: Record<CustodyWithdrawalAction, string> = {
  approve: "通过申请",
  reject: "拒绝申请",
  retry: "重试原申请",
};

export function CustodyWithdrawalsPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [status, setStatus] = useState("PENDING_APPROVAL");
  const [limit, setLimit] = useState("50");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    scope: string;
    rows: CustodyWithdrawal[];
    error: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [writing, setWriting] = useState(false);
  const pendingWrite = useRef(false);
  const alive = useRef(true);
  const detailHeading = useRef<HTMLHeadingElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [writeError, setWriteError] = useState("");
  const [notice, setNotice] = useState("");
  const scope = `${status}:${limit}`;
  const rows = result?.scope === scope ? result.rows : [];
  const error = result?.scope === scope ? result.error : "";
  const selected =
    !loading && !error ? rows.find((row) => row.withdrawalId === selectedId) : undefined;
  const filtered = rows.filter((row) =>
    [
      row.userId,
      row.withdrawalId,
      row.toAddress,
      row.assetSymbol,
      row.chain,
      row.idempotencyKey,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    ),
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    setSelectedId("");
    setReason("");
    void loadCustodyWithdrawals(status, Number(limit), controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) {
          setResult({ scope, rows, error: "" });
          setLoading(false);
          setNeedsRefresh(false);
        }
      },
      (error) => {
        if (!controller.signal.aborted) {
          setResult({ scope, rows: [], error: errorMessage(error) });
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [scope, status, limit, revision, refreshKey]);

  useEffect(() => {
    if (selected) {
      detailHeading.current?.focus();
      detailHeading.current?.scrollIntoView({ block: "start" });
    }
  }, [selected?.withdrawalId]);

  async function act(row: CustodyWithdrawal, action: CustodyWithdrawalAction) {
    if (pendingWrite.current || needsRefresh) return;
    setWriteError("");
    setNotice("");
    if (!reason.trim() || reason.trim().length > 500) {
      setWriteError("请填写 1 至 500 字的操作原因。");
      return;
    }
    if (
      !window.confirm(
        `确认${actionLabels[action]}？\n用户：${row.userId}\n来源：SPOT 资金账户\n金额：${row.amount} ${row.assetSymbol}\n网络：${row.chain}\n收款地址：${row.toAddress}\n申请：${row.withdrawalId}\n原因：${reason.trim()}`,
      )
    )
      return;
    pendingWrite.current = true;
    setWriting(true);
    try {
      const nextStatus = await actOnCustodyWithdrawal(row, action, reason);
      if (alive.current) {
        setNotice(
          `原申请已返回状态：${statusLabels[nextStatus] ?? nextStatus}。此状态不代表链上转账已完成。`,
        );
        setRevision((value) => value + 1);
      }
    } catch (error) {
      if (alive.current) {
        setWriteError(errorMessage(error));
        if (error instanceof ApiError) setNeedsRefresh(true);
      }
    } finally {
      pendingWrite.current = false;
      if (alive.current) setWriting(false);
    }
  }

  return (
    <div className="custody-withdrawals">
      <Panel title="平台提现申请">
        <p className="custody-withdrawals-description">
          <ShieldCheck size={17} aria-hidden="true" />
          来源为 SPOT
          资金账户，按平台申请编号追踪审批、扣款、托管提交和退款状态。托管钱包运营连接失败时，此列表仍独立可用。
        </p>
        <fieldset className="custody-withdrawals-fields" disabled={writing}>
          <div className="filters">
            <label>
              平台提现状态
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setWriteError("");
                  setNotice("");
                }}
              >
                <option value="">全部状态</option>
                {custodyWithdrawalStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]} · {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              最多读取
              <select value={limit} onChange={(event) => setLimit(event.target.value)}>
                {[50, 100, 200].map((value) => (
                  <option key={value} value={value}>
                    {value} 条
                  </option>
                ))}
              </select>
            </label>
            <label className="custody-withdrawal-search">
              筛选已加载申请
              <div>
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedId("");
                    setReason("");
                    setWriteError("");
                  }}
                  placeholder="用户、编号、地址、币种或网络"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={() => setRevision((value) => value + 1)}
              disabled={loading}
              aria-busy={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : undefined} aria-hidden="true" />
              {loading ? "同步中…" : "刷新申请"}
            </button>
          </div>
          {needsRefresh ? (
            <p role="status" className="custody-withdrawals-count">
              操作结果需核对，请先刷新申请，再决定下一步。
            </p>
          ) : null}
          {notice ? (
            <div className="alert" role="status">
              {notice}
            </div>
          ) : null}
          {writeError ? (
            <div className="alert danger" role="alert">
              {writeError}
            </div>
          ) : null}
          {error ? (
            <div className="alert danger state-alert" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setRevision((value) => value + 1)}>
                重新查询申请
              </button>
            </div>
          ) : null}
          <p className="custody-withdrawals-count" role="status">
            {loading
              ? "正在读取平台提现申请…"
              : error
                ? "申请读取失败，未展示旧记录。"
                : `已加载 ${rows.length} 条，筛选后 ${filtered.length} 条。${rows.length >= Number(limit) ? "已达到读取上限，可缩小状态范围或提高上限。" : ""}`}
          </p>
          <DataTable
            label="平台提现申请列表"
            loading={loading}
            rows={error ? [] : filtered}
            error={error ? "平台提现申请暂不可用，请重新查询。" : ""}
            emptyText={query ? "没有匹配的已加载申请。" : "暂无该状态的平台提现申请。"}
            columns={[
              "withdrawalId",
              "userId",
              "chain",
              "assetSymbol",
              "amount",
              "status",
              "createdAt",
            ]}
            rowActionLabel="查看申请"
            onRowClick={(row) => {
              returnFocus.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
              setSelectedId(String(row.withdrawalId));
              setReason("");
              setWriteError("");
            }}
            rowActionDisabled={writing}
            isSelected={(row) => row.withdrawalId === selectedId}
          />
          {selected ? (
            <section className="custody-withdrawal-detail" aria-label="平台提现申请详情">
              <div className="custody-withdrawal-detail-heading">
                <h4 ref={detailHeading} tabIndex={-1}>
                  申请详情
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId("");
                    if (returnFocus.current?.isConnected) returnFocus.current.focus();
                  }}
                >
                  <X size={16} aria-hidden="true" />
                  关闭详情
                </button>
              </div>
              <p>资金来源：SPOT / 资金账户。{statusLabels[selected.status] ?? selected.status}。</p>
              <dl className="custody-withdrawal-facts">
                {detailFields
                  .filter(([key]) =>
                    [
                      "withdrawalId",
                      "idempotencyKey",
                      "userId",
                      "chain",
                      "assetSymbol",
                      "amount",
                      "amountUnits",
                      "toAddress",
                      "status",
                      "createdAt",
                    ].includes(key),
                  )
                  .map(([key, label]) => (
                    <div
                      key={key}
                      data-wide={
                        [
                          "withdrawalId",
                          "idempotencyKey",
                          "toAddress",
                          "walletWithdrawalId",
                          "externalReference",
                          "errorMessage",
                          "adminReason",
                        ].includes(key) ||
                        String(selected[key] ?? "").length >= 16 ||
                        undefined
                      }
                    >
                      <dt>{label}</dt>
                      <dd>{String(selected[key] ?? "—")}</dd>
                    </div>
                  ))}
              </dl>
              <details className="custody-withdrawal-audit">
                <summary>处理与审计记录</summary>
                <dl className="custody-withdrawal-facts">
                  {detailFields
                    .filter(
                      ([key]) =>
                        ![
                          "withdrawalId",
                          "idempotencyKey",
                          "userId",
                          "chain",
                          "assetSymbol",
                          "amount",
                          "amountUnits",
                          "toAddress",
                          "status",
                          "createdAt",
                        ].includes(key),
                    )
                    .map(([key, label]) => (
                      <div
                        key={key}
                        data-wide={
                          [
                            "withdrawalId",
                            "idempotencyKey",
                            "toAddress",
                            "walletWithdrawalId",
                            "externalReference",
                            "errorMessage",
                            "adminReason",
                          ].includes(key) ||
                          String(selected[key] ?? "").length >= 16 ||
                          undefined
                        }
                      >
                        <dt>{label}</dt>
                        <dd>{String(selected[key] ?? "—")}</dd>
                      </div>
                    ))}
                </dl>
              </details>
              {custodyWithdrawalActions(selected.status).length ? (
                <div className="custody-withdrawal-review">
                  <label>
                    平台提现操作原因
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="记录已核对的事实与操作依据"
                    />
                  </label>
                  <p>
                    操作沿用原申请编号，并继续经过现有敏感操作审批。未知结果先核对，重试不会创建新的提现申请。
                  </p>
                  <div className="button-row">
                    {custodyWithdrawalActions(selected.status).map((action) => (
                      <button
                        type="button"
                        key={action}
                        className={action === "reject" ? "danger" : "primary"}
                        disabled={writing || needsRefresh}
                        onClick={() => void act(selected, action)}
                      >
                        {action === "approve" ? (
                          <Check size={16} aria-hidden="true" />
                        ) : action === "reject" ? (
                          <X size={16} aria-hidden="true" />
                        ) : (
                          <RefreshCw size={16} aria-hidden="true" />
                        )}
                        {writing ? "处理中…" : actionLabels[action]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="custody-withdrawals-count">
                  当前状态无人工审批或重试操作，请刷新查看后续进度。
                </p>
              )}
            </section>
          ) : null}
        </fieldset>
      </Panel>
    </div>
  );
}
