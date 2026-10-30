import { ApiError, request } from "./client";
import { adminLocalWrite } from "./admin";
import { int64String, positiveInt64 } from "../lib/integers";
import type { UnknownRecord } from "../types";

export type CustodyWithdrawal = UnknownRecord & {
  withdrawalId: string;
  userId: string;
  chain: string;
  assetSymbol: string;
  toAddress: string;
  amount: string;
  platformFee: string;
  receivedAmount: string;
  status: string;
  createdAt: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const custodyWithdrawalStatuses = [
  "PENDING_APPROVAL",
  "PROCESSING",
  "DEBIT_UNKNOWN",
  "DEBITED",
  "BROADCAST_UNKNOWN",
  "SUBMITTED",
  "COMPLETED",
  "FAILED_PENDING",
  "REFUND_PENDING",
  "REFUNDED",
  "REJECTED",
] as const;
export type CustodyWithdrawalAction = "approve" | "reject" | "retry";
export function custodyWithdrawalActions(status: string): CustodyWithdrawalAction[] {
  if (status === "PENDING_APPROVAL") return ["approve", "reject"];
  return ["DEBIT_UNKNOWN", "BROADCAST_UNKNOWN", "REFUND_PENDING"].includes(status) ? ["retry"] : [];
}

export function parseCustodyWithdrawals(response: unknown): CustodyWithdrawal[] {
  if (!Array.isArray(response) || response.length > 200)
    throw new Error("平台提现记录格式异常，请重试。");
  const seen = new Set<string>();
  return response.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("平台提现记录格式异常，请重试。");
    const row = value as UnknownRecord;
    const id = String(row.withdrawalId ?? "");
    if (
      !uuid.test(id) ||
      seen.has(id) ||
      ["chain", "assetSymbol", "toAddress", "amount", "platformFee", "receivedAmount", "status", "createdAt"].some(
        (field) => typeof row[field] !== "string" || !(row[field] as string).trim(),
      )
    )
      throw new Error("平台提现记录字段不完整，数据未展示。");
    for (const field of ["amount", "platformFee", "receivedAmount"]) {
      const amount = row[field] as string;
      if (amount.length > 120 || !/^\d+(?:\.\d+)?$/.test(amount)) throw new Error("提现金额格式异常，操作已停止。");
    }
    const fields = [row.amount, row.platformFee, row.receivedAmount] as string[];
    const decimals = Math.max(...fields.map((value) => value.split(".")[1]?.length ?? 0));
    const units = fields.map((value) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole + fraction.padEnd(decimals, "0")); });
    if (units[0] !== units[1] + units[2] || units[2] <= 0n) throw new Error("提现总扣款、平台手续费与收款金额不一致，操作已停止。");
    seen.add(id);
    if (row.amountUnits != null) int64String(row.amountUnits, "提现最小单位");
    return {
      ...row,
      withdrawalId: id,
      userId: positiveInt64(row.userId, "提现用户 ID"),
    } as CustodyWithdrawal;
  });
}

export async function loadCustodyWithdrawals(status: string, limit: number, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set("status", status);
  return parseCustodyWithdrawals(
    await request<unknown>(`/api/v1/admin/wallet/withdrawals?${params}`, { signal }),
  );
}

export async function actOnCustodyWithdrawal(
  row: CustodyWithdrawal,
  action: CustodyWithdrawalAction,
  reason: string,
) {
  if (!uuid.test(row.withdrawalId) || !custodyWithdrawalActions(row.status).includes(action))
    throw new Error("当前申请状态不支持此操作，请重新查询。");
  const trimmed = reason.trim();
  if (!trimmed || trimmed.length > 500) throw new Error("请填写 1 至 500 字的操作原因。");
  const response = await adminLocalWrite<UnknownRecord>(
    "POST",
    `/api/v1/admin/wallet/withdrawals/${row.withdrawalId}/${action}`,
    { reason: trimmed },
  );
  if (
    !response ||
    String(response.withdrawalId) !== row.withdrawalId ||
    typeof response.status !== "string"
  )
    throw new ApiError(502, "操作响应与原申请不一致，请查询原申请状态，勿重复操作。", response);
  return response.status;
}
