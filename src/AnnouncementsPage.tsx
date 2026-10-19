import { useEffect, useState } from "react";
import {
  announcementAudit,
  createAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
  withdrawAnnouncement,
  type Announcement,
  type AnnouncementSave,
  type AnnouncementTranslation
} from "./api/announcements";

const LINES = ["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"];
const PLATFORMS = ["WEB", "IOS", "ANDROID"];
const PLACEMENTS = ["CENTER", "MODAL", "BANNER"];
const LOCALES = ["zh-CN", "en-US"];

type Draft = {
  category: string;
  priority: string;
  placements: string[];
  productLines: string[];
  platforms: string[];
  startsAt: string;
  expiresAt: string;
  translations: Record<string, AnnouncementTranslation>;
};

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
  const [rows, setRows] = useState<Announcement[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [auditRows, setAuditRows] = useState<Awaited<ReturnType<typeof announcementAudit>>>([]);
  const [auditFor, setAuditFor] = useState<number | null>(null);

  async function load(nextOffset = offset) {
    setLoading(true);
    setError("");
    try {
      const page = await listAnnouncements({ status, query, offset: nextOffset, limit: 25 });
      setRows(page.announcements);
      setCount(page.count);
      setOffset(page.offset);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(0); }, [status, query]);

  function beginCreate() {
    setEditing(null);
    setCreating(true);
    setDraft(emptyDraft());
    setAuditFor(null);
    setError("");
  }

  function beginEdit(row: Announcement) {
    setEditing(row);
    setCreating(false);
    setDraft(draftFrom(row));
    setAuditFor(null);
    setError("");
  }

  function payload(): AnnouncementSave {
    if (!draft.startsAt) throw new Error("请选择公告生效时间。");
    const translations = Object.values(draft.translations).filter(item =>
      item.title.trim() || item.summary.trim() || item.body.trim()
    );
    return {
      category: draft.category,
      priority: Number(draft.priority),
      placements: draft.placements,
      productLines: draft.productLines,
      platforms: draft.platforms,
      startsAt: new Date(draft.startsAt).toISOString(),
      expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
      translations
    };
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = payload();
      const result = editing
        ? await updateAnnouncement(editing.announcementId, { ...body, version: editing.version })
        : await createAnnouncement(body);
      setEditing(result);
      setCreating(false);
      setDraft(draftFrom(result));
      await load(0);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSaving(false);
    }
  }

  async function publish(row: Announcement | null) {
    setSaving(true);
    setError("");
    try {
      let target = row;
      if (!target) {
        const body = payload();
        target = await createAnnouncement(body);
        setEditing(target);
        setCreating(false);
      } else if (editing?.announcementId === target.announcementId && draftDiffersFrom(target, draft)) {
        target = await updateAnnouncement(target.announcementId, { ...payload(), version: target.version });
        setEditing(target);
        setDraft(draftFrom(target));
      }
      const reason = window.prompt("发布原因（可选）", "");
      if (reason === null) return;
      const result = await publishAnnouncement(target.announcementId, { version: target.version, reason: reason.trim() });
      setEditing(result);
      setDraft(draftFrom(result));
      await load(0);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(row: Announcement) {
    const reason = window.prompt("请输入撤回原因", "");
    if (!reason?.trim()) return;
    setSaving(true);
    setError("");
    try {
      const result = await withdrawAnnouncement(row.announcementId, { version: row.version, reason: reason.trim() });
      if (editing?.announcementId === row.announcementId) {
        setEditing(result);
        setDraft(draftFrom(result));
      }
      await load(offset);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  async function showAudit(row: Announcement) {
    setError("");
    try {
      setAuditRows(await announcementAudit(row.announcementId));
      setAuditFor(row.announcementId);
    } catch (reason) {
      setError(errorText(reason));
    }
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

  return <div className="page">
    <div className="page-heading">
      <div><h2>公告中心</h2><p>管理多语言公告、投放范围、生效时间和发布审计。</p></div>
      <div className="button-row"><button onClick={() => void load(0)} disabled={loading}>刷新</button><button className="primary" onClick={beginCreate}>新建公告</button></div>
    </div>
    {error && <div className="status danger" role="alert">{error}</div>}
    <div className="filters">
      <label>状态<select value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">全部状态</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="WITHDRAWN">已撤回</option>
      </select></label>
      <label>搜索<input value={query} onChange={event => setQuery(event.target.value)} placeholder="标题、摘要或正文" /></label>
      <span className="status">共 {count} 条</span>
    </div>
    <section className="panel">
      <div className="panel-title"><h3>公告列表</h3></div>
      <div className="table-wrap"><table><thead><tr><th>ID / 标题</th><th>类型</th><th>状态</th><th>投放范围</th><th>生效时间</th><th>操作</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.announcementId}>
          <td><strong>#{row.announcementId}</strong><br />{titleFor(row)}</td>
          <td>{row.category} · {row.priority}</td>
          <td><span className={`status ${row.effectiveStatus === "PUBLISHED" ? "ok" : row.effectiveStatus === "WITHDRAWN" ? "danger" : "warn"}`}>{statusLabel(row.effectiveStatus)}</span></td>
          <td>{row.placements.join(", ")}<br />{row.productLines.join(", ")}<br />{row.platforms.join(", ")}</td>
          <td>{formatDate(row.startsAt)}{row.expiresAt ? <><br />至 {formatDate(row.expiresAt)}</> : null}</td>
          <td><div className="button-row compact-row"><button onClick={() => beginEdit(row)}>编辑</button><button onClick={() => void publish(row)} disabled={saving || row.status === "WITHDRAWN"}>发布</button>{row.status !== "WITHDRAWN" && <button onClick={() => void withdraw(row)} disabled={saving}>撤回</button>}<button onClick={() => void showAudit(row)}>审计</button></div></td>
        </tr>)}{!rows.length && <tr><td colSpan={6}>{loading ? "加载中…" : "暂无公告"}</td></tr>}</tbody>
      </table></div>
      <div className="button-row" style={{ justifyContent: "flex-end", margin: 12 }}>
        <button disabled={offset <= 0 || loading} onClick={() => void load(Math.max(0, offset - 25))}>上一页</button>
        <span>{count === 0 ? 0 : offset + 1}–{Math.min(offset + rows.length, count)} / {count}</span>
        <button disabled={offset + rows.length >= count || loading} onClick={() => void load(offset + 25)}>下一页</button>
      </div>
    </section>

    {(editing || creating) && <section className="panel">
      <div className="panel-title"><h3>{editing ? `编辑公告 #${editing.announcementId} · ${statusLabel(editing.effectiveStatus)}` : "新建公告"}</h3><button onClick={() => { setEditing(null); setCreating(false); setError(""); }}>关闭</button></div>
      <div className="announcement-editor">
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
        {LOCALES.map(locale => <section className="announcement-language" key={locale}>
          <h4>{locale === "zh-CN" ? "简体中文（必填）" : "English (required)"}</h4>
          <label>标题<input maxLength={160} value={draft.translations[locale]?.title ?? ""} onChange={event => setTranslation(locale, "title", event.target.value)} /></label>
          <label>摘要<input maxLength={500} value={draft.translations[locale]?.summary ?? ""} onChange={event => setTranslation(locale, "summary", event.target.value)} /></label>
          <label>正文<textarea rows={7} maxLength={12000} value={draft.translations[locale]?.body ?? ""} onChange={event => setTranslation(locale, "body", event.target.value)} /></label>
        </section>)}
        <section className="announcement-language"><h4>用户预览 · 简体中文</h4><strong>{draft.translations["zh-CN"]?.title || "公告标题"}</strong><p>{draft.translations["zh-CN"]?.summary}</p><div className="announcement-preview-body">{draft.translations["zh-CN"]?.body || "公告正文预览"}</div></section>
        <div className="button-row"><button className="primary" disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存草稿"}</button><button disabled={saving} onClick={() => void publish(editing)}>{saving ? "处理中…" : "发布 / 定时发布"}</button>{editing && <button onClick={() => void showAudit(editing)}>查看审计</button>}</div>
      </div>
    </section>}

    {auditFor !== null && <section className="panel"><div className="panel-title"><h3>公告 #{auditFor} 操作审计</h3><button onClick={() => setAuditFor(null)}>关闭</button></div>
      <div className="table-wrap"><table><thead><tr><th>时间</th><th>操作</th><th>管理员</th><th>原因</th><th>变更快照</th></tr></thead><tbody>
        {auditRows.map(item => <tr key={item.auditId}><td>{formatDate(item.createdAt)}</td><td>{item.action}</td><td>{item.adminUsername} ({item.adminUserId})</td><td>{item.reason || "—"}</td><td><details><summary>查看</summary><pre>{prettySnapshot(item.snapshot)}</pre></details></td></tr>)}
        {!auditRows.length && <tr><td colSpan={5}>暂无审计记录</td></tr>}
      </tbody></table></div>
    </section>}
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
    placements: [...new Set(["CENTER", ...row.placements])],
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
    return !next || item.title !== next.title || item.summary !== next.summary || item.body !== next.body;
  });
  return translationsDiffer || row.category !== draft.category || row.priority !== Number(draft.priority)
    || row.placements.join(",") !== draft.placements.join(",")
    || row.productLines.join(",") !== draft.productLines.join(",")
    || row.platforms.join(",") !== draft.platforms.join(",")
    || localDateTimeValue(row.startsAt) !== draft.startsAt
    || (row.expiresAt ? localDateTimeValue(row.expiresAt) : "") !== draft.expiresAt;
}

function titleFor(row: Announcement) {
  return row.translations.find(item => item.locale === "zh-CN")?.title ?? row.translations[0]?.title ?? "（无标题）";
}

function statusLabel(value: string) {
  return ({ DRAFT: "草稿", PUBLISHED: "已发布", SCHEDULED: "定时发布", EXPIRED: "已过期", WITHDRAWN: "已撤回" } as Record<string, string>)[value] ?? value;
}

function localDateTimeValue(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

function prettySnapshot(value: string) {
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
