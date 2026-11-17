import { CheckCircle2, Clock, Layers, Power, RefreshCw, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { request } from "./api/client";
import "./ProductLineAccess.css";

type ProductStatus = {
  configuration: {
    productLine: string;
    enabled: boolean;
    configurationVersion: number;
    reason: string;
    updatedAt: string;
  };
  runtimeStatus: "NOT_ENABLED" | "INITIALIZING" | "CONNECTED" | "FAILED";
  message?: string;
};

const names: Record<string, string> = {
  SPOT: "现货与资金账户",
  LINEAR_PERPETUAL: "U 本位永续",
  INVERSE_PERPETUAL: "币本位永续",
  LINEAR_DELIVERY: "U 本位交割",
  INVERSE_DELIVERY: "币本位交割",
  OPTION: "期权",
};

const stateMeta: Record<
  ProductStatus["runtimeStatus"],
  { label: string; tone: "ok" | "warn" | "danger" | "muted" }
> = {
  CONNECTED: { label: "已接入", tone: "ok" },
  INITIALIZING: { label: "正在初始化", tone: "warn" },
  FAILED: { label: "初始化失败，自动重试中", tone: "danger" },
  NOT_ENABLED: { label: "未启用", tone: "muted" },
};

export function ProductLineAccess() {
  const [items, setItems] = useState<ProductStatus[]>([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmItem, setConfirmItem] = useState<ProductStatus | null>(null);
  const [reason, setReason] = useState("管理员启用产品线接入");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const data = await request<ProductStatus[]>("/api/v1/admin/product-lines", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setItems(data);
          setLoadError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  async function confirmEnable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmItem) return;
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 1000) {
      setError("请填写 1 至 1000 字的启用原因。");
      return;
    }
    const line = confirmItem.configuration.productLine;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/api/v1/admin/product-lines/${line}/enable`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: confirmItem.configuration.configurationVersion,
          reason: trimmed,
        }),
      });
      setItems(await request<ProductStatus[]>("/api/v1/admin/product-lines"));
      setConfirmItem(null);
      setNotice(`${names[line] ?? line} 已启用接入，Gateway 正在自动初始化连接。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel pla-section" aria-label="产品线接入">
      <div className="pla-header">
        <div>
          <h3 className="pla-title">
            <Layers size={16} aria-hidden="true" />
            产品线接入开关
          </h3>
          <p className="pla-desc">
            启用后自动连接对应 Core，初始化账户、订单与实时订阅，无需重启 Gateway。
          </p>
        </div>
        <span className="pla-summary-pill">
          已接入 {items.filter((i) => i.runtimeStatus === "CONNECTED").length} / {items.length}
        </span>
      </div>

      {notice && (
        <div className="alert" role="status">
          {notice}
        </div>
      )}
      {(error || loadError) && (
        <div className="alert danger" role="alert">
          {error || loadError}
        </div>
      )}

      <div className="pla-grid">
        {items.map((item) => {
          const line = item.configuration.productLine;
          const meta = stateMeta[item.runtimeStatus];
          return (
            <article
              key={line}
              className={`pla-card${item.configuration.enabled ? " is-enabled" : ""}`}
            >
              <div className="pla-card-top">
                <div>
                  <strong>{names[line] ?? line}</strong>
                  <span className="pla-code">{line}</span>
                </div>
                <span className={`pla-badge ${meta.tone}`}>
                  {item.runtimeStatus === "CONNECTED" ? (
                    <CheckCircle2 size={12} aria-hidden="true" />
                  ) : item.runtimeStatus === "FAILED" ? (
                    <XCircle size={12} aria-hidden="true" />
                  ) : item.runtimeStatus === "INITIALIZING" ? (
                    <RefreshCw size={12} aria-hidden="true" />
                  ) : (
                    <Clock size={12} aria-hidden="true" />
                  )}
                  {meta.label}
                </span>
              </div>

              <div className="pla-card-meta">
                <span>后台设置：{item.configuration.enabled ? "已启用" : "未启用"}</span>
                {item.configuration.reason && (
                  <span title={item.configuration.reason}>备注：{item.configuration.reason}</span>
                )}
                {item.message && <span className="pla-msg">{item.message}</span>}
              </div>

              <div className="pla-card-actions">
                {item.configuration.enabled ? (
                  <span className="pla-connected-note">已接入运行中</span>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setReason(`启用 ${names[line] ?? line} 接入`);
                      setConfirmItem(item);
                    }}
                  >
                    <Power size={13} aria-hidden="true" />
                    启用接入
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {confirmItem && (
        <div
          className="assets-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="确认启用产品线接入"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setConfirmItem(null);
          }}
        >
          <div className="assets-modal">
            <div className="assets-modal-header">
              <div>
                <h3>
                  启用 {names[confirmItem.configuration.productLine] ?? confirmItem.configuration.productLine}
                </h3>
                <p>对应 Core 节点需已部署并启动，保存后将自动完成连接初始化。</p>
              </div>
              <button
                type="button"
                className="assets-icon-btn"
                aria-label="关闭"
                onClick={() => setConfirmItem(null)}
              >
                <X size={16} />
              </button>
            </div>
            <form className="assets-form" onSubmit={confirmEnable}>
              <label>
                启用原因（审计记录）
                <input
                  required
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="assets-modal-footer">
                <button type="button" disabled={busy} onClick={() => setConfirmItem(null)}>
                  取消
                </button>
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? "启用中…" : "确认启用"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
