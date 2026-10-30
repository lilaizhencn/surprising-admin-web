import { adminLocalWrite } from "./admin";
import { loadSession, queryString, request } from "./client";
import { positiveInt64, serializeAdminBody } from "../lib/integers";
import { CONTENT_LOCALES } from "../lib/contentLocales";

export const LEGAL_TYPES = [
  ["USER_AGREEMENT", "用户协议"], ["PRIVACY_POLICY", "隐私政策"], ["COOKIE_POLICY", "Cookie 政策"],
  ["TRADING_RISK", "交易风险披露"], ["DERIVATIVES_RISK", "衍生品风险披露"],
  ["FUNDS_AND_WITHDRAWALS", "资金与提币规则"], ["FEES", "费用说明"],
  ["AML_KYC", "身份认证与合规"], ["COMPLAINTS", "投诉与争议处理"], ["SECURITY_NOTICE", "安全声明"],
] as const;
export type LegalType = typeof LEGAL_TYPES[number][0];
export type LegalTranslation = { locale: string; title: string; bodyHtml: string };
export type LegalSave = { type: LegalType; revisionLabel: string; translations: LegalTranslation[] };
export type LegalRow = {
  revisionId: string; type: LegalType; revisionLabel: string; status: "DRAFT" | "PUBLISHED" | "SUPERSEDED" | "WITHDRAWN";
  version: string; createdAt: string; updatedAt: string; publishedAt: string | null;
};
export type LegalRevision = LegalRow & { translations: LegalTranslation[] };
export type LegalAudit = { auditId: string; revisionId: string; action: string; adminUserId: string; reason: string | null; snapshot: string; createdAt: string };
type Page = { revisions: LegalRow[]; offset: number; limit: number; hasMore: boolean };
const base = "/api/v1/admin/legal/revisions";
const owner = () => String(loadSession()?.user.userId ?? "");
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function date(value: unknown): value is string { return typeof value === "string" && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)); }
export function parseLegalRow(value: unknown): LegalRow {
  if (!object(value) || !LEGAL_TYPES.some(([type]) => type === value.type) || typeof value.revisionLabel !== "string"
    || !/^[A-Za-z0-9._-]{1,40}$/.test(value.revisionLabel) || !["DRAFT", "PUBLISHED", "SUPERSEDED", "WITHDRAWN"].includes(String(value.status))
    || !date(value.createdAt) || !date(value.updatedAt) || !(value.publishedAt === null || date(value.publishedAt))) throw new Error("协议版本响应不完整，请重新查询。");
  return { ...value, revisionId: positiveInt64(value.revisionId, "协议版本 ID"), version: positiveInt64(value.version, "协议版本") } as LegalRow;
}
export function parseLegalRevision(value: unknown): LegalRevision {
  const row = parseLegalRow(value);
  const translations = (value as Record<string, unknown>).translations;
  if (!Array.isArray(translations) || translations.length < 1 || translations.length > CONTENT_LOCALES.length
    || !translations.every(item => object(item) && CONTENT_LOCALES.some(locale => locale.code === item.locale)
      && typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 160
      && typeof item.bodyHtml === "string" && item.bodyHtml.trim().length > 0 && item.bodyHtml.length <= 64000)
    || new Set(translations.map(item => item.locale)).size !== translations.length) throw new Error("协议译文响应不完整，请重新载入。");
  return { ...row, translations };
}
export async function listLegal(offset: number, signal?: AbortSignal): Promise<Page> {
  const value = await request<unknown>(base + queryString({ offset, limit: 25 }), { signal, expectedUserId: owner() });
  if (!object(value) || !Array.isArray(value.revisions) || value.offset !== offset || value.limit !== 25
    || value.revisions.length > 25 || typeof value.hasMore !== "boolean") throw new Error("协议分页响应不完整。");
  const revisions = value.revisions.map(parseLegalRow);
  if (new Set(revisions.map(row => row.revisionId)).size !== revisions.length) throw new Error("协议列表包含重复编号。");
  return { revisions, offset, limit: 25, hasMore: value.hasMore };
}
export async function getLegal(id: string, signal?: AbortSignal) {
  const value = parseLegalRevision(await request<unknown>(base + "/" + positiveInt64(id, "协议版本 ID"), { signal, expectedUserId: owner() }));
  if (value.revisionId !== id) throw new Error("协议版本编号不匹配。");
  return value;
}
export async function saveLegal(body: LegalSave, revision?: LegalRevision | null) {
  const value = parseLegalRevision(await request<unknown>(base + (revision ? "/" + positiveInt64(revision.revisionId, "协议版本 ID") : ""), {
    method: revision ? "PUT" : "POST", body: serializeAdminBody({ ...body, ...(revision ? { version: revision.version } : {}) }), expectedUserId: owner(),
  }));
  if (revision && value.revisionId !== revision.revisionId) throw new Error("保存返回的协议编号不匹配，请重新查询。");
  return value;
}
export async function changeLegal(revision: LegalRevision, action: "publish" | "withdraw", reason: string) {
  const value = parseLegalRevision(await adminLocalWrite<unknown>("POST", `${base}/${positiveInt64(revision.revisionId, "协议版本 ID")}/${action}`, { version: revision.version, reason }));
  if (value.revisionId !== revision.revisionId) throw new Error("操作返回的协议编号不匹配，请重新查询。");
  return value;
}
export async function legalAudit(id: string, signal?: AbortSignal): Promise<LegalAudit[]> {
  const value = await request<unknown>(`${base}/${positiveInt64(id, "协议版本 ID")}/audit`, { signal, expectedUserId: owner() });
  if (!Array.isArray(value)) throw new Error("协议审计响应不完整。");
  return value.map(item => {
    if (!object(item) || String(item.revisionId) !== id || !date(item.createdAt) || typeof item.action !== "string"
      || typeof item.snapshot !== "string" || !(item.reason === null || typeof item.reason === "string")) throw new Error("协议审计内容或编号不匹配。");
    return { ...item, revisionId: id, auditId: positiveInt64(item.auditId, "审计 ID"), adminUserId: positiveInt64(item.adminUserId, "管理员 ID") } as LegalAudit;
  });
}
