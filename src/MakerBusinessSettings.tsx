import { useEffect, useState } from "react";
import { gatewayGet, gatewayPost } from "./api/admin";
import type { UnknownRecord } from "./types";

const labels: Record<string, string> = {
  engine: "做市运行", quoting: "报价规则", risk: "库存限制", trade: "模拟成交", referenceMarket: "参考盘口",
  enabled: "启用", quoteWatchdogInterval: "报价检查间隔", tradeInterval: "模拟成交间隔", orderBookDepth: "本地盘口深度",
  orderLevels: "默认报价档数", minSpreadTicks: "最小价差", levelSpacingTicks: "默认档位间距", refreshThresholdTicks: "最小调价阈值",
  refreshTolerancePpm: "价格调整容忍比例", quantityRefreshTolerancePpm: "数量调整容忍比例", quantityVariationPpm: "报价数量变化比例",
  halfSpreadPpm: "单侧价差比例", makerFeeReservePpm: "挂单手续费预留比例", minNetHalfSpreadPpm: "单侧最小净价差比例",
  linearLiquidityTargetNotionalUnits: "U 本位流动性目标名义价值", maxOpenOrdersPerAccountSymbol: "单账户单合约最大挂单数",
  maxPriceDeviationPpm: "最大价格偏离比例", orderReconciliationInterval: "订单核对间隔", volatilitySpreadMultiplierPpm: "波动率价差系数",
  maxVolatilitySpreadTicks: "波动附加价差上限", maxInventorySteps: "默认最大库存", maxInventorySkewPpm: "默认库存偏移上限",
  ordersPerBatch: "每批模拟成交订单数", accountIds: "模拟成交账户 ID", minQuantitySteps: "最小数量步数", maxQuantitySteps: "最大数量步数",
  inventoryThresholdSteps: "库存调节阈值", webSocketEnabled: "启用实时盘口", refreshInterval: "参考盘口刷新间隔", maxAge: "参考盘口有效时间",
  requestTimeout: "请求超时", reconnectBackoff: "断线重连等待", depthLevels: "参考盘口档数", quantityScalePpm: "外部数量换算比例",
  referencePressureSkewPpm: "盘口压力调价比例", inventoryPriceSkewPpm: "库存调价比例", liquiditySlippagePpm: "流动性测算滑点", slippageTicks: "模拟成交滑点", maxSweepLevels: "最大扫单档数",
  sources: "参考盘口来源", productLine: "产品线", name: "来源名称", instrumentId: "合约永久 ID", externalSymbol: "外部交易对",
  url: "盘口请求地址", parser: "盘口解析器", webSocketUrl: "实时盘口地址", webSocketSubscribeMessage: "订阅消息", webSocketParser: "实时解析器",
};
const hint = (key: string) => key.endsWith("Ppm") ? "百万分比：10,000 为 1%，1,000,000 为 100%。"
  : key.endsWith("Ticks") ? "单位为合约价格跳动数。" : key.endsWith("Steps") ? "单位为合约数量步。"
  : /Interval|Timeout|Backoff|maxAge/.test(key) ? "使用时间格式，例如 PT1S 为 1 秒，PT0.5S 为半秒。"
  : key === "sources" ? "来源按合约永久 ID 绑定；修改后自动重建行情连接。"
  : key === "accountIds" ? "填写已备好资金的模拟交易账户；每行一个账户 ID。"
  : key === "enabled" ? "保存后按此开关运行，具体策略仍有各自的启用开关。"
  : key === "url" || key === "webSocketUrl" ? "填写完整服务地址，可用 {externalSymbol} 作为交易对占位符。"
  : key.includes("Parser") || key === "parser" ? "使用价格服务支持的协议解析器标识。" : "";

