import { installConfigFixture } from "./configFixture";
import { expect, test } from "bun:test";
installConfigFixture();
const { readAccountSections } = await import("../src/lib/accountReads");

test("a failed report or ledger cannot erase independently read balances", async () => {
  const response = { balances: [{ availableUnits: "9223372036854775807" }] };
  const result = await readAccountSections({
    balances: { request: Promise.resolve(response), array: "balances" },
    ledger: { request: Promise.reject(new Error("ledger unavailable")), array: "entries" }
  });
  expect(result.balances?.response).toBe(response);
  expect(result.ledger?.response).toBeNull();
  expect(result.ledger?.error).toBe("ledger unavailable");
});

test("a missing or malformed collection is an error, while a real empty collection stays empty", async () => {
  for (const response of [{}, { balances: null }, { balances: [null] }]) {
    const result = await readAccountSections({ balances: { request: Promise.resolve(response), array: "balances" } });
    expect(result.balances?.response).toBeNull();
    expect(result.balances?.error).toContain("格式异常");
  }
  const result = await readAccountSections({ balances: { request: Promise.resolve({ balances: [] }), array: "balances" } });
  expect(result.balances?.error).toBe("");
  expect(result.balances?.response?.balances).toEqual([]);
});

test("conflicting response ownership cannot be shown under the selected user and product", async () => {
  const result = await readAccountSections({ balances: {
    request: Promise.resolve({ balances: [{ userId: "2", productLine: "SPOT" }] }),
    array: "balances", expected: { userId: "1", productLine: "OPTION" }
  } });
  expect(result.balances?.response).toBeNull();
  expect(result.balances?.error).toContain("不一致");
});
