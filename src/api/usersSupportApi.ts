import type { AuthenticatedUser, UnknownRecord } from "../types";
import { positiveInt64, serializeAdminBody } from "../lib/integers";
import { adminLocalWrite, type CursorListParams, type CursorPage, gatewayGet } from "./adminCore";
import { loadSession, queryString, request } from "./client";

export function adminUsers(params: { query?: string; status?: string; limit?: number } & CursorListParams) {
  return request<{
    count: number;
    users: AuthenticatedUser[];
    nextCursor?: string | null;
    hasMore?: boolean;
    sort?: string;
    limit?: number;
  }>(`/api/v1/admin/users${queryString(params)}`);
}

export function updateUserStatus(userId: number | string, status: string) {
  return adminLocalWrite<AuthenticatedUser>("POST", `/api/v1/admin/users/${positiveInt64(userId, "用户 ID")}/status`, { status });
}

export function replaceUserRoles(userId: number | string, roles: string[]) {
  return adminLocalWrite<AuthenticatedUser>("POST", `/api/v1/admin/users/${positiveInt64(userId, "用户 ID")}/roles`, { roles });
}

export function userSessions(userId: number | string, params: { active?: boolean; limit?: number } & CursorListParams = {}, signal?: AbortSignal) {
  return request<CursorPage<UnknownRecord, "sessions">>(
    `/api/v1/admin/users/${positiveInt64(userId, "用户 ID")}/sessions${queryString(params)}`, { signal }
  );
}

export async function userProfile(userId: number | string, params: { settleAsset?: string; productLine?: string; limit?: number } = {}, signal?: AbortSignal) {
  const uid = positiveInt64(userId, "用户 ID");
  try {
    return await request<UnknownRecord>(`/api/v1/admin/users/${uid}/profile${queryString(params)}`, { signal });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (!msg.includes("404")) throw err;
    const productLine = params.productLine || "LINEAR_PERPETUAL";
    const limit = params.limit ?? 50;
    const [balances, productBalances, positions, orders, trades, triggerOrders, sessionsRes, logsRes] = await Promise.allSettled([
      gatewayGet<UnknownRecord>("account", "/balances", { userId: uid, productLine }, signal),
      gatewayGet<UnknownRecord>("account", "/product-balances", { userId: uid, productLine }, signal),
      gatewayGet<UnknownRecord>("account", "/positions", { userId: uid, productLine }, signal),
      gatewayGet<UnknownRecord>("trading-orders", "", { userId: uid, productLine, limit }, signal),
      gatewayGet<UnknownRecord>("trading-orders", "/trades", { userId: uid, productLine, limit }, signal),
      gatewayGet<UnknownRecord>("trading-trigger", "", { userId: uid, productLine, limit }, signal),
      userSessions(uid, { limit }, signal),
      loginLogs({ userId: uid, limit })
    ]);
    return {
      userId: uid,
      productLine,
      settleAsset: params.settleAsset ?? "USDT",
      account: {
        balances: balances.status === "fulfilled" ? balances.value : { balances: [] },
        productBalances: productBalances.status === "fulfilled" ? productBalances.value : { balances: [] },
        positions: positions.status === "fulfilled" ? positions.value : { positions: [] },
        accountLedger: { entries: [] },
        productLedger: { entries: [] },
        transfers: { transfers: [] }
      },
      trading: {
        orders: orders.status === "fulfilled" ? orders.value : { orders: [] },
        trades: trades.status === "fulfilled" ? trades.value : { trades: [] },
        triggerOrders: triggerOrders.status === "fulfilled" ? triggerOrders.value : { orders: [] }
      },
      risk: { accountLatest: [], positionsLatest: [] },
      sessions: sessionsRes.status === "fulfilled" ? sessionsRes.value : { sessions: [] },
      loginLogs: logsRes.status === "fulfilled" ? logsRes.value : { logs: [] },
      errors: []
    };
  }
}

export function supportUserOverview(userId: number | string, signal?: AbortSignal) {
  return request<UnknownRecord>(`/api/v1/admin/support/users/${positiveInt64(userId, "用户 ID")}/overview`, {
    signal, expectedUserId: String(loadSession()?.user.userId ?? "")
  });
}

