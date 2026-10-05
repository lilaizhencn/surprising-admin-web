import { useEffect, useState } from "react";
import { gatewayGet, gatewayPost } from "./api/admin";
import type { Instrument, UnknownRecord } from "./types";

const fields = [
  ["baseQuantitySteps", "每档基础数量（步）", "必须在本合约最小与最大下单数量之间。"],
  ["spreadTicks", "基础价差（tick）", "非负整数，与当前价格跳动单位一致。"],
  ["levelSpacingTicks", "档位间距（tick）", "相邻报价档位的价格跳动数。"],
  ["maxInventorySteps", "最大库存（步）", "做市账户允许持有的库存数量上限。"],
  ["maxInventorySkewPpm", "最大库存偏移", "0–1,000,000，1,000,000 表示 100%。"],
  ["orderLevels", "双边报价档数", "每侧 1–50 档。"],
  ["initialAnchorPriceTicks", "启动参考价（tick）", "0 表示关闭，正常使用实时行情；非零值仅用于明确确认的启动价格。"],
];

export function InstrumentMakerSettings({ instrument, reason }: { instrument: Instrument; reason: string }) {
  const line = instrument.contractType === "VANILLA_OPTION" ? "OPTION" : instrument.contractType;
  const [definitions, setDefinitions] = useState<UnknownRecord[]>([]);
  const [draft, setDraft] = useState<UnknownRecord | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setDraft(null); setLoaded(false); setError("");
    if (!instrument.instrumentId || !line) return;
    gatewayGet<UnknownRecord[]>("market-maker", "/strategy-definitions", { productLine: line })
      .then(rows => {
        if (!active) return;
        const matching = rows.filter(row => (row.instrumentIds as string[]).map(String).includes(String(instrument.instrumentId)));
        setDefinitions(matching); setDraft(matching[0] ?? null); setLoaded(true);
      }).catch(err => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [instrument.instrumentId, line]);
  const update = (key: string, value: unknown) => setDraft(current => ({ ...current, [key]: value }));
  async function save() {
    if (!draft || saving) return;
    setSaving(true); setError("");
    try {
      if (!reason.trim()) throw new Error("请填写合约页面的修改原因。");
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(String(draft.strategyId ?? ""))) throw new Error("策略标识须为 1–64 位字母、数字、下划线或连字符。");
      const accounts = Array.isArray(draft.accountIds) ? draft.accountIds : String(draft.accountIds ?? "").split(",").map(value => value.trim());
      if (!accounts.length || accounts.some(value => !/^[1-9][0-9]*$/.test(String(value)) || BigInt(String(value)) > 9223372036854775807n)) throw new Error("请填写有效做市账户 ID，多个账户用逗号分隔。");
      for (const [field, label] of fields) {
        const value = String(draft[field] ?? "");
        if (!/^\d+$/.test(value) || BigInt(value) > 9223372036854775807n) throw new Error(`${label}须为有效非负整数。`);
      }
      if (BigInt(String(draft.baseQuantitySteps)) <= 0n) throw new Error("基础数量必须大于 0。");
      if (Number(draft.orderLevels) < 1 || Number(draft.orderLevels) > 50) throw new Error("报价档数须为 1–50。");
      if (BigInt(String(draft.maxInventorySkewPpm)) > 1000000n) throw new Error("库存偏移不得超过 1,000,000。");
      const saved = await gatewayPost<UnknownRecord>("market-maker", "/strategy-definitions", {
        ...draft, accountIds: accounts, productLine: line, instrumentIds: draft.instrumentIds,
      }, { reason: reason.trim() });
      setDraft(saved); setDefinitions(rows => [...rows.filter(row => row.strategyId !== saved.strategyId), saved]);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  }
  return <details className="profile-section instrument-section"><summary>本合约做市设置</summary>
    <p>策略保存在后台，保存后自动加载。合约开启交易后方可启用做市；账户须已备好可用余额。</p>
    {error && <p role="alert" className="alert danger">{error}</p>}
    {!instrument.instrumentId ? <p>先保存合约，再配置做市。</p> : <>
      {definitions.length > 0 && <label>选择策略<select value={String(draft?.strategyId ?? "")} onChange={e => setDraft(definitions.find(row => row.strategyId === e.target.value) ?? null)}>{definitions.map(row => <option key={String(row.strategyId)}>{String(row.strategyId)}</option>)}</select></label>}
      <button disabled={!loaded || saving} onClick={() => setDraft({ strategyId: "", productLine: line, instrumentIds: [String(instrument.instrumentId)], accountIds: [], enabled: false, marginMode: "CROSS", version: 0 })}>添加做市策略</button>
      {draft && <><div className="form-grid">
        <label>策略标识<input disabled={Boolean(draft.version)} value={String(draft.strategyId ?? "")} onChange={e => update("strategyId", e.target.value)} /><small>永久标识，创建后不可修改。</small></label>
        <label>做市账户 ID<input disabled={Boolean(draft.version)} value={Array.isArray(draft.accountIds) ? draft.accountIds.join(",") : String(draft.accountIds ?? "")} onChange={e => update("accountIds", e.target.value)} /><small>多个 ID 用逗号分隔；创建后锁定账户绑定。</small></label>
        <label>保证金模式<select value={String(draft.marginMode)} onChange={e => update("marginMode", e.target.value)}><option value="CROSS">全仓</option><option value="ISOLATED">逐仓</option></select></label>
        {fields.map(([field, label, hint]) => <label key={field}>{label}<input inputMode="numeric" value={String(draft[field] ?? "")} onChange={e => update(field, e.target.value)} /><small>{hint}</small></label>)}
        <label><input type="checkbox" checked={Boolean(draft.enabled)} disabled={instrument.status !== "TRADING" && !draft.enabled} onChange={e => update("enabled", e.target.checked)} />启用做市</label>
      </div><button disabled={saving} onClick={() => void save()}>{saving ? "正在保存…" : "保存做市设置"}</button></>}
    </>}
  </details>;
}
