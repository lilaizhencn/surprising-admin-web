import type { UnknownRecord } from "../types";
import { positiveInt64 } from "../lib/integers";
import {
  adminLocalWrite,
  type CursorListParams,
  type CursorPage,
  gatewayGet,
  gatewayPost,
  type WalletCursorPage,
  type WalletResponse
} from "./adminCore";
import { queryString, request, requestBlob } from "./client";

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
    reserveRatioPct: string | number;
    includedAccountCount?: number;
    status: string;
    auditorSignoff?: string;
  }>("/api/v1/admin/compliance/por/latest");
}

export function adminTriggerPorSnapshot() {
  return adminLocalWrite<{ ok: boolean; snapshotId: string; merkleRoot: string }>(
    "POST",
    "/api/v1/admin/compliance/por/snapshot/trigger",
    {}
  );
}

export function adminPorSnapshots() {
  return request<Array<{
    snapshotId: string;
    timestamp: number;
    merkleRoot: string;
    totalReserveUsd: string;
    totalLiabilityUsd: string;
    reserveRatioPct: string | number;
    includedAccountCount?: number;
    status?: string;
  }>>("/api/v1/admin/compliance/por/history");
}
