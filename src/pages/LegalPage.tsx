import { useCallback, useEffect, useRef, useState } from "react";
import { changeLegal, getLegal, legalAudit, LEGAL_TYPES, listLegal, saveLegal, type LegalAudit, type LegalRevision, type LegalRow, type LegalSave, type LegalTranslation, type LegalType } from "../api/legal";
import { RichArticleEditor } from "../components/RichArticleEditor";
import { ArticleView } from "../components/ArticleView";
import { CONTENT_LOCALES, localeLabel } from "../lib/contentLocales";
import { errorMessage } from "../lib/adminData";
import { StatusBadge } from "../components/AdminUi";
import "./LegalPage.css";

const label = () => new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const blank = (): LegalSave => ({ type: "USER_AGREEMENT", revisionLabel: label(), translations: [{ locale: "zh-CN", title: "", bodyHtml: "" }] });
const content = (revision: LegalRevision): LegalSave => ({ type: revision.type, revisionLabel: revision.revisionLabel, translations: revision.translations });
function canonical(value: LegalSave) { return JSON.stringify({ ...value, translations: [...value.translations].sort((a, b) => a.locale.localeCompare(b.locale)) }); }
function complete(value: LegalTranslation) { const text = value.bodyHtml.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(); return value.title.trim().length > 0 && value.title.length <= 160 && value.bodyHtml.length <= 64000 && text.length > 0 && text.length <= 60000; }

