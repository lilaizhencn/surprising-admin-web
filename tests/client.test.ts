import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
mock.module("../src/config", () => ({
  config: {
    gatewayBaseUrl: "http://qa.invalid",
    sessionKey: "surprising-admin.session",
  },
}));
const { request, requestBlob, saveSession, loadSession, parseApiJson } = await import(
  "../src/api/client"
);
const originalFetch = globalThis.fetch;
const session = (id = 9, token = "old") => ({
  user: {
    userId: id,
    roles: ["ADMIN"],
    username: "QA",
    status: "NORMAL",
    createdAt: "2026-10-20T00:00:00Z",
  },
  accessToken: token,
  refreshToken: `refresh-${id}-${token}`,
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  const values = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    window: new EventTarget(),
  });
  saveSession(session());
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
describe("private admin requests", () => {
  test("never fetches a private file or history under a different owner", async () => {
    const fetch = mock(async () => json({}));
    globalThis.fetch = fetch;
    await expect(request("/private", { expectedUserId: "10" })).rejects.toThrow("账号已变化");
    await expect(requestBlob("/private/file", { expectedUserId: "10" })).rejects.toThrow(
      "账号已变化",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  test("a late 401 cannot refresh or restore the previous account", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = mock(async () => {
      await waiting;
      return json({}, 401);
    });
    globalThis.fetch = fetch;
    const result = request("/private", { expectedUserId: "9" });
    saveSession(session(10));
    release();
    await expect(result).rejects.toThrow("账号已变化");
    expect(loadSession()?.user.userId).toBe(10);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test("an in-flight refresh cannot overwrite a newer login", async () => {
    let open!: () => void, release!: () => void;
    const opened = new Promise<void>((resolve) => {
        open = resolve;
      }),
      waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
    globalThis.fetch = mock(async (url) => {
      if (String(url).endsWith("/auth/refresh")) {
        open();
        await waiting;
        return json(session(9, "new"));
      }
      return json({}, 401);
    });
    const result = request("/private", { expectedUserId: "9" });
    void result.catch(() => {});
    await opened;
    saveSession(session(10));
    release();
    await expect(result).rejects.toThrow("会话已变化");
    expect(loadSession()?.user.userId).toBe(10);
  });
  test("concurrent 401 responses share one rotating refresh", async () => {
    let refreshes = 0;
    globalThis.fetch = mock(async (url, init) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return json(session(9, "new"));
      }
      return new Headers(init?.headers).get("Authorization") === "Bearer new"
        ? json({ ok: true })
        : json({}, 401);
    });
    expect(
      await Promise.all([
        request("/one", { expectedUserId: "9" }),
        request("/two", { expectedUserId: "9" }),
      ]),
    ).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
  });
  test("a rejected refreshed token fails without an endless refresh loop", async () => {
    let refreshes = 0;
    globalThis.fetch = mock(async (url) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshes++;
        return json(session(9, "new"));
      }
      return json({}, 401);
    });
    await expect(request("/private", { expectedUserId: "9" })).rejects.toHaveProperty(
      "status",
      401,
    );
    expect(refreshes).toBe(1);
  });
  test("session changes during response body reading cannot return private content", async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    globalThis.fetch = mock(
      async () =>
        new Response(
          new ReadableStream({
            async start(controller) {
              await waiting;
              controller.enqueue(new TextEncoder().encode('{"private":"body"}'));
              controller.close();
            },
          }),
        ),
    );
    const result = request("/private", { expectedUserId: "9" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    saveSession(session(10));
    finish();
    await expect(result).rejects.toThrow("账号已变化");
  });
  test("unsafe JSON integers are preserved exactly rather than rounded", () => {
    expect(parseApiJson<{ id: string }>('{"id":9223372036854775807}').id).toBe(
      "9223372036854775807",
    );
  });
});
