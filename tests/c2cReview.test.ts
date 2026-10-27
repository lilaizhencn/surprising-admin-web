import { expect, test } from "bun:test";
import {
  c2cReviewPage,
  c2cPaymentDetails,
  c2cAppealOrder,
  c2cConfiguration,
  c2cBondPolicy,
  c2cReconciliation,
  c2cDecisions,
} from "../src/lib/c2cReview";
const id = "11111111-1111-4111-8111-111111111111";
const account = {
  accountId: id,
  userId: "9007199254740993",
  fiat: "CNY",
  methodCode: "BANK",
  maskedLabel: "****1234",
  status: "PENDING",
  revision: "9223372036854775807",
};
test("C2C pages reject missing metadata, duplicates and wrong page offsets", () => {
  expect(
    c2cReviewPage({ items: [account], hasMore: false, offset: 0 }, "payment-accounts", 0).items[0]
      .userId,
  ).toBe(account.userId);
  for (const value of [
    { items: [] },
    { items: [account, account], hasMore: false, offset: 0 },
    { items: [account], hasMore: false, offset: 30 },
    { items: [{ ...account, status: "UNKNOWN" }], hasMore: false, offset: 0 },
  ])
    expect(() => c2cReviewPage(value, "payment-accounts", 0)).toThrow();
});
test("audited payment details remain bound to exact owner, account and revision", () => {
  const details = {
    ...account,
    ownerUserId: account.userId,
    manualIdentityVerificationRequired: true,
    kycStatus: "VERIFIED",
    kycExpiresAt: null,
    details: {
      holderName: "Synthetic holder",
      accountNumber: "123456",
      bankName: "Synthetic bank",
    },
  };
  expect(c2cPaymentDetails(details, account).accountId).toBe(id);
  for (const row of [
    { ...details, ownerUserId: "2" },
    { ...details, revision: "1" },
    { ...details, accountId: "22222222-2222-4222-8222-222222222222" },
    { ...details, details: {} },
  ])
    expect(() => c2cPaymentDetails(row, account)).toThrow();
});
test("appeal decisions inspect the original exact parties and amount", () => {
  const order = {
    orderId: id,
    buyerUserId: "9007199254740993",
    sellerUserId: "9223372036854775807",
    market: { asset: "USDT", fiat: "CNY" },
    quantity: "0.00000001",
    fiatAmount: "6.650000000000000001",
    status: "APPEALED",
  };
  expect(c2cAppealOrder(order, id).fiatAmount).toBe(order.fiatAmount);
  expect(() => c2cAppealOrder(order, "another-order")).toThrow();
  expect(() => c2cAppealOrder({ ...order, buyerUserId: 9007199254740992 }, id)).toThrow();
});
test("configuration and bond policy absence cannot masquerade as a disabled or zero policy", () => {
  expect(() => c2cConfiguration({})).toThrow();
  expect(() => c2cBondPolicy({})).toThrow();
  expect(c2cBondPolicy({ configured: false, revision: "0" }).configured).toBe(false);
  expect(() => c2cBondPolicy({ configured: true, revision: "1" })).toThrow();
  expect(() =>
    c2cBondPolicy({ configured: true, revision: "1", asset: "USDT", amount: "0" }),
  ).toThrow();
});
test("reconciliation preserves signed and aggregate integer discrepancies without rounding", () => {
  const report = {
    status: "MISMATCH",
    assets: [
      {
        asset: "USDT",
        expectedEscrowUnits: "922337203685477580700",
        actualEscrowUnits: "-1",
        expectedFeeUnits: "0",
        actualFeeUnits: "0",
        matches: false,
      },
    ],
  };
  expect(c2cReconciliation(report).assets).toEqual(report.assets);
  expect(() => c2cReconciliation({ status: "MATCHED", assets: [{ asset: "USDT" }] })).toThrow();
});
test("review controls follow ad, payment and appeal states", () => {
  expect(c2cDecisions("ads", { status: "ACTIVE" })).toEqual(["PAUSE"]);
  expect(c2cDecisions("ads", { status: "CLOSING" })).toEqual([]);
  expect(c2cDecisions("payment-accounts", { status: "APPROVED" })).toEqual(["DISABLE"]);
  expect(c2cDecisions("appeals", { status: "RESOLVED" })).toEqual([]);
  expect(
    c2cDecisions("merchants", { status: "PENDING", bondStatus: "RETURNED", kycStatus: "VERIFIED" }),
  ).not.toContain("APPROVE");
});