export default function LegalPage() {
  const [rows, setRows] = useState<LegalRow[]>([]), [offset, setOffset] = useState(0), [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [mediaBusy, setMediaBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [revision, setRevision] = useState<LegalRevision | null>(null), [draft, setDraft] = useState<LegalSave | null>(null), [saved, setSaved] = useState("");
  const [locale, setLocale] = useState("zh-CN"), [reason, setReason] = useState(""), [preview, setPreview] = useState(false), [audit, setAudit] = useState<LegalAudit[]>([]);
  const [generation, setGeneration] = useState(0);
  const alive = useRef(true), detailRequest = useRef<AbortController | null>(null);
  const dirty = draft !== null && canonical(draft) !== saved;
  const immutable = revision !== null && revision.status !== "DRAFT";
  const disabled = immutable || busy || mediaBusy;
  const current = draft?.translations.find(item => item.locale === locale) ?? { locale, title: "", bodyHtml: "" };
  const load = useCallback(async (page: number, signal?: AbortSignal) => {
    setLoading(true);
    try { const result = await listLegal(page, signal); if (!signal?.aborted && alive.current) { setRows(result.revisions); setHasMore(result.hasMore); } }
    catch (failure) { if (!signal?.aborted && alive.current) setError(errorMessage(failure)); }
    finally { if (!signal?.aborted && alive.current) setLoading(false); }
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; detailRequest.current?.abort(); }; }, []);
  useEffect(() => { const request = new AbortController(); void load(offset, request.signal); return () => request.abort(); }, [load, offset]);
  useEffect(() => {
    if (!dirty && !mediaBusy) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", leave); return () => window.removeEventListener("beforeunload", leave);
  }, [dirty, mediaBusy]);
  function canLeave() { return !busy && !mediaBusy && (!dirty || window.confirm("还有未保存的协议修改，确定放弃？")); }
  function display(next: LegalRevision | null, value: LegalSave) {
    setRevision(next); setDraft(value); setSaved(next || !value.translations.some(complete) ? canonical(value) : ""); setLocale(value.translations[0]?.locale ?? "zh-CN");
    setReason(""); setPreview(false); setAudit([]); setGeneration(value => value + 1);
  }
  async function open(id: string) {
    if (!canLeave()) return;
    detailRequest.current?.abort(); const request = new AbortController(); detailRequest.current = request;
    setBusy(true); setError(""); setNotice("");
    try { const next = await getLegal(id, request.signal); if (!request.signal.aborted && alive.current) display(next, content(next)); }
    catch (failure) { if (!request.signal.aborted && alive.current) setError(errorMessage(failure)); }
    finally { if (!request.signal.aborted && alive.current) setBusy(false); }
  }
  function updateTranslation(patch: Partial<LegalTranslation>) {
    setDraft(value => value ? { ...value, translations: [...value.translations.filter(item => item.locale !== locale), { ...current, ...patch }] } : value);
  }
  async function run(operation: () => Promise<LegalRevision>, message: string) {
    if (busy || mediaBusy) return;
    setBusy(true); setError(""); setNotice("");
    try { const next = await operation(); if (alive.current) { const selected = locale; display(next, content(next)); setLocale(selected); setNotice(message); await load(offset); } }
    catch (failure) { if (alive.current) setError(errorMessage(failure)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function showAudit() {
    if (!revision || busy) return;
    setBusy(true); setError("");
    try { const result = await legalAudit(revision.revisionId); if (alive.current) setAudit(result); }
    catch (failure) { if (alive.current) setError(errorMessage(failure)); }
    finally { if (alive.current) setBusy(false); }
  }
  const allComplete = draft && CONTENT_LOCALES.every(item => draft.translations.some(translation => translation.locale === item.code && complete(translation)));
  return <div className="legal-page">
    <div className="page-header"><div><h1>协议管理</h1><p>编辑草稿、核对译文并审批发布。已发布正文不可修改；新版本发布后用户需重新确认必需协议。</p></div>
      <button className="primary" disabled={busy || mediaBusy} onClick={() => { if (canLeave()) { display(null, blank()); setError(""); setNotice(""); } }}>新建修订</button></div>
    {error && <div className="alert danger" role="alert">{error}</div>}{notice && <div className="alert" role="status">{notice}</div>}
    <div className="panel table-scroll"><table><thead><tr><th>协议</th><th>修订标识</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.revisionId}><td>{LEGAL_TYPES.find(([type]) => type === row.type)?.[1]}</td><td>{row.revisionLabel}</td><td><StatusBadge value={row.status} /></td><td>{new Date(row.updatedAt).toLocaleString()}</td><td><button disabled={busy || mediaBusy} onClick={() => void open(row.revisionId)}>查看与管理</button></td></tr>)}
      {!rows.length && <tr><td colSpan={5}>{loading ? "正在加载…" : "还没有协议修订"}</td></tr>}
    </tbody></table></div>
    <div className="button-row"><button disabled={loading || busy || offset === 0} onClick={() => { if (canLeave()) setOffset(value => Math.max(0, value - 25)); }}>上一页</button><span>第 {offset / 25 + 1} 页</span><button disabled={loading || busy || !hasMore} onClick={() => { if (canLeave()) setOffset(value => value + 25); }}>下一页</button><button disabled={loading || busy} onClick={() => void load(offset)}>刷新列表</button></div>
    {draft && <section className="panel legal-editor" aria-label="协议修订编辑器">
      <div className="page-header"><h2>{revision ? `修订 ${revision.revisionId}` : "新协议修订"}{dirty ? " · 未保存" : ""}</h2><button disabled={busy || mediaBusy} onClick={() => { if (canLeave()) { setDraft(null); setAudit([]); } }}>关闭</button></div>
      <div className="form-grid"><label>协议类型<select value={draft.type} disabled={disabled || !!revision} onChange={event => setDraft({ ...draft, type: event.target.value as LegalType })}>{LEGAL_TYPES.map(([type, name]) => <option key={type} value={type}>{name}</option>)}</select></label>
        <label>修订标识<input value={draft.revisionLabel} maxLength={40} pattern="[A-Za-z0-9._-]+" disabled={disabled} onChange={event => setDraft({ ...draft, revisionLabel: event.target.value })} /><small>使用字母、数字、点、下划线或连字符，如 2026-10-31.1</small></label></div>
      {immutable && <p role="status">此版本正文已锁定。需要修改时，请复制为新修订。</p>}
      <fieldset disabled={busy || mediaBusy} className="legal-locales"><legend>译文 · {draft.translations.filter(complete).length} / {CONTENT_LOCALES.length} 完成</legend>{CONTENT_LOCALES.map(item => <button key={item.code} type="button" aria-pressed={locale === item.code} onClick={() => { setLocale(item.code); setPreview(false); }}>{item.label} {draft.translations.some(value => value.locale === item.code && complete(value)) ? "✓" : "○"}</button>)}</fieldset>
      <label>标题 · {localeLabel(locale)}<input dir={locale.startsWith("ar") ? "rtl" : "auto"} lang={locale} value={current.title} maxLength={160} disabled={disabled} onChange={event => updateTranslation({ title: event.target.value })} /></label>
      <div className="button-row"><button type="button" aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? "返回编辑" : "预览正文"}</button>
        {!immutable && draft.translations.some(item => item.locale === locale) && <button disabled={busy || mediaBusy || draft.translations.length === 1} onClick={() => { if (window.confirm(`清空 ${localeLabel(locale)} 的译文？`)) { setDraft({ ...draft, translations: draft.translations.filter(item => item.locale !== locale) }); setGeneration(value => value + 1); } }}>清空此语言</button>}</div>
      {preview || immutable ? <ArticleView html={current.bodyHtml} text="" locale={locale} /> : <RichArticleEditor key={`${generation}:${locale}`} html={current.bodyHtml} text="" locale={locale} maxTextLength={60000} editorLabel="协议正文" disabled={busy} onBusyChange={setMediaBusy} onChange={value => updateTranslation({ bodyHtml: value.bodyHtml })} />}
      {!immutable && <div className="button-row"><button className="primary" disabled={busy || mediaBusy || !dirty || !/^[A-Za-z0-9._-]{1,40}$/.test(draft.revisionLabel) || !draft.translations.every(complete)} onClick={() => void run(() => saveLegal(draft, revision), "草稿已保存，发布前请核对所有译文。")}>保存草稿</button></div>}
      {revision && <><label>操作原因<input value={reason} maxLength={1000} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="说明本次发布或撤回的原因" /></label><div className="button-row">
        {revision.status === "DRAFT" && <button className="primary" disabled={busy || mediaBusy || dirty || !allComplete || !reason.trim()} onClick={() => { if (window.confirm("发布后将替换同类型现行协议，正文不可修改。确认已核对全部译文？")) void run(() => changeLegal(revision, "publish", reason.trim()), "协议已发布。必需协议的新版本将在用户下一次登录或刷新会话时要求确认。"); }}>审批并发布</button>}
        {revision.status === "DRAFT" && <small>发布需要全部 {CONTENT_LOCALES.length} 种语言完成并先保存。</small>}
        {revision.status === "PUBLISHED" && <button disabled={busy || !reason.trim()} onClick={() => { if (window.confirm("确认撤回此协议？必需协议需先发布替代版本，服务端会阻止无替代撤回。")) void run(() => changeLegal(revision, "withdraw", reason.trim()), "协议已撤回。"); }}>审批并撤回</button>}
        <button disabled={busy || mediaBusy} onClick={() => { if (canLeave()) display(null, { ...content(revision), revisionLabel: label() }); }}>复制为新修订</button>
        <button disabled={busy} onClick={() => void showAudit()}>查看审计</button>
      </div></>}
      {!!audit.length && <div className="legal-audit">{audit.map(item => <details key={item.auditId}><summary>{item.action} · {new Date(item.createdAt).toLocaleString()} · 管理员 {item.adminUserId}</summary><p>{item.reason}</p><pre>{item.snapshot}</pre></details>)}</div>}
    </section>}
  </div>;
}
