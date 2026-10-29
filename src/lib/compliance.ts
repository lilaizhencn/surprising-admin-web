import { positiveInt64 } from "./integers";
import type { UnknownRecord } from "../types";

export const KYC_LEVELS = ["NONE", "BASIC", "STANDARD", "ENHANCED", "INSTITUTIONAL"];
export const KYC_STATUSES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"];
export function validateKycReview(body: UnknownRecord, current: UnknownRecord, now = Date.now()): void {
  if (body.status === "REJECTED" && !String(body.rejectionReason ?? "").trim())
    throw new Error("请填写拒绝原因，让用户知道如何补正材料。");
  if (body.status !== "VERIFIED") return;
  if (body.kycLevel === "NONE") throw new Error("审核通过必须对应实际完成的认证级别。");
  const expiry = Date.parse(String(body.expiresAt ?? ""));
  if (!Number.isFinite(expiry) || expiry <= now) throw new Error("审核通过前请设置将来的认证到期时间。");
  const evidenceExpiry = Date.parse(String(current.expiresAt ?? ""));
  if (Number.isFinite(evidenceExpiry) && expiry > evidenceExpiry) throw new Error("认证有效期不能超过本次证件有效期。");
  if (body.provider !== current.provider) throw new Error("请保留本次申请使用的认证服务商。");
  if (body.provider !== "SELF" && body.kycLevel !== current.kycLevel) throw new Error("第三方审核不能提升级别，请让用户完成对应核验流程。");
  if (body.provider !== "SELF" && !String(current.providerReference ?? "").trim()) throw new Error("请先让用户提交有效的第三方认证申请。");
  if (body.provider !== "SELF" && body.providerReference !== current.providerReference) throw new Error("请保留本次申请对应的第三方认证会话。");
  if (body.provider === "SELF") {
    let evidence: unknown;
    try { evidence = JSON.parse(String(current.submittedDocuments ?? "[]")); } catch { throw new Error("提交材料记录无效，请重新加载。"); }
    if (!Array.isArray(evidence) || !evidence.length) throw new Error("请先核对用户本次提交的身份材料。");
  }
}
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
