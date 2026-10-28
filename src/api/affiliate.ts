import { request, loadSession } from "./client";
import { serializeAdminBody, positiveInt64 } from "../lib/integers";
import type { UnknownRecord } from "../types";

export type AffiliateSettings = {
  version: number;
  referralRatePpm: number;
  kolRatePpm: number;
  settlementHours: number;
};
export type AffiliateAdminData = {
  settings: AffiliateSettings;
  profiles: UnknownRecord[];
  budgets: UnknownRecord[];
  sources: UnknownRecord[];
  payouts: UnknownRecord[];
};
const owner = () => ({
  expectedUserId: String(loadSession()?.user.userId ?? ""),
});
function write<T>(path: string, body?: unknown) {
  return request<T>(`/api/v1/admin/affiliate${path}`, {
    ...owner(),
    method: "POST",
    body: serializeAdminBody(body),
  });
}
export const affiliateAdmin = {
  load: async (cursor: string, signal?: AbortSignal) => {
    const data = await request<AffiliateAdminData>(
      `/api/v1/admin/affiliate?cursor=${cursor}`,
      { ...owner(), signal },
    );
    if (
      !data ||
      ![data.profiles, data.budgets, data.sources, data.payouts].every(
        Array.isArray,
      ) ||
      !data.settings ||
      !Number.isInteger(data.settings.referralRatePpm) ||
      !Number.isInteger(data.settings.kolRatePpm) ||
      !Number.isInteger(data.settings.settlementHours)
    )
      throw new Error("返佣响应不完整，请刷新核对");
    return data;
  },
  user: (userId: string) =>
    request<UnknownRecord>(
      `/api/v1/admin/affiliate/users/${positiveInt64(userId, "用户 ID")}`,
      owner(),
    ),
  settings: (
    referralRatePpm: number,
    kolRatePpm: number,
    settlementHours: number,
    reason: string,
  ) =>
    write("/settings", {
      referralRatePpm,
      kolRatePpm,
      settlementHours,
      reason,
    }),
  profile: (
    userId: string,
    kolEnabled: boolean,
    autoSettlement: boolean,
    ratePpm: number | null,
    reason: string,
  ) =>
    write(`/users/${positiveInt64(userId, "用户 ID")}`, {
      kolEnabled,
      autoSettlement,
      ratePpm,
      reason,
    }),
  budget: (product: string, userId: string, reason: string) =>
    write(`/budgets/${product}`, {
      userId: positiveInt64(userId, "预算账户 UID"),
      reason,
    }),
  settle: () => write("/settle"),
  retry: (id: string) => write(`/payouts/${encodeURIComponent(id)}/retry`),
};
export function affiliatePercent(text: string): number {
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(text.trim()))
    throw new Error("比例应为 0–100%，最多四位小数");
  const [whole, decimal = ""] = text.trim().split(".");
  const ppm = Number(whole) * 10000 + Number(decimal.padEnd(4, "0"));
  if (ppm > 1000000) throw new Error("比例不能超过 100%");
  return ppm;
}