const numericBounds: Record<string, [bigint, bigint]> = {
  orderBookDepth: [1n, 200n], orderLevels: [1n, 50n], minSpreadTicks: [1n, 9223372036854775807n],
  levelSpacingTicks: [1n, 9223372036854775807n], refreshThresholdTicks: [0n, 9223372036854775807n],
  refreshTolerancePpm: [0n, 100000n], quantityRefreshTolerancePpm: [0n, 900000n], quantityVariationPpm: [0n, 900000n],
  halfSpreadPpm: [0n, 100000n], makerFeeReservePpm: [0n, 999999n], minNetHalfSpreadPpm: [0n, 100000n],
  referencePressureSkewPpm: [0n, 1000n], inventoryPriceSkewPpm: [0n, 1000n], liquiditySlippagePpm: [1n, 100000n],
  maxOpenOrdersPerAccountSymbol: [2n, 1000n], maxPriceDeviationPpm: [1n, 100000n], volatilitySpreadMultiplierPpm: [0n, 5000000n],
  maxVolatilitySpreadTicks: [1n, 9223372036854775807n], maxInventorySteps: [1n, 9223372036854775807n], maxInventorySkewPpm: [0n, 1000000n],
  ordersPerBatch: [1n, 20n], maxSweepLevels: [1n, 20n], depthLevels: [1n, 100n], quantityScalePpm: [1n, 1000000n],
  minQuantitySteps: [1n, 9223372036854775807n], maxQuantitySteps: [1n, 9223372036854775807n], instrumentId: [1n, 9223372036854775807n],
  slippageTicks: [0n, 9223372036854775807n], inventoryThresholdSteps: [0n, 9223372036854775807n], linearLiquidityTargetNotionalUnits: [0n, 9223372036854775807n],
};
function validateSettings(value: UnknownRecord, path = "") {
  for (const [key, current] of Object.entries(value)) {
    const name = labels[key] ?? key;
    const bounds = numericBounds[key];
    if (bounds && (!/^\d+$/.test(String(current)) || BigInt(String(current)) < bounds[0] || BigInt(String(current)) > bounds[1]))
      throw new Error(`${name}必须为 ${bounds[0]} 至 ${bounds[1]} 的整数。`);
    if (/Interval|Timeout|Backoff|maxAge/.test(key)) {
      const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(current));
      const seconds = match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : NaN;
      const zeroAllowed = ["tradeInterval", "refreshInterval", "orderReconciliationInterval"].includes(key);
      if (!match || !match.slice(1).some(Boolean) || !Number.isFinite(seconds) || seconds > 3600 || seconds < 0 || (!zeroAllowed && seconds === 0))
        throw new Error(`${name}请填写${zeroAllowed ? "0 至" : "大于 0 且不超过"} 3600 秒的时间，例如 PT1S。`);
    }
    if (key === "accountIds" && Array.isArray(current)) {
      if (current.length > 50 || new Set(current.map(String)).size !== current.length || current.some(id => !/^[1-9]\d*$/.test(String(id)) || BigInt(String(id)) > 9223372036854775807n))
        throw new Error("模拟成交账户必须是互不重复的正整数 ID，最多 50 个。");
    }
    if (Array.isArray(current)) current.forEach(row => { if (row && typeof row === "object") validateSettings(row as UnknownRecord, `${path}.${key}`); });
    else if (current && typeof current === "object") validateSettings(current as UnknownRecord, `${path}.${key}`);
  }
  if (value.minQuantitySteps !== undefined && value.maxQuantitySteps !== undefined && BigInt(String(value.minQuantitySteps)) > BigInt(String(value.maxQuantitySteps)))
    throw new Error("最大数量步数不能小于最小数量步数。");
  if (path.endsWith(".sources")) {
    for (const key of ["name", "externalSymbol", "parser", "url", "instrumentId"])
      if (!String(value[key] ?? "").trim()) throw new Error(`${labels[key]}不能为空。`);
    for (const key of ["url", "webSocketUrl"]) {
      if (!value[key]) continue;
      try {
        const url = new URL(String(value[key]).replaceAll("{externalSymbol}", "SYMBOL").replaceAll("{externalSymbolLower}", "symbol"));
        if (!(key === "url" ? ["http:", "https:"] : ["ws:", "wss:"]).includes(url.protocol) || url.username || url.password || url.hash) throw new Error();
      } catch { throw new Error(`${labels[key]}格式不正确。`); }
    }
    if (value.webSocketSubscribeMessage) {
      try { JSON.parse(String(value.webSocketSubscribeMessage)); } catch { throw new Error("订阅消息必须为有效 JSON。"); }
    }
  }
}

