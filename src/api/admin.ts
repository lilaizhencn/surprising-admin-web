import type { AuthenticatedUser, AuthSession, Instrument, UnknownRecord } from "../types";
import { positiveInt64, serializeAdminBody } from "../lib/integers";
import { adminGatewayPath, ApiError, loadSession, queryString, request, requestBlob, requestFile } from "./client";

type WalletResponse<T> = T | { code?: number; message?: string; data?: T };
type CursorListParams = {
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

export function login(username: string, password: string, totpCode?: string) {
  return request<AuthSession>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password, totpCode: totpCode || undefined })
  }, null);
}

export function me(session?: AuthSession | null) {
  return request<AuthenticatedUser>("/api/v1/auth/me", {}, session || null);
}

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

export function userProfile(userId: number | string, params: { settleAsset?: string; productLine?: string; limit?: number } = {}, signal?: AbortSignal) {
  return request<UnknownRecord>(`/api/v1/admin/users/${positiveInt64(userId, "用户 ID")}/profile${queryString(params)}`, { signal });
}

export function supportUserOverview(userId: number | string, params: { settleAsset?: string; productLine?: string; limit?: number } = {}) {
  return request<UnknownRecord>(`/api/v1/admin/support/users/${positiveInt64(userId, "用户 ID")}/overview${queryString(params)}`);
}

export function supportTickets(params: { userId?: string; status?: string; limit?: number } & CursorListParams = {}) {
  return request<{
    ticketCount?: number;
    tickets?: UnknownRecord[];
    nextCursor?: string | null;
    hasMore?: boolean;
    sort?: string;
    limit?: number;
  }>(
    `/api/v1/admin/support/tickets${queryString(params)}`
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
    method: "POST",
    body: serializeAdminBody(body)
  });
}

export function supportTicketNotes(ticketId: number | string, params: { limit?: number } & CursorListParams = {}) {
  return request<{
    noteCount?: number;
    notes?: UnknownRecord[];
    nextCursor?: string | null;
    hasMore?: boolean;
    sort?: string;
    limit?: number;
  }>(
    `/api/v1/admin/support/tickets/${ticketId}/notes${queryString(params)}`
  );
}

export function addSupportTicketNote(ticketId: number | string, body: {
  noteType?: string;
  visibility?: string;
  body: string;
}) {
  return request<UnknownRecord>(`/api/v1/admin/support/tickets/${ticketId}/notes`, {
    method: "POST",
    body: serializeAdminBody(body)
  });
}

export function updateSupportTicketStatus(ticketId: number | string, body: { status: string; reason: string }) {
  return request<UnknownRecord>(`/api/v1/admin/support/tickets/${ticketId}/status`, {
    method: "POST",
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
} & CursorListParams) {
  return request<CursorPage<UnknownRecord, "approvals">>(`/api/v1/admin/approvals${queryString(params)}`);
}

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

export function approveApproval(approvalId: number | string, reason?: string) {
  return request<UnknownRecord>(`/api/v1/admin/approvals/${approvalId}/approve`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || "" })
  });
}

export function rejectApproval(approvalId: number | string, reason?: string) {
  return request<UnknownRecord>(`/api/v1/admin/approvals/${approvalId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || "" })
  });
}

export function systemRoutes() {
  return request<UnknownRecord>("/api/v1/admin/system/routes");
}

export function systemHealth(params: { includePublicRoutes?: boolean } = {}) {
  return request<UnknownRecord>(`/api/v1/admin/system/health${queryString(params)}`);
}

export function systemMetrics(params: { windowMinutes?: number } = {}) {
  return request<UnknownRecord>(`/api/v1/admin/system/metrics${queryString(params)}`);
}

export function systemObservability() {
  return request<UnknownRecord>("/api/v1/admin/system/observability");
}

export function tradingMetrics(params: { windowMinutes?: number; productLine?: string; limit?: number } = {}) {
  return gatewayGet<UnknownRecord>("trading-orders","/metrics",params);
}

export function accountAssetValuation(params: {
  valuationAsset?: string;
  userId?: string;
  accountType?: string;
  asset?: string;
  nonZeroOnly?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return request<UnknownRecord>(`/api/v1/admin/reports/account-assets/valuation${queryString(params)}`, { signal });
}

export function accountAssetSnapshots(params: {
  snapshotDate?: string;
  valuationAsset?: string;
  accountType?: string;
  asset?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return request<CursorPage<UnknownRecord, "snapshots">>(
    `/api/v1/admin/reports/account-assets/snapshots${queryString(params)}`, { signal }
  );
}

export function createAccountAssetSnapshot(params: {
  snapshotDate?: string;
  valuationAsset?: string;
} = {}) {
  return request<UnknownRecord>(`/api/v1/admin/reports/account-assets/snapshots${queryString(params)}`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function marketHealth(params: { instrumentId?: string; period?: string; staleSeconds?: number; limit?: number } = {}) {
  return request<UnknownRecord>(`/api/v1/admin/market/health${queryString(params)}`);
}

export function alertRules(params: { domain?: string; enabled?: string; limit?: number } & CursorListParams = {}) {
  return request<CursorPage<UnknownRecord, "rules">>(`/api/v1/admin/alerts/rules${queryString(params)}`);
}

export function createAlertRule(body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", "/api/v1/admin/alerts/rules", body);
}

export function updateAlertRule(ruleId: number | string, body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/rules/${ruleId}`, body);
}

