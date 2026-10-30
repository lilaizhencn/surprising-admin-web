import { useEffect, useRef, useState } from "react";
import { RefreshCw, Plus } from "lucide-react";
import { RichArticleEditor } from "./components/RichArticleEditor";
import { ArticleView } from "./components/ArticleView";
import { CONTENT_LOCALES, localeLabel } from "./lib/contentLocales";
import { DataTable } from "./components/AdminUi";
import { parseApiJson } from "./api/client";
import { announcementSave, requirePublishable, localDateTimeValue, type AnnouncementDraft as Draft } from "./lib/announcementDraft";
import {
  announcementAudit,
  getAnnouncement,
  createAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
  withdrawAnnouncement,
  type Announcement,
  type AnnouncementSummary,
  type AnnouncementSave,
  type AnnouncementTranslation
} from "./api/announcements";

const LINES = ["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"];
const PLATFORMS = ["WEB", "IOS", "ANDROID"];
const PLACEMENTS = ["CENTER", "MODAL", "BANNER"];
const LOCALES = CONTENT_LOCALES.map(locale => locale.code);

function emptyDraft(): Draft {
  return {
    category: "GENERAL",
    priority: "0",
    placements: ["CENTER", "MODAL", "BANNER"],
    productLines: ["ALL"],
    platforms: ["ALL"],
    startsAt: localDateTimeValue(new Date(Date.now() + 60_000).toISOString()),
    expiresAt: "",
    translations: Object.fromEntries(LOCALES.map(locale => [locale, { locale, title: "", summary: "", body: "" }]))
  };
}

