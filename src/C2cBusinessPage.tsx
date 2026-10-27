import { useEffect, useRef, useState } from "react";
import { c2cBusinessRead, c2cBusinessWrite, type C2cRow } from "./api/c2cBusiness";
import { C2cChatPage } from "./C2cChatPage";
import type { AuthSession } from "./types";
import { DataTable, Empty, KeyValue } from "./components/AdminUi";
import { RefreshCw, ShieldCheck } from "lucide-react";
import {
  c2cReviewPage,
  c2cRowId,
  c2cConfiguration,
  c2cBondPolicy,
  c2cReconciliation,
  c2cPaymentDetails,
  c2cAppealOrder,
  c2cDecisions,
  c2cStatusFilters,
  type C2cReviewSection,
} from "./lib/c2cReview";
import "./C2cBusinessPage.css";

const items = (value: unknown): C2cRow[] => (Array.isArray(value) ? (value as C2cRow[]) : []);
const text = (value: unknown) => (value == null ? "—" : String(value));
const state: Record<string, string> = {
  VERIFIED: "已认证",
  UNVERIFIED: "未认证",
  RESOLVED: "已裁决",
  REVIEW_REQUIRED: "需人工核对",
  APPEALED: "申诉中",
  PAYMENT_PENDING: "待付款",
  PAID: "已付款待放币",
  RELEASE_PENDING: "放币处理中",
  REFUND_PENDING: "退款处理中",
  COMPLETED: "已完成",
  CANCELED: "已取消",
  EXPIRED: "已超时",
  RELEASE: "裁决放币",
  REFUND: "退回原卖家",
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "未通过",
  SUSPENDED: "已停用",
  WITHDRAWN: "已退出",
  LOCKED: "已质押",
  RESERVING: "资金确认中",

  RETURNED: "已退回",
  FAILED: "失败",
  ACTIVE: "已上架",
  PAUSED: "已暂停",
  CLOSED: "已关闭",
  OPEN: "待处理",
  REVIEWING: "处理中",
  MATCHED: "核对一致",
  MISMATCH: "核对不一致",
  UNAVAILABLE: "查询未就绪",
};
const label = (v: unknown) => state[text(v)] || text(v);
const decisionLabels: Record<string, string> = {
  APPROVE: "核实后通过",
  REJECT: "拒绝",
  SUSPEND: "停用商家",
  DISABLE: "停用账户",
  PAUSE: "暂停广告",
  RESUME: "恢复广告",
  RELEASE: "裁决放币",
  REFUND: "退回原卖家",
};
type Section = "configuration" | "merchants" | "payment-accounts" | "ads" | "appeals" | "chat";
export function C2cBusinessPage({ session }: { session: AuthSession }) {
  return (
    <Business
      key={String(session.user.userId)}
      session={session}
      owner={String(session.user.userId)}
    />
  );
}
function Business({ session, owner }: { session: AuthSession; owner: string }) {
  const [identityChecked, setIdentityChecked] = useState(false);
  const [section, setSection] = useState<Section>("merchants"),
    [revision, refresh] = useState(0);
  const [rows, setRows] = useState<C2cRow[]>([]),
    [config, setConfig] = useState<C2cRow>({}),
    [policy, setPolicy] = useState<C2cRow>({}),
    [reconciliation, setReconciliation] = useState<C2cRow>({});
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState(""),
    [writeBlocked, setWriteBlocked] = useState(false);
  const [selected, setSelected] = useState<C2cRow | null>(null),
    [reason, setReason] = useState(""),
    [details, setDetails] = useState<C2cRow | null>(null),
    [detailsLoading, setDetailsLoading] = useState(false),
    [detailsError, setDetailsError] = useState("");
  const live = useRef(true),
    operation = useRef(false),
    selectedKey = useRef("");
  const detailRequest = useRef<AbortController | null>(null),
    detailPanel = useRef<HTMLElement | null>(null);
  const failureText = (failure: unknown) =>
    failure instanceof Error ? failure.message : "读取未完成，请重试。";
  const clearSelection = () => {
    detailRequest.current?.abort();
    selectedKey.current = "";
    setSelected(null);
    setDetails(null);
    setDetailsLoading(false);
    setDetailsError("");
    setIdentityChecked(false);
    setReason("");
  };
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      detailRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (section === "chat") return;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    setRows([]);
    setMore(false);
    clearSelection();
    void (async () => {
      if (section === "configuration") {
        const values = await Promise.allSettled([
          c2cBusinessRead(owner, "/configuration", abort.signal).then(c2cConfiguration),
          c2cBusinessRead(owner, "/merchant-bond-policy", abort.signal).then(c2cBondPolicy),
          c2cBusinessRead(owner, "/reconciliation", abort.signal).then(c2cReconciliation),
        ]);
        if (abort.signal.aborted) return;
        const [configuration, bond, report] = values;
        setReady({
          configuration: configuration.status === "fulfilled",
          policy: bond.status === "fulfilled",
          reconciliation: report.status === "fulfilled",
        });
        if (configuration.status === "fulfilled") {
          setConfig(configuration.value);
          setWriteBlocked(false);
        }
        if (bond.status === "fulfilled") setPolicy(bond.value);
        if (report.status === "fulfilled") setReconciliation(report.value);
        setError(
          values
            .flatMap((value) => (value.status === "rejected" ? [failureText(value.reason)] : []))
            .join("\n"),
        );
      } else {
        const query = new URLSearchParams({
          limit: "30",
          offset: String(offset),
          ...(statusFilter ? { status: statusFilter } : {}),
        });
        const result = c2cReviewPage(
          await c2cBusinessRead(owner, `/${section}?${query}`, abort.signal),
          section,
          offset,
        );
        if (statusFilter && result.items.some((row) => row.status !== statusFilter))
          throw Error("C2C 状态与当前筛选不匹配。");
        if (abort.signal.aborted) return;
        setRows(result.items);
        setMore(result.hasMore);
        setWriteBlocked(false);
      }
    })()
      .catch((failure) => {
        if (!abort.signal.aborted) setError(failureText(failure));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [owner, section, revision, offset, statusFilter]);
  useEffect(() => {
    if (
      section !== "configuration" ||
      !ready.reconciliation ||
      !["UNAVAILABLE", "PENDING"].includes(String(reconciliation.status))
    )
      return;
    const abort = new AbortController();
    let attempts = 0,
      reading = false;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || operation.current || reading) return;
      if (++attempts > 30) {
        clearInterval(timer);
        return;
      }
      reading = true;
      void c2cBusinessRead(owner, "/reconciliation", abort.signal)
        .then(c2cReconciliation)
        .then((value) => {
          if (!abort.signal.aborted) setReconciliation(value);
        })
        .catch((failure) => {
          if (!abort.signal.aborted) setError(failureText(failure));
        })
        .finally(() => {
          reading = false;
        });
    }, 2000);
    return () => {
      clearInterval(timer);
      abort.abort();
    };
  }, [owner, section, reconciliation.status, ready.reconciliation]);
  const run = async (action: () => Promise<unknown>) => {
    if (operation.current || loading || writeBlocked) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (live.current) {
        setNotice("操作已提交，请核对重新读取后的业务状态。");
        refresh((value) => value + 1);
      }
    } catch (failure) {
      if (live.current) {
        setError(failureText(failure) + " 请重新读取原记录，核对结果后再继续。");
        setRows([]);
        clearSelection();
        setWriteBlocked(true);
      }
    } finally {
      operation.current = false;
      if (live.current) setBusy(false);
    }
  };
  const loadDetails = async (row: C2cRow) => {
    if (section !== "payment-accounts" && section !== "appeals") return;
    const target = c2cRowId(section, row),
      abort = new AbortController();
    detailRequest.current?.abort();
    detailRequest.current = abort;
    setDetails(null);
    setDetailsError("");
    setDetailsLoading(true);
    setIdentityChecked(false);
    try {
      const response = await c2cBusinessRead(
        owner,
        section === "payment-accounts"
          ? `/payment-accounts/${row.accountId}`
          : `/orders/${row.orderId}`,
        abort.signal,
      );
      const value =
        section === "payment-accounts"
          ? c2cPaymentDetails(response, row)
          : c2cAppealOrder(response, row.orderId);
      if (!abort.signal.aborted && selectedKey.current === target) setDetails(value);
    } catch (failure) {
      if (!abort.signal.aborted && selectedKey.current === target)
        setDetailsError(failureText(failure));
    } finally {
      if (!abort.signal.aborted) setDetailsLoading(false);
    }
  };
  const open = (row: C2cRow) => {
    if (
      operation.current ||
      loading ||
      writeBlocked ||
      section === "configuration" ||
      section === "chat"
    )
      return;
    clearSelection();
    selectedKey.current = c2cRowId(section, row);
    setSelected(row);
    setNotice("");
    if (section === "appeals") void loadDetails(row);
  };
  useEffect(() => {
    if (selected) {
      detailPanel.current?.focus({ preventScroll: true });
      detailPanel.current?.scrollIntoView({ block: "start" });
    }
  }, [selected]);
  const selfReview =
    !!selected &&
    (section === "merchants" || section === "payment-accounts") &&
    String(selected.userId) === owner;
  const independent = !!details && details.buyerUserId !== owner && details.sellerUserId !== owner;
  const kycValid =
    !!details &&
    details.kycStatus === "VERIFIED" &&
    (details.kycExpiresAt === null || Date.parse(String(details.kycExpiresAt)) > Date.now());
  const decide = (decision: string) => {
    if (
      !selected ||
      operation.current ||
      loading ||
      writeBlocked ||
      section === "configuration" ||
      section === "chat" ||
      reason.trim().length < 5
    )
      return;
    const row = selected,
      id = c2cRowId(section, row);
    if (selfReview || !c2cDecisions(section, row).includes(decision)) return;
    if (
      section === "payment-accounts" &&
      decision === "APPROVE" &&
      (!details || !identityChecked || !kycValid)
    )
      return;
    if (section === "appeals" && (!details || !independent || details.status !== "APPEALED"))
      return;
    const common = { revision: row.revision, reason: reason.trim() };
    const body =
      section === "merchants"
        ? { ...common, decision, tier: "VERIFIED" }
        : section === "payment-accounts"
          ? { ...common, decision, identityChecked: decision === "APPROVE" && identityChecked }
          : section === "ads"
            ? { ...common, action: decision }
            : { decision, reason: reason.trim() };
    const suffix = section === "ads" ? "status" : section === "appeals" ? "decision" : "review";
    const target =
      section === "appeals" && details
        ? `\n原订单：${details.orderId}\n买方：${details.buyerUserId}\n卖方：${details.sellerUserId}\n数量：${details.quantity} ${String((details.market as C2cRow).asset)}\n金额：${details.fiatAmount} ${String((details.market as C2cRow).fiat)}\n沿用另一管理员审批，不修改原收款人或金额。`
        : `\n当前状态：${label(row.status)}\n版本：${row.revision}`;
    if (
      !window.confirm(
        `确认${decisionLabels[decision]}？\n对象：${id}${target}\n原因：${reason.trim()}`,
      )
    )
      return;
    void run(async () => {
      const result = await c2cBusinessWrite(owner, `/${section}/${id}/${suffix}`, body);
      if (section === "appeals") c2cAppealOrder(result, row.orderId);
      else if (
        String(
          result[
            section === "merchants"
              ? "userId"
              : section === "payment-accounts"
                ? "accountId"
                : "adId"
          ],
        ) !== id ||
        !result.status ||
        !result.revision
      )
        throw Error("操作响应与原目标不匹配。");
    });
  };

  return (
    <div className="c2c-business">
      <div className="c2c-business-intro">
        <h2>C2C 运营</h2>
        <p>核对实名资料、商家资质、广告状态与原订单，所有变更沿用权限与审计。</p>
      </div>
      <nav className="toolbar" aria-label="C2C 运营功能">
        {(
          [
            ["configuration", "经营配置"],
            ["merchants", "商家与质押"],
            ["payment-accounts", "收款审核"],
            ["ads", "广告管理"],
            ["appeals", "申诉裁决"],
            ["chat", "订单会话"],
          ] as const
        ).map(([key, title]) => (
          <button
            key={key}
            className={section === key ? "primary" : ""}
            aria-pressed={section === key}
            disabled={busy}
            onClick={() => {
              if (operation.current) return;
              clearSelection();
              setRows([]);
              setError("");
              setNotice("");
              setSection(key);
              setOffset(0);
              setStatusFilter("");
            }}
          >
            {title}
          </button>
        ))}
        <button disabled={busy || loading} onClick={() => refresh((v) => v + 1)}>
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? "正在读取…" : "刷新"}
        </button>
      </nav>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading && section !== "chat" && (
        <p className="alert" role="status" aria-busy="true">
          正在读取当前业务资料…
        </p>
      )}
      <fieldset className="c2c-business-workspace" disabled={busy}>
        {section === "chat" ? (
          <C2cChatPage session={session} />
        ) : section === "configuration" ? (
          <fieldset className="c2c-business-workspace" disabled={loading || writeBlocked}>
            {!ready.configuration ? (
              <Empty text={loading ? "正在读取经营配置…" : "经营配置暂不可用，请刷新后继续。"} />
            ) : (
              <>
                <section className="panel">
                  <h2>资金与业务开关</h2>
                  <p>
                    C2C 市场：{config.enabled ? "已开放" : "已关闭新交易"} · 资金核对：
                    {ready.reconciliation ? label(reconciliation.status) : "暂未读取"}
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm("确认初始化 C2C 内部账户？该入口不接受金额或其他账户参数。")
                      )
                        return;
                      void run(() => c2cBusinessWrite(owner, "/initialization", undefined));
                    }}
                  >
                    初始化内部账户（零金额）
                  </button>
                  <button
                    disabled={
                      busy ||
                      reason.trim().length < 5 ||
                      (!config.enabled &&
                        (!ready.reconciliation || reconciliation.status !== "MATCHED"))
                    }
                    onClick={() => {
                      if (
                        !window.confirm(
                          `确认${config.enabled ? "停止新交易" : "开放 C2C 新交易"}？\n配置版本：${config.revision}\n原因：${reason.trim()}`,
                        )
                      )
                        return;
                      void run(() =>
                        c2cBusinessWrite(
                          owner,
                          "/configuration",
                          {
                            revision: config.revision,
                            enabled: !config.enabled,
                            maxActiveAds: config.maxActiveAds,
                            reason,
                          },
                          "PUT",
                        ),
                      );
                    }}
                  >
                    {config.enabled ? "停止新交易" : "核对后开放交易"}
                  </button>
                  <label>
                    本次配置原因
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={1000}
                    />
                  </label>
                  {!config.enabled &&
                    (!ready.reconciliation || reconciliation.status !== "MATCHED") && (
                      <p className="alert" role="status">
                        资金核对尚未一致，暂不能开放新交易。
                      </p>
                    )}
                  {ready.reconciliation ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>资产</th>
                            <th>预期托管（最小单位）</th>
                            <th>实际托管（最小单位）</th>
                            <th>预期手续费（最小单位）</th>
                            <th>实际手续费（最小单位）</th>
                            <th>状态</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items(reconciliation.assets).map((a) => (
                            <tr key={text(a.asset)}>
                              <td>{text(a.asset)}</td>
                              <td>{text(a.expectedEscrowUnits)}</td>
                              <td>{text(a.actualEscrowUnits)}</td>
                              <td>{text(a.expectedFeeUnits)}</td>
                              <td>{text(a.actualFeeUnits)}</td>
                              <td>{a.matches === true ? "一致" : "不一致"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p role="status">资金核对记录暂不可用，请刷新后核对。</p>
                  )}
                </section>
                <form
                  className="panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    if (
                      !ready.policy ||
                      !window.confirm(
                        `确认保存质押规则？\n资产：${form.get("asset")}\n金额：${form.get("amount")}\n版本：${policy.revision}\n原因：${reason.trim()}`,
                      )
                    )
                      return;
                    void run(() =>
                      c2cBusinessWrite(
                        owner,
                        "/merchant-bond-policy",
                        {
                          revision: policy.revision,
                          asset: form.get("asset"),
                          amount: form.get("amount"),
                          reason,
                        },
                        "PUT",
                      ),
                    );
                  }}
                >
                  <h2>商户质押规则</h2>
                  <p>
                    {!ready.policy
                      ? "质押规则暂不可用，请刷新后继续。"
                      : policy.configured
                        ? `${text(policy.amount)} ${text(policy.asset)}`
                        : "尚未配置，商户不能通过审核"}
                  </p>
                  <label>
                    资产代码
                    <input name="asset" placeholder="USDT" required pattern="[A-Z0-9]{2,20}" />
                  </label>
                  <label>
                    质押金额
                    <input name="amount" inputMode="decimal" required />
                  </label>
                  <button disabled={busy || reason.trim().length < 5 || !ready.policy}>
                    保存质押规则
                  </button>
                </form>
                <form
                  className="panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    if (
                      !window.confirm(
                        `确认新增 C2C 市场？\n市场：${f.get("asset")}/${f.get("fiat")}\n法币限额：${f.get("min")} – ${f.get("max")}\n买方费率：${f.get("fee")} PPM\n付款窗口：${f.get("window")} 秒\n原因：${reason.trim()}`,
                      )
                    )
                      return;
                    void run(() =>
                      c2cBusinessWrite(owner, "/markets", {
                        marketId: null,
                        revision: "0",
                        asset: f.get("asset"),
                        fiat: f.get("fiat"),
                        fiatDecimals: Number(f.get("fiatDecimals")),
                        enabled: true,
                        minFiat: f.get("min"),
                        maxFiat: f.get("max"),
                        minPrice: f.get("minPrice"),
                        maxPrice: f.get("maxPrice"),
                        buyerFeePpm: Number(f.get("fee")),
                        paymentWindowSeconds: Number(f.get("window")),
                        maxOpenOrders: 3,
                        requireKyc: true,
                        vipMinCompleted: 100,
                        reason,
                      }),
                    );
                  }}
                >
                  <h2>新增市场</h2>
                  <p>
                    {items(config.markets)
                      .map((m) => `${text(m.asset)}/${text(m.fiat)}`)
                      .join(" · ") || "暂无市场"}
                  </p>
                  {[
                    ["asset", "资产代码", "USDT"],
                    ["fiat", "法币代码", "CNY"],
                    ["fiatDecimals", "法币小数位", "2"],
                    ["min", "最低法币金额", ""],
                    ["max", "最高法币金额", ""],
                    ["minPrice", "最低价格", ""],
                    ["maxPrice", "最高价格", ""],
                    ["fee", "买方费率 PPM", "0"],
                    ["window", "付款秒数（60–3600）", "900"],
                  ].map(([name, title, value]) => (
                    <label key={name}>
                      {title}
                      <input
                        name={name}
                        defaultValue={value}
                        required
                        {...(name === "fiatDecimals"
                          ? { type: "number", min: 0, max: 8, step: 1 }
                          : name === "fee"
                            ? { type: "number", min: 0, max: 999999, step: 1 }
                            : name === "window"
                              ? { type: "number", min: 60, max: 3600, step: 1 }
                              : {})}
                      />
                    </label>
                  ))}
                  <button disabled={busy || reason.trim().length < 5}>新增市场</button>
                </form>
                <section className="panel">
                  <h2>收款方式</h2>
                  {items(config.paymentMethods).map((m) => (
                    <div key={text(m.code)}>
                      <strong>
                        {text(m.label)} · {m.enabled ? "已开启" : "已关闭"}
                      </strong>
                      <span>
                        {" "}
                        {(Array.isArray(m.currencies) && m.currencies.length
                          ? m.currencies
                          : items(config.markets).map((row) => row.fiat)
                        ).join(" / ")}{" "}
                      </span>
                      <button
                        disabled={busy || reason.trim().length < 5}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `确认${m.enabled ? "停用" : "启用"}收款方式 ${m.label} (${m.code})？\n适用法币：${(Array.isArray(m.currencies) && m.currencies.length ? m.currencies : items(config.markets).map((row) => row.fiat)).join(" / ")}\n原因：${reason.trim()}`,
                            )
                          )
                            return;
                          void run(() =>
                            c2cBusinessWrite(owner, "/payment-methods", {
                              code: m.code,
                              revision: m.revision,
                              label: m.label,
                              enabled: !m.enabled,
                              currencies:
                                Array.isArray(m.currencies) && m.currencies.length
                                  ? m.currencies
                                  : items(config.markets).map((row) => row.fiat),
                              requiresBankName: m.requiresBankName,
                              supportsQr: m.supportsQr,
                              reason,
                            }),
                          );
                        }}
                      >
                        {m.enabled ? "停用" : "按当前市场开启"}
                      </button>
                    </div>
                  ))}
                </section>
              </>
            )}
          </fieldset>
        ) : (
          <>
            <div className="toolbar">
              <label>
                业务状态
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setRows([]);
                    clearSelection();
                    setStatusFilter(event.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">全部状态</option>
                  {c2cStatusFilters[section].map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <DataTable
              rows={rows.map((source) => {
                const row: C2cRow = {
                  ...source,
                  c2cStatus: label(source.status),
                  c2cKycStatus: label(source.kycStatus),
                  c2cBondStatus: label(source.bondStatus),
                };
                if (section === "ads")
                  return {
                    ...row,
                    c2cMarket:
                      text((row.market as C2cRow).asset) + "/" + text((row.market as C2cRow).fiat),
                    c2cPrice: text(row.price) + " " + text((row.market as C2cRow).fiat),
                    c2cAvailable:
                      text(row.availableQuantity) + " " + text((row.market as C2cRow).asset),
                  };
                return row;
              })}
              columns={
                section === "merchants"
                  ? [
                      "userId",
                      "nickname",
                      "c2cStatus",
                      "c2cKycStatus",
                      "c2cBondStatus",
                      "bondAmount",
                      "bondAsset",
                    ]
                  : section === "payment-accounts"
                    ? ["accountId", "userId", "fiat", "methodCode", "maskedLabel", "c2cStatus"]
                    : section === "ads"
                      ? [
                          "adId",
                          "makerUserId",
                          "c2cMarket",
                          "side",
                          "c2cPrice",
                          "c2cAvailable",
                          "c2cStatus",
                        ]
                      : ["appealId", "orderId", "openerUserId", "c2cStatus", "reason"]
              }
              loading={loading}
              error={error && !rows.length ? error : ""}
              onRowClick={open}
              rowActionDisabled={busy || loading || writeBlocked}
              rowActionLabel="核对记录"
              isSelected={(row) =>
                selected !== null && c2cRowId(section, row) === c2cRowId(section, selected)
              }
            />
            <nav className="toolbar" aria-label="C2C 运营分页">
              <button
                disabled={busy || loading || writeBlocked || offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - 30))}
              >
                上一页
              </button>
              <span>第 {offset / 30 + 1} 页 · 每页最多 30 条</span>
              <button
                disabled={busy || loading || writeBlocked || !more}
                onClick={() => setOffset((value) => value + 30)}
              >
                下一页
              </button>
            </nav>
            {selected && (
              <section
                className="panel c2c-review-detail"
                ref={detailPanel}
                tabIndex={-1}
                aria-label="C2C 记录核对"
              >
                <div className="c2c-business-heading">
                  <h2>核对 {c2cRowId(section, selected)}</h2>
                  <button type="button" disabled={busy} onClick={clearSelection}>
                    收起详情
                  </button>
                </div>
                <KeyValue
                  data={{
                    "对象 ID": c2cRowId(section, selected),
                    状态: label(selected.status),
                    版本: selected.revision ?? "—",
                    ...(section === "merchants"
                      ? {
                          商家: selected.nickname,
                          申请资料: selected.application,
                          身份认证: selected.kycStatus,
                          认证有效期: selected.kycExpiresAt,
                          质押状态: label(selected.bondStatus),
                          质押: text(selected.bondAmount) + " " + text(selected.bondAsset),
                          上次审核原因: selected.reviewReason,
                        }
                      : section === "payment-accounts"
                        ? {
                            "用户 ID": selected.userId,
                            法币: selected.fiat,
                            收款方式: selected.methodCode,
                            收款账号: selected.maskedLabel,
                            上次审核原因: selected.reviewReason,
                          }
                        : section === "ads"
                          ? {
                              "商家 ID": selected.makerUserId,
                              市场:
                                text((selected.market as C2cRow).asset) +
                                "/" +
                                text((selected.market as C2cRow).fiat),
                              方向: selected.side === "SELL" ? "出售" : "购买",
                              单价: selected.price,
                              剩余数量: selected.availableQuantity,
                              交易条款: selected.terms,
                            }
                          : {
                              原订单: selected.orderId,
                              "发起人 ID": selected.openerUserId,
                              申诉原因: selected.reason,
                              原决定: selected.decision,
                              原决定原因: selected.decisionReason,
                            }),
                  }}
                />
                {selfReview && (
                  <p className="alert" role="status">
                    不能审核本人的商家资格或收款资料，请由其他管理员核对。
                  </p>
                )}
                {section === "payment-accounts" && (
                  <>
                    <button
                      type="button"
                      disabled={busy || detailsLoading}
                      onClick={() => void loadDetails(selected)}
                    >
                      <ShieldCheck size={16} aria-hidden="true" />
                      审计后查阅实名收款资料
                    </button>
                    {details && (
                      <>
                        <KeyValue
                          data={{
                            本人姓名: (details.details as C2cRow).holderName,
                            收款账号: (details.details as C2cRow).accountNumber,
                            开户银行: (details.details as C2cRow).bankName,
                            身份认证: details.kycStatus,
                            认证有效期: details.kycExpiresAt,
                          }}
                        />
                        <label className="c2c-identity-check">
                          <input
                            type="checkbox"
                            disabled={busy || !kycValid || selfReview}
                            checked={identityChecked}
                            onChange={(event) => setIdentityChecked(event.target.checked)}
                          />
                          已核对收款实名与有效身份认证资料
                        </label>
                        {!kycValid && (
                          <p className="alert" role="status">
                            当前身份认证未确认有效，不能通过收款审核。
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}
                {section === "appeals" && (
                  <>
                    {details && (
                      <>
                        <KeyValue
                          data={{
                            原订单: details.orderId,
                            订单状态: details.status,
                            "买方 ID": details.buyerUserId,
                            "卖方 ID": details.sellerUserId,
                            资产: (details.market as C2cRow).asset,
                            法币: (details.market as C2cRow).fiat,
                            交易数量: details.quantity,
                            法币金额: details.fiatAmount,
                            交易条款: details.terms,
                          }}
                        />
                        <p className="alert">
                          裁决沿用原订单的双方与金额。放币交付给原买方；退款退回原卖方。实际资金进度以订单状态为准。
                        </p>
                        {!independent && (
                          <p className="alert danger" role="status">
                            当前管理员参与了该订单，不能裁决；审批人也必须独立于双方。
                          </p>
                        )}
                      </>
                    )}
                    {(!details || detailsError) && (
                      <button
                        type="button"
                        disabled={busy || detailsLoading}
                        onClick={() => void loadDetails(selected)}
                      >
                        重新读取原订单
                      </button>
                    )}
                  </>
                )}
                {detailsLoading && (
                  <p role="status" aria-busy="true">
                    正在读取当前目标资料…
                  </p>
                )}
                {detailsError && (
                  <p className="error" role="alert">
                    {detailsError}
                  </p>
                )}
                {c2cDecisions(section, selected).length ? (
                  <>
                    <label>
                      处理原因
                      <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        maxLength={1000}
                      />
                    </label>
                    <div className="toolbar">
                      {c2cDecisions(section, selected).map((decision) => (
                        <button
                          key={decision}
                          disabled={
                            busy ||
                            loading ||
                            writeBlocked ||
                            selfReview ||
                            reason.trim().length < 5 ||
                            (section === "payment-accounts" &&
                              decision === "APPROVE" &&
                              (!details || !identityChecked || !kycValid || detailsLoading)) ||
                            (section === "appeals" &&
                              (!details ||
                                detailsLoading ||
                                !independent ||
                                details.status !== "APPEALED"))
                          }
                          onClick={() => decide(decision)}
                        >
                          {decisionLabels[decision]}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p role="status">该记录当前仅可查看，无需再次处理。</p>
                )}
              </section>
            )}
          </>
        )}
      </fieldset>
    </div>
  );
}
