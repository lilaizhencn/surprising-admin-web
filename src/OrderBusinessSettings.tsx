import { useState } from "react";
import { gatewayGet, gatewayPost } from "./api/admin";

type SettingValues = Record<string, number | boolean>;
type Snapshot = { configurationVersion: number; settings: { risk: SettingValues; algo: SettingValues }; reason: string; updatedAt: string };
type Field = { section: "risk" | "algo"; key: string; label: string; help: string; min?: number; max?: number; boolean?: boolean };
const fields: Field[] = [
  { section: "risk", key: "marketMaxSlippagePpm", label: "市价保护范围（ppm）", min: 0, max: 999999, help: "相对标记价的最远成交范围；10,000 表示 1%。同时用于衍生品冻结金额估算。" },
  { section: "risk", key: "marketMaxMarkAgeMs", label: "下单标记价有效时间（毫秒）", min: 1, max: 600000, help: "衍生品下单时，超过此年龄的标记价会被拒绝。" },
  { section: "risk", key: "limitPriceProtectionEnabled", label: "启用限价价格保护", boolean: true, help: "开启后，衍生品买入限价不能过高、卖出限价不能过低。" },
  { section: "risk", key: "limitPriceBandPpm", label: "限价保护范围（ppm）", min: 0, max: 999999, help: "相对标记价的保护范围；50,000 表示 5%。" },
  { section: "risk", key: "limitPriceMaxMarkAgeMs", label: "限价保护行情有效时间（毫秒）", min: 1, max: 600000, help: "开启限价保护时额外检查行情年龄；同时受下单标记价有效时间限制。" },
  { section: "algo", key: "enabled", label: "启用算法订单调度", boolean: true, help: "关闭后暂停算法订单分批执行；现有普通委托仍可撤销。" },
  { section: "algo", key: "claimBatchSize", label: "算法订单每批数量", min: 1, max: 1000, help: "每次扫描最多处理的算法订单数量。" },
  { section: "algo", key: "scanDelayMs", label: "算法订单扫描间隔（毫秒）", min: 25, max: 60000, help: "后台扫描待执行算法订单的间隔。" },
  { section: "algo", key: "minIntervalSeconds", label: "最短分批间隔（秒）", min: 1, max: 86400, help: "用户创建算法订单时允许的最短分批间隔。" },
  { section: "algo", key: "maxIntervalSeconds", label: "最长分批间隔（秒）", min: 1, max: 86400, help: "不得小于最短分批间隔。" },
  { section: "algo", key: "minDurationSeconds", label: "最短执行时长（秒）", min: 1, max: 604800, help: "用户创建算法订单时允许的最短总时长。" },
  { section: "algo", key: "maxDurationSeconds", label: "最长执行时长（秒）", min: 1, max: 604800, help: "不得小于最短执行时长。" },
  { section: "algo", key: "claimLeaseMs", label: "算法订单执行租约（毫秒）", min: 1000, max: 600000, help: "工作节点领取任务后的持有时间，防止多个节点同时执行。" }
];

export function OrderBusinessSettings({ productLine }: { productLine: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function install(value: Snapshot) {
    setSnapshot(value);
    setDraft(Object.fromEntries(fields.map(f => [f.key, f.boolean ? Boolean(value.settings[f.section][f.key]) : String(value.settings[f.section][f.key])])));
  }
  async function read() {
    setBusy(true); setError("");
    try { install(await gatewayGet<Snapshot>("instrument-admin", "/order-settings", { productLine })); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try {
      if (!snapshot) throw new Error("请先读取订单设置。");
      if (!reason.trim() || reason.length > 1000) throw new Error("请填写 1 至 1000 字的修改原因。");
      const settings = { risk: {} as SettingValues, algo: {} as SettingValues };
      for (const f of fields) {
        const value = f.boolean ? Boolean(draft[f.key]) : Number(draft[f.key]);
        if (!f.boolean && (String(draft[f.key]).trim() === "" || !Number.isSafeInteger(value) || Number(value) < f.min! || Number(value) > f.max!))
          throw new Error(`${f.label}须为 ${f.min} 至 ${f.max} 的整数。`);
        settings[f.section][f.key] = value;
      }
      if (Number(settings.algo.minIntervalSeconds) > Number(settings.algo.maxIntervalSeconds) || Number(settings.algo.minDurationSeconds) > Number(settings.algo.maxDurationSeconds))
        throw new Error("最短间隔和执行时长不得大于对应最长值。");
      if (!window.confirm(`保存 ${productLine} 的订单规则？价格保护将在交易核心确认同步后生效。`)) return;
      install(await gatewayPost<Snapshot>("instrument-admin", "/order-settings", { settings, expectedVersion: snapshot.configurationVersion, reason: reason.trim() }, { productLine }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <details className="profile-section instrument-section"><summary>产品线订单规则</summary>
    <p>当前产品线：{productLine || "请先选择产品线"}。规则由后台统一维护，保存后自动同步；合约的“生效状态”确认后使用新价格保护规则。</p>
    <button disabled={busy || !productLine} onClick={() => void read()}>读取订单设置</button>
    {error && <p role="alert">{error}</p>}
    {snapshot && <><p>配置版本：{snapshot.configurationVersion}；最近保存：{snapshot.updatedAt}</p>
      <div className="form-grid">{fields.map(f => <label key={f.key}>{f.label}
        {f.boolean ? <input type="checkbox" checked={Boolean(draft[f.key])} onChange={e => setDraft({ ...draft, [f.key]: e.target.checked })} />
          : <input type="number" min={f.min} max={f.max} step={1} value={String(draft[f.key] ?? "")} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />}
        <small>{f.help}</small></label>)}</div>
      <label>修改原因<input required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button disabled={busy} onClick={() => void save()}>保存订单设置</button></>}
  </details>;
}
