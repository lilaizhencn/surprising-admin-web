import type { Instrument, UnknownRecord } from "../types";
import { positiveInt64 } from "../lib/integers";
import { adminLocalWrite, type CursorListParams, type CursorPage, gatewayGet, gatewayPost } from "./adminCore";
import { queryString, request } from "./client";

export type InstrumentChange = { changeId: string; operatorId: string; reason: string; changedAt: string; beforeValues: string | null; afterValues: string };

export function instruments(params: {
  productLine?: string;
  type?: string;
  status?: string;
  limit?: number;
} & CursorListParams = {}) {
  return gatewayGet<CursorPage<Instrument, "instruments"> & { items?: Instrument[] }>("instrument-admin", "/list", params);
}

export function instrumentLatest(instrumentId: number | string, productLine?: string) {
  return gatewayGet<Instrument>("instrument-admin", `/${encodeURIComponent(String(instrumentId))}`, { productLine });
}

export function instrumentChanges(instrumentId: number | string, productLine: string, beforeId = "0", limit = 50) {
  return gatewayGet<InstrumentChange[]>("instrument-admin", `/${encodeURIComponent(String(instrumentId))}/changes`, { productLine, beforeId, limit });
}

export function upsertInstrument(body: UnknownRecord, reason = "Admin configuration update", expectedChangeId: unknown = 0) {
  return gatewayPost<Instrument>("instrument-admin", "/upsert", body, { reason, expectedChangeId });
}

export function updateInstrumentStatus(instrumentId: number | string, status: string, productLine: string | undefined, reason = "Admin trading status update", expectedChangeId: unknown = 0) {
  return gatewayPost<Instrument>("instrument-admin", `/${encodeURIComponent(String(instrumentId))}/status`, undefined, { status, productLine, reason, expectedChangeId });
}

export function accountAdjustments(params: {
  adminUserId?: string;
  userId?: string;
  adjustmentKind?: string;
  accountType?: string;
  asset?: string;
  referenceId?: string;
  limit?: number;
} & CursorListParams = {}, signal?: AbortSignal) {
  return gatewayGet<CursorPage<UnknownRecord, "adjustments">>("account", "/adjustments", params, signal);
}

// ---------------------------------------------------------------------------
// VIP 阶梯费率管理
// ---------------------------------------------------------------------------
export function adminVipLevels() {
  return request<Array<{
    level: number;
    name: string;
    minVolume30d: string;
    makerFeeDiscountPpm: number;
    takerFeeDiscountPpm: number;
    makerFeeRatePpm: number;
    takerFeeRatePpm: number;
  }>>("/api/v1/vip/levels");
}

export function adminUserVipStatus(userId: number | string) {
  return request<{
    userId: number | string;
    currentLevel: number;
    tierName: string;
    volume30d: string;
    makerFeeRatePpm: number;
    takerFeeRatePpm: number;
    makerFeeDiscountPpm: number;
    takerFeeDiscountPpm: number;
    manualOverride: boolean;
    updatedAt: string;
  }>(`/api/v1/vip/status?userId=${positiveInt64(userId, "用户 ID")}`);
}

export function adminUpdateUserVip(payload: {
  userId: number | string;
  vipLevel: number;
  makerFeeDiscountPpm?: number;
  takerFeeDiscountPpm?: number;
  reason?: string;
}) {
  return adminLocalWrite<{ ok: boolean; message?: string }>("POST", "/api/v1/vip/evaluate", {
    userId: positiveInt64(payload.userId, "用户 ID"),
    manualLevel: payload.vipLevel,
    makerFeeDiscountPpm: payload.makerFeeDiscountPpm,
    takerFeeDiscountPpm: payload.takerFeeDiscountPpm,
    reason: payload.reason || "Admin manual override"
  });
}

// ---------------------------------------------------------------------------
// 主子账户关系树与权限管理
// ---------------------------------------------------------------------------
export function adminSubAccounts(masterUserId: number | string) {
  return request<Array<{
    subUserId: number | string;
    masterUserId: number | string;
    subAccountName: string;
    permission: "TRADE_ONLY" | "READ_ONLY" | "FULL";
    status: "ACTIVE" | "FROZEN";
    createdAt: string;
  }>>(`/api/v1/sub-account/list?masterUserId=${positiveInt64(masterUserId, "主账户 ID")}`);
}

export function adminUpdateSubAccountStatus(subUserId: number | string, status: "ACTIVE" | "FROZEN") {
  return adminLocalWrite<{ ok: boolean }>("POST", "/api/v1/sub-account/status", {
    subUserId: positiveInt64(subUserId, "子账户 ID"),
    status
  });
}

// ---------------------------------------------------------------------------
// 网格策略机器人全网运行监控
// ---------------------------------------------------------------------------
export function adminGridStrategies(params: { symbol?: string; status?: string } = {}) {
  return request<Array<{
    strategyId: string;
    userId: number | string;
    symbol: string;
    gridType: "ARITHMETIC" | "GEOMETRIC";
    lowerPrice: string;
    upperPrice: string;
    gridCount: number;
    investAmount: string;
    matchedCount: number;
    profitUsd: string;
    status: "RUNNING" | "STOPPED";
    createdAt: string;
  }>>(`/api/v1/strategy/grid/admin-list${queryString(params)}`);
}

export function adminStopGridStrategy(strategyId: string) {
  return adminLocalWrite<{ ok: boolean }>("POST", "/api/v1/strategy/grid/stop", { strategyId });
}
