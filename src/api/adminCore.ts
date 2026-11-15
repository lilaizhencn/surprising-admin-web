import type { UnknownRecord } from "../types";
import { serializeAdminBody } from "../lib/integers";
import { adminGatewayPath, ApiError, loadSession, queryString, request } from "./client";

export type WalletResponse<T> = T | { code?: number; message?: string; data?: T };
export type CursorListParams = {
  cursor?: string;
  sort?: string;
};
export type AdminApprovalRequestContext = {
  service: string;
  method: string;
  requestPath: string;
  query: string;
  requestBodySha256?: string;
};
export type AdminApprovalDecision = {
  approvalId?: string;
  reason?: string;
} | null;
type AdminApprovalRequestHandler = (context: AdminApprovalRequestContext) => Promise<AdminApprovalDecision>;
let approvalRequestHandler: AdminApprovalRequestHandler | null = null;

export function setApprovalRequestHandler(handler: AdminApprovalRequestHandler | null) {
  approvalRequestHandler = handler;
}

export type WalletCursorPage<K extends string> = {
  count?: number;
  items?: UnknownRecord[];
  nextCursor?: string | null;
  hasMore?: boolean;
  sort?: string;
  limit?: number;
} & Partial<Record<K, UnknownRecord[]>>;

export type CursorPage<T extends Record<string, unknown>, K extends string> = {
  count: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  sort?: string;
  limit?: number;
} & Record<K, T[]>;

export function createApproval(body: {
  service: string;
  httpMethod: string;
  requestPath: string;
  queryString?: string;
  requestBodySha256?: string;
  reason: string;
}, expectedUserId?: string) {
  return request<UnknownRecord>("/api/v1/admin/approvals", {
    method: "POST",
    body: serializeAdminBody(body),
    expectedUserId
  });
}

export function gatewayGet<T>(service: string, path: string, params: Record<string, unknown> = {}, signal?: AbortSignal) {
  return request<T>(`${adminGatewayPath(service, path)}${queryString(params)}`, {
    productLine: productLineParam(params), signal
  });
}

export async function gatewayPost<T>(service: string, path: string, body?: unknown, params: Record<string, unknown> = {}) {
  return gatewayWrite<T>("POST", service, path, body, params);
}

export async function gatewayPatch<T>(service: string, path: string, body?: unknown, params: Record<string, unknown> = {}) {
  return gatewayWrite<T>("PATCH", service, path, body, params);
}

async function gatewayWrite<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  service: string,
  path: string,
  body?: unknown,
  params: Record<string, unknown> = {}
) {
  const requestPath = adminGatewayPath(service, path);
  const query = queryString(params);
  const serializedBody = serializeAdminBody(body);
  const expectedUserId = String(loadSession()?.user.userId ?? "");
  const headers: Record<string, string> = {};
  const productLine = productLineParam(params);

  if (requiresApproval(service, path, method)) {
    await attachApproval(headers, service, method, requestPath, query, serializedBody, expectedUserId);
  }

  return request<T>(`${requestPath}${query}`, {
    method,
    headers,
    body: serializedBody,
    productLine,
    expectedUserId
  });
}

export async function adminLocalWrite<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  requestPath: string,
  body?: unknown,
  params: Record<string, unknown> = {}
) {
  const query = queryString(params);
  const serializedBody = serializeAdminBody(body);
  const expectedUserId = String(loadSession()?.user.userId ?? "");
  const headers: Record<string, string> = {};
  await attachApproval(headers, "gateway-admin", method, requestPath, query, serializedBody, expectedUserId);
  return request<T>(`${requestPath}${query}`, {
    method,
    headers,
    body: serializedBody,
    expectedUserId
  });
}

export async function attachApproval(
  headers: Record<string, string>,
  service: string,
  method: string,
  requestPath: string,
  query: string,
  serializedBody?: string,
  expectedUserId?: string
) {
  if (!approvalRequestHandler) {
    throw new Error("敏感后台写操作需要审批处理器。");
  }
  const requestBodySha256 = serializedBody ? await sha256Hex(serializedBody) : undefined;
  const decision = await approvalRequestHandler({
    service,
    method,
    requestPath,
    query: query ? query.slice(1) : "",
    requestBodySha256
  });
  if (expectedUserId !== undefined && String(loadSession()?.user.userId ?? "") !== expectedUserId)
    throw new ApiError(401, "登录账号已变化，未提交此操作。", null);
  if (decision?.approvalId?.trim()) {
    headers["X-Admin-Approval-Id"] = decision.approvalId.trim();
    return;
  }
  const reason = decision?.reason;
  if (!reason?.trim()) {
    throw new Error("已取消敏感操作。");
  }
  const approval = await createApproval({
    service,
    httpMethod: method,
    requestPath,
    queryString: query ? query.slice(1) : undefined,
    requestBodySha256,
    reason: reason.trim()
  }, expectedUserId);
  const id = approval.approvalId ?? approval.id;
  throw new Error(`审批单 ${id} 已创建，等待审批。`);
}

function requiresApproval(service: string, path: string, method: string) {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  const normalizedService = service.trim().toLowerCase();
  const normalizedPath = path.trim().toLowerCase();
  if (method === "POST" && (
    (normalizedService === "instrument-admin" && (normalizedPath === "/upsert" || normalizedPath === "/order-settings" || /^\/[0-9]+\/status$/.test(normalizedPath)))
    || (normalizedService === "market-maker" && (["/business-settings", "/strategy-definitions"].includes(normalizedPath)
      || /^\/strategies\/[a-z0-9_-]+\/(config|pause|resume)$/.test(normalizedPath)))
    || (normalizedService === "insurance-admin" && normalizedPath === "/runtime-config")
    || (["risk", "liquidation", "funding", "adl"].includes(normalizedService) && normalizedPath === "/admin/runtime-config")
  )) return false;
  if (["account", "instrument-admin", "insurance-admin", "trading-fees", "trading-orders", "trading-leverage", "market-maker", "risk-admin", "liquidation-admin", "wallet-admin"]
    .includes(normalizedService)) {
    return true;
  }
  return ["risk", "liquidation", "liquidation-admin", "funding", "adl"].includes(normalizedService)
    && normalizedPath.endsWith("/admin/runtime-config");
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function productLineParam(params: Record<string, unknown>) {
  const value = params.productLine;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function dispositionFileName(disposition: string | null) {
  if (!disposition) return "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8?.[1]) return decodeURIComponent(utf8[1].replace(/^"|"$/g, ""));
  const ascii = /filename="?([^";]+)"?/i.exec(disposition);
  return ascii?.[1] ? ascii[1] : "";
}
