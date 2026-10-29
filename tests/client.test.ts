import { installConfigFixture } from "./configFixture";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
installConfigFixture();
const { request, requestBlob, saveSession, loadSession, parseApiJson, validateSession } = await import(
  "../src/api/client"
);
const originalFetch = globalThis.fetch;
// The public CSRF token endpoint is part of this HTTP fixture; individual mocks exercise business/refresh responses.
function installTransport(handler: typeof fetch) {
  globalThis.fetch = ((input, init) => String(input).endsWith("/auth/csrf")
    ? Promise.resolve(json({token: "csrf-test"})) : handler(input, init)) as typeof fetch;
}
const session = (id = 9, token = "old") => ({
  user: {
    userId: id,
    roles: ["ADMIN"],
    username: "QA",
    status: "NORMAL",
    createdAt: "2026-10-20T00:00:00Z",
  },
  accessToken: token,
  refreshToken: null,
  browserSession: true,
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: { request: (_name: string, _options: unknown, run: () => unknown) => Promise.resolve(run()) } } });
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
  test("429 exposes Retry-After for mutations and downloads without repeating them", async () => {
    const fetch = mock(async () => new Response('{"code":"RATE_LIMITED"}', { status: 429, headers: { "Retry-After": "12" } }));
    installTransport(fetch);
    for (const operation of [() => request("/private", { method: "POST", body: "{}" }), () => requestBlob("/export")]) {
      await expect(operation()).rejects.toMatchObject({ status: 429, retryAfterSeconds: 12, message: expect.stringContaining("12 秒") });
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(loadSession()?.user.userId).toBe(9);
  });
  test("never fetches a private file or history under a different owner", async () => {
    const fetch = mock(async () => json({}));
    installTransport(fetch);
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
    installTransport(fetch);
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
    installTransport(mock(async (url) => {
      if (String(url).endsWith("/auth/browser/refresh")) {
        open();
        await waiting;
        return json(session(9, "new"));
      }
      return json({}, 401);
    }));
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
    installTransport(mock(async (url, init) => {
      if (String(url).endsWith("/auth/browser/refresh")) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return json(session(9, "new"));
      }
      return new Headers(init?.headers).get("Authorization") === "Bearer new"
        ? json({ ok: true })
        : json({}, 401);
    }));
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
    installTransport(mock(async (url) => {
      if (String(url).endsWith("/auth/browser/refresh")) {
        refreshes++;
        return json(session(9, "new"));
      }
      return json({}, 401);
    }));
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
    installTransport(mock(
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
    ));
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

describe("session boundary", () => {
  test.each([
    { username: null, email: "admin@example.test" },
    { email: "admin@example.test" },
    { username: null, email: null },
    {},
  ])("nullable login labels preserve a valid session: %j", labels => {
    const { username: _username, ...user } = session().user;
    const value = { ...session(), user: { ...user, ...labels } };
    expect(validateSession(value)).toEqual(value);
    saveSession(null);
    saveSession(null);
    localStorage.setItem("surprising-admin.session", JSON.stringify(value));
    expect(loadSession()).toBeNull();
    saveSession(validateSession(value));
    expect(loadSession()).toEqual(value);
  });
  test.each([
    { username: 42, email: "admin@example.test" },
    { username: {}, email: "admin@example.test" },
    { username: "QA", email: [] },
    { username: "QA", email: true },
  ])("malformed login labels are rejected: %j", labels => {
    const value = { ...session(), user: { ...session().user, ...labels } };
    expect(() => validateSession(value)).toThrow("登录会话已失效");
    saveSession(null);
    localStorage.setItem("surprising-admin.session", JSON.stringify(value));
    expect(loadSession()).toBeNull();
  });
  test.each([null, {}, { user: { userId: 1 }, accessToken: "audit" }, { ...session(), user: { ...session().user, roles: "ADMIN" } }, { ...session(), refreshTokenExpiresAt: "invalid" }, { ...session(), refreshTokenExpiresAt: "2000-01-01T00:00:00Z" }])("bad stored sessions recover to login: %j", value => {
    saveSession(null);
    localStorage.setItem("surprising-admin.session", JSON.stringify(value));
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem("surprising-admin.session")).toBeNull();
  });
  test("a long user ID remains exact in a valid stored session", () => {
    const raw = JSON.stringify(session()).replace('"userId":9', '"userId":9223372036854775807');
    saveSession(validateSession(parseApiJson(raw)));
    expect(String(loadSession()?.user.userId)).toBe("9223372036854775807");
    expect(localStorage.getItem("surprising-admin.session")).toBeNull();
  });
  test("storage denial and a blocked write keep only this tab's session", () => {
    const denied = () => { throw new DOMException("blocked", "SecurityError"); };
    Object.assign(globalThis, { localStorage: { getItem: denied, setItem: denied, removeItem: denied } });
    expect(() => saveSession(session(10))).not.toThrow();
    expect(loadSession()?.user.userId).toBe(10);
    saveSession(null);
    expect(loadSession()).toBeNull();
  });
});

describe("refresh failure classification", () => {
  test.each([503, 500, 429])("transient refresh status %i preserves the session and never repeats a write", async status => {
    let writes = 0;
    installTransport(mock(async url => {
      if (String(url).endsWith("/auth/browser/refresh")) return json({ message: "temporarily unavailable" }, status);
      writes++;
      return json({}, 401);
    }));
    await expect(request("/write", { method: "POST", body: "{}" })).rejects.toHaveProperty("status", status);
    expect(loadSession()?.accessToken).toBe("old");
    expect(writes).toBe(1);
  });
  test("a network refresh failure preserves the session", async () => {
    installTransport(mock(async url => {
      if (String(url).endsWith("/auth/browser/refresh")) throw new TypeError("offline");
      return json({}, 401);
    }));
    await expect(request("/private")).rejects.toThrow("offline");
    expect(loadSession()?.accessToken).toBe("old");
  });
  test.each([401, 403])("confirmed refresh rejection %i clears this session", async status => {
    installTransport(mock(async url => json({}, String(url).endsWith("/auth/browser/refresh") ? status : 401)));
    await expect(request("/private")).rejects.toHaveProperty("status", status);
    expect(loadSession()).toBeNull();
  });
  test("an unexpected refresh identity cannot replace the logged-in user", async () => {
    installTransport(mock(async url => String(url).endsWith("/auth/browser/refresh") ? json(session(10, "new")) : json({}, 401)));
    await expect(request("/private")).rejects.toThrow("身份");
    expect(loadSession()?.user.userId).toBe(9);
  });
});

describe("complete request deadline and body limits", () => {
  test("slow headers are aborted once; writes are not automatically retried", async () => {
    let signal: AbortSignal | undefined;
    const send = mock((_url: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Promise<Response>(() => {}); });
    installTransport(send);
    await expect(request("/write", { method: "POST", timeoutMs: 25 })).rejects.toHaveProperty("status", 408);
    expect(signal?.aborted).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
  test.each([false, true])("unfinished response body is cancelled for blob=%p", async blob => {
    let cancelled = false;
    installTransport(mock(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"ok":')); },
      cancel() { cancelled = true; }
    }))));
    const result = blob ? requestBlob("/file", { timeoutMs: 25 }) : request("/json", { timeoutMs: 25 });
    await expect(result).rejects.toHaveProperty("status", 408);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(cancelled).toBe(true);
  });
  test("caller cancellation also closes a body stream", async () => {
    let cancelled = false;
    installTransport(mock(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }))));
    const abort = new AbortController();
    const result = request("/json", { signal: abort.signal });
    await new Promise(resolve => setTimeout(resolve, 0));
    abort.abort(new DOMException("navigation", "AbortError"));
    await expect(result).rejects.toThrow("navigation");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(cancelled).toBe(true);
  });
  test("aborted requests never start a fetch", async () => {
    const send = mock(async () => json({})); installTransport(send);
    const abort = new AbortController(); abort.abort();
    await expect(request("/json", { signal: abort.signal })).rejects.toHaveProperty("name", "AbortError");
    expect(send).not.toHaveBeenCalled();
  });
  test.each([false, true])("stream size limit cancels without waiting for EOF, blob=%p", async blob => {
    let cancelled = false;
    installTransport(mock(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(17)); },
      cancel() { cancelled = true; }
    }))));
    const result = blob ? requestBlob("/file", { maxResponseBytes: 16 }) : request("/json", { maxResponseBytes: 16 });
    await expect(result).rejects.toHaveProperty("status", 413);
    expect(cancelled).toBe(true);
  });
  test("declared oversize is rejected before body decoding", async () => {
    installTransport(mock(async () => new Response("{}", { headers: { "Content-Length": "17" } })));
    await expect(request("/json", { maxResponseBytes: 16 })).rejects.toHaveProperty("status", 413);
  });
  test("the original deadline remains in force while a shared refresh is waiting", async () => {
    let opened!: () => void;
    const refreshOpened = new Promise<void>(resolve => { opened = resolve; });
    let release!: () => void;
    const refreshWaiting = new Promise<void>(resolve => { release = resolve; });
    installTransport(mock(async url => {
      if (String(url).endsWith("/auth/browser/refresh")) { opened(); await refreshWaiting; return json(session(9, "new")); }
      return json({}, 401);
    }));
    const result = request("/private", { timeoutMs: 25 });
    await refreshOpened;
    await expect(result).rejects.toHaveProperty("status", 408);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});

test("a real HTTP response with headers and an unfinished body reaches the application deadline", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch() {
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"unfinished":')); } }), { headers: { "Content-Type": "application/json" } });
    }
  });
  installTransport(((url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    return originalFetch(new URL(path, server.url), init);
  }) as typeof fetch);
  const started = performance.now();
  try {
    await expect(request("/unfinished", { timeoutMs: 100 })).rejects.toHaveProperty("status", 408);
    expect(performance.now() - started).toBeLessThan(1000);
  } finally { await server.stop(true); }
});