export default function AnnouncementsPage() {
  const [rows, setRows] = useState<AnnouncementSummary[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editLocale, setEditLocale] = useState("zh-CN");
  const [mediaBusy, setMediaBusy] = useState(false);
  const [previewLocale, setPreviewLocale] = useState("zh-CN");
  const [auditRows, setAuditRows] = useState<Awaited<ReturnType<typeof announcementAudit>>>([]);
  const [auditFor, setAuditFor] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [notice, setNotice] = useState("");
  const [writeBlocked, setWriteBlocked] = useState(false);
  const readRequest = useRef<AbortController | null>(null);
  const auditRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const writeLock = useRef(false);
  const editor = useRef<HTMLElement>(null);
  const auditPanel = useRef<HTMLElement>(null);
  const dirty = (editing || creating) && (editing ? draftDiffersFrom(editing, draft) : Object.values(draft.translations).some(item => item.title || item.body || item.summary));
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; readRequest.current?.abort(); auditRequest.current?.abort(); detailRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !saving) { event.preventDefault(); event.returnValue = ""; } };
    const navigate = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest('nav[aria-label="后台导航"] button, nav[aria-label="移动端后台导航"] button, button[aria-label="退出登录"]') : null;
      if (!button || button.getAttribute("aria-current") === "page") return;
      if (saving || (dirty && !window.confirm("当前公告有未保存的修改，确定离开并放弃修改？"))) {
        event.preventDefault(); event.stopPropagation();
        if (saving) setError("公告操作正在处理中，请等待结果后再离开。");
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigate, true); };
  }, [dirty, saving]);
  useEffect(() => {
    if (!editing && !creating) return;
    editor.current?.focus({ preventScroll: true });
    editor.current?.scrollIntoView({ block: "start" });
  }, [editing?.announcementId, creating]);
  useEffect(() => {
    if (auditFor) { auditPanel.current?.focus({ preventScroll: true }); auditPanel.current?.scrollIntoView({ block: "start" }); }
  }, [auditFor]);

  async function load(nextOffset = offset) {
    readRequest.current?.abort();
    const abort = new AbortController();
    readRequest.current = abort;
    setLoading(true); setError(""); setRows([]); setCount(null); setNotice("");
    try {
      const page = await listAnnouncements({ status, query, offset: nextOffset, limit: 25 }, abort.signal);
      if (abort.signal.aborted) return;
      setRows(page.announcements); setCount(page.count); setOffset(page.offset); setHasMore(page.hasMore);
    } catch (reason) { if (!abort.signal.aborted) setError(errorText(reason)); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    readRequest.current?.abort(); setRows([]); setCount(null); setLoading(true); setError("");
    const timer = window.setTimeout(() => void load(0), 200);
    return () => { window.clearTimeout(timer); readRequest.current?.abort(); };
  }, [status, query]);
  function canLeaveEditor() { return !writeLock.current && !mediaBusy && (!dirty || window.confirm("当前公告有未保存的修改，确定放弃这些修改？")); }
  function closeEditor() {
    if (!canLeaveEditor()) return;
    detailRequest.current?.abort(); setDetailLoading(false); setEditing(null); setCreating(false); setWriteBlocked(false); setError("");
  }
  function closeAudit() { auditRequest.current?.abort(); setAuditFor(null); setAuditRows([]); setAuditLoading(false); setAuditError(""); }
  function beginCreate() {
    if (!canLeaveEditor()) return;
    detailRequest.current?.abort(); setDetailLoading(false); setEditing(null); setCreating(true); setDraft(emptyDraft()); closeAudit(); setError(""); setNotice(""); setWriteBlocked(false);
  }
  async function beginEdit(summary: AnnouncementSummary) {
    if (!canLeaveEditor()) return;
    detailRequest.current?.abort();
    const abort = new AbortController(); detailRequest.current = abort;
    setDetailLoading(true); setError("");
    try {
      const row = await getAnnouncement(summary.announcementId, abort.signal);
      if (abort.signal.aborted || !mounted.current) return;
      setEditing(row); setCreating(false); setDraft(draftFrom(row)); closeAudit(); setNotice(""); setWriteBlocked(false);
    } catch (reason) { if (!abort.signal.aborted && mounted.current) setError(errorText(reason)); }
    finally { if (!abort.signal.aborted && mounted.current) setDetailLoading(false); }
  }
  async function reloadEditor() {
    if (!editing || writeLock.current || (dirty && !window.confirm("重新载入将以服务端最新内容覆盖本地修改，是否继续？"))) return;
    detailRequest.current?.abort();
    const abort = new AbortController(); detailRequest.current = abort;
    setWriteBlocked(true); setError("");
    try {
      const row = await getAnnouncement(editing.announcementId, abort.signal);
      if (!abort.signal.aborted) { setEditing(row); setDraft(draftFrom(row)); setWriteBlocked(false); setNotice("已载入服务端最新版本，请核对后再操作。"); }
    } catch (reason) { if (!abort.signal.aborted) setError(errorText(reason)); }
  }
  function failedWrite(reason: unknown) {
    readRequest.current?.abort();
    setLoading(false);
    setError(errorText(reason) + " 请重新查询并核对操作结果；不会自动重试写入。");
    setWriteBlocked(true); setRows([]); setCount(null);
  }
  async function save() {
    if (writeLock.current || writeBlocked) return;
    let body: AnnouncementSave;
    try { body = announcementSave(draft, editing); } catch (reason) { setError(errorText(reason)); return; }
    if (editing?.status === "PUBLISHED" && !window.confirm(`修改已发布公告 #${editing.announcementId} · 版本 ${editing.version}\n${titleFor(editing)}\n保存将直接更新投放内容，并重置该公告的用户已读记录。\n确定保存当前修改？`)) return;
    writeLock.current = true; setSaving(true); setError(""); setNotice(""); closeAudit();
    try {
      const result = editing ? await updateAnnouncement(editing.announcementId, { ...body, version: editing.version }) : await createAnnouncement(body);
      if (!mounted.current) return;
      setEditing(result); setCreating(false); setDraft(draftFrom(result)); setWriteBlocked(false);
      await load(0);
      if (mounted.current) setNotice(result.status === "PUBLISHED" ? "已保存并更新投放内容，请核对当前版本。" : "草稿已保存。请核对预览和投放范围后发布。");
    } catch (reason) { if (mounted.current) failedWrite(reason); }
    finally { writeLock.current = false; if (mounted.current) setSaving(false); }
  }
  async function publish(row: Announcement | null) {
    if (writeLock.current || writeBlocked) return;
    try {
      if (!row) throw new Error("请先保存草稿，再发布已保存版本。");
      if (editing?.announcementId === row.announcementId && draftDiffersFrom(row, draft)) throw new Error("当前公告有未保存的更改，请先保存，再发布已保存版本。");
      requirePublishable(row);
    } catch (reason) { setError(errorText(reason)); return; }
    if (!row) return;
    const reason = window.prompt("发布原因（可选，最多 1000 字）", "");
    if (reason === null) return;
    if (reason.trim().length > 1000) { setError("发布原因最多 1000 字。"); return; }
    if (!window.confirm(`发布已保存公告 #${row.announcementId} · 版本 ${row.version}\n${titleFor(row)}\n展示位置：${row.placements.join(", ")}\n产品线：${row.productLines.join(", ")}\n客户端：${row.platforms.join(", ")}\n生效：${formatDate(row.startsAt)}\n结束：${formatDate(row.expiresAt)}\n仅发布该已保存版本，是否继续？`)) return;
    writeLock.current = true; setSaving(true); setError(""); setNotice(""); closeAudit();
    try {
      const result = await publishAnnouncement(row.announcementId, { version: row.version, reason: reason.trim() });
      if (!mounted.current) return;
      if ((!editing && !creating) || editing?.announcementId === row.announcementId) { setEditing(result); setCreating(false); setDraft(draftFrom(result)); }
      await load(0);
      if (mounted.current) setNotice("发布操作已提交，请核对列表中的生效状态和时间。");
    } catch (cause) { if (mounted.current) failedWrite(cause); }
    finally { writeLock.current = false; if (mounted.current) setSaving(false); }
  }
  async function withdraw(row: Announcement | AnnouncementSummary) {
    if (writeLock.current || writeBlocked) return;
    const reason = window.prompt("请输入撤回原因（1–1000 字）", "");
    if (reason === null) return;
    if (!reason.trim() || reason.trim().length > 1000) { setError("请填写 1–1000 字撤回原因。"); return; }
    if (!window.confirm(`撤回公告 #${row.announcementId} · 版本 ${row.version}\n${titleFor(row)}\n产品线：${row.productLines.join(", ")}\n客户端：${row.platforms.join(", ")}${editing?.announcementId === row.announcementId && dirty ? "\n当前未保存的修改会被放弃。" : ""}\n撤回后停止投放，是否继续？`)) return;
    writeLock.current = true; setSaving(true); setError(""); setNotice(""); closeAudit();
    try {
      const result = await withdrawAnnouncement(row.announcementId, { version: row.version, reason: reason.trim() });
      if (!mounted.current) return;
      if (editing?.announcementId === row.announcementId) { setEditing(result); setDraft(draftFrom(result)); }
      await load(offset);
      if (mounted.current) setNotice("公告已撤回；重新发布前需先保存为草稿。");
    } catch (cause) { if (mounted.current) failedWrite(cause); }
    finally { writeLock.current = false; if (mounted.current) setSaving(false); }
  }
  async function showAudit(row: Pick<Announcement, "announcementId">) {
    auditRequest.current?.abort();
    const abort = new AbortController(); auditRequest.current = abort;
    setAuditFor(row.announcementId); setAuditRows([]); setAuditError(""); setAuditLoading(true);
    try { const rows = await announcementAudit(row.announcementId, abort.signal); if (!abort.signal.aborted) setAuditRows(rows); }
    catch (reason) { if (!abort.signal.aborted) setAuditError(errorText(reason)); }
    finally { if (!abort.signal.aborted) setAuditLoading(false); }
  }

  function setTranslation(locale: string, key: "title" | "summary" | "body", value: string) {
    setDraft(current => ({
      ...current,
      translations: {
        ...current.translations,
        [locale]: { ...(current.translations[locale] ?? { locale, title: "", summary: "", body: "" }), [key]: value }
      }
    }));
  }

  function toggleTarget(key: "placements" | "productLines" | "platforms", value: string) {
    setDraft(current => {
      const values = current[key];
      const next = values.includes(value) ? values.filter(item => item !== value) : [...values, value];
      return { ...current, [key]: next.length ? next : values };
    });
  }

  return <div className="page announcement-admin-page">
    <div className="page-heading">
      <div><h2>公告中心</h2><p>管理多语言公告、投放范围、生效时间和发布审计。</p></div>
      <div className="button-row"><button onClick={() => void load(0)} disabled={loading || saving}><RefreshCw size={15} aria-hidden="true" />刷新</button><button className="primary" onClick={beginCreate} disabled={saving}><Plus size={15} aria-hidden="true" />新建公告</button></div>
    </div>
    {detailLoading && <p role="status">正在载入公告正文…</p>}
    {error && <div className="alert danger" role="alert">{error}</div>}
    {notice && <div className="alert" role="status">{notice}</div>}
    <fieldset className="announcement-workspace" disabled={saving}>
    <div className="filters">
      <label>状态<select value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">全部状态</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="WITHDRAWN">已撤回</option>
      </select></label>
      <label>搜索<input value={query} onChange={event => setQuery(event.target.value)} placeholder="标题、摘要或正文" /></label>
      <span className="status" role="status">{count === null ? (loading ? "正在查询…" : "公告总数不可用") : `共 ${count} 条`}</span>
    </div>
    <section className="panel">
      <div className="panel-title"><h3>公告列表</h3></div>
      <DataTable rows={rows.map(row => ({ ...row, title: titleFor(row), displayStatus: statusLabel(row.effectiveStatus), targets: `位置：${row.placements.join(", ")}\n产品线：${row.productLines.join(", ")}\n客户端：${row.platforms.join(", ")}` }))}
        columns={["announcementId", "title", "category", "displayStatus", "targets", "startsAt", "expiresAt"]}
        loading={loading} error={error && !rows.length ? error : ""} emptyText="当前条件下没有公告"
        label="公告列表" onRowClick={record => void beginEdit(record as unknown as AnnouncementSummary)} rowActionLabel="编辑公告" rowActionDisabled={saving || detailLoading}
        isSelected={row => row.announcementId === editing?.announcementId}
        actions={record => { const row = record as unknown as AnnouncementSummary; return <div className="row-actions">
          {row.status === "DRAFT" && <button onClick={() => void beginEdit(row)} disabled={writeBlocked || detailLoading}>预览与发布</button>}
          {row.status !== "WITHDRAWN" && <button onClick={() => void withdraw(row)} disabled={writeBlocked}>撤回</button>}
          <button onClick={() => void showAudit(row)}>审计</button>
        </div>; }} />
      <nav className="button-row announcement-admin-pagination" aria-label="公告分页">
        <button disabled={offset <= 0 || loading || count === null} onClick={() => void load(Math.max(0, offset - 25))}>上一页</button>
        <span>{count === null ? "—" : `${rows.length ? offset + 1 : 0}–${Math.min(offset + rows.length, count)} / ${count}`}</span>
        <button disabled={!hasMore || loading || count === null} onClick={() => void load(offset + 25)}>下一页</button>
      </nav>
    </section>

    {(editing || creating) && <section className="panel announcement-edit-panel" ref={editor} tabIndex={-1} aria-label="公告编辑">
      <div className="panel-title"><h3>{editing ? `编辑公告 #${editing.announcementId} · ${statusLabel(editing.effectiveStatus)}` : "新建公告"}</h3><button onClick={closeEditor}>关闭编辑</button></div>
      <div className="announcement-editor">
        <p className="muted">{editing ? `当前公告 #${editing.announcementId} · 已保存版本 ${editing.version}` : "新公告尚未保存"}{dirty ? " · 有未保存修改" : " · 与已保存内容一致"}</p>
        <p className="muted">支持 12 种语言，可按需添加翻译。发布前须完成所有已填写语言的内容；未提供的语言将明确展示可用译文。开始和结束时间均使用浏览器本地时区。</p>
        {writeBlocked && <div className="alert danger" role="alert">操作结果需要重新核对。{editing ? <button onClick={() => void reloadEditor()}>重新载入当前公告</button> : <span>请先刷新列表核对是否已创建，再决定后续操作。</span>}</div>}
        <div className="filters">
          <label>公告类型<select value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))}>
            <option value="GENERAL">普通公告</option><option value="PRODUCT">产品更新</option><option value="MAINTENANCE">维护通知</option><option value="SECURITY">安全通知</option><option value="RISK">风险提示</option>
          </select></label>
          <label>优先级（0–100）<input type="number" min="0" max="100" value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value }))} /></label>
          <label>开始时间<input type="datetime-local" value={draft.startsAt} onChange={event => setDraft(current => ({ ...current, startsAt: event.target.value }))} /></label>
          <label>结束时间（可选）<input type="datetime-local" value={draft.expiresAt} onChange={event => setDraft(current => ({ ...current, expiresAt: event.target.value }))} /></label>
        </div>
        <fieldset><legend>展示位置</legend>{PLACEMENTS.map(value => <Check key={value} value={value} checked={draft.placements.includes(value)} disabled={value === "CENTER"} onChange={() => toggleTarget("placements", value)} />)}</fieldset>
        <fieldset><legend>客户端</legend><Check value="ALL" checked={draft.platforms.includes("ALL")} onChange={() => setDraft(current => ({ ...current, platforms: ["ALL"] }))} />{!draft.platforms.includes("ALL") && PLATFORMS.map(value => <Check key={value} value={value} checked={draft.platforms.includes(value)} onChange={() => toggleTarget("platforms", value)} />)}{draft.platforms.includes("ALL") && <button onClick={() => setDraft(current => ({ ...current, platforms: PLATFORMS }))}>指定客户端</button>}</fieldset>
        <fieldset><legend>交易产品线</legend><Check value="ALL" checked={draft.productLines.includes("ALL")} onChange={() => setDraft(current => ({ ...current, productLines: ["ALL"] }))} />{!draft.productLines.includes("ALL") && LINES.map(value => <Check key={value} value={value} checked={draft.productLines.includes(value)} onChange={() => toggleTarget("productLines", value)} />)}{draft.productLines.includes("ALL") && <button onClick={() => setDraft(current => ({ ...current, productLines: LINES }))}>指定产品线</button>}</fieldset>
        <div className="article-language-controls">
          <label>编辑语言<select aria-label="编辑语言" value={editLocale} disabled={mediaBusy} onChange={event => setEditLocale(event.target.value)}>{CONTENT_LOCALES.map(locale => <option key={locale.code} value={locale.code}>{locale.label}{draft.translations[locale.code]?.title.trim() && draft.translations[locale.code]?.body.trim() ? " ✓" : ""}</option>)}</select></label>
          <span className="muted">已填写 {Object.values(draft.translations).filter(item => item.title.trim() && item.body.trim()).length} / 12 种语言</span>
          <button type="button" disabled={mediaBusy} onClick={() => {
            if (!window.confirm(`清空 ${localeLabel(editLocale)} 的内容？保存前可关闭编辑放弃本轮修改。`)) return;
            setDraft(current => ({ ...current, translations: { ...current.translations, [editLocale]: { locale: editLocale, title: "", summary: "", body: "", bodyHtml: null } } }));
            setEditLocale(current => current === "zh-CN" ? "en-US" : "zh-CN");
          }}>清空当前语言</button>
        </div>
        <section className="announcement-language" lang={editLocale} dir={editLocale.startsWith("ar") ? "rtl" : "auto"}>
          <h4>{localeLabel(editLocale)}</h4>
          <label>标题<input maxLength={160} value={draft.translations[editLocale]?.title ?? ""} onChange={event => setTranslation(editLocale, "title", event.target.value)} /></label>
          <label>摘要<input maxLength={500} value={draft.translations[editLocale]?.summary ?? ""} onChange={event => setTranslation(editLocale, "summary", event.target.value)} /></label>
          <RichArticleEditor key={`${editing?.announcementId ?? "new"}:${editing?.version ?? "0"}:${editLocale}`} locale={editLocale}
            text={draft.translations[editLocale]?.body ?? ""} html={draft.translations[editLocale]?.bodyHtml}
            disabled={saving || writeBlocked} onBusyChange={setMediaBusy}
            onChange={value => setDraft(current => ({ ...current, translations: { ...current.translations,
              [editLocale]: { ...(current.translations[editLocale] ?? { locale: editLocale, title: "", summary: "", body: "" }),
                ...value, body: value.body || (/<(?:img|audio|video)\b/.test(value.bodyHtml) ? "[media]" : "") }
            } }))} />
        </section>
        <section className="announcement-language announcement-user-preview"><h4>用户预览</h4>
          <label>预览语言<select value={previewLocale} onChange={event => setPreviewLocale(event.target.value)}>{CONTENT_LOCALES.map(locale => <option key={locale.code} value={locale.code}>{locale.label}</option>)}</select></label>
          <strong dir="auto">{draft.translations[previewLocale]?.title || "此语言尚未填写标题"}</strong><p dir="auto">{draft.translations[previewLocale]?.summary}</p>
          <ArticleView locale={previewLocale} html={draft.translations[previewLocale]?.bodyHtml} text={draft.translations[previewLocale]?.body || "此语言尚未填写正文"} />
        </section>
        <p className="muted">{!editing ? "请先保存草稿，再发布已保存版本。" : dirty ? "请先保存更改，再发布已保存版本。" : editing.status === "PUBLISHED" ? "保存会更新当前投放内容，并重置用户已读记录。" : editing.status === "WITHDRAWN" ? "已撤回公告需先保存为草稿，才能重新发布。" : "发布前请核对已填写语言的预览、投放范围与生效时间。"}</p>
        <div className="button-row"><button className="primary" disabled={saving || mediaBusy || writeBlocked} onClick={() => void save()}>{saving ? "保存中…" : editing?.status === "PUBLISHED" ? "保存已发布内容" : editing?.status === "WITHDRAWN" ? "保存为草稿" : "保存草稿"}</button><button disabled={saving || mediaBusy || writeBlocked || !editing || Boolean(dirty) || editing.status !== "DRAFT"} onClick={() => void publish(editing)}>{saving ? "处理中…" : "发布 / 定时发布"}</button>{editing && <button onClick={() => void showAudit(editing)}>查看审计</button>}</div>
      </div>
    </section>}

    {auditFor !== null && <section className="panel" ref={auditPanel} tabIndex={-1} aria-label={`公告 ${auditFor} 审计`}><div className="panel-title"><h3>公告 #{auditFor} 操作审计</h3><button onClick={closeAudit}>关闭审计</button></div>
      <DataTable rows={auditRows} columns={["createdAt", "action", "adminUserId", "adminUsername", "reason"]} loading={auditLoading} error={auditError} emptyText="当前公告没有审计记录"
        actions={row => <details className="announcement-audit-snapshot"><summary>查看变更快照</summary><pre>{prettySnapshot(String(row.snapshot))}</pre></details>} />
      {auditError && <button onClick={() => { const row = rows.find(item => item.announcementId === auditFor) ?? editing; if (row?.announcementId === auditFor) void showAudit(row); }}>重试审计查询</button>}
    </section>}
    </fieldset>
  </div>;
}

