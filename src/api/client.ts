import { config } from "../config";
import type { AuthSession } from "../types";
import { positiveInt64 } from "../lib/integers";

/** Preserve financial integers before JavaScript rounds them during JSON parsing. */
export function parseApiJson<T>(text: string): T {
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number" || !Number.isInteger(value) || Number.isSafeInteger(value)) return value;
    if (context?.source && /^-?\d+$/.test(context.source)) return context.source;
    throw new Error("浏览器无法无损读取此大整数，请升级浏览器后重新加载；本次数据未载入。");
  }) as T;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly payload: unknown, readonly retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "ApiError";
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function validateSession(value: unknown): AuthSession {
  const session = object(value);
  const user = object(session?.user);
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const optionalText = (value: unknown) => value == null || typeof value === "string";
  const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  if (!session || !user || !optionalText(user.username) || !optionalText(user.email)
      || !text(user.status) || !date(user.createdAt)
      || !Array.isArray(user.roles) || user.roles.length > 100 || !user.roles.every(text)
      || !text(session.accessToken) || (session.browserSession !== true && !text(session.refreshToken))
      || !date(session.accessTokenExpiresAt) || !date(session.refreshTokenExpiresAt)
      || Date.parse(session.refreshTokenExpiresAt as string) <= Date.now()) {
    throw new Error("登录会话已失效，请重新登录。");
  }
  positiveInt64(user.userId, "登录用户 ID");
  return session as unknown as AuthSession;
}

// Access credentials stay in this tab's memory. Only non-secret preferences/device IDs use storage.
let memorySession: AuthSession | null = null;
export function loadSession(): AuthSession | null {
  try { localStorage.removeItem(config.sessionKey); } catch { /* Storage may be disabled. */ }
  try { return memorySession ? validateSession(memorySession) : null; }
  catch { memorySession = null; return null; }
}

export function saveSession(session: AuthSession | null) {
  memorySession = session === null ? null : validateSession(session);
  try { localStorage.removeItem(config.sessionKey); } catch { /* Storage may be disabled. */ }
  window.dispatchEvent(new Event("surprising-admin.session-changed"));
}

export async function restoreBrowserSession(): Promise<void> {
  try { saveSession(validateSession(await request("/api/v1/auth/browser/refresh", { method: "POST", body: "{}" }, null, false))); }
  catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; }
}

export async function logoutBrowserSession(): Promise<void> {
  await request("/api/v1/auth/browser/logout", { method: "POST", body: "{}" }, null, false);
  saveSession(null);
}

export function adminGatewayPath(service: string, path = "") {
  const normalizedPath = path && path.startsWith("/") ? path : `/${path}`;
  return `/api/v1/admin/gateway/${service}${path ? normalizedPath : ""}`;
}

export function queryString(params: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const value = query.toString();
  return value ? `?${value}` : "";
}

export interface AdminRequestInit extends RequestInit {
  productLine?: string;
  expectedUserId?: string;
  /** Deadline includes refresh, headers, body and decoding. */
  timeoutMs?: number;
  maxResponseBytes?: number;
}

