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
      || !text(session.accessToken) || !text(session.refreshToken)
      || !date(session.accessTokenExpiresAt) || !date(session.refreshTokenExpiresAt)
      || Date.parse(session.refreshTokenExpiresAt as string) <= Date.now()) {
    throw new Error("登录会话已失效，请重新登录。");
  }
  positiveInt64(user.userId, "登录用户 ID");
  return session as unknown as AuthSession;
}

// When browser storage is unavailable, keep only this tab's current session in memory.
let memorySession: AuthSession | null = null;
let storageUnavailable = false;
export function loadSession(): AuthSession | null {
  if (storageUnavailable) {
    try { return memorySession ? validateSession(memorySession) : null; } catch { memorySession = null; return null; }
  }
  let raw: string | null;
  try { raw = localStorage.getItem(config.sessionKey); }
  catch { storageUnavailable = true; return memorySession; }
  if (!raw) { memorySession = null; return null; }
  try { return memorySession = validateSession(parseApiJson<unknown>(raw)); }
  catch {
    memorySession = null;
    try { localStorage.removeItem(config.sessionKey); } catch { /* Storage may be read-only. */ }
    return null;
  }
}

export function saveSession(session: AuthSession | null) {
  memorySession = session === null ? null : validateSession(session);
  try {
    if (memorySession) localStorage.setItem(config.sessionKey, JSON.stringify(memorySession));
    else localStorage.removeItem(config.sessionKey);
    storageUnavailable = false;
  } catch { storageUnavailable = true; }
  window.dispatchEvent(new Event("surprising-admin.session-changed"));
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
  const response = await untilAborted(fetch(`${config.gatewayBaseUrl}${path}`, { ...requestInit, headers, signal }), signal);
  try { requireOwner(expectedUserId); }
  catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
  if (response.status === 401 && allowRefresh && session?.refreshToken && !path.endsWith("/auth/refresh")) {
    void response.body?.cancel().catch(() => {});
    const refreshed = await untilAborted(refreshSession(session.refreshToken), signal);
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
function refreshSession(refreshToken: string): Promise<AuthSession> {
  if (refreshInFlight?.token === refreshToken) return refreshInFlight.promise;
  const promise = refreshSessionOnce(refreshToken).finally(() => {
    if (refreshInFlight?.promise === promise) refreshInFlight = null;
  });
  refreshInFlight = { token: refreshToken, promise };
  return promise;
}

async function refreshSessionOnce(refreshToken: string): Promise<AuthSession> {
  const current = () => loadSession()?.refreshToken === refreshToken;
  if (!current()) throw new ApiError(401, "登录会话已变化，请重新打开当前页面。", null);
  try {
    const next = validateSession(await request<unknown>("/api/v1/auth/refresh", {
      method: "POST", body: JSON.stringify({ refreshToken })
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
