import { config } from "../config";
import type { AuthSession } from "../types";

/** Preserve financial integers before JavaScript rounds them during JSON parsing. */
export function parseApiJson<T>(text: string): T {
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number" || !Number.isInteger(value) || Number.isSafeInteger(value)) return value;
    if (context?.source && /^-?\d+$/.test(context.source)) return context.source;
    throw new Error("浏览器无法无损读取此大整数，请升级浏览器后重新加载；本次数据未载入。");
  }) as T;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(config.sessionKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(config.sessionKey);
    return null;
  }
}

export function saveSession(session: AuthSession | null) {
  if (!session) {
    localStorage.removeItem(config.sessionKey);
    window.dispatchEvent(new Event("surprising-admin.session-changed"));
    return;
  }
  localStorage.setItem(config.sessionKey, JSON.stringify(session));
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
}

function requireOwner(expectedUserId?: string) {
  if (expectedUserId !== undefined && String(loadSession()?.user.userId ?? "") !== expectedUserId)
    throw new ApiError(401, "登录账号已变化，请重新打开当前页面。", null);
}

export async function request<T>(path: string, init: AdminRequestInit = {}, session = loadSession(), allowRefresh = true): Promise<T> {
  const { productLine, expectedUserId, ...requestInit } = init;
  requireOwner(expectedUserId);
  const headers = new Headers(requestInit.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  if (productLine) {
    headers.set("X-Product-Line", productLine);
  }
  const response = await fetch(`${config.gatewayBaseUrl}${path}`, {
    ...requestInit,
    headers
  });
  requireOwner(expectedUserId);
  if (response.status === 401 && allowRefresh && session?.refreshToken && !path.endsWith("/auth/refresh")) {
    const refreshed = await refreshSession(session.refreshToken);
    return request<T>(path, init, refreshed, false);
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  requireOwner(expectedUserId);
  return text ? parseApiJson<T>(text) : undefined as T;
}

export async function requestBlob(path: string, init: AdminRequestInit = {}, session = loadSession(), allowRefresh = true): Promise<Blob> {
  const { productLine, expectedUserId, ...requestInit } = init;
  requireOwner(expectedUserId);
  const headers = new Headers(requestInit.headers);
  if (productLine) {
    headers.set("X-Product-Line", productLine);
  }
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  const response = await fetch(`${config.gatewayBaseUrl}${path}`, {
    ...requestInit,
    headers
  });
  requireOwner(expectedUserId);
  if (response.status === 401 && allowRefresh && session?.refreshToken && !path.endsWith("/auth/refresh")) {
    const refreshed = await refreshSession(session.refreshToken);
    return requestBlob(path, init, refreshed, false);
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  const blob = await response.blob();
  requireOwner(expectedUserId);
  return blob;
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
  const response = await fetch(`${config.gatewayBaseUrl}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  if (!response.ok) {
    if (current()) saveSession(null);
    throw await toApiError(response);
  }
  const next = parseApiJson<AuthSession>(await response.text());
  if (!current()) throw new ApiError(401, "登录会话已变化，请重新打开当前页面。", null);
  saveSession(next);
  return next;
}

async function toApiError(response: Response) {
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  const message = typeof payload === "object" && payload && "message" in payload
    ? String((payload as { message?: unknown }).message)
    : `${response.status} ${response.statusText}`;
  return new ApiError(response.status, message, payload);
}
