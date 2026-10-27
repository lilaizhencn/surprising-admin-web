import { ApiError } from "../api/client";
import { positiveInt64, int64String } from "./integers";
import type { UnknownRecord } from "../types";

export const SUPPORT_STATUSES = {
  OPEN: "待处理",
  PENDING_USER: "等待用户",
  PENDING_INTERNAL: "内部处理中",
  RESOLVED: "已解决",
  CLOSED: "已关闭",
} as const;
export const SUPPORT_PRIORITIES = { LOW: "低", MEDIUM: "普通", HIGH: "高", URGENT: "紧急" } as const;
export type SupportStatus = keyof typeof SUPPORT_STATUSES;
export type SupportTicket = UnknownRecord & {
  ticketId: string;
  userId: string;
  status: SupportStatus;
  priority: keyof typeof SUPPORT_PRIORITIES;
  category: string;
  title: string;
  assignedAdminUserId: string | null;
  createdByUserId: string;
  resolvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};
export type SupportNote = UnknownRecord & {
  noteId: string;
  ticketId: string;
  adminUserId: string;
  noteType: string;
  visibility: string;
  body: string;
  createdAt: string;
};
export type SupportPage<T> = {
  items: T[];
  nextCursor: string;
  hasMore: boolean;
  sort: string;
  limit: number;
};
export type SupportFilters = { status: string; limit: number; sort: string; cursor: string };

