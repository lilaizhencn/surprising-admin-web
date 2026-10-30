export type RouteKey =
  | "dashboard"
  | "support"
  | "c2c"
  | "users"
  | "assets"
  | "markets"
  | "lifecycle"
  | "orders"
  | "maintenance"
  | "accounts"
  | "wallet"
  | "compliance"
  | "risk"
  | "funding"
  | "affiliate"
  | "fees"
  | "maker"
  | "security"
  | "approvals"
  | "exports"
  | "queries"
  | "alerts"
  | "announcements"
  | "legal"
  | "system"
  | "audit";

export type StatusTone = "ok" | "warn" | "danger" | "muted";
export type ProductLine = "SPOT" | "LINEAR_PERPETUAL" | "INVERSE_PERPETUAL" | "LINEAR_DELIVERY" | "INVERSE_DELIVERY" | "OPTION";

export type IntegerValue = number | string;

export interface AuthenticatedUser {
  userId: IntegerValue;
  username?: string | null;
  email?: string | null;
  status: string;
  roles: string[];
  createdAt: string;
}

export interface AuthSession {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken?: string | null;
  browserSession?: boolean;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface QueryState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

export interface Instrument {
  instrumentId: IntegerValue;
  baseAssetId: IntegerValue;
  quoteAssetId: IntegerValue;
  settleAssetId: IntegerValue;
  contractValueAssetId: IntegerValue;
  symbol: string;
  changeId?: IntegerValue;
  lastChangeId?: IntegerValue;
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
  expiryTime?: string | null;
  deliveryTime?: string | null;
  underlyingInstrumentId?: string | null;
  underlyingProductLine?: string | null;
  strikePriceUnits?: IntegerValue | null;
  optionType?: string | null;
  optionExerciseStyle?: string | null;
  settlementMethod?: string | null;
  riskLimitBrackets?: unknown[];
  indexSources?: unknown[];
  [key: string]: unknown;
}

export interface OrderRecord {
  orderId: IntegerValue;
  userId: IntegerValue;
  clientOrderId?: string;
  instrumentId: string;
  side: string;
  orderType: string;
  timeInForce: string;
  priceTicks: IntegerValue;
  quantitySteps: IntegerValue;
  executedQuantitySteps: IntegerValue;
  remainingQuantitySteps: IntegerValue;
  marginMode: string;
  positionSide?: string;
  status: string;
  rejectReason?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface BalanceRecord {
  userId: IntegerValue;
  accountType?: string;
  asset: string;
  availableUnits: IntegerValue;
  lockedUnits: IntegerValue;
  equityUnits: IntegerValue;
  updatedAt: string;
  [key: string]: unknown;
}

export interface PositionRecord {
  userId: IntegerValue;
  instrumentId: string;
  instrumentChangeId: IntegerValue;
  marginMode: string;
  positionSide: string;
  signedQuantitySteps: IntegerValue;
  entryPriceTicks: IntegerValue;
  realizedPnlUnits: IntegerValue;
  updatedAt: string;
  [key: string]: unknown;
}

export type UnknownRecord = Record<string, unknown>;