export function enableAlertRule(ruleId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/rules/${ruleId}/enable`, {});
}

export function disableAlertRule(ruleId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/rules/${ruleId}/disable`, {});
}

export function alertEvents(params: { status?: string; severity?: string; domain?: string; limit?: number } & CursorListParams = {}, signal?: AbortSignal) {
  return request<CursorPage<UnknownRecord, "events">>(`/api/v1/admin/alerts/events${queryString(params)}`, { signal });
}

export function alertChannels(params: { domain?: string; enabled?: string; limit?: number } & CursorListParams = {}) {
  return request<CursorPage<UnknownRecord, "channels">>(`/api/v1/admin/alerts/channels${queryString(params)}`);
}

export function createAlertChannel(body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", "/api/v1/admin/alerts/channels", body);
}

export function updateAlertChannel(channelId: number | string, body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/channels/${channelId}`, body);
}

export function enableAlertChannel(channelId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/channels/${channelId}/enable`, {});
}

export function disableAlertChannel(channelId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/channels/${channelId}/disable`, {});
}

export function alertDeliveries(params: { status?: string; channelId?: string; eventId?: string; limit?: number } & CursorListParams = {}) {
  return request<CursorPage<UnknownRecord, "deliveries">>(`/api/v1/admin/alerts/deliveries${queryString(params)}`);
}

export function retryAlertDelivery(deliveryId: number | string) {
  return request<UnknownRecord>(`/api/v1/admin/alerts/deliveries/${deliveryId}/retry`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function acknowledgeAlertEvent(eventId: number | string) {
  return request<UnknownRecord>(`/api/v1/admin/alerts/events/${eventId}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function evaluateAlerts() {
  return request<UnknownRecord>("/api/v1/admin/alerts/evaluate", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function mfaStatus() {
  return request<UnknownRecord>("/api/v1/admin/security/mfa");
}

export function enrollMfa() {
  return request<UnknownRecord>("/api/v1/admin/security/mfa/enroll", { method: "POST" });
}

export function confirmMfa(totpCode: string) {
  return request<UnknownRecord>("/api/v1/admin/security/mfa/confirm", {
    method: "POST",
    body: JSON.stringify({ totpCode })
  });
}

export function disableMfa(totpCode: string) {
  return request<UnknownRecord>("/api/v1/admin/security/mfa/disable", {
    method: "POST",
    body: JSON.stringify({ totpCode })
  });
}

export function adminRoles() {
  return request<{ count: number; roles: UnknownRecord[] }>("/api/v1/admin/roles");
}

export function adminPermissions() {
  return request<{ count: number; permissions: UnknownRecord[] }>("/api/v1/admin/permissions");
}

export function getRolePermissions(roleCode: string) {
  return request<{ roleCode: string; permissions: string[] }>(
    `/api/v1/admin/roles/${encodeURIComponent(roleCode)}/permissions`
  );
}

export function replaceRolePermissions(roleCode: string, permissions: string[]) {
  return adminLocalWrite<{ roleCode: string; permissions: string[] }>(
    "POST",
    `/api/v1/admin/roles/${encodeURIComponent(roleCode)}/permissions`,
    { permissions }
  );
}

export function complianceUsers(params: { userId?: string; kycStatus?: string; tagCode?: string; limit?: number } & CursorListParams) {
  return request<CursorPage<UnknownRecord, "users">>(`/api/v1/admin/compliance/users${queryString(params)}`);
}

export function complianceUser(userId: number | string) {
  return request<UnknownRecord>(`/api/v1/admin/compliance/users/${positiveInt64(userId, "用户 ID")}`);
}

export function complianceMfaRecoveryRequests() {
  return request<UnknownRecord[]>("/api/v1/admin/compliance/mfa-recovery");
}

export function decideMfaRecovery(requestId: number | string, approved: boolean, reason: string) {
  return adminLocalWrite<UnknownRecord>("POST",
    `/api/v1/admin/compliance/mfa-recovery/${encodeURIComponent(String(requestId))}/decision`,
    { approved, reason });
}

export function complianceKycDocument(userId: number | string, documentId: number | string) {
  return requestBlob(
    `/api/v1/admin/compliance/users/${encodeURIComponent(String(userId))}/kyc/documents/${encodeURIComponent(String(documentId))}`
  );
}

export function complianceRiskTags(params: { userId?: string; status?: string; limit?: number } & CursorListParams = {}) {
  return request<CursorPage<UnknownRecord, "tags">>(`/api/v1/admin/compliance/risk-tags${queryString(params)}`);
}

export function complianceAmlCases(params: { userId?: string; status?: string; limit?: number } & CursorListParams = {}) {
  return request<CursorPage<UnknownRecord, "cases">>(`/api/v1/admin/compliance/aml-cases${queryString(params)}`);
}

export function updateKyc(userId: number | string, body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/compliance/users/${positiveInt64(userId, "用户 ID")}/kyc`, body);
}

export function createRiskTag(userId: number | string, body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/compliance/users/${positiveInt64(userId, "用户 ID")}/risk-tags`, body);
}

export function resolveRiskTag(tagId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/compliance/risk-tags/${tagId}/resolve`, {});
}

export function createAmlCase(userId: number | string, body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/compliance/users/${positiveInt64(userId, "用户 ID")}/aml-cases`, body);
}

export function updateAmlCaseStatus(caseId: number | string, body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/compliance/aml-cases/${caseId}/status`, body);
}

export function exportJobs(params: { status?: string; exportType?: string; limit?: number } & CursorListParams) {
  return request<CursorPage<UnknownRecord, "exports">>(`/api/v1/admin/exports${queryString(params)}`);
}

export function exportJob(exportId: number | string) {
  return request<UnknownRecord>(`/api/v1/admin/exports/${exportId}`);
}

export function createExportJob(body: { exportType: string; params: Record<string, string> }) {
  return adminLocalWrite<UnknownRecord>("POST", "/api/v1/admin/exports", body);
}

export function queryTasks(params: { status?: string; queryType?: string; limit?: number } & CursorListParams) {
  return request<CursorPage<UnknownRecord, "tasks">>(`/api/v1/admin/query-tasks${queryString(params)}`);
}

export function queryTaskLimits() {
  return request<UnknownRecord>("/api/v1/admin/query-tasks/limits");
}

export function queryTask(queryTaskId: number | string) {
  return request<UnknownRecord>(`/api/v1/admin/query-tasks/${queryTaskId}`);
}

export function createQueryTask(body: { queryType: string; params: Record<string, string> }) {
  return adminLocalWrite<UnknownRecord>("POST", "/api/v1/admin/query-tasks", body);
}

export function archiveExpiredQueryTasks(body: { olderThanDays?: number; limit?: number; reason?: string }) {
  return adminLocalWrite<UnknownRecord>("POST", "/api/v1/admin/query-tasks/archive-expired", body);
}

export async function downloadExportFile(exportId: number | string) {
  const expectedUserId = String(loadSession()?.user.userId ?? "");
  const { blob, headers } = await requestFile(`/api/v1/admin/exports/${exportId}/download`, { expectedUserId });
  const fileName = dispositionFileName(headers.get("Content-Disposition")) || `admin-export-${exportId}.csv`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return fileName;
}

export function gatewayGet<T>(service: string, path: string, params: Record<string, unknown> = {}, signal?: AbortSignal) {
  return request<T>(`${adminGatewayPath(service, path)}${queryString(params)}`, {
    productLine: productLineParam(params), signal
  });
}

export function instruments(params: {
  productLine?: string;
  type?: string;
  status?: string;
  limit?: number;
} & CursorListParams = {}) {
  return gatewayGet<CursorPage<Instrument, "instruments"> & { items?: Instrument[] }>("instrument-admin", "/list", params);
}

export function instrumentLatest(instrumentId: number | string, productLine?: string) {
  return gatewayGet<Instrument>("instrument-admin", `/${encodeURIComponent(String(instrumentId))}`, { productLine });
}

export type InstrumentChange = { changeId: string; operatorId: string; reason: string; changedAt: string; beforeValues: string | null; afterValues: string };

export function instrumentChanges(instrumentId: number | string, productLine: string, beforeId = "0", limit = 50) {
  return gatewayGet<InstrumentChange[]>("instrument-admin", `/${encodeURIComponent(String(instrumentId))}/changes`, { productLine, beforeId, limit });
}

export function upsertInstrument(body: UnknownRecord, reason = "Admin configuration update", expectedChangeId: unknown = 0) {
  return gatewayPost<Instrument>("instrument-admin", "/upsert", body, { reason, expectedChangeId });
}

export function updateInstrumentStatus(instrumentId: number | string, status: string, productLine: string | undefined, reason = "Admin trading status update", expectedChangeId: unknown = 0) {
  return gatewayPost<Instrument>("instrument-admin", `/${encodeURIComponent(String(instrumentId))}/status`, undefined, { status, productLine, reason, expectedChangeId });
}

export function accountAdjustments(params: {
  adminUserId?: string;
  userId?: string;
  adjustmentKind?: string;
  accountType?: string;
  asset?: string;
  referenceId?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return gatewayGet<CursorPage<UnknownRecord, "adjustments">>("account", "/adjustments", params, signal);
}

export function walletFinanceSummary(params: {
  chain?: string;
  assetSymbol?: string;
  windowHours?: number;
  limit?: number;
} = {}, signal?: AbortSignal) {
  return gatewayGet<WalletResponse<UnknownRecord>>("wallet-admin", "/finance/summary", params, signal);
}

export function walletFinanceDeposits(params: {
  chain?: string;
  assetSymbol?: string;
  status?: string;
  credited?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return gatewayGet<WalletResponse<WalletCursorPage<"deposits">>>("wallet-admin", "/finance/deposits", params, signal);
}

export function walletFinanceWithdrawals(params: {
  chain?: string;
  assetSymbol?: string;
  status?: string;
  userId?: string;
  orderNo?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return gatewayGet<WalletResponse<WalletCursorPage<"withdrawals">>>("wallet-admin", "/finance/withdrawals", params, signal);
}

export function walletFinanceWithdrawalReviews(params: {
  chain?: string;
  assetSymbol?: string;
  decision?: string;
  adminUserId?: string;
  userId?: string;
  orderNo?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return gatewayGet<WalletResponse<WalletCursorPage<"reviews">>>("wallet-admin", "/finance/withdrawal-reviews", params, signal);
}

export function walletOperationsOverview(params: {
  chain?: string;
  assetSymbol?: string;
  windowHours?: number;
  limit?: number;
} = {}, signal?: AbortSignal) {
  return gatewayGet<WalletResponse<UnknownRecord>>("wallet-admin", "/operations/overview", params, signal);
}

export function walletOperationAddresses(params: {
  chain?: string;
  assetSymbol?: string;
  userId?: string;
  walletRole?: string;
  enabled?: string;
  address?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return gatewayGet<WalletResponse<WalletCursorPage<"addresses">>>("wallet-admin", "/operations/addresses", params, signal);
}

export function walletOperationBalances(params: {
  chain?: string;
  assetSymbol?: string;
  userId?: string;
  nonZeroOnly?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return gatewayGet<WalletResponse<WalletCursorPage<"balances">>>("wallet-admin", "/operations/balances", params, signal);
}

export function walletOperationExceptions(params: {
  eventType?: string;
  chain?: string;
  assetSymbol?: string;
  status?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return gatewayGet<WalletResponse<WalletCursorPage<"events">>>("wallet-admin", "/operations/exceptions", params, signal);
}

export function approveWalletWithdrawal(chain: string, orderNo: string, reason: string) {
  return gatewayPost<WalletResponse<UnknownRecord>>(
    "wallet-admin",
    `/finance/withdrawals/${encodeURIComponent(chain)}/${encodeURIComponent(orderNo)}/approve`,
    { reason }
  );
}

export function rejectWalletWithdrawal(chain: string, orderNo: string, reason: string) {
  return gatewayPost<WalletResponse<UnknownRecord>>(
    "wallet-admin",
    `/finance/withdrawals/${encodeURIComponent(chain)}/${encodeURIComponent(orderNo)}/reject`,
    { reason }
  );
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

function dispositionFileName(disposition: string | null) {
  if (!disposition) return "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8?.[1]) return decodeURIComponent(utf8[1].replace(/^"|"$/g, ""));
  const ascii = /filename="?([^";]+)"?/i.exec(disposition);
  return ascii?.[1] ? ascii[1] : "";
}
