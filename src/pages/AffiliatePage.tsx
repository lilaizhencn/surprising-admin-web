import { useEffect, useState } from "react";
import {
  affiliateAdmin,
  affiliatePercent,
  type AffiliateAdminData,
} from "../api/affiliate";
import { DataTable, Page, Panel, TextFilter } from "../components/AdminUi";
import { errorMessage } from "../lib/adminData";
import { PRODUCT_LINES } from "../lib/products";
import type { UnknownRecord } from "../types";

export default function AffiliatePage() {
  const [data, setData] = useState<AffiliateAdminData | null>(null);
  const [cursor, setCursor] = useState("0");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [normal, setNormal] = useState("20");
  const [kol, setKol] = useState("20");
  const [hours, setHours] = useState("24");
  const [userId, setUserId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [auto, setAuto] = useState(true);
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const [product, setProduct] = useState("LINEAR_PERPETUAL");
  const [budget, setBudget] = useState("");
  const [detail, setDetail] = useState<UnknownRecord | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void affiliateAdmin
      .load(cursor, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setData(value);
        setNormal(String(value.settings.referralRatePpm / 10000));
        setKol(String(value.settings.kolRatePpm / 10000));
        setHours(String(value.settings.settlementHours));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cursor, revision]);
  async function run(operation: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await operation();
      if (result === false) {
        setNotice("操作已取消");
        return;
      }
      setNotice(message);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function requireReason() {
    if (!reason.trim()) throw new Error("请填写变更原因");
    return reason.trim();
  }
  function select(row: UnknownRecord) {
    setUserId(String(row.userId));
    setEnabled(row.kolEnabled === true);
    setAuto(row.autoSettlement === true);
    setRate(row.ratePpm == null ? "" : String(Number(row.ratePpm) / 10000));
    setDetail(null);
  }
  return (
    <Page
      title="邀请返佣与 KOL"
      description="普通用户默认可邀请；团队从顶层佣金池逐级分配。成员本人交易不向团队上级返佣。"
      error={error}
      loading={loading}
      onRefresh={() => setRevision((value) => value + 1)}
    >
      {notice && <p role="status">{notice}</p>}
      <Panel title="操作原因">
        <TextFilter label="本次变更原因" value={reason} onChange={setReason} />
      </Panel>
      <div className="two-grid">
        <Panel title="平台默认配置">
          <div className="stack">
            <TextFilter
              label="普通邀请返佣（%）"
              value={normal}
              onChange={setNormal}
            />
            <TextFilter
              label="顶层 KOL 返佣（%）"
              value={kol}
              onChange={setKol}
            />
            <TextFilter
              label="结算成熟及周期（小时）"
              value={hours}
              onChange={setHours}
            />
            <p>新比例只影响生效后的费用；各资产按最小整数单位独立核算。</p>
            <button
              className="primary"
              disabled={busy || loading}
              onClick={() =>
                void run(async () => {
                  const h = Number(hours);
                  if (!Number.isInteger(h) || h < 1 || h > 720)
                    throw new Error("结算周期应为 1–720 小时");
                  if (!window.confirm("确认调整未来返佣比例与结算周期？"))
                    return false;
                  await affiliateAdmin.settings(
                    affiliatePercent(normal),
                    affiliatePercent(kol),
                    h,
                    requireReason(),
                  );
                }, "平台配置已保存")
              }
            >
              保存默认配置
            </button>
          </div>
        </Panel>
        <Panel title="KOL 开停与自动结算">
          <div className="stack">
            <TextFilter
              label="用户 UID"
              value={userId}
              onChange={(value) => {
                setUserId(value);
                setDetail(null);
              }}
            />
            <button
              disabled={busy || !userId}
              onClick={() =>
                void run(async () => {
                  const value = await affiliateAdmin.user(userId);
                  const p = value.profile as UnknownRecord;
                  if (!p) throw new Error("用户资料不完整");
                  select(p);
                  setDetail(value);
                }, "用户资料已加载")
              }
            >
              查询用户
            </button>
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              开启 KOL 团队合作
            </label>
            <label>
              <input
                type="checkbox"
                checked={auto}
                onChange={(event) => setAuto(event.target.checked)}
              />
              开启自动结算
            </label>
            <TextFilter
              label="个人顶层比例（%，留空跟随平台默认）"
              value={rate}
              onChange={setRate}
            />
            <p>停用不撤回历史佣金；已承诺的在途资金继续确认。</p>
            <button
              className="primary"
              disabled={busy || !userId}
              onClick={() =>
                void run(async () => {
                  if (
                    !window.confirm(
                      `确认更新 UID ${userId} 的 KOL、返佣及结算设置？`,
                    )
                  )
                    return false;
                  await affiliateAdmin.profile(
                    userId,
                    enabled,
                    auto,
                    rate.trim() ? affiliatePercent(rate) : null,
                    requireReason(),
                  );
                }, "用户设置已保存")
              }
            >
              保存用户设置
            </button>
          </div>
        </Panel>
        <Panel title="产品预算账户">
          <div className="stack">
            <label>
              产品线
              <select
                value={product}
                onChange={(event) => setProduct(event.target.value)}
              >
                {PRODUCT_LINES.filter(Boolean).map((line) => (
                  <option key={line}>{line}</option>
                ))}
              </select>
            </label>
            <TextFilter
              label="已备资的预算账户 UID"
              value={budget}
              onChange={setBudget}
            />
            <p>
              结算通过现有账户划转执行。未配置或余额不足时保留应付款，不直接增加用户余额。
            </p>
            <button
              disabled={busy || !budget}
              onClick={() =>
                void run(async () => {
                  if (
                    !window.confirm(
                      `确认将 ${product} 的返佣付款账户设置为 UID ${budget}？`,
                    )
                  )
                    return false;
                  await affiliateAdmin.budget(product, budget, requireReason());
                }, "预算账户已保存")
              }
            >
              保存预算账户
            </button>
            <DataTable
              rows={data?.budgets ?? []}
              columns={["productLine", "userId", "updatedAt"]}
            />
          </div>
        </Panel>
        <Panel title="核算来源与结算">
          <p>
            已接收进度包含完整留存的隔离费用；连续确认进度不会跨过未解决费用。关系异常仅隔离相关费用，健康团队继续核算；修复后后台自动重试。手动结算只处理已成熟佣金。
          </p>
          <DataTable
            rows={data?.sources ?? []}
            columns={[
              "productLine",
              "clusterPosition",
              "orderId",
              "readClusterPosition",
              "readOrderId",
              "deferredCount",
              "oldestDeferredAt",
              "checkedAt",
              "error",
            ]}
          />
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!window.confirm("确认将已成熟的待付佣金生成结算单？"))
                  return false;
                await affiliateAdmin.settle();
              }, "结算任务已排队，请刷新查看实际到账状态")
            }
          >
            手动结算成熟佣金
          </button>
        </Panel>
      </div>
      <Panel title="用户与 KOL">
        <DataTable
          rows={(data?.profiles ?? []).slice(0, 50)}
          columns={["userId", "kolEnabled", "autoSettlement", "ratePpm"]}
          onRowClick={select}
          rowActionLabel="管理该用户"
        />
        <div className="button-row">
          <button
            disabled={cursor === "0" || loading}
            onClick={() => setCursor("0")}
          >
            首页
          </button>
          <button
            disabled={!data || data.profiles.length <= 50 || loading}
            onClick={() => setCursor(String(data?.profiles[49].userId))}
          >
            下一页
          </button>
        </div>
      </Panel>
      {detail && (
        <Panel title={`用户 ${userId} 的贡献与佣金`}>
          <DataTable
            rows={
              Array.isArray(detail.balances)
                ? (detail.balances as UnknownRecord[])
                : []
            }
            columns={[
              "productLine",
              "asset",
              "directFeeUnits",
              "teamFeeUnits",
              "receivedUnits",
              "delegatedUnits",
              "retainedUnits",
              "pendingUnits",
              "paidUnits",
            ]}
          />
          <p>
            金额为资产最小单位；团队贡献已包含下级来源，不与下级小计重复相加。
          </p>
        </Panel>
      )}
      <Panel title="最近 50 笔结算单">
        <DataTable
          rows={data?.payouts ?? []}
          columns={[
            "createdAt",
            "userId",
            "budgetUserId",
            "productLine",
            "asset",
            "amountUnits",
            "status",
            "error",
          ]}
          actions={(row) =>
            row.status !== "PAID" && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (
                      !window.confirm(
                        "确认重试该结算？未知结果沿用原资金身份；明确拒绝才创建替代结算单。",
                      )
                    )
                      return false;
                    await affiliateAdmin.retry(String(row.payoutId));
                  }, "结算重试已排队")
                }
              >
                重试
              </button>
            )
          }
        />
      </Panel>
    </Page>
  );
}
