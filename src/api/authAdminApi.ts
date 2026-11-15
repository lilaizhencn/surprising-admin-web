import type { AuthenticatedUser, AuthSession, UnknownRecord } from "../types";
import { adminLocalWrite } from "./adminCore";
import { loadSession, request } from "./client";

export function login(username: string, password: string, totpCode?: string) {
  return request<AuthSession>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password, totpCode: totpCode || undefined })
  }, null);
}

export function me(session?: AuthSession | null) {
  return request<AuthenticatedUser>("/api/v1/auth/me", {}, session || null);
}

export function mfaStatus() {
  return request<UnknownRecord>("/api/v1/admin/security/mfa");
}

export function enrollMfa() {
  return request<UnknownRecord>("/api/v1/admin/security/mfa/enroll", { method: "POST" });
}

export function confirmMfa(totpCode: string) {
  return request<UnknownRecord>("/api/v1/admin/security/mfa/confirm", {
    method: "POST",
    body: JSON.stringify({ totpCode })
  });
}

export function disableMfa(totpCode: string) {
  return request<UnknownRecord>("/api/v1/admin/security/mfa/disable", {
    method: "POST",
    body: JSON.stringify({ totpCode })
  });
}

export function adminRoles(signal?: AbortSignal) {
  return request<{ count: number; roles: UnknownRecord[] }>("/api/v1/admin/roles", { signal, expectedUserId: String(loadSession()?.user.userId ?? "") });
}

export function adminPermissions(signal?: AbortSignal) {
  return request<{ count: number; permissions: UnknownRecord[] }>("/api/v1/admin/permissions", { signal, expectedUserId: String(loadSession()?.user.userId ?? "") });
}

export function getRolePermissions(roleCode: string, signal?: AbortSignal) {
  return request<{ roleCode: string; permissions: string[] }>(
    `/api/v1/admin/roles/${encodeURIComponent(roleCode)}/permissions`, { signal, expectedUserId: String(loadSession()?.user.userId ?? "") }
  );
}

export function replaceRolePermissions(roleCode: string, permissions: string[]) {
  return adminLocalWrite<{ roleCode: string; permissions: string[] }>(
    "POST",
    `/api/v1/admin/roles/${encodeURIComponent(roleCode)}/permissions`,
    { permissions }
  );
}
