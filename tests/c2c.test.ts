import { afterEach, beforeEach, expect, mock, test } from "bun:test";
mock.module("../src/config", () => ({
  config: {
    gatewayBaseUrl: "http://qa.invalid",
    sessionKey: "surprising-admin.session",
  },
}));
const { c2cReply, c2cReceipt, c2cHistory, c2cUnits, mergeC2cMessages, parseC2cMessage } =
  await import("../src/api/c2c");
const { saveSession } = await import("../src/api/client");
const { setApprovalRequestHandler } = await import("../src/api/admin");
const originalFetch = globalThis.fetch;
const order = "10000000-0000-4000-8000-000000000001";
const body = {
  requestId: "10000000-0000-4000-8000-000000000002",
  text: "客服核实中",
  attachmentId: null,
};
const message = (id = "9223372036854775807") => ({
  messageId: id,
  requestId: body.requestId,
  conversationId: order,
  senderUserId: "9",
  authorKind: "SUPPORT",
  text: body.text,
  attachment: null,
  createdAt: "2026-10-20T00:00:00Z",
  status: "SENT",
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => {
  const values = new Map<string, string>();
  Object.assign(globalThis, {
    window: new EventTarget(),
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  saveSession({
    user: {
      userId: 9,
      roles: ["ADMIN"],
      username: "QA",
      status: "NORMAL",
      createdAt: "",
    },
    accessToken: "qa-9",
    refreshToken: "qa-refresh",
    accessTokenExpiresAt: "2099-01-01T00:00:00Z",
    refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  setApprovalRequestHandler(null);
});
test("normal support reply sends the fixed original body once", async () => {
  const fetch = mock(async (_url, init) => {
    expect(JSON.parse(String(init?.body))).toEqual(body);
    return json(message());
  });
  globalThis.fetch = fetch;
  expect((await c2cReply("9", order, body)).authorKind).toBe("SUPPORT");
  expect(fetch).toHaveBeenCalledTimes(1);
});
test("required approval uses c2c service and the same exact reply hash and body", async () => {
  let posts = 0;
  let context: unknown;
  setApprovalRequestHandler(async (value) => {
    context = value;
    return { approvalId: "77" };
  });
  globalThis.fetch = mock(async (_url, init) => {
    posts++;
    expect(init?.body).toBe(JSON.stringify(body));
    if (posts === 1) return json({ code: "C2C_APPROVAL_REQUIRED", message: "需要审批" }, 403);
    expect(new Headers(init?.headers).get("X-Admin-Approval-Id")).toBe("77");
    return json(message());
  });
  await c2cReply("9", order, body);
  expect(posts).toBe(2);
  expect(context).toMatchObject({
    service: "c2c",
    method: "POST",
    requestPath: `/api/v1/admin/c2c/orders/${order}/chat`,
    query: "",
    requestBodySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
});
test("network uncertainty is not retried; an audited receipt can recover the own support message", async () => {
  const failed = mock(async () => {
    throw Error("offline");
  });
  globalThis.fetch = failed;
  await expect(c2cReply("9", order, body)).rejects.toThrow("offline");
  expect(failed).toHaveBeenCalledTimes(1);
  globalThis.fetch = mock(async (url, init) => {
    expect(init?.method).toBeUndefined();
    expect(String(url)).toEndWith(`/requests/${body.requestId}`);
    return json({ status: "SENT", message: message() });
  });
  expect((await c2cReceipt("9", order, body.requestId))?.messageId).toBe("9223372036854775807");
});
test("a different support identity cannot be mistaken for an own receipt", async () => {
  globalThis.fetch = mock(async () =>
    json({ status: "SENT", message: { ...message(), senderUserId: "10" } }),
  );
  await expect(c2cReceipt("9", order, body.requestId)).rejects.toThrow("身份不匹配");
});
test("recent history and exact numeric values follow server contracts", async () => {
  globalThis.fetch = mock(async (url) => {
    expect(String(url)).toEndWith("/chat?limit=50&latest=true");
    return json({
      messages: [message()],
      orderEvents: [],
      reads: [],
      hasMore: false,
      eventsHaveMore: false,
    });
  });
  await c2cHistory("9", order, { latest: true });
  expect(c2cUnits("9223372036854775807", "100000000")).toBe("92233720368.54775807");
  expect(
    mergeC2cMessages(
      [parseC2cMessage(message())],
      [parseC2cMessage(message("9223372036854775806")), parseC2cMessage(message())],
    ).map((m) => m.messageId),
  ).toEqual(["9223372036854775806", "9223372036854775807"]);
});
