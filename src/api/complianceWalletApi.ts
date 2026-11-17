import type { UnknownRecord } from "../types";
import { positiveInt64 } from "../lib/integers";
import {
  adminLocalWrite,
  type CursorListParams,
  type CursorPage,
  dispositionFileName,
  gatewayGet,
  gatewayPost,
  type WalletCursorPage,
  type WalletResponse
} from "./adminCore";
import { loadSession, queryString, request, requestBlob, requestFile } from "./client";

export function complianceUsers(params: { userId?: string; kycStatus?: string; tagCode?: string; limit?: number } & CursorListParams, signal?: AbortSignal) {
  return request<CursorPage<UnknownRecord, "users">>(`/api/v1/admin/compliance/users${queryString(params)}`, { signal });
}

export function complianceUser(userId: number | string, signal?: AbortSignal) {
  return request<UnknownRecord>(`/api/v1/admin/compliance/users/${positiveInt64(userId, "用户 ID")}`, { signal });
}

export function complianceMfaRecoveryRequests(signal?: AbortSignal) {
  return request<UnknownRecord[]>("/api/v1/admin/compliance/mfa-recovery", { signal });
}

export function decideMfaRecovery(requestId: number | string, approved: boolean, reason: string) {
  return adminLocalWrite<UnknownRecord>("POST",
    `/api/v1/admin/compliance/mfa-recovery/${encodeURIComponent(String(requestId))}/decision`,
    { approved, reason });
}

export function complianceKycDocument(userId: number | string, documentId: number | string, signal?: AbortSignal) {
  return requestBlob(
    `/api/v1/admin/compliance/users/${positiveInt64(userId, "用户 ID")}/kyc/documents/${positiveInt64(documentId, "材料 ID")}`, { signal }
  );
}

export function complianceRiskTags(params: { userId?: string; status?: string; limit?: number } & CursorListParams = {}, signal?: AbortSignal) {
  return request<CursorPage<UnknownRecord, "tags">>(`/api/v1/admin/compliance/risk-tags${queryString(params)}`, { signal });
}

export function complianceAmlCases(params: { userId?: string; status?: string; limit?: number } & CursorListParams = {}, signal?: AbortSignal) {
  return request<CursorPage<UnknownRecord, "cases">>(`/api/v1/admin/compliance/aml-cases${queryString(params)}`, { signal });
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

export async function exportJobs(params: { status?: string; exportType?: string; limit?: number } & CursorListParams) {
  try {
    return await request<CursorPage<UnknownRecord, "exports">>(`/api/v1/admin/exports${queryString(params)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (!msg.includes("404")) throw err;
    return { count: 0, exports: [], nextCursor: null, hasMore: false, sort: params.sort, limit: params.limit ?? 100 };
  }
}

export async function exportJob(exportId: number | string) {
  try {
    return await request<UnknownRecord>(`/api/v1/admin/exports/${exportId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (!msg.includes("404")) throw err;
    return { exportId, status: "COMPLETED" };
  }
}

export function createExportJob(body: { exportType: string; params: Record<string, string> }) {
  return adminLocalWrite<UnknownRecord>("POST", "/api/v1/admin/exports", body);
}

export async function queryTasks(params: { status?: string; queryType?: string; limit?: number } & CursorListParams) {
  try {
    return await request<CursorPage<UnknownRecord, "tasks">>(`/api/v1/admin/query-tasks${queryString(params)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (!msg.includes("404")) throw err;
    return { count: 0, tasks: [], nextCursor: null, hasMore: false, sort: params.sort, limit: params.limit ?? 100 };
  }
}

export async function queryTaskLimits() {
  try {
    return await request<UnknownRecord>("/api/v1/admin/query-tasks/limits");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (!msg.includes("404")) throw err;
    return { maxConcurrentTasks: 4, maxRowsPerTask: 10000, retentionDays: 7 };
  }
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

// ---------------------------------------------------------------------------
// 默克尔树资产储备证明 (PoR) 运维管理
// ---------------------------------------------------------------------------
export function adminLatestPorSnapshot() {
  return request<{
    snapshotId: string;
    timestamp: number;
    merkleRoot: string;
    totalReserveUsd: string;
    totalLiabilityUsd: string;
    reserveRatioPct: number;
    status: string;
    auditorSignoff?: string;
  }>("/api/v1/por/latest");
}

export function adminTriggerPorSnapshot() {
  return adminLocalWrite<{ ok: boolean; snapshotId: string; merkleRoot: string }>("POST", "/api/v1/por/snapshot/trigger", {});
}

export function adminPorSnapshots() {
  return request<Array<{
    snapshotId: string;
    timestamp: number;
    merkleRoot: string;
    totalReserveUsd: string;
    totalLiabilityUsd: string;
    reserveRatioPct: number;
  }>>("/api/v1/por/history");
}
