import { expect, test } from "bun:test";
import { complianceDetail, complianceRows, KYC_LEVELS } from "../src/lib/compliance";
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
