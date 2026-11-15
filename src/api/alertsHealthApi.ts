import type { UnknownRecord } from "../types";
import { adminLocalWrite, type CursorListParams, type CursorPage, gatewayGet } from "./adminCore";
import { queryString, request } from "./client";

export function systemRoutes() {
  return request<UnknownRecord>("/api/v1/admin/system/routes");
}

export function systemHealth(params: { includePublicRoutes?: boolean } = {}) {
  return request<UnknownRecord>(`/api/v1/admin/system/health${queryString(params)}`);
}

export function systemMetrics(params: { windowMinutes?: number } = {}) {
  return request<UnknownRecord>(`/api/v1/admin/system/metrics${queryString(params)}`);
}

export function systemObservability() {
  return request<UnknownRecord>("/api/v1/admin/system/observability");
}

export function tradingMetrics(params: { windowMinutes?: number; productLine?: string; limit?: number } = {}) {
  return gatewayGet<UnknownRecord>("trading-orders", "/metrics", params);
}

export function accountAssetValuation(params: {
  valuationAsset?: string;
  userId?: string;
  accountType?: string;
  asset?: string;
  nonZeroOnly?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return request<UnknownRecord>(`/api/v1/admin/reports/account-assets/valuation${queryString(params)}`, { signal });
}

export function accountAssetSnapshots(params: {
  snapshotDate?: string;
  valuationAsset?: string;
  accountType?: string;
  asset?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return request<CursorPage<UnknownRecord, "snapshots">>(
    `/api/v1/admin/reports/account-assets/snapshots${queryString(params)}`, { signal }
  );
}

export function createAccountAssetSnapshot(params: {
  snapshotDate?: string;
  valuationAsset?: string;
} = {}) {
  return request<UnknownRecord>(`/api/v1/admin/reports/account-assets/snapshots${queryString(params)}`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function marketHealth(params: { instrumentId?: string; period?: string; staleSeconds?: number; limit?: number } = {}) {
  return request<UnknownRecord>(`/api/v1/admin/market/health${queryString(params)}`);
}

export function alertRules(params: { domain?: string; enabled?: string; limit?: number } & CursorListParams = {}) {
  return request<CursorPage<UnknownRecord, "rules">>(`/api/v1/admin/alerts/rules${queryString(params)}`);
}

export function createAlertRule(body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", "/api/v1/admin/alerts/rules", body);
}

export function updateAlertRule(ruleId: number | string, body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/rules/${ruleId}`, body);
}

export function enableAlertRule(ruleId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/rules/${ruleId}/enable`, {});
}

export function disableAlertRule(ruleId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/rules/${ruleId}/disable`, {});
}

export function alertEvents(params: { status?: string; severity?: string; domain?: string; limit?: number } & CursorListParams = {}, signal?: AbortSignal) {
  return request<CursorPage<UnknownRecord, "events">>(`/api/v1/admin/alerts/events${queryString(params)}`, { signal });
}

export function alertChannels(params: { domain?: string; enabled?: string; limit?: number } & CursorListParams = {}) {
  return request<CursorPage<UnknownRecord, "channels">>(`/api/v1/admin/alerts/channels${queryString(params)}`);
}

export function createAlertChannel(body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", "/api/v1/admin/alerts/channels", body);
}

export function updateAlertChannel(channelId: number | string, body: UnknownRecord) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/channels/${channelId}`, body);
}

export function enableAlertChannel(channelId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/channels/${channelId}/enable`, {});
}

export function disableAlertChannel(channelId: number | string) {
  return adminLocalWrite<UnknownRecord>("POST", `/api/v1/admin/alerts/channels/${channelId}/disable`, {});
}

export function alertDeliveries(params: { status?: string; channelId?: string; eventId?: string; limit?: number } & CursorListParams = {}) {
  return request<CursorPage<UnknownRecord, "deliveries">>(`/api/v1/admin/alerts/deliveries${queryString(params)}`);
}

export function retryAlertDelivery(deliveryId: number | string) {
  return request<UnknownRecord>(`/api/v1/admin/alerts/deliveries/${deliveryId}/retry`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function acknowledgeAlertEvent(eventId: number | string) {
  return request<UnknownRecord>(`/api/v1/admin/alerts/events/${eventId}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function evaluateAlerts() {
  return request<UnknownRecord>("/api/v1/admin/alerts/evaluate", {
    method: "POST",
    body: JSON.stringify({})
  });
}
