import { positiveInt64 } from "./integers";
import type { UnknownRecord } from "../types";

export const KYC_LEVELS = ["NONE", "BASIC", "STANDARD", "ENHANCED", "INSTITUTIONAL"];
export const KYC_STATUSES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"];
function object(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function complianceRows(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value) || !value.every(object)) throw new Error("合规列表响应不完整，请重新加载。");
  return value;
}
export function complianceDetail(value: unknown, expectedUserId: string): UnknownRecord {
  const fail = () => { throw new Error("合规详情不完整或用户不匹配，本次材料未载入。"); };
  if (!object(value) || !object(value.user)) return fail();
  const owner = positiveInt64(expectedUserId, "用户 ID");
  if (positiveInt64(value.user.userId, "用户 ID") !== owner) return fail();
  if (value.kyc !== null && (!object(value.kyc) || positiveInt64(value.kyc.userId, "KYC 用户 ID") !== owner
    || !KYC_STATUSES.includes(String(value.kyc.status)) || !KYC_LEVELS.includes(String(value.kyc.kycLevel)))) return fail();
  for (const key of ["kycDocuments", "riskTags", "amlCases"]) {
    for (const row of complianceRows(value[key])) {
      if (positiveInt64(row.userId, "材料所属用户 ID") !== owner) return fail();
    }
  }
  return value;
}