function Check({ value, checked, disabled = false, onChange }: { value: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return <label className="announcement-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />{value}</label>;
}

function draftFrom(row: Announcement): Draft {
  const translations = Object.fromEntries(LOCALES.map(locale => {
    const existing = row.translations.find(item => item.locale === locale);
    return [locale, existing ?? { locale, title: "", summary: "", body: "" }];
  }));
  for (const translation of row.translations) translations[translation.locale] = translation;
  return {
    category: row.category,
    priority: String(row.priority),
    placements: row.placements.includes("ALL") ? ["CENTER", "MODAL", "BANNER"] : [...new Set(["CENTER", ...row.placements])],
    productLines: row.productLines,
    platforms: row.platforms,
    startsAt: localDateTimeValue(row.startsAt),
    expiresAt: row.expiresAt ? localDateTimeValue(row.expiresAt) : "",
    translations
  };
}

function draftDiffersFrom(row: Announcement, draft: Draft) {
  const translationsDiffer = row.translations.length !== Object.values(draft.translations).filter(item =>
    item.title.trim() || item.summary.trim() || item.body.trim()
  ).length || row.translations.some(item => {
    const next = draft.translations[item.locale];
    return !next || item.title !== next.title || item.summary !== next.summary || item.body !== next.body || (item.bodyHtml ?? null) !== (next.bodyHtml ?? null);
  });
  return translationsDiffer || row.category !== draft.category || row.priority !== Number(draft.priority)
    || [...row.placements].sort().join(",") !== [...draft.placements].sort().join(",")
    || [...row.productLines].sort().join(",") !== [...draft.productLines].sort().join(",")
    || [...row.platforms].sort().join(",") !== [...draft.platforms].sort().join(",")
    || localDateTimeValue(row.startsAt) !== draft.startsAt
    || (row.expiresAt ? localDateTimeValue(row.expiresAt) : "") !== draft.expiresAt;
}

function titleFor(row: { translations: readonly { locale: string; title: string }[] }) {
  return row.translations.find(item => item.locale === "zh-CN")?.title ?? row.translations[0]?.title ?? "（无标题）";
}

function statusLabel(value: string) {
  return ({ DRAFT: "草稿", PUBLISHED: "已发布", SCHEDULED: "定时发布", EXPIRED: "已过期", WITHDRAWN: "已撤回" } as Record<string, string>)[value] ?? value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

function prettySnapshot(value: string) {
  try { return JSON.stringify(parseApiJson(value), null, 2); } catch { return value; }
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