function requireOwner(expectedUserId?: string) {
  if (expectedUserId !== undefined && String(loadSession()?.user.userId ?? "") !== expectedUserId)
    throw new ApiError(401, "登录账号已变化，请重新打开当前页面。", null);
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function readBody(response: Response, signal: AbortSignal, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  const tooLarge = () => new ApiError(413, "响应内容超过大小限制，请缩小查询或导出范围。", null);
  if (Number(response.headers.get("Content-Length")) > maximum) {
    void response.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await untilAborted(reader.read(), signal);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) throw tooLarge();
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

function apiError(response: Response, text: string) {
  let payload: unknown = text;
  try { payload = text ? parseApiJson(text) : null; } catch { /* Preserve non-JSON error bodies. */ }
  const header = response.headers.get("Retry-After")?.trim();
  const delay = header ? (/^\d+$/.test(header) ? Number(header) : (Date.parse(header) - Date.now()) / 1000) : NaN;
  const retryAfter = Number.isFinite(delay) ? Math.max(1, Math.ceil(delay)) : null;
  if (response.status === 429) return new ApiError(429,
    retryAfter === null ? "请求过于频繁，请稍后重试。" : `请求过于频繁，请在 ${retryAfter} 秒后重试。`, payload, retryAfter);
  const code = object(payload)?.code;
  if (code === "REQUEST_EXCEEDS_RATE_BURST") return new ApiError(response.status, "请减小批量数量或查询条数后重试。", payload, retryAfter);
  if (code === "GATEWAY_BUSY" || code === "RATE_LIMIT_STORAGE_UNAVAILABLE")
    return new ApiError(response.status, "网关暂时繁忙，请先核对操作结果后重试。", payload, retryAfter);
  const message = typeof payload === "object" && payload && "message" in payload
    ? String((payload as { message?: unknown }).message) : `${response.status} ${response.statusText}`;
  return new ApiError(response.status, message, payload, retryAfter);
}

async function fetchBody(path: string, init: AdminRequestInit, session: AuthSession | null, signal: AbortSignal, blob: boolean, allowRefresh: boolean): Promise<{ response: Response; bytes: Uint8Array<ArrayBuffer> }> {
  const { productLine, expectedUserId, timeoutMs: _timeout, maxResponseBytes, ...requestInit } = init;
  requireOwner(expectedUserId);
  const headers = new Headers(requestInit.headers);
  if (!blob && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
  if (productLine) headers.set("X-Product-Line", productLine);
  signal.throwIfAborted();
  const browserAuth = path.startsWith("/api/v1/auth/") && (requestInit.method ?? "GET") !== "GET";
  const send = async () => {
  if (browserAuth) {
    const csrfResponse = await untilAborted(fetch(`${config.gatewayBaseUrl}/api/v1/auth/csrf`, { credentials: "include", headers: {"X-Auth-Client": "admin"}, signal }), signal);
    const csrfText = new TextDecoder().decode(await readBody(csrfResponse, signal, 2048));
    if (!csrfResponse.ok) throw apiError(csrfResponse, csrfText);
    const csrf = parseApiJson<{token: string}>(csrfText);
    if (typeof csrf.token !== "string" || csrf.token.length > 512) throw new Error("无法建立安全登录会话，请稍后重试。");
    headers.set("X-XSRF-TOKEN", csrf.token);
    headers.set("X-Auth-Transport", "cookie");
    headers.set("X-Auth-Client", "admin");
    if (!path.endsWith("/verify-email") && !path.endsWith("/resend-email-verification")) headers.delete("Authorization");
  }
  const response = await untilAborted(fetch(`${config.gatewayBaseUrl}${path}`, { ...requestInit, credentials: browserAuth ? "include" : "omit", headers, signal }), signal);
    return response;
  };
  if (browserAuth && (typeof navigator === "undefined" || !navigator.locks))
    throw new ApiError(0, "请升级浏览器后使用安全登录。", null);
  const response = browserAuth
    ? await navigator.locks.request("surprising-admin-browser-session", { signal }, send) : await send();
  try { requireOwner(expectedUserId); }
  catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
  if (response.status === 401 && allowRefresh && session && !path.startsWith("/api/v1/auth/")) {
    void response.body?.cancel().catch(() => {});
    const refreshed = await untilAborted(refreshSession(session.accessToken), signal);
    return fetchBody(path, init, refreshed, signal, blob, false);
  }
  const bytes = await readBody(response, signal, maxResponseBytes ?? (blob ? 64 : 8) * 1024 * 1024);
  requireOwner(expectedUserId);
  if (!response.ok) throw apiError(response, new TextDecoder().decode(bytes));
  return { response, bytes };
}

async function withDeadline<T>(init: AdminRequestInit, fallback: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const timeout = init.timeoutMs ?? fallback;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("请求截止时间必须为正数。");
  if (init.maxResponseBytes !== undefined && (!Number.isSafeInteger(init.maxResponseBytes) || init.maxResponseBytes <= 0)) throw new Error("响应大小限制必须为正整数。");
  const controller = new AbortController();
  const expiresAt = performance.now() + timeout;
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new ApiError(408, "请求超时。写操作结果可能尚未确认，请先查询状态后再操作。", null)), timeout);
  try {
    controller.signal.throwIfAborted();
    const result = await untilAborted(run(controller.signal), controller.signal);
    if (performance.now() >= expiresAt && !controller.signal.aborted) controller.abort(new ApiError(408, "请求超时，请先核对操作状态。", null));
    controller.signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}

export async function request<T>(path: string, init: AdminRequestInit = {}, session = loadSession(), allowRefresh = true): Promise<T> {
  init = { ...init, expectedUserId: init.expectedUserId ?? (session ? String(session.user.userId) : undefined) };
  return withDeadline(init, 15_000, async signal => {
    const { bytes } = await fetchBody(path, init, session, signal, false, allowRefresh);
    const text = new TextDecoder().decode(bytes);
    return text ? parseApiJson<T>(text) : undefined as T;
  });
}

/** File downloads share authentication, ownership, size and deadline checks. */
export async function requestFile(path: string, init: AdminRequestInit = {}, session = loadSession(), allowRefresh = true): Promise<{ blob: Blob; headers: Headers }> {
  init = { ...init, expectedUserId: init.expectedUserId ?? (session ? String(session.user.userId) : undefined) };
  return withDeadline(init, 120_000, async signal => {
    const { response, bytes } = await fetchBody(path, init, session, signal, true, allowRefresh);
    return { blob: new Blob([bytes], { type: response.headers.get("Content-Type") ?? "" }), headers: response.headers };
  });
}

export async function requestBlob(path: string, init: AdminRequestInit = {}, session = loadSession(), allowRefresh = true): Promise<Blob> {
  return (await requestFile(path, init, session, allowRefresh)).blob;
}

let refreshInFlight: { token: string; promise: Promise<AuthSession> } | null = null;
function refreshSession(accessToken: string): Promise<AuthSession> {
  if (refreshInFlight?.token === accessToken) return refreshInFlight.promise;
  const promise = refreshSessionOnce(accessToken).finally(() => {
    if (refreshInFlight?.promise === promise) refreshInFlight = null;
  });
  refreshInFlight = { token: accessToken, promise };
  return promise;
}

async function refreshSessionOnce(accessToken: string): Promise<AuthSession> {
  const owner = String(loadSession()?.user.userId);
  const current = () => loadSession()?.accessToken === accessToken && String(loadSession()?.user.userId) === owner;
  if (!current()) throw new ApiError(401, "登录会话已变化，请重新打开当前页面。", null);
  try {
    const next = validateSession(await request<unknown>("/api/v1/auth/browser/refresh", {
      method: "POST", body: "{}"
    }, null, false));
    if (!current()) throw new ApiError(401, "登录会话已变化，请重新打开当前页面。", null);
    if (String(next.user.userId) !== String(loadSession()?.user.userId)) throw new Error("刷新身份与当前账号不一致，请重新登录。");
    saveSession(next);
    return next;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403) && current()) saveSession(null);
    throw error;
  }
}