function object(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("客服响应不完整，请重新查询。");
  return value as UnknownRecord;
}
function text(value: unknown, max = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("客服响应字段无效，请重新查询。");
  return value;
}
function date(value: unknown): string {
  const valueText = text(value, 64);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(valueText) || !Number.isFinite(Date.parse(valueText)))
    throw new Error("客服响应时间无效，请重新查询。");
  return valueText;
}
function optionalId(value: unknown, label: string): string | null {
  return value == null ? null : positiveInt64(value, label);
}
function count(value: unknown): number {
  const result = Number(int64String(value, "客服计数", 0n));
  if (!Number.isSafeInteger(result)) throw new Error("客服计数超出安全范围。");
  return result;
}
export function supportOverview(value: unknown, userId: string) {
  const data = object(value),
    user = object(data.user),
    compliance = object(data.compliance);
  if (positiveInt64(user.userId, "用户 ID") !== userId)
    throw new Error("客服摘要与当前用户不匹配，请重新查询。");
  for (const key of ["username", "email"])
    if (user[key] !== null && typeof user[key] !== "string") throw new Error("客服用户信息不完整。");
  for (const key of ["kycStatus", "kycLevel"]) text(compliance[key], 64);
  if (compliance.country !== null && typeof compliance.country !== "string")
    throw new Error("合规摘要不完整。");
  if (compliance.kycExpiresAt !== null) date(compliance.kycExpiresAt);
  return {
    generatedAt: date(data.generatedAt),
    user: {
      userId,
      username: user.username as string | null,
      email: user.email as string | null,
      status: text(user.status, 64),
      createdAt: date(user.createdAt),
    },
    compliance: {
      kycStatus: text(compliance.kycStatus, 64),
      kycLevel: text(compliance.kycLevel, 64),
      country: compliance.country as string | null,
      kycExpiresAt: compliance.kycExpiresAt as string | null,
      activeRiskTags: count(compliance.activeRiskTags),
      criticalRiskTags: count(compliance.criticalRiskTags),
      openAmlCases: count(compliance.openAmlCases),
      maxAmlRiskScore: count(compliance.maxAmlRiskScore),
    },
  };
}
export function supportTicket(value: unknown, userId: string, ticketId?: string): SupportTicket {
  const row = object(value),
    id = positiveInt64(row.ticketId, "工单 ID");
  if (positiveInt64(row.userId, "用户 ID") !== userId || (ticketId !== undefined && id !== ticketId))
    throw new Error("工单响应与当前用户或工单不匹配，请重新查询。");
  if (
    !Object.hasOwn(SUPPORT_STATUSES, String(row.status)) ||
    !Object.hasOwn(SUPPORT_PRIORITIES, String(row.priority))
  )
    throw new Error("工单状态或优先级无法识别，请重新查询。");
  return {
    ...row,
    ticketId: id,
    userId,
    status: row.status as SupportStatus,
    priority: row.priority as SupportTicket["priority"],
    category: text(row.category, 64),
    title: text(row.title, 160),
    assignedAdminUserId: optionalId(row.assignedAdminUserId, "受理人 ID"),
    createdByUserId: positiveInt64(row.createdByUserId, "创建人 ID"),
    resolvedByUserId: optionalId(row.resolvedByUserId, "解决人 ID"),
    createdAt: date(row.createdAt),
    updatedAt: date(row.updatedAt),
    closedAt: row.closedAt === null ? null : date(row.closedAt),
  };
}
export function supportNote(value: unknown, ticketId: string, adminUserId?: string): SupportNote {
  const row = object(value),
    operator = positiveInt64(row.adminUserId, "备注人 ID");
  if (
    positiveInt64(row.ticketId, "工单 ID") !== ticketId ||
    (adminUserId !== undefined && operator !== adminUserId)
  )
    throw new Error("备注响应与当前工单或操作人不匹配，请重新查询。");
  if (
    !["NOTE", "STATUS_CHANGE", "ESCALATION", "FOLLOW_UP"].includes(String(row.noteType)) ||
    !["INTERNAL", "CUSTOMER"].includes(String(row.visibility))
  )
    throw new Error("备注类型无法识别，请重新查询。");
  return {
    ...row,
    noteId: positiveInt64(row.noteId, "备注 ID"),
    ticketId,
    adminUserId: operator,
    noteType: String(row.noteType),
    visibility: String(row.visibility),
    body: text(row.body),
    createdAt: date(row.createdAt),
  };
}
function page<T>(
  value: unknown,
  key: "tickets" | "notes",
  expected: { limit: number; sort: string; cursor: string },
  parse: (row: unknown) => T,
  id: (row: T) => string,
): SupportPage<T> {
  const data = object(value),
    rows = data[key];
  if (
    !Array.isArray(rows) ||
    data[key === "tickets" ? "ticketCount" : "noteCount"] === undefined ||
    rows.length > expected.limit ||
    count(data[key === "tickets" ? "ticketCount" : "noteCount"]) !== rows.length ||
    data.limit !== expected.limit ||
    data.sort !== expected.sort ||
    typeof data.hasMore !== "boolean" ||
    (data.nextCursor !== null && typeof data.nextCursor !== "string")
  )
    throw new Error("客服分页响应不完整，请重新查询。");
  const cursor = data.nextCursor as string | null;
  if (
    (cursor && cursor.length > 4096) ||
    (data.hasMore && (!cursor || cursor === expected.cursor || rows.length === 0)) ||
    (!data.hasMore && !!cursor)
  )
    throw new Error("客服分页游标无效，请重新查询。");
  const items = rows.map(parse);
  if (new Set(items.map(id)).size !== items.length) throw new Error("客服列表含重复记录，请重新查询。");
  return {
    items,
    nextCursor: cursor ?? "",
    hasMore: data.hasMore,
    sort: expected.sort,
    limit: expected.limit,
  };
}
export function supportTicketPage(value: unknown, userId: string, filters: SupportFilters) {
  return page(
    value,
    "tickets",
    filters,
    (row) => {
      const ticket = supportTicket(row, userId);
      if (filters.status && ticket.status !== filters.status)
        throw new Error("工单与当前状态筛选不匹配，请重新查询。");
      return ticket;
    },
    (row) => row.ticketId,
  );
}
export function supportNotePage(
  value: unknown,
  ticketId: string,
  filters: { limit: number; sort: string; cursor: string },
) {
  return page(
    value,
    "notes",
    filters,
    (row) => supportNote(row, ticketId),
    (row) => row.noteId,
  );
}
export function supportMutation(value: unknown, userId: string, ticketId?: string) {
  const data = object(value),
    ticket = supportTicket(data.ticket, userId, ticketId);
  if (!Array.isArray(data.notes) || count(data.noteCount) !== data.notes.length)
    throw new Error("工单操作回执不完整，请先重新查询。");
  const notes = data.notes.map((row) => supportNote(row, ticket.ticketId));
  return { ticket, notes };
}
export function supportWriteUncertain(error: unknown) {
  return !(error instanceof ApiError && [400, 403, 404, 409, 422].includes(error.status));
}
