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
export function adminVipLevels(productLine = "LINEAR_PERPETUAL") {
  return gatewayGet<Array<{
    level: number;
    name: string;
    minVolume30d: string;
    minAssetBalanceUsd?: string;
    makerFeeDiscountPpm: number;
    takerFeeDiscountPpm: number;
    makerFeeRatePpm: number;
    takerFeeRatePpm: number;
  }>>("trading-fees", "/vip/levels", { productLine });
}

export function adminUserVipStatus(userId: number | string, productLine = "LINEAR_PERPETUAL") {
  return gatewayGet<{
    userId: number | string;
    currentLevel: number;
    tierName: string;
    volume30d: string | number;
    makerFeeRatePpm: number;
    takerFeeRatePpm: number;
    makerFeeDiscountPpm: number;
    takerFeeDiscountPpm: number;
    manualOverride: boolean;
    updatedAt: string;
  }>("trading-fees", "/vip/status", { userId: positiveInt64(userId, "用户 ID"), productLine });
}

export function adminUpdateUserVip(payload: {
  userId: number | string;
  vipLevel: number;
  productLine?: string;
  makerFeeRatePpm?: number;
  takerFeeRatePpm?: number;
  makerFeeDiscountPpm?: number;
  takerFeeDiscountPpm?: number;
  reason?: string;
}) {
  const productLine = payload.productLine || "LINEAR_PERPETUAL";
  return gatewayPost<{ ok: boolean; status?: UnknownRecord; message?: string }>(
    "trading-fees",
    "/vip/override",
    {
      userId: positiveInt64(payload.userId, "用户 ID"),
      vipLevel: payload.vipLevel,
      makerFeeRatePpm: payload.makerFeeRatePpm,
      takerFeeRatePpm: payload.takerFeeRatePpm,
      makerFeeDiscountPpm: payload.makerFeeDiscountPpm,
      takerFeeDiscountPpm: payload.takerFeeDiscountPpm,
      reason: payload.reason || "Admin manual override"
    },
    { productLine }
  );
}

// ---------------------------------------------------------------------------
// 主子账户关系树与权限管理
// ---------------------------------------------------------------------------
export function adminSubAccounts(masterUserId?: number | string) {
  const params = masterUserId ? { masterUserId: positiveInt64(masterUserId, "主账户 ID") } : {};
  return request<Array<{
    subUserId: number | string;
    masterUserId: number | string;
    subAccountName: string;
    permission: string;
    status: "ACTIVE" | "FROZEN";
    createdAt: string;
  }>>(`/api/v1/admin/sub-accounts${queryString(params)}`);
}

export function adminUpdateSubAccountStatus(subUserId: number | string, status: "ACTIVE" | "FROZEN") {
  return adminLocalWrite<{ ok: boolean }>("POST", `/api/v1/admin/sub-accounts/${positiveInt64(subUserId, "子账户 ID")}/status`, {
    status
  });
}

// ---------------------------------------------------------------------------
// 网格策略机器人全网运行监控
// ---------------------------------------------------------------------------
export function adminGridStrategies(params: { symbol?: string; status?: string; productLine?: string } = {}) {
  return gatewayGet<Array<{
    strategyId: string;
    userId: number | string;
    symbol: string;
    productLine?: string;
    gridType: "ARITHMETIC" | "GEOMETRIC";
    lowerPrice: string;
    upperPrice: string;
    gridCount: number;
    investAmount: string;
    matchedCount: number;
    profitUsd: string;
    status: "RUNNING" | "STOPPED";
    createdAt: string;
  }>>("trading-grid", "/list", { ...params, productLine: params.productLine || "LINEAR_PERPETUAL" });
}

export function adminStopGridStrategy(strategyId: string, productLine = "LINEAR_PERPETUAL") {
  return gatewayPost<{ ok: boolean }>("trading-grid", `/${encodeURIComponent(strategyId)}/stop`, {}, { productLine });
}
