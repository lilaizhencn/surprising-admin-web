export type RouteKey =
  | "dashboard"
  | "support"
  | "users"
  | "markets"
  | "orders"
  | "accounts"
  | "wallet"
  | "compliance"
  | "risk"
  | "funding"
  | "fees"
  | "maker"
  | "security"
  | "approvals"
  | "exports"
  | "queries"
  | "alerts"
  | "system"
  | "audit";

export type StatusTone = "ok" | "warn" | "danger" | "muted";

export interface AuthenticatedUser {
  userId: number;
  username: string;
  email?: string | null;
  status: string;
  roles: string[];
  createdAt: string;
}

export interface AuthSession {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface QueryState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

export interface Instrument {
  symbol: string;
  version?: number;
  instrumentType?: string;
  contractType?: string;
  baseAsset?: string;
  quoteAsset?: string;
  settleAsset?: string;
  status?: string;
  maxLeveragePpm?: number;
  makerFeeRatePpm?: number;
  takerFeeRatePpm?: number;
  fundingIntervalHours?: number;
  riskLimitBrackets?: unknown[];
  indexSources?: unknown[];
  [key: string]: unknown;
}

export interface OrderRecord {
  orderId: number;
  userId: number;
  clientOrderId?: string;
  symbol: string;
  side: string;
  orderType: string;
  timeInForce: string;
  priceTicks: number;
  quantitySteps: number;
  executedQuantitySteps: number;
  remainingQuantitySteps: number;
  marginMode: string;
  positionSide?: string;
  status: string;
  rejectReason?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface BalanceRecord {
  userId: number;
  accountType?: string;
  asset: string;
  availableUnits: number;
  lockedUnits: number;
  equityUnits: number;
  updatedAt: string;
  [key: string]: unknown;
}

export interface PositionRecord {
  userId: number;
  symbol: string;
  instrumentVersion: number;
  marginMode: string;
  positionSide: string;
  signedQuantitySteps: number;
  entryPriceTicks: number;
  realizedPnlUnits: number;
  updatedAt: string;
  [key: string]: unknown;
}

export type UnknownRecord = Record<string, unknown>;
