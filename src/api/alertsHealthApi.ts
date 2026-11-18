import type { UnknownRecord } from "../types";
import { gatewayGet } from "./adminCore";
import { queryString, request } from "./client";

export function systemRoutes() {
  return request<UnknownRecord>("/api/v1/admin/system/routes");
}

export function systemHealth(params: { includePublicRoutes?: boolean } = {}) {
  return request<UnknownRecord>(`/api/v1/admin/system/health${queryString(params)}`);
}

export function adminWebSocketMetrics() {
  return request<UnknownRecord>("/api/v1/admin/websocket/metrics");
}

export function tradingMetrics(params: { windowMinutes?: number; productLine?: string; limit?: number } = {}) {
  return gatewayGet<UnknownRecord>("trading-orders", "/metrics", params);
}
