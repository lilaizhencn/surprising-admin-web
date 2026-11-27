import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { request } from "../api/client";
import { Metric, Page, Panel } from "../components/AdminUi";
import { errorMessage } from "../lib/adminData";
import { formatUsdtDecimal } from "../lib/decimals";
import type { ProductLine, RouteTarget } from "../types";
import "./DashboardPage.css";

interface ProductLineSummary {
  productLine: ProductLine;
  totalInstruments: number;
  tradingInstruments: number;
}

interface SystemOverviewResponse {
  generatedAt: string;
  totalUsers: number;
  todayRegistrations: number;
  totalDepositsUsdt: number | string;
  todayWithdrawalsUsdt: number | string;
  totalWithdrawalsUsdt: number | string;
  productLines: ProductLineSummary[];
}

interface RuntimeStatusResponse {
  productLines?: string[];
}

const PRODUCT_LINE_META: ReadonlyArray<{
  productLine: ProductLine;
  title: string;
  subtitle: string;
  route: RouteTarget;
}> = [
  { productLine: "SPOT", title: "现货", subtitle: "Spot 币币交易对", route: "markets-spot" },
  {
    productLine: "LINEAR_PERPETUAL",
    title: "U本位永续",
    subtitle: "USDT 结算永续合约",
    route: "markets-linear-perp",
  },
  {
    productLine: "INVERSE_PERPETUAL",
    title: "币本位永续",
    subtitle: "币本位反向永续合约",
    route: "markets-inverse-perp",
  },
  {
    productLine: "LINEAR_DELIVERY",
    title: "U本位交割",
    subtitle: "USDT 结算交割合约",
    route: "markets-linear-delivery",
  },
  {
    productLine: "INVERSE_DELIVERY",
    title: "币本位交割",
    subtitle: "币本位反向交割合约",
    route: "markets-inverse-delivery",
  },
  { productLine: "OPTION", title: "期权", subtitle: "欧式/美式期权合约", route: "markets-option" },
];

function formatUsdt(value: number | string | undefined): string {
  return formatUsdtDecimal(value);
}

export default function DashboardPage({
  onNavigate,
}: {
  onNavigate: (route: RouteTarget) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<SystemOverviewResponse | null>(null);
  const [activeLines, setActiveLines] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  async function load() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, runtimeRes] = await Promise.all([
        request<SystemOverviewResponse>("/api/v1/admin/system/overview", { signal: controller.signal }),
        request<RuntimeStatusResponse>("/api/v1/runtime", { signal: controller.signal }).catch(() => ({ productLines: [] })),
      ]);
      if (controller.signal.aborted) return;
      setOverview(overviewRes);
      setActiveLines(new Set(runtimeRes.productLines ?? []));
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(errorMessage(err));
      }
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, []);

  const lineMap = new Map(
    (overview?.productLines ?? []).map((item) => [item.productLine, item]),
  );

  return (
    <Page
      title="平台运营总览"
      description="展示平台全局用户与资金核心指标，以及 6 条产品线各自的币对统计。点击产品线卡片可直达对应币对管理页。"
      loading={loading}
      error={error}
    >
      <div className="dashboard-toolbar">
        <span className="dashboard-timestamp">
          {overview?.generatedAt
            ? `统计时间：${new Date(overview.generatedAt).toLocaleString()}`
            : "正在同步平台统计…"}
        </span>
      </div>

      <div className="dashboard-metrics">
        <Metric
          label="用户总数"
          value={overview ? overview.totalUsers.toLocaleString("en-US") : "—"}
          tone="ok"
        />
        <Metric
          label="今日注册总数"
          value={overview ? overview.todayRegistrations.toLocaleString("en-US") : "—"}
          tone="muted"
        />
        <button
          type="button"
          className="dashboard-kpi-link"
          onClick={() => onNavigate("wallet")}
          title="点击进入钱包管理页面查看各币种充提汇总"
        >
          <Metric
            label="平台充值总资产 (USDT) →"
            value={overview ? formatUsdt(overview.totalDepositsUsdt) : "—"}
            tone="ok"
          />
        </button>
        <button
          type="button"
          className="dashboard-kpi-link"
          onClick={() => onNavigate("wallet")}
          title="点击进入钱包管理页面查看各币种充提汇总"
        >
          <Metric
            label="今日累计提现 (USDT) →"
            value={overview ? formatUsdt(overview.todayWithdrawalsUsdt) : "—"}
            tone="warn"
          />
        </button>
        <button
          type="button"
          className="dashboard-kpi-link"
          onClick={() => onNavigate("wallet")}
          title="点击进入钱包管理页面查看各币种充提汇总"
        >
          <Metric
            label="历史累计提现 (USDT) →"
            value={overview ? formatUsdt(overview.totalWithdrawalsUsdt) : "—"}
            tone="muted"
          />
        </button>
      </div>

      <Panel title="高频运营快捷入口">
        <div className="button-row">
          {(
            [
              ["wallet", "链上充提审核"],
              ["compliance", "KYC 与储备金"],
              ["approvals", "敏感操作审批"],
              ["c2c", "C2C 法币运营"],
              ["support", "客服工单台"],
              ["assets", "币种与网络"],
            ] satisfies ReadonlyArray<readonly [RouteTarget, string]>
          ).map(([target, label]) => (
            <button key={target} type="button" onClick={() => onNavigate(target)}>
              {label}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="六大产品线币对总览">
        <div className="product-line-grid">
          {PRODUCT_LINE_META.map((meta) => {
            const summary = lineMap.get(meta.productLine);
            const trading = summary?.tradingInstruments ?? 0;
            const total = summary?.totalInstruments ?? 0;
            const enabled = activeLines.has(meta.productLine);
            return (
              <button
                key={meta.productLine}
                type="button"
                className="product-line-card"
                onClick={() => onNavigate(meta.route)}
              >
                <div className="product-line-card-head">
                  <span className="product-line-title">{meta.title}</span>
                  <span className={`product-line-status${enabled ? " active" : ""}`}>
                    <span className="product-line-status-dot" aria-hidden="true" />
                    {enabled ? "运行中" : "未启动"}
                  </span>
                </div>
                <span className="product-line-meta">
                  {meta.subtitle} · {meta.productLine}
                </span>
                <div className="product-line-card-foot">
                  <span className="product-line-count">
                    <strong>{overview ? `${trading} / ${total}` : "—"}</strong>
                    <span>可交易 / 总币对</span>
                  </span>
                  <span className="product-line-action">
                    币对管理
                    <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>
    </Page>
  );
}
