import type { Announcement, AnnouncementSave, AnnouncementTranslation } from "../api/announcements";
export type AnnouncementDraft = {
  category: string; priority: string; placements: string[]; productLines: string[]; platforms: string[];
  startsAt: string; expiresAt: string; translations: Record<string, AnnouncementTranslation>;
};
export function localDateTimeValue(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function announcementSave(draft: AnnouncementDraft, original?: Announcement | null): AnnouncementSave {
  if (!/^\d{1,3}$/.test(draft.priority) || Number(draft.priority) > 100) throw new Error("优先级必须为 0–100 的整数。");
  if (!draft.startsAt || !Number.isFinite(Date.parse(draft.startsAt))) throw new Error("请选择有效的公告生效时间。");
  if (draft.expiresAt && !Number.isFinite(Date.parse(draft.expiresAt))) throw new Error("请选择有效的公告结束时间。");
  const startsAt = original && localDateTimeValue(original.startsAt) === draft.startsAt ? original.startsAt : new Date(draft.startsAt).toISOString();
  const expiresAt = original?.expiresAt && localDateTimeValue(original.expiresAt) === draft.expiresAt ? original.expiresAt : draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null;
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) throw new Error("结束时间必须晚于开始时间。");
  const translations = Object.values(draft.translations).filter(item => item.title.trim() || item.summary.trim() || item.body.trim()).map(item => {
    if (!item.title.trim() || item.title.trim().length > 160 || !item.body.trim() || item.body.trim().length > 12000 || item.summary.trim().length > 500)
      throw new Error(item.locale + " 请填写标题（1–160 字）、正文（1–12000 字），摘要最多 500 字。");
    return { locale: item.locale, title: item.title.trim(), summary: item.summary.trim(), body: item.body.trim() };
  });
  if (!translations.length) throw new Error("请至少填写一种语言的标题和正文。");
  if (!draft.placements.length || !draft.productLines.length || !draft.platforms.length) throw new Error("请完整选择展示位置、产品线与客户端。");
  return { category: draft.category, priority: Number(draft.priority), placements: draft.placements, productLines: draft.productLines, platforms: draft.platforms, startsAt, expiresAt, translations };
}
export function requirePublishable(row: Announcement) {
  if (row.status !== "DRAFT") throw new Error("请先保存为草稿，再发布已保存版本。");
  for (const locale of ["zh-CN", "en-US"]) if (!row.translations.some(item => item.locale === locale && item.title.trim() && item.body.trim()))
    throw new Error("发布前请完成简体中文和 English 的标题与正文，并保存更改。");
  if (!row.placements.includes("CENTER")) throw new Error("发布公告必须包含公告中心展示位置。");
}