export function supportTickets(params: { userId?: string; status?: string; limit?: number } & CursorListParams = {}, signal?: AbortSignal) {
  return request<{
    ticketCount?: number;
    tickets?: UnknownRecord[];
    nextCursor?: string | null;
    hasMore?: boolean;
    sort?: string;
    limit?: number;
  }>(
    `/api/v1/admin/support/tickets${queryString(params)}`, { signal, expectedUserId: String(loadSession()?.user.userId ?? "") }
  );
}

export function createSupportTicket(userId: number | string, body: {
  title: string;
  category?: string;
  priority?: string;
  assignedAdminUserId?: number;
  initialNote?: string;
}) {
  return request<UnknownRecord>(`/api/v1/admin/support/users/${positiveInt64(userId, "用户 ID")}/tickets`, {
    method: "POST", expectedUserId: String(loadSession()?.user.userId ?? ""),
    body: serializeAdminBody(body)
  });
}

export function supportTicketNotes(ticketId: number | string, params: { limit?: number } & CursorListParams = {}, signal?: AbortSignal) {
  return request<{
    noteCount?: number;
    notes?: UnknownRecord[];
    nextCursor?: string | null;
    hasMore?: boolean;
    sort?: string;
    limit?: number;
  }>(
    `/api/v1/admin/support/tickets/${positiveInt64(ticketId, "工单 ID")}/notes${queryString(params)}`, { signal, expectedUserId: String(loadSession()?.user.userId ?? "") }
  );
}

export function addSupportTicketNote(ticketId: number | string, body: {
  noteType?: string;
  visibility?: string;
  body: string;
}) {
  return request<UnknownRecord>(`/api/v1/admin/support/tickets/${positiveInt64(ticketId, "工单 ID")}/notes`, {
    method: "POST", expectedUserId: String(loadSession()?.user.userId ?? ""),
    body: serializeAdminBody(body)
  });
}

export function updateSupportTicketStatus(ticketId: number | string, body: { status: string; reason: string }) {
  return request<UnknownRecord>(`/api/v1/admin/support/tickets/${positiveInt64(ticketId, "工单 ID")}/status`, {
    method: "POST", expectedUserId: String(loadSession()?.user.userId ?? ""),
    body: serializeAdminBody(body)
  });
}

export function revokeSession(sessionId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/sessions/${sessionId}/revoke`, {});
}

export function revokeUserSessions(userId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/users/${positiveInt64(userId, "用户 ID")}/sessions/revoke`, {});
}

export function loginLogs(params: { userId?: string; result?: string; limit?: number } & CursorListParams) {
  return request<CursorPage<UnknownRecord, "logs">>(`/api/v1/admin/audit/login-logs${queryString(params)}`);
}

export function operationLogs(params: {
  adminUserId?: string;
  service?: string;
  method?: string;
  success?: string;
  limit?: number;
} & CursorListParams) {
  return request<CursorPage<UnknownRecord, "logs">>(`/api/v1/admin/audit/operations${queryString(params)}`);
}

export function approvalRequests(params: {
  status?: string;
  requesterUserId?: string;
  approverUserId?: string;
  service?: string;
  limit?: number;
} & CursorListParams, signal?: AbortSignal) {
  return request<CursorPage<UnknownRecord, "approvals">>(`/api/v1/admin/approvals${queryString(params)}`, { signal, expectedUserId: String(loadSession()?.user.userId ?? "") });
}

export function approveApproval(approvalId: number | string, reason?: string) {
  return request<UnknownRecord>(`/api/v1/admin/approvals/${positiveInt64(approvalId, "审批 ID")}/approve`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || "" }),
    expectedUserId: String(loadSession()?.user.userId ?? "")
  });
}

export function rejectApproval(approvalId: number | string, reason?: string) {
  return request<UnknownRecord>(`/api/v1/admin/approvals/${positiveInt64(approvalId, "审批 ID")}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || "" }),
    expectedUserId: String(loadSession()?.user.userId ?? "")
  });
}
