import { useEffect, useRef, useState } from "react";
import { gatewayGet, gatewayPost, instruments } from "./api/admin";
import { loadSession } from "./api/client";
import type { Instrument } from "./types";

const service = "trading-orders";
const path = "/maintenance";
const lines = ["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"];
const modes = { CANCEL: "撤销普通单和触发单", MARKET: "市价撮合平仓（IOC）", LIMIT: "限价撮合平仓（IOC）", SETTLEMENT: "固定价格结算清退" };
type Mode = keyof typeof modes;
type Draft = { requestId: string; symbol: string; userId: string; mode: Mode; priceTicks: string; reason: string };
type Task = { id: string; productLine: string; request: Draft; adminUserId: string; status: string; phase: string; error: string | null; updatedAt: string };
type Action = { key: string; requestJson: string; resultJson: string | null; completed: boolean };
type Position = { userId: string; symbol: string; marginMode: string; positionSide: string; signedQuantitySteps: string; entryPriceTicks: string; positionMarginUnits: string };
type Preview = { productLine: string; symbol: string; gateMode: string; gateTaskId: string; instrumentChangeId: string; positions: Position[]; orderIds: string[]; triggerOrderIds: string[]; moreUsers: boolean; nextUserId: string; moreOrders: boolean; moreTriggers: boolean };
const statuses: Record<string, string> = { RUNNING: "处理中", BLOCKED: "已阻塞，需检查", COMPLETED: "Core 已确认完成，维护限制保留", RELEASED: "维护任务已解除" };
const phases: Record<string, string> = { GATE: "限制交易", GATE_REJECTED: "尚未进入维护", TRIGGERS: "撤触发单", ORDERS: "撤普通单", CLOSE: "撮合平仓", SETTLE: "分批结算", VERIFY: "核对剩余状态", RELEASE: "恢复交易", RELEASE_REJECTED: "恢复交易被拒绝" };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function draftKey() { return `surprising-maintenance-draft:${loadSession()?.user.userId ?? "anonymous"}`; }
function savedDraft(): { line: string; draft: Draft } | null {
  try {
    const value = JSON.parse(localStorage.getItem(draftKey()) ?? "null");
    if (value && lines.includes(value.line) && value.draft && Object.hasOwn(modes, value.draft.mode)
      && ["requestId", "symbol", "userId", "priceTicks", "reason"].every(key => typeof value.draft[key] === "string")) return value;
  } catch { /* A malformed browser draft must not prevent opening the maintenance console. */ }
  return null;
}

