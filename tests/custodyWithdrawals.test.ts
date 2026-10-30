import { installConfigFixture } from "./configFixture";
import { expect, test } from "bun:test";
installConfigFixture();
const { parseCustodyWithdrawals, custodyWithdrawalActions } = await import(
  "../src/api/custodyWithdrawals"
);
const row = {
  withdrawalId: "11111111-1111-4111-8111-111111111111",
  userId: "9223372036854775807",
  chain: "ETH",
  assetSymbol: "USDT",
  toAddress: "0x123",
  amount: "90071992.54740993",
  amountUnits: "9007199254740993",
  platformFee: "0.5",
  receivedAmount: "90071992.04740993",
  status: "PENDING_APPROVAL",
  createdAt: "2026-10-26T12:00:00Z",
};
test("gateway withdrawal reads retain exact amounts and financial identity", () => {
  expect(parseCustodyWithdrawals([row])).toEqual([row]);
  expect(parseCustodyWithdrawals([])).toEqual([]);
});
test("malformed or duplicate withdrawal records cannot appear as an empty successful list", () => {
  for (const value of [
    {},
    [null],
    [{ ...row, withdrawalId: "wrong" }],
    [row, row],
    [{ ...row, userId: "0" }],
    [{ ...row, amountUnits: "9223372036854775808" }],
  ])
    expect(() => parseCustodyWithdrawals(value)).toThrow();
});
test("human review and retry actions follow the backend state transitions", () => {
  expect(custodyWithdrawalActions("PENDING_APPROVAL")).toEqual(["approve", "reject"]);
  for (const status of ["DEBIT_UNKNOWN", "BROADCAST_UNKNOWN", "REFUND_PENDING"])
    expect(custodyWithdrawalActions(status)).toEqual(["retry"]);
  for (const status of ["SUBMITTED", "COMPLETED", "REFUNDED", "FAILED_PENDING", "UNKNOWN"])
    expect(custodyWithdrawalActions(status)).toEqual([]);
});

test("inconsistent or missing fee quotations cannot be approved", () => {
  for (const patch of [{platformFee: undefined}, {platformFee: "NaN"}, {platformFee: "1"}, {receivedAmount: "0"}, {amount: 25}])
    expect(() => parseCustodyWithdrawals([{...row,...patch}])).toThrow();
});
