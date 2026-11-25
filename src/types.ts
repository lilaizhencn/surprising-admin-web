export type RouteKey =
  | "dashboard"
  | "assets"
  | "markets"
  | "lifecycle"
  | "fees"
  | "maker"
  | "orders"
  | "risk"
  | "funding"
  | "accounts"
  | "wallet"
  | "c2c"
  | "users"
  | "compliance"
  | "support"
  | "affiliate"
  | "announcements"
  | "approvals"
  | "security"
  | "system";

export type LegacyRouteKey =
  | "product-lines"
  | "markets-spot"
  | "markets-linear-perp"
  | "markets-inverse-perp"
  | "markets-linear-delivery"
  | "markets-inverse-delivery"
  | "markets-option"
  | "maintenance"
  | "telegram"
  | "legal"
  | "audit";

export type RouteTarget = RouteKey | LegacyRouteKey;

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
  displayName?: string | null;
  statusReason?: string | null;
  frozenUntil?: string | null;
}

export interface AuthSession {
  user: AuthenticatedUser;
  /** 浏览器会话标记；令牌本身只在 HttpOnly Cookie 里，不会出现在响应体。 */
  browserSession?: boolean;
  /** 会话是滑动有效期，这里只是登录时给出的参考上限。 */
  sessionExpiresAt?: string | null;
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
