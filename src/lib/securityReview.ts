import type { UnknownRecord } from "../types";
import { positiveInt64 } from "./integers";
function object(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function permissionCodes(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((code) => typeof code === "string" && code.trim() === code && code.length > 0)
  )
    throw new Error("权限代码响应不完整，请重新读取。");
  if (new Set(value).size !== value.length) throw new Error("权限响应包含重复代码。");
  return value;
}
export function rolePermissionResult(value: unknown, roleCode: string) {
  if (!object(value) || value.roleCode !== roleCode)
    throw new Error("角色权限响应不匹配，旧权限未载入当前角色。");
  return { roleCode, permissions: permissionCodes(value.permissions) };
}
export function securityCatalogue(value: unknown, key: "roles" | "permissions"): UnknownRecord[] {
  if (!object(value) || !Array.isArray(value[key]) || value.count !== value[key].length)
    throw new Error("安全目录响应不完整，请重新读取。");
  const rows = value[key] as unknown[];
  const field = key === "roles" ? "roleCode" : "permissionCode";
  if (
    !rows.every(
      (row) =>
        object(row) && typeof row[field] === "string" && String(row[field]).trim().length > 0,
    ) ||
    new Set(rows.map((row) => (row as UnknownRecord)[field])).size !== rows.length
  )
    throw new Error("安全目录包含无效或重复代码。");
  return rows as UnknownRecord[];
}
export function draftPermissionCodes(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  ];
}
export function permissionDifference(original: string[], draft: string[]) {
  return {
    added: draft.filter((code) => !original.includes(code)),
    removed: original.filter((code) => !draft.includes(code)),
  };
}
export type ApprovalRecord = UnknownRecord & {
  approvalId: string;
  requesterUserId: string;
  requesterUsername: string;
  status: string;
  service: string;
  httpMethod: string;
  requestPath: string;
  queryString: string | null;
  requestBodySha256: string | null;
  reason: string;
  requestedAt: string;
  expiresAt: string;
};
export function approvalRecords(value: unknown): ApprovalRecord[] {
  if (!Array.isArray(value)) throw new Error("审批列表响应不完整，请重新查询。");
  const rows = value.map((row) => {
    if (
      !object(row) ||
      !["PENDING", "APPROVED", "REJECTED", "CONSUMED"].includes(String(row.status)) ||
      !["requesterUsername", "service", "httpMethod", "requestPath", "reason"].every(
        (field) => typeof row[field] === "string",
      ) ||
      !String(row.requestPath).startsWith("/api/v1/admin/") ||
      ![row.requestedAt, row.expiresAt].every(
        (date) => typeof date === "string" && Number.isFinite(Date.parse(date)),
      ) ||
      !(row.queryString === null || typeof row.queryString === "string") ||
      !(
        row.requestBodySha256 === null ||
        (typeof row.requestBodySha256 === "string" && /^[a-f0-9]{64}$/.test(row.requestBodySha256))
      )
    )
      throw new Error("审批请求字段或状态异常，请重新查询。");
    return {
      ...row,
      approvalId: positiveInt64(row.approvalId, "审批 ID"),
      requesterUserId: positiveInt64(row.requesterUserId, "申请人 ID"),
    } as ApprovalRecord;
  });
  if (new Set(rows.map((row) => row.approvalId)).size !== rows.length)
    throw new Error("审批列表包含重复编号。");
  return rows;
}
export function canDecideApproval(row: ApprovalRecord, administratorId: string, now: number) {
  return (
    row.status === "PENDING" &&
    row.requesterUserId !== administratorId &&
    Date.parse(row.expiresAt) > now
  );
}
export function approvalListPage(value: unknown) {
  if (
    !object(value) ||
    !Number.isSafeInteger(value.count) ||
    Number(value.count) < 0 ||
    !Number.isSafeInteger(value.limit) ||
    Number(value.limit) < 1 ||
    Number(value.limit) > 1000 ||
    typeof value.hasMore !== "boolean" ||
    !(
      value.nextCursor === null ||
      (typeof value.nextCursor === "string" && value.nextCursor.length > 0)
    ) ||
    value.hasMore !== Boolean(value.nextCursor) ||
    typeof value.sort !== "string"
  )
    throw new Error("审批分页响应不完整，请重新查询。");
  const approvals = approvalRecords(value.approvals);
  if (value.count !== approvals.length || approvals.length > Number(value.limit))
    throw new Error("审批分页数量不匹配，请重新查询。");
  return {
    ...value,
    approvals,
    count: value.count as number,
    limit: value.limit as number,
    hasMore: value.hasMore,
    nextCursor: value.nextCursor as string | null,
    sort: value.sort,
  };
}
