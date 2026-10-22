import { type UnknownRecord } from "../types";
import { useState, useEffect } from "react";
import { gatewayGet, gatewayPost } from "../api/admin";
import { errorMessage } from "../lib/adminData";
import { Panel } from "./AdminUi";

export function RuntimeConfigPanel({ title, service, path, template, productLine }: {
  title: string; service: string; path: string; template: UnknownRecord; productLine?: string;
}) {
  const [config, setConfig] = useState<UnknownRecord | null>(null);
  const [draft, setDraft] = useState<UnknownRecord>({});
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const labels: Record<string, string> = {
    calculationEnabled: "启用计算", coordinationEnabled: "启用协调", settlementEnabled: "启用结算",
    executionEnabled: "启用执行", scannerEnabled: "启用扫描", coverageEnabled: "启用保险赔付",
    scanDelayMs: "扫描间隔（毫秒）", scanBatchSize: "扫描基础预算", batchSize: "每批处理数量",
    maxMarkAgeMs: "标记价格有效时间（毫秒）",
    maxDeleveragesPerDeficit: "单次亏空最大减仓数", candidateMultiplier: "候选账户数量倍数",
    calculationPublishDelayMs: "资金费计算间隔（毫秒）", settleDelayMs: "结算检查间隔（毫秒）", settlementBatchSize: "每批结算数量",
    maxRateAgeMs: "资金费率有效时间（毫秒）", maxPagesPerRun: "每轮最大页数", leaseDurationMs: "协调租约时长（毫秒）",
    liquidationFeeRatePpm: "强平费率（ppm）", delayMs: "强平处理间隔（毫秒）",
    workBatchSize: "每批强平任务数", maxWorkBytes: "每批任务最大字节数",
  };
  const bounds: Record<string, [number, number, string]> = {
    scanDelayMs: [service === "risk" ? 0 : 25, service === "risk" ? Number.MAX_SAFE_INTEGER : 3600000, "两次扫描之间的间隔"],
    scanBatchSize: [1, 4096, "基础扫描预算，随合约数量自动增加"],
    batchSize: [1, service === "adl" ? 1000 : 10000, "每批最多处理的亏空数量"],
    maxRateAgeMs: [1, 600000, "资金费率缓存允许的最大年龄"],
    maxMarkAgeMs: [1, 600000, "资金费计算允许的标记价格最大年龄，超时不计算"],
    maxDeleveragesPerDeficit: [1, 1000, "每个亏空最多减仓的账户数"],
    candidateMultiplier: [1, 1000, "扩大候选账户池；与最大减仓数的乘积不能超过 1000"],
    calculationPublishDelayMs: [25, 3600000, "资金费率计算与发布间隔"],
    settleDelayMs: [25, 3600000, "检查到期资金费结算的间隔"],
    settlementBatchSize: [1, 10000, "每批结算数量"],
    maxPagesPerRun: [1, 1000, "每轮最多读取的分页数，限制单轮工作量"],
    leaseDurationMs: [1000, 600000, "资金费协调租约的有效时间"],
    liquidationFeeRatePpm: [0, 1000000, "百万分比；3000 表示 0.3%"],
    delayMs: [25, 3600000, "检查强平任务的间隔"],
    workBatchSize: [1, 1000, "每批获取的强平任务上限"],
    maxWorkBytes: [256, 1048576, "每批强平任务响应大小上限"],
  };
  async function load() {
    setLoading(true); setError(""); setConfig(null); setDraft({});
    try {
      const response = await gatewayGet<UnknownRecord>(service, path, { productLine });
      setConfig(response);
      const settings = (service === "risk" ? response.calculation : response.config && typeof response.config === "object" ? response.config : response) as UnknownRecord;
      if (service === "risk") {
        setDraft({ calculationEnabled: settings.enabled, scanDelayMs: settings.scanDelayMs, scanBatchSize: settings.scanBatchSize });
        return;
      }
      if (service === "adl" || service === "insurance-admin") {
        const section = response[service === "adl" ? "scanner" : "coverage"] as UnknownRecord;
        const { enabled, ...parameters } = section;
        setDraft({ ...parameters, [service === "adl" ? "scannerEnabled" : "coverageEnabled"]: enabled });
        return;
      }
      if (service === "funding") {
        const calculation = response.calculation as UnknownRecord;
        const settlement = response.settlement as UnknownRecord;
        const coordination = response.coordination as UnknownRecord;
        setDraft({ calculationEnabled: calculation.enabled, calculationPublishDelayMs: calculation.publishDelayMs,
          settlementEnabled: settlement.enabled, settleDelayMs: settlement.settleDelayMs, settlementBatchSize: settlement.batchSize,
          coordinationEnabled: coordination.enabled, maxMarkAgeMs: calculation.maxMarkAgeMs, maxRateAgeMs: calculation.maxRateAgeMs,
          maxPagesPerRun: settlement.maxPagesPerRun, leaseDurationMs: coordination.leaseDurationMs });
        return;
      }
      if (service === "liquidation") {
        const execution = response.execution as UnknownRecord;
        const coordinator = response.coordinator as UnknownRecord;
        setDraft({ executionEnabled: execution.enabled, liquidationFeeRatePpm: execution.liquidationFeeRatePpm,
          delayMs: coordinator.delayMs, workBatchSize: coordinator.workBatchSize,
          maxPagesPerRun: coordinator.maxPagesPerRun, maxWorkBytes: coordinator.maxWorkBytes });
        return;
      }
      setDraft(Object.fromEntries(Object.entries(settings).filter(([key, value]) =>
        key in template || key in labels || (typeof value === "boolean" && key.endsWith("Enabled")))));
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  async function save() {
    if (!config) return;
    setLoading(true); setError("");
    try {
      const body: UnknownRecord = { ...draft };
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === "boolean") continue;
        if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error(`${labels[key] ?? key}必须为非负整数。`);
        body[key] = Number(value);
        const range = bounds[key];
        if (range && (Number(value) < range[0] || Number(value) > range[1])) throw new Error(`${labels[key] ?? key}范围为 ${range[0]} 至 ${range[1]}。`);
      }
      if (!reason.trim() || reason.length > (service === "risk" ? 500 : 1000)) throw new Error(`请填写 1 至 ${service === "risk" ? 500 : 1000} 字的修改原因。`);
      body.expectedVersion = service === "risk" ? (config.calculation as UnknownRecord).version : config.version;
      body.reason = reason.trim();
      if (service === "adl" && Number(body.maxDeleveragesPerDeficit) * Number(body.candidateMultiplier) > 1000)
        throw new Error("最大减仓数与候选倍数的乘积不能超过 1000。");
      if (!window.confirm(`确认更新 ${productLine ?? "当前产品线"} 的${title}？保存后立即生效。`)) return;
      await gatewayPost<UnknownRecord>(service, path, body, { productLine });
      await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [service, path, productLine]);
  return <Panel title={title}><div className="stack">
    {error && <div role="alert" className="alert danger">{error}</div>}
    {config && <p>按产品线独立保存，保存后热生效。修改原因会进入审计；版本冲突时请重新读取后再保存。</p>}
    {config && <div className="form-grid">{Object.entries(draft).map(([key, value]) => <label key={key}>{labels[key] ?? key}
      {typeof value === "boolean" ? <input type="checkbox" checked={value} onChange={e => setDraft(current => ({ ...current, [key]: e.target.checked }))} />
        : <input inputMode="numeric" value={String(value ?? "")} onChange={e => setDraft(current => ({ ...current, [key]: e.target.value }))} />}
      {bounds[key] && <small>{bounds[key][2]}。范围 {bounds[key][0]}–{bounds[key][1]}。</small>}
      {key.endsWith("Ms") && <small>单位为毫秒，1000 毫秒等于 1 秒。</small>}
    </label>)}</div>}
    <label>修改原因<input required maxLength={service === "risk" ? 500 : 1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <div className="button-row"><button onClick={() => void load()} disabled={loading}>重新读取</button>
      <button className="primary" onClick={() => void save()} disabled={loading || !config || !Object.keys(draft).length}>保存设置</button></div>
  </div></Panel>;
}