export default function MaintenancePage() {
  const [saved] = useState(savedDraft);
  const [line, setLine] = useState(saved?.line ?? "LINEAR_PERPETUAL");
  const [draft, setDraft] = useState<Draft>(saved?.draft ?? { requestId: crypto.randomUUID(), symbol: "", userId: "", mode: "CANCEL", priceTicks: "0", reason: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewScope, setPreviewScope] = useState("");
  const [previewUserId, setPreviewUserId] = useState("0");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [beforeId, setBeforeId] = useState("0");
  const [selected, setSelected] = useState<Task | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [dialog, setDialog] = useState<"create" | "retry" | "release" | null>(null);
  const [symbolList, setSymbolList] = useState<{ line: string; items: Instrument[]; loading: boolean; error: string }>({ line: "", items: [], loading: true, error: "" });
  const [symbolReload, setSymbolReload] = useState(0);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [symbolIndex, setSymbolIndex] = useState(0);
  const generation = useRef(0);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (symbolOpen) document.getElementById(`maintenance-symbol-${symbolIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [symbolOpen, symbolIndex, symbolSearch]);

  useEffect(() => {
    let stopped = false;
    setSymbolList({ line, items: [], loading: true, error: "" });
    async function load() {
      try {
        const items = new Map<string, Instrument>();
        const cursors = new Set<string>();
        let cursor: string | undefined;
        do {
          const page = await instruments({ productLine: line, limit: 100, cursor });
          if (stopped) return;
          for (const item of page.instruments) items.set(item.symbol, item);
          if (!page.hasMore) break;
          if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error("币对列表分页异常，请重试");
          cursor = page.nextCursor;
          cursors.add(cursor);
        } while (!stopped);
        if (!stopped) setSymbolList({ line, items: [...items.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)), loading: false, error: "" });
      } catch (e) {
        if (!stopped) setSymbolList({ line, items: [], loading: false, error: message(e) });
      }
    }
    void load();
    return () => { stopped = true; };
  }, [line, symbolReload]);

  useEffect(() => {
    try { localStorage.setItem(draftKey(), JSON.stringify({ line, draft })); }
    catch { setError("浏览器无法保存审批草稿，请保持本页面打开，避免丢失请求身份。"); }
  }, [line, draft]);
  useEffect(() => {
    if (!dialog || busy) return;
    const previous = document.activeElement as HTMLElement | null;
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { setDialog(null); return; }
      if (event.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>("input, button:not(:disabled)");
      if (!nodes?.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [dialog, busy]);

  useEffect(() => {
    ++generation.current;
    setTasks([]); setSelected(null); setActions([]); setPreview(null); setError("");
    let stopped = false;
    const refresh = async () => {
      try {
        const result = await gatewayGet<Task[]>(service, path, { productLine: line, beforeId });
        if (!stopped) { setTasks(result); setSelected(previous => previous ? result.find(t => t.id === previous.id) ?? previous : null); }
      } catch (e) { if (!stopped) setError(message(e)); }
    };
    void refresh(); const timer = window.setInterval(refresh, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [line, beforeId]);

  function change(value: Partial<Draft>) {
    generation.current++;
    setDraft(previous => ({ ...previous, ...value, requestId: crypto.randomUUID() }));
    setPreview(null); setConfirmation(""); setError("");
  }
  async function inspect(afterUserId = "0", symbol = draft.symbol, userId = draft.userId) {
    const version = generation.current;
    setBusy(true); setError("");
    try {
      const result = await gatewayGet<Preview>(service, `${path}/preview`, { productLine: line, symbol, userId: userId || "0", afterUserId });
      if (generation.current === version) { setPreview(result); setPreviewUserId(userId || "0"); setPreviewScope(`${line}:${symbol}:${userId || "0"}`); }
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function select(task: Task, afterKey = "") {
    setBusy(true); setError("");
    try {
      const result = await gatewayGet<Action[]>(service, `${path}/${task.id}/actions`, { productLine: line, afterKey });
      setSelected(task); setActions(result);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function execute() {
    setBusy(true); setError("");
    try {
      let task: Task;
      if (dialog === "create") {
        task = await gatewayPost<Task>(service, path, draft, { productLine: line });
      } else {
        if (!selected || !dialog) return;
        task = await gatewayPost<Task>(service, `${path}/${selected.id}/${dialog}`, {}, { productLine: line });
      }
      setSelected(task); setActions([]); setDialog(null); setConfirmation("");
      setTasks(await gatewayGet<Task[]>(service, path, { productLine: line, beforeId }));
      if (dialog === "create") { setPreview(null); setDraft(previous => ({ ...previous, requestId: crypto.randomUUID() })); }
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const hasPrice = draft.mode === "LIMIT" || draft.mode === "SETTLEMENT";
  const symbolLoading = symbolList.line !== line || symbolList.loading;
  const availableSymbols = symbolList.line === line ? symbolList.items : [];
  const symbolAvailable = availableSymbols.some(item => item.symbol === draft.symbol);
  const symbolMatches = availableSymbols.filter(item => `${item.symbol} ${item.baseAsset ?? ""} ${item.quoteAsset ?? ""}`.toUpperCase().includes(symbolSearch.trim().toUpperCase()));
  function chooseSymbol(symbol: string) {
    change({ symbol }); setSymbolOpen(false); setSymbolSearch(""); setSymbolIndex(0);
  }
  const valid = !symbolOpen && !symbolLoading && !symbolList.error && symbolAvailable && /^(|[1-9][0-9]*)$/.test(draft.userId)
    && draft.reason.trim().length > 0 && (!hasPrice || /^[1-9][0-9]*$/.test(draft.priceTicks));
  const confirmSymbol = dialog === "create" ? draft.symbol : selected?.request.symbol ?? "";

  return <div className="stack maintenance-page">
    <section className="panel">
      <div className="panel-title"><h3>交易维护</h3><span>撤单 · 撮合平仓 · 结算清退</span></div>
      <p>任务按产品线和币对执行。先预览，再提交审批。交易限制作用于整个币对，即使只处理指定用户；完成后需明确恢复交易，结算清退的币对永久停止交易。</p>
      <div className="filters">
        <label>产品线<select disabled={busy || !!dialog} value={line} onChange={e => { setLine(e.target.value); setBeforeId("0"); setSymbolOpen(false); setSymbolSearch(""); setSymbolIndex(0); change({ symbol: "", mode: "CANCEL", priceTicks: "0" }); }}>{lines.map(v => <option key={v}>{v}</option>)}</select></label>
        <div className="maintenance-symbol" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setSymbolOpen(false); setSymbolSearch(""); setSymbolIndex(0); } }}>
          <label htmlFor="maintenance-symbol-input">币对</label>
          <input id="maintenance-symbol-input" role="combobox" aria-autocomplete="list" aria-expanded={symbolOpen} aria-controls="maintenance-symbol-options"
            aria-activedescendant={symbolOpen && symbolMatches[symbolIndex] ? `maintenance-symbol-${symbolIndex}` : undefined}
            autoComplete="off" disabled={busy || !!dialog || symbolLoading || !!symbolList.error || availableSymbols.length === 0}
            placeholder={symbolLoading ? "正在加载币对…" : symbolList.error ? "币对加载失败" : availableSymbols.length === 0 ? "当前产品线暂无币对" : "输入关键词搜索币对"}
            value={symbolOpen ? symbolSearch : draft.symbol}
            onFocus={() => { setSymbolOpen(true); setSymbolSearch(""); setSymbolIndex(0); }}
            onClick={() => { if (!symbolOpen) { setSymbolOpen(true); setSymbolSearch(""); setSymbolIndex(0); } }}
            onChange={e => { setSymbolSearch(e.target.value); setSymbolOpen(true); setSymbolIndex(0); }}
            onKeyDown={e => {
              if (e.key === "Escape") { e.preventDefault(); setSymbolOpen(false); setSymbolSearch(""); setSymbolIndex(0); }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault(); setSymbolOpen(true);
                setSymbolIndex(previous => Math.max(0, Math.min(symbolMatches.length - 1, previous + (e.key === "ArrowDown" ? 1 : -1))));
              }
              if (e.key === "Enter" && symbolOpen) { e.preventDefault(); if (symbolMatches[symbolIndex]) chooseSymbol(symbolMatches[symbolIndex].symbol); }
            }} />
          {symbolOpen && <div id="maintenance-symbol-options" className="maintenance-symbol-options" role="listbox" aria-label="匹配币对">
            {symbolMatches.map((item, index) => <button type="button" role="option" id={`maintenance-symbol-${index}`} tabIndex={-1}
              aria-selected={index === symbolIndex} key={item.symbol} onMouseDown={e => e.preventDefault()}
              onClick={() => chooseSymbol(item.symbol)}>{item.symbol}{item.status ? ` · ${item.status}` : ""}</button>)}
            {symbolMatches.length === 0 && <p role="status">没有匹配的币对</p>}
          </div>}
          {!symbolLoading && draft.symbol && !symbolAvailable && <small>草稿币对不在当前列表，请重新选择。</small>}
        </div>
        <label>用户 ID（留空为全部）<input disabled={busy || !!dialog || draft.mode === "SETTLEMENT"} inputMode="numeric" value={draft.userId} onChange={e => change({ userId: e.target.value })} /></label>
        <label>操作方式<select disabled={busy || !!dialog} value={draft.mode} onChange={e => { const mode = e.target.value as Mode; change({ mode, priceTicks: "0", ...(mode === "SETTLEMENT" ? { userId: "" } : {}) }); }}>{Object.entries(modes).filter(([key]) => line !== "SPOT" || key === "CANCEL").map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        {hasPrice && <label>{draft.mode === "SETTLEMENT" && line === "OPTION" ? "标的结算价格（ticks）" : "价格（ticks，整数最小单位）"}<input disabled={busy || !!dialog} inputMode="numeric" value={draft.priceTicks} onChange={e => change({ priceTicks: e.target.value })} /></label>}
        <label>维护原因<input disabled={busy || !!dialog} value={draft.reason} maxLength={1024} placeholder="升级维护或下架原因、关联工单" onChange={e => change({ reason: e.target.value })} /></label>
        <button disabled={busy || !valid} onClick={() => void inspect()}>预览 Core 当前状态</button>
        <button className="primary" disabled={busy || !valid || !preview || previewScope !== `${line}:${draft.symbol}:${draft.userId || "0"}` || preview.gateMode !== "TRADING"} onClick={() => { setConfirmation(""); setDialog("create"); }}>确认并提交审批</button>
      </div>
      {symbolList.error && <p role="alert" className="maintenance-error">币对加载失败：{symbolList.error} <button disabled={busy || !!dialog} onClick={() => setSymbolReload(value => value + 1)}>重新加载币对</button></p>}
      {draft.mode === "MARKET" && <p>使用现有市价保护及 IOC 撮合，只减仓。流动性不足可能部分成交或未成交，剩余持仓会保留，任务不会显示完成。</p>}
      <p>草稿保留在当前浏览器。可前往审批中心后返回执行同一请求；修改范围、方式、价格或原因需要重新审批。</p>
      {draft.mode === "LIMIT" && <p>IOC 不挂余单：平多的价格不得低于指定价，平空不得高于指定价。双向持仓共用此价格，请先核对两个方向是否适用同一价格。</p>}
      {draft.mode === "SETTLEMENT" && <p role="note">清退整个币对，价格提交后不可修改，不能恢复交易。期权按标的结算价计算行权价值；衍生品按现有结算资金规则处理，保险资金不足会暂停。现货资产不会被出售。</p>}
      {error && <p role="alert" className="maintenance-error">{error}</p>}
    </section>
    {preview && <section className="panel">
      <div className="panel-title"><h3>Core 实时预览 · {preview.productLine} · {preview.symbol}</h3></div>
      <p>限制：{preview.gateMode} · 维护任务：{preview.gateTaskId}。这是分批预览，不代表全部数量；执行前会重新读取状态。</p>
      <p>本页普通单：{preview.orderIds.join(", ") || "无"}{preview.moreOrders ? "（还有更多）" : ""}</p>
      <p>本页触发单：{preview.triggerOrderIds.join(", ") || "无"}{preview.moreTriggers ? "（还有更多）" : ""}</p>
      <div className="table-wrap"><table><thead><tr>{["用户", "保证金模式", "持仓方向", "有符号持仓量（steps）", "开仓价（ticks）", "保证金（units）"].map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{preview.positions.map(p => <tr key={`${p.userId}:${p.marginMode}:${p.positionSide}`}><td>{p.userId}</td><td>{p.marginMode}</td><td>{p.positionSide}</td><td>{p.signedQuantitySteps}</td><td>{p.entryPriceTicks}</td><td>{p.positionMarginUnits}</td></tr>)}</tbody></table></div>
      {preview.positions.length === 0 && <p>本页无未平仓持仓。</p>}
      <div className="button-row"><button disabled={busy} onClick={() => void inspect("0", preview.symbol, previewUserId)}>第一页</button><button disabled={busy || !preview.moreUsers} onClick={() => void inspect(preview.nextUserId, preview.symbol, previewUserId)}>下一批持仓用户</button></div>
    </section>}
    <section className="panel">
      <div className="panel-title"><h3>维护任务 · {line}</h3><span>每 5 秒刷新</span></div>
      <div className="table-wrap"><table><thead><tr>{["任务", "币对 / 用户范围", "方式", "状态 / 步骤", "操作人", "最后更新", "详情"].map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{tasks.map(t => <tr key={t.id}><td>{t.id}</td><td>{t.request.symbol}<br />{t.request.userId === "0" ? "全部用户" : t.request.userId}</td><td>{modes[t.request.mode]}</td><td>{statuses[t.status] ?? t.status}<br />{phases[t.phase] ?? t.phase}</td><td>{t.adminUserId}</td><td>{t.updatedAt}</td><td><button disabled={busy} onClick={() => void select(t)}>查看</button></td></tr>)}</tbody></table></div>
      {tasks.length === 0 && <p>本页暂无任务。</p>}
      <div className="button-row"><button disabled={busy || beforeId === "0"} onClick={() => setBeforeId("0")}>最新任务</button><button disabled={busy || tasks.length < 50} onClick={() => setBeforeId(tasks.at(-1)!.id)}>更早任务</button></div>
    </section>
    {selected && <section className="panel">
      <div className="panel-title"><h3>任务 {selected.id} · {selected.productLine} · {selected.request.symbol}</h3></div>
      <p>{statuses[selected.status]} · 原因：{selected.request.reason} · 价格 ticks：{selected.request.priceTicks}</p>
      {selected.error && <p role="alert" className="maintenance-error">{selected.error}</p>}
      <div className="button-row">
        <button disabled={busy} onClick={() => void inspect("0", selected.request.symbol, selected.request.userId)}>查询当前剩余订单与持仓</button>
        <button disabled={busy || selected.status !== "BLOCKED"} onClick={() => { setConfirmation(""); setDialog("retry"); }}>重试（需要审批）</button>
        <button disabled={busy || !["COMPLETED", "BLOCKED"].includes(selected.status) || selected.phase === "GATE" || (selected.request.mode === "SETTLEMENT" && selected.phase !== "GATE_REJECTED")} onClick={() => { setConfirmation(""); setDialog("release"); }}>{selected.phase === "GATE_REJECTED" ? "取消未开始的维护任务" : "解除维护并恢复交易"}</button>
      </div>
      <p>操作记录包含原始整数单位。提交成功不等于全部成交，请同时核对 Core 剩余状态。</p>
      {actions.map(a => <details key={a.key}><summary>{a.key} · {a.completed ? "已得到操作结果" : "等待执行或核对"}</summary><pre>{a.requestJson}</pre><pre>{a.resultJson ?? "暂无结果"}</pre></details>)}
      <div className="button-row"><button disabled={busy} onClick={() => void select(selected)}>最新结果 / 第一页</button><button disabled={busy || actions.length < 50} onClick={() => void select(selected, actions.at(-1)!.key)}>下一页操作</button></div>
    </section>}
    {dialog && <div className="modal-backdrop"><section ref={dialogRef} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="maintenance-confirm-title">
      <h3 id="maintenance-confirm-title">{dialog === "create" ? "确认维护范围与操作" : dialog === "retry" ? "确认重试维护任务" : selected?.phase === "GATE_REJECTED" ? "确认取消未开始的任务" : "确认恢复交易"}</h3>
      <p>{line} · {confirmSymbol} · {dialog === "create" ? modes[draft.mode] : `任务 ${selected?.id}`}</p>
      {dialog === "create" && <p>用户范围：{draft.userId || "全部"} · 价格 ticks：{draft.priceTicks} · 原因：{draft.reason}</p>}
      <p>{dialog === "release" ? selected?.phase === "GATE_REJECTED" ? "Core 已明确拒绝进入维护。此操作结束尚未开始的任务，保留当前交易状态。" : "解除整个币对的维护限制，用户可以重新开仓。此操作不会补成交此前剩余持仓。" : "此操作会改变真实订单或持仓。维护限制覆盖整个币对，结算清退不能撤销。"}</p>
      <label>输入币对 {confirmSymbol} 确认<input autoFocus value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      {error && <p role="alert" className="maintenance-error">{error}</p>}
      <div className="button-row"><button disabled={busy} onClick={() => setDialog(null)}>取消</button><button className="primary" disabled={busy || confirmation !== confirmSymbol} onClick={() => void execute()}>{busy ? "处理中…" : "继续审批并执行"}</button></div>
    </section></div>}
  </div>;
}
