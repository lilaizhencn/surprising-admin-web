import { mock } from "bun:test";

/** Network tests never contact a real gateway; UI tests still import the full module shape. */
export function installConfigFixture() {
  // 写请求需要 CSRF Cookie 的值；这里直接给一个，不让每个用例都去模拟 /auth/csrf。
  Object.assign(globalThis, { document: { cookie: "surprising-admin-csrf=csrf-test" } });
  mock.module("../src/config", () => ({
    config: { gatewayBaseUrl: "http://qa.invalid", sessionKey: "surprising-admin.session" },
    compactNumber: (value: unknown) => String(value ?? "-"),
    formatDate: (value: unknown) => String(value ?? "-"),
    formatValue: (value: unknown) => String(value ?? "-")
  }));
}
