import { expect, test } from "bun:test";
import { complianceDetail, complianceRows, KYC_LEVELS, validateKycReview } from "../src/lib/compliance";
const userId = "9223372036854775807";
const detail = {
  user: { userId },
  kyc: { userId, status: "PENDING", kycLevel: "STANDARD" },
  kycDocuments: [{ documentId: "9007199254740993", userId }],
  riskTags: [], amlCases: []
};
test("compliance evidence preserves the selected user and exact material IDs", () => {
  expect(complianceDetail(detail, userId)).toBe(detail);
  expect(complianceDetail({ ...detail, kyc: null }, userId).kyc).toBeNull();
  expect(KYC_LEVELS).toEqual(["NONE", "BASIC", "STANDARD", "ENHANCED", "INSTITUTIONAL"]);
});
test("mixed owners, missing collections and unknown review states cannot become writable detail", () => {
  for (const value of [
    { ...detail, user: { userId: "2" } },
    { ...detail, kyc: { ...detail.kyc, userId: "2" } },
    { ...detail, kycDocuments: [{ userId: "2" }] },
    { ...detail, riskTags: undefined },
    { ...detail, amlCases: {} },
    { ...detail, kyc: { ...detail.kyc, status: "UNKNOWN" } },
    { ...detail, kyc: { ...detail.kyc, kycLevel: "ADVANCED" } },
  ]) expect(() => complianceDetail(value, userId)).toThrow();
  expect(() => complianceRows({})).toThrow();
  expect(() => complianceRows([null])).toThrow();
});

test("review requires an explanation, valid evidence, expiry and the verified provider level", () => {
  const now = Date.parse("2026-10-29T00:00:00Z");
  const current = { provider: "SELF", kycLevel: "BASIC", submittedDocuments: '[{"reference":"document:1"}]', expiresAt: "2027-01-01T00:00:00Z" };
  const approved = { provider: "SELF", kycLevel: "BASIC", status: "VERIFIED", expiresAt: "2026-12-01T00:00:00Z" };
  expect(() => validateKycReview(approved, current, now)).not.toThrow();
  expect(() => validateKycReview({ ...approved, kycLevel: "NONE" }, current, now)).toThrow("认证级别");
  expect(() => validateKycReview({ ...approved, provider: "SUMSUB" }, { ...current, provider: "SUMSUB" }, now)).toThrow("第三方认证申请");
  expect(() => validateKycReview({ ...approved, provider: "SUMSUB", providerReference: "other" }, { ...current, provider: "SUMSUB", providerReference: "original" }, now)).toThrow("认证会话");
  expect(() => validateKycReview({ status: "REJECTED", rejectionReason: "" }, current, now)).toThrow("拒绝原因");
  expect(() => validateKycReview({ status: "REJECTED", rejectionReason: "请补充清晰原件" }, current, now)).not.toThrow();
  for (const expiresAt of [null, "bad", "2020-01-01", "2028-01-01"]) expect(() => validateKycReview({ ...approved, expiresAt }, current, now)).toThrow();
  expect(() => validateKycReview(approved, { ...current, submittedDocuments: "[]" }, now)).toThrow("身份材料");
  expect(() => validateKycReview({ ...approved, provider: "SUMSUB", kycLevel: "ENHANCED" }, { ...current, provider: "SUMSUB" }, now)).toThrow("不能提升级别");
});
