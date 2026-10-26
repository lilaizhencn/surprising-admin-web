import { adminLocalWrite } from "./admin";
import { loadSession, queryString, request } from "./client";
import { positiveInt64, serializeAdminBody } from "../lib/integers";
import type { UnknownRecord } from "../types";

export type AnnouncementTranslation = { locale: string; title: string; summary: string; body: string };
export type Announcement = {
  announcementId: string; version: string; category: string; status: string; effectiveStatus: string;
  priority: number; placements: string[]; productLines: string[]; platforms: string[];
  startsAt: string; expiresAt: string | null; translations: AnnouncementTranslation[];
  createdAt: string; updatedAt: string;
};
export type AnnouncementSave = {
  category: string; priority: number; placements: string[]; productLines: string[]; platforms: string[];
  startsAt: string; expiresAt: string | null; translations: AnnouncementTranslation[];
};
export type AnnouncementPage = { count: number; announcements: Announcement[]; offset: number; limit: number; hasMore: boolean };
export type AnnouncementAudit = { auditId: string; announcementId: string; action: string; adminUserId: string; adminUsername: string; reason: string | null; snapshot: string; createdAt: string };
function object(value: unknown): value is UnknownRecord { return value !== null && typeof value === "object" && !Array.isArray(value); }
function date(value: unknown): value is string { return typeof value === "string" && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)); }
function targets(value: unknown, allowed: string[]): value is string[] {
  return Array.isArray(value) && value.length > 0 && new Set(value).size === value.length
    && value.every(item => typeof item === "string" && (item === "ALL" || allowed.includes(item)))
    && (!value.includes("ALL") || value.length === 1);
}
export function parseAnnouncement(value: unknown): Announcement {
  const fail = () => { throw new Error("公告响应不完整，请重新加载后核对。"); };
  if (!object(value)) return fail();
  if (!["GENERAL", "PRODUCT", "MAINTENANCE", "SECURITY", "RISK"].includes(String(value.category))
    || !Number.isInteger(value.priority) || Number(value.priority) < 0 || Number(value.priority) > 100
    || !date(value.startsAt) || !date(value.createdAt) || !date(value.updatedAt)
    || !(value.expiresAt === null || date(value.expiresAt))
    || !targets(value.placements, ["CENTER", "MODAL", "BANNER"])
    || !targets(value.productLines, ["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"])
    || !targets(value.platforms, ["WEB", "IOS", "ANDROID"])
    || !Array.isArray(value.translations) || value.translations.length < 1 || value.translations.length > 12
    || !value.translations.every(item => object(item) && typeof item.locale === "string" && typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 160
      && typeof item.summary === "string" && item.summary.length <= 500 && typeof item.body === "string" && item.body.trim().length > 0 && item.body.length <= 12000)
    || new Set(value.translations.map(item => (item as UnknownRecord).locale)).size !== value.translations.length) return fail();
  const status = String(value.status), effective = String(value.effectiveStatus);
  if (!(status === "PUBLISHED" ? ["PUBLISHED", "SCHEDULED", "EXPIRED"].includes(effective) : ["DRAFT", "WITHDRAWN"].includes(status) && effective === status)) return fail();
  return { ...value, announcementId: positiveInt64(value.announcementId, "公告 ID"), version: positiveInt64(value.version, "公告版本") } as Announcement;
}
export function parseAnnouncementPage(value: unknown): AnnouncementPage {
  if (!object(value) || !Array.isArray(value.announcements) || ![value.count, value.offset, value.limit].every(item => Number.isSafeInteger(item) && Number(item) >= 0)
    || Number(value.limit) < 1 || Number(value.limit) > 100 || typeof value.hasMore !== "boolean"
    || value.announcements.length > Number(value.limit)
    || value.hasMore !== (Number(value.offset) + value.announcements.length < Number(value.count)))
    throw new Error("公告分页响应不完整，请重新查询。");
  const announcements = value.announcements.map(parseAnnouncement);
  if (new Set(announcements.map(row => row.announcementId)).size !== announcements.length) throw new Error("公告列表包含重复编号，请重新查询。");
  return { ...value, announcements } as AnnouncementPage;
}
const base = "/api/v1/admin/announcements";
export async function listAnnouncements(params: { status?: string; query?: string; offset?: number; limit?: number }, signal?: AbortSignal) {
  return parseAnnouncementPage(await request<unknown>(base + queryString(params), { signal, expectedUserId: String(loadSession()?.user.userId ?? "") }));
}
export async function getAnnouncement(id: string, signal?: AbortSignal) {
  const row = parseAnnouncement(await request<unknown>(base + "/" + positiveInt64(id, "公告 ID"), { signal, expectedUserId: String(loadSession()?.user.userId ?? "") }));
  if (row.announcementId !== id) throw new Error("公告响应编号不匹配，本次内容未载入。");
  return row;
}
export async function createAnnouncement(body: AnnouncementSave) {
  return parseAnnouncement(await request<unknown>(base, { method: "POST", body: serializeAdminBody(body), expectedUserId: String(loadSession()?.user.userId ?? "") }));
}
export async function updateAnnouncement(id: string, body: AnnouncementSave & { version: string }) {
  const row = parseAnnouncement(await request<unknown>(base + "/" + positiveInt64(id, "公告 ID"), { method: "PUT", body: serializeAdminBody(body), expectedUserId: String(loadSession()?.user.userId ?? "") }));
  if (row.announcementId !== id) throw new Error("公告响应编号不匹配，请重新核对保存结果。");
  return row;
}
export async function publishAnnouncement(id: string, body: { version: string; reason?: string }) {
  const row = parseAnnouncement(await adminLocalWrite<unknown>("POST", base + "/" + positiveInt64(id, "公告 ID") + "/publish", body));
  if (row.announcementId !== id) throw new Error("公告响应编号不匹配，请重新核对发布结果。");
  return row;
}
export async function withdrawAnnouncement(id: string, body: { version: string; reason: string }) {
  const row = parseAnnouncement(await adminLocalWrite<unknown>("POST", base + "/" + positiveInt64(id, "公告 ID") + "/withdraw", body));
  if (row.announcementId !== id) throw new Error("公告响应编号不匹配，请重新核对撤回结果。");
  return row;
}
export async function announcementAudit(id: string, signal?: AbortSignal): Promise<AnnouncementAudit[]> {
  const data = await request<unknown>(base + "/" + positiveInt64(id, "公告 ID") + "/audit", { signal, expectedUserId: String(loadSession()?.user.userId ?? "") });
  if (!Array.isArray(data)) throw new Error("公告审计响应不完整，请重新加载。");
  const rows = data.map(value => {
    if (!object(value) || String(value.announcementId) !== id || !date(value.createdAt)
      || typeof value.action !== "string" || typeof value.adminUsername !== "string" || typeof value.snapshot !== "string"
      || !(value.reason === null || typeof value.reason === "string")) throw new Error("公告审计编号或内容不匹配。");
    return { ...value, announcementId: id, auditId: positiveInt64(value.auditId, "审计 ID"), adminUserId: positiveInt64(value.adminUserId, "管理员 ID") } as AnnouncementAudit;
  });
  if (new Set(rows.map(row => row.auditId)).size !== rows.length) throw new Error("公告审计包含重复记录。");
  return rows;
}
