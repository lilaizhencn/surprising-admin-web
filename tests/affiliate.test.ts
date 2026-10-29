import { installConfigFixture } from "./configFixture";
import { afterEach, beforeEach, expect, test } from "bun:test";
installConfigFixture();
const { affiliateAdmin } = await import("../src/api/affiliate");
const { saveSession } = await import("../src/api/client");
const originalFetch = globalThis.fetch;
const source = () => ({
  productLine: "SPOT",
  clusterPosition: "9007199254740993",
  orderId: "42",
  readClusterPosition: "9007199254740993",
  readOrderId: "44",
  deferredCount: "1",
  oldestDeferredAt: "2026-10-28T01:00:00Z",
  checkedAt: "2026-10-29T01:00:00Z",
  error: "存在隔离待核算费用",
});
beforeEach(() => {
  const storage = new Map<string, string>();
  Object.assign(globalThis, {
    window: new EventTarget(),
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  saveSession({
    user: {
      userId: "9",
      username: "QA",
      roles: ["ADMIN"],
      status: "NORMAL",
      createdAt: "2026-10-20T00:00:00Z",
    },
    accessToken: "qa",
    refreshToken: "refresh",
    accessTokenExpiresAt: "2099-01-01T00:00:00Z",
    refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
function response(sources: unknown[]) {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          settings: {
            version: 1,
            referralRatePpm: 200000,
            kolRatePpm: 200000,
            settlementHours: 24,
          },
          sources,
          profiles: [],
          budgets: [],
          payouts: [],
        }),
      ),
    )) as typeof fetch;
}
test("received and confirmed checkpoints stay exact and distinct", async () => {
  response([source()]);
  const result = await affiliateAdmin.load("0");
  expect(result.sources[0]).toMatchObject({
    clusterPosition: "9007199254740993",
    orderId: "42",
    readOrderId: "44",
    deferredCount: "1",
  });
});
test("missing deferred count is an invalid response rather than a fabricated zero", async () => {
  const row: Record<string, unknown> = source();
  delete row.deferredCount;
  response([row]);
  await expect(affiliateAdmin.load("0")).rejects.toThrow("返佣响应不完整");
});
test("confirmation cannot exceed the received checkpoint", async () => {
  response([{ ...source(), orderId: "45" }]);
  await expect(affiliateAdmin.load("0")).rejects.toThrow("返佣响应不完整");
});
test("unresolved fees must carry their oldest source time", async () => {
  response([{ ...source(), oldestDeferredAt: null }]);
  await expect(affiliateAdmin.load("0")).rejects.toThrow("返佣响应不完整");
});
test("different product queues are preserved separately", async () => {
  response([
    source(),
    {
      ...source(),
      productLine: "LINEAR_PERPETUAL",
      deferredCount: "0",
      oldestDeferredAt: null,
    },
  ]);
  expect(
    (await affiliateAdmin.load("0")).sources.map((row) => [
      row.productLine,
      row.deferredCount,
    ]),
  ).toEqual([
    ["SPOT", "1"],
    ["LINEAR_PERPETUAL", "0"],
  ]);
});