export function MakerBusinessSettings({ productLine, instrumentId, reason }: { productLine?: string; instrumentId: number; reason: string }) {
  const [settings, setSettings] = useState<UnknownRecord | null>(null);
  const [version, setVersion] = useState<unknown>(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setSettings(null); setError("");
    if (!productLine) return;
    gatewayGet<{ settings: UnknownRecord; version: unknown }>("market-maker", "/business-settings", { productLine })
      .then(data => { if (active) { setSettings(data.settings ?? null); setVersion(data.version); } })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [productLine]);
  function fields(value: unknown, path: string, change: (next: unknown) => void): React.ReactNode {
    const key = path.split(".").at(-1) ?? "";
    const label = labels[key] ?? key;
    if (Array.isArray(value)) return <fieldset><legend>{label}</legend><small>{hint(key)}</small>
      {value.map((row, i) => <div key={i}>{fields(row, `${path}.${i}`, next => change(value.map((v, index) => index === i ? next : v)))}<button type="button" onClick={() => change(value.filter((_, index) => index !== i))}>移除此项</button></div>)}
      <button type="button" onClick={() => change([...value, key === "sources" ? { enabled: false, productLine, instrumentId: String(instrumentId), name: "", externalSymbol: "", url: "", parser: "", webSocketUrl: "", webSocketSubscribeMessage: "", webSocketParser: "", quantityScalePpm: "1000000" } : ""])}>添加{label}</button>
    </fieldset>;
    if (value && typeof value === "object") return <fieldset><legend>{label}</legend><div className="form-grid">
      {Object.entries(value as UnknownRecord).filter(([name]) => name !== "nodeId").map(([name, current]) => <div key={name}>{fields(current, `${path}.${name}`, next => change({ ...value, [name]: next }))}</div>)}
    </div></fieldset>;
    return <label>{label}{typeof value === "boolean"
      ? <input type="checkbox" checked={value} onChange={e => change(e.target.checked)} />
      : <input disabled={key === "productLine"} value={String(value ?? "")} inputMode={typeof value === "number" || /Ppm|Ticks|Steps|Levels|Depth|Batch|Units/.test(key) ? "numeric" : "text"} onChange={e => change(e.target.value)} />}
      {hint(key) && <small>{hint(key)}</small>}{numericBounds[key] && <small>整数范围：{String(numericBounds[key][0])} 至 {String(numericBounds[key][1])}。</small>}</label>;
  }
  async function save() {
    if (!settings || saving) return;
    setSaving(true); setError("");
    try {
      if (!reason.trim() || reason.length > 1000) throw new Error("请填写 1 至 1000 字的修改原因。");
      validateSettings(settings);
      if (!window.confirm("这些公共设置会影响当前产品线的所有做市策略，确认保存？")) return;
      const result = await gatewayPost<{ settings: UnknownRecord; version: unknown }>("market-maker", "/business-settings", { settings, expectedVersion: version, reason: reason.trim() }, { productLine });
      setSettings(result.settings); setVersion(result.version);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  }
  return <details className="profile-section instrument-section"><summary>做市公共设置</summary>
    <p>影响本产品线的所有做市策略。设置保存在后台，保存后自动生效，无需修改文件或重启。</p>
    {error && <p role="alert" className="alert danger">{error}</p>}
    {settings ? <>{Object.entries(settings).map(([key, value]) => <div key={key}>{fields(value, key, next => setSettings(current => ({ ...current, [key]: next })))}</div>)}<button disabled={saving} onClick={() => void save()}>{saving ? "正在保存…" : "保存公共设置"}</button></> : <p>公共设置尚未加载。</p>}
  </details>;
}
