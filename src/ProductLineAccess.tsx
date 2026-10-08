import { useEffect, useState } from "react";
import { request } from "./api/client";
import "./ProductLineAccess.css";

type ProductStatus = {
  configuration: { productLine: string; enabled: boolean; configurationVersion: number; reason: string; updatedAt: string };
  runtimeStatus: "NOT_ENABLED" | "INITIALIZING" | "CONNECTED" | "FAILED";
  message?: string;
};
const names: Record<string, string> = {
  SPOT: "现货与资金账户", LINEAR_PERPETUAL: "U 本位永续", INVERSE_PERPETUAL: "币本位永续",
  LINEAR_DELIVERY: "U 本位交割", INVERSE_DELIVERY: "币本位交割", OPTION: "期权"
};
const states = { NOT_ENABLED: "未启用", INITIALIZING: "正在初始化", CONNECTED: "已接入", FAILED: "初始化失败，自动重试中" };

export function ProductLineAccess() {
  const [items, setItems] = useState<ProductStatus[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const data = await request<ProductStatus[]>("/api/v1/admin/product-lines", { signal: controller.signal });
        if (!controller.signal.aborted) { setItems(data); setLoadError(""); }
      } catch (e) {
        if (!controller.signal.aborted) setLoadError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, []);

  async function enable(item: ProductStatus) {
    setError("");
    if (!reason.trim() || reason.length > 1000) { setError("请填写 1 至 1000 字的启用原因。"); return; }
    const line = item.configuration.productLine;
    if (!window.confirm(`启用${names[line]}接入？对应 Core 必须已部署，保存后会自动初始化。`)) return;
    setBusy(true);
    try {
      await request(`/api/v1/admin/product-lines/${line}/enable`, { method: "POST",
        body: JSON.stringify({ expectedVersion: item.configuration.configurationVersion, reason: reason.trim() }) });
      setItems(await request<ProductStatus[]>("/api/v1/admin/product-lines"));
      setReason("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return <section className="panel profile-section instrument-section product-line-access" aria-label="产品线接入">
    <h3>产品线接入</h3>
    <p>启用后自动连接对应 Core，初始化账户、订单与实时订阅，无需重启 Gateway。合约展示与交易开关在下方维护。</p>
    <p>“已接入”表示本机完成连接初始化；可否下单还取决于合约状态与行情。接入后保留资金查询及对账连接；停止交易请关闭合约交易开关。</p>
    <label>启用原因<input value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} placeholder="说明本次启用原因" /></label>
    {(error || loadError) && <p role="alert">{error || loadError}</p>}
    <div className="table-wrap"><table><thead><tr><th>产品线</th><th>后台设置</th><th>本机接入状态</th><th>最近修改原因</th><th>操作</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.configuration.productLine}>
        <td data-label="产品线">{names[item.configuration.productLine] ?? item.configuration.productLine}</td>
        <td data-label="后台设置">{item.configuration.enabled ? "已启用" : "未启用"}</td>
        <td data-label="本机接入状态">{states[item.runtimeStatus]}{item.message && <small>{item.message}</small>}</td>
        <td data-label="最近修改原因">{item.configuration.reason}</td>
        <td data-label="操作"><button disabled={busy || item.configuration.enabled} onClick={() => void enable(item)}>
          {item.configuration.enabled ? "已启用接入" : "启用接入"}</button></td>
      </tr>)}</tbody></table></div>
  </section>;
}
