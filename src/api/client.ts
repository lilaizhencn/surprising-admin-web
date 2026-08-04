import { config } from "../config";
import type { AuthSession } from "../types";

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
    return;
  }
  localStorage.setItem(config.sessionKey, JSON.stringify(session));
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
}

export async function request<T>(path: string, init: AdminRequestInit = {}, session = loadSession()): Promise<T> {
  const { productLine, ...requestInit } = init;
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
  if (response.status === 401 && session?.refreshToken && !path.endsWith("/auth/refresh")) {
    const refreshed = await refreshSession(session.refreshToken);
    return request<T>(path, init, refreshed);
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? JSON.parse(text) as T : undefined as T;
}

export async function requestBlob(path: string, init: AdminRequestInit = {}, session = loadSession()): Promise<Blob> {
  const { productLine, ...requestInit } = init;
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
  if (response.status === 401 && session?.refreshToken && !path.endsWith("/auth/refresh")) {
    const refreshed = await refreshSession(session.refreshToken);
    return requestBlob(path, init, refreshed);
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  return response.blob();
}

async function refreshSession(refreshToken: string): Promise<AuthSession> {
  const response = await fetch(`${config.gatewayBaseUrl}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  if (!response.ok) {
    saveSession(null);
    throw await toApiError(response);
  }
  const next = await response.json() as AuthSession;
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
