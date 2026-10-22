import { mock } from "bun:test";

/** Network tests never contact a real gateway; UI tests still import the full module shape. */
export function installConfigFixture() {
  mock.module("../src/config", () => ({
    config: { gatewayBaseUrl: "http://qa.invalid", sessionKey: "surprising-admin.session" },
    compactNumber: (value: unknown) => String(value ?? "-"),
    formatDate: (value: unknown) => String(value ?? "-"),
    formatValue: (value: unknown) => String(value ?? "-")
  }));
}
