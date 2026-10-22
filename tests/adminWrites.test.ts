import { installConfigFixture } from "./configFixture";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
installConfigFixture();
const { gatewayPost, gatewayPatch, adminLocalWrite, setApprovalRequestHandler } = await import("../src/api/admin");
const { saveSession } = await import("../src/api/client");
const originalFetch = globalThis.fetch;
const session = (id = 9) => ({ user: { userId: id, username: "QA", roles: ["ADMIN"], status: "NORMAL", createdAt: "2026-10-20T00:00:00Z" }, accessToken: `qa-${id}`, refreshToken: `refresh-${id}`, accessTokenExpiresAt: "2099-01-01T00:00:00Z", refreshTokenExpiresAt: "2099-01-01T00:00:00Z" });
beforeEach(() => {
  const storage = new Map<string, string>();
  Object.assign(globalThis, { window: new EventTarget(), localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
  saveSession(session());
});
afterEach(() => { globalThis.fetch = originalFetch; setApprovalRequestHandler(null); });

describe("admin approval execution", () => {
  test.each(["/balance-adjustments", "/product-balance-adjustments"])("%s preserves the exact input through approval and execution", async path => {
    const body = { userId: "9007199254740993", asset: "USDT", amountUnits: "-9223372036854775808", reason: "核对精度", referenceId: "audit-original" };
    let hash = "";
    setApprovalRequestHandler(async context => { hash = context.requestBodySha256!; return { approvalId: "42" }; });
    const send = mock(async () => new Response("{}")); globalThis.fetch = send;
    await gatewayPost("account", path, body, { productLine: "SPOT" });
    const init = send.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(JSON.stringify(body));
    expect(JSON.parse(String(init.body))).toMatchObject({ userId: "9007199254740993", amountUnits: "-9223372036854775808" });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(init.body)));
    expect(hash).toBe(Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join(""));
    expect(new Headers(init.headers).get("X-Admin-Approval-Id")).toBe("42");
  });
  test("invalid financial values fail before creating an approval or issuing a request", async () => {
    const approval = mock(async () => ({ approvalId: "42" })); setApprovalRequestHandler(approval);
    const send = mock(async () => new Response("{}")); globalThis.fetch = send;
    await expect(gatewayPost("account", "/balance-adjustments", { userId: "9", amountUnits: "1.5" })).rejects.toThrow();
    await expect(gatewayPost("insurance-admin", "/fund-adjustments", { amountUnits: Number("9007199254740993") })).rejects.toThrow();
    expect(approval).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  test.each([false, true])("an account change during approval prevents gateway/local execution, local=%p", async local => {
    let entered!: () => void, finish!: () => void;
    const opened = new Promise<void>(resolve => { entered = resolve; });
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    setApprovalRequestHandler(async () => { entered(); await waiting; return { approvalId: "42" }; });
    const send = mock(async () => new Response("{}")); globalThis.fetch = send;
    const result = local ? adminLocalWrite("POST", "/api/v1/admin/users/1/status", { status: "FROZEN" }) : gatewayPatch("account", "/balance-adjustments", { userId: "9", amountUnits: "1" });
    await opened; saveSession(session(10)); finish();
    await expect(result).rejects.toThrow("账号已变化"); expect(send).not.toHaveBeenCalled();
  });
});
