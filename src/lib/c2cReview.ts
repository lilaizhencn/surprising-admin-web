import type { UnknownRecord } from "../types";
import { positiveInt64 } from "./integers";
export type C2cReviewSection = "merchants" | "payment-accounts" | "ads" | "appeals";
const uuid = (value: unknown) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const text = (value: unknown) => typeof value === "string" && value.length > 0;
const money = (value: unknown) => typeof value === "string" && /^\d+(\.\d+)?$/.test(value);
const version = (value: unknown) =>
  typeof value === "string" &&
  /^(0|[1-9]\d{0,18})$/.test(value) &&
  BigInt(value) <= 9223372036854775807n;
const states = {
  merchants: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED", "WITHDRAWN"],
  "payment-accounts": ["PENDING", "APPROVED", "REJECTED", "DISABLED"],
  ads: ["RESERVING", "ACTIVE", "PAUSED", "CLOSING", "CLOSED", "REJECTED"],
  appeals: ["OPEN", "REVIEWING", "RESOLVED", "WITHDRAWN"],
};
export const c2cStatusFilters = states;
export function c2cObject(value: unknown): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw Error("C2C 响应不完整，请重新读取。");
  return value as UnknownRecord;
}
function list(value: unknown) {
  if (!Array.isArray(value)) throw Error("C2C 列表响应不完整。");
  return value.map(c2cObject);
}
export function c2cRowId(section: C2cReviewSection, row: UnknownRecord) {
  return String(
    row[
      section === "merchants"
        ? "userId"
        : section === "payment-accounts"
          ? "accountId"
          : section === "ads"
            ? "adId"
            : "appealId"
    ],
  );
}
export function c2cReviewPage(value: unknown, section: C2cReviewSection, offset: number) {
  const page = c2cObject(value),
    rows = list(page.items);
  if (page.offset !== offset || typeof page.hasMore !== "boolean" || rows.length > 30)
    throw Error("C2C 分页与当前查询不匹配。");
  for (const row of rows) {
    const id = c2cRowId(section, row);
    if (
      !states[section].includes(String(row.status)) ||
      (section === "merchants" ? positiveInt64(row.userId, "商家 ID") !== id : !uuid(id)) ||
      (section !== "appeals" && (!version(row.revision) || row.revision === "0"))
    )
      throw Error("C2C 记录身份、版本或状态异常。");
    if (
      section === "merchants" &&
      (!(row.nickname === null || typeof row.nickname === "string") ||
        typeof row.application !== "string" ||
        !(row.kycStatus === null || typeof row.kycStatus === "string") ||
        !(row.bondStatus === null || typeof row.bondStatus === "string") ||
        !(row.bondAmount === null || money(row.bondAmount)))
    )
      throw Error("商家资料响应不完整。");
    if (
      section === "payment-accounts" &&
      (!positiveInt64(row.userId, "账户用户 ID") ||
        !text(row.maskedLabel) ||
        !text(row.methodCode) ||
        !text(row.fiat))
    )
      throw Error("收款账户响应不完整。");
    if (section === "ads") {
      positiveInt64(row.makerUserId, "商家 ID");
      const market = c2cObject(row.market);
      if (
        !uuid(market.marketId) ||
        !text(market.asset) ||
        !text(market.fiat) ||
        !money(row.price) ||
        !money(row.availableQuantity)
      )
        throw Error("广告市场或金额响应不完整。");
    }
    if (section === "appeals" && (!uuid(row.orderId) || !text(row.reason)))
      throw Error("申诉订单绑定不完整。");
  }
  if (new Set(rows.map((row) => c2cRowId(section, row))).size !== rows.length)
    throw Error("C2C 列表包含重复记录。");
  return { items: rows, hasMore: page.hasMore, offset };
}
export function c2cConfiguration(value: unknown) {
  const row = c2cObject(value);
  if (
    typeof row.enabled !== "boolean" ||
    !version(row.revision) ||
    !Number.isSafeInteger(row.maxActiveAds) ||
    Number(row.maxActiveAds) < 1 ||
    Number(row.maxActiveAds) > 100
  )
    throw Error("C2C 配置尚未完整读取。");
  const markets = list(row.markets),
    methods = list(row.paymentMethods);
  if (
    markets.some((m) => !uuid(m.marketId) || !text(m.asset) || !text(m.fiat)) ||
    methods.some(
      (m) =>
        !text(m.code) ||
        !text(m.label) ||
        typeof m.enabled !== "boolean" ||
        !version(m.revision) ||
        typeof m.requiresBankName !== "boolean" ||
        typeof m.supportsQr !== "boolean" ||
        !Array.isArray(m.currencies) ||
        !m.currencies.every(text),
    )
  )
    throw Error("C2C 市场或收款方式配置不完整。");
  if (
    new Set(markets.map((m) => m.marketId)).size !== markets.length ||
    new Set(methods.map((m) => m.code)).size !== methods.length
  )
    throw Error("C2C 配置包含重复标识。");
  return row;
}
export function c2cBondPolicy(value: unknown) {
  const row = c2cObject(value);
  if (
    typeof row.configured !== "boolean" ||
    !version(row.revision) ||
    (row.configured &&
      (row.revision === "0" ||
        !text(row.asset) ||
        !money(row.amount) ||
        !/[1-9]/.test(String(row.amount))))
  )
    throw Error("质押规则响应不完整。");
  return row;
}
export function c2cReconciliation(value: unknown) {
  const row = c2cObject(value),
    assets = list(row.assets);
  if (
    !["MATCHED", "MISMATCH", "UNAVAILABLE", "PENDING", "REVIEW_REQUIRED"].includes(
      String(row.status),
    ) ||
    assets.some(
      (a) =>
        !text(a.asset) ||
        typeof a.matches !== "boolean" ||
        !["expectedEscrowUnits", "actualEscrowUnits", "expectedFeeUnits", "actualFeeUnits"].every(
          (field) => typeof a[field] === "string" && /^-?\d+$/.test(String(a[field])),
        ),
    )
  )
    throw Error("资金核对响应不完整，请重新读取。");
  return row;
}
export function c2cPaymentDetails(value: unknown, account: UnknownRecord) {
  const row = c2cObject(value),
    details = c2cObject(row.details);
  if (
    row.accountId !== account.accountId ||
    row.ownerUserId !== account.userId ||
    row.revision !== account.revision ||
    row.fiat !== account.fiat ||
    row.methodCode !== account.methodCode ||
    row.manualIdentityVerificationRequired !== true ||
    !text(row.kycStatus) ||
    !(
      row.kycExpiresAt === null ||
      (typeof row.kycExpiresAt === "string" && Number.isFinite(Date.parse(row.kycExpiresAt)))
    ) ||
    !text(details.holderName) ||
    !text(details.accountNumber)
  )
    throw Error("实名资料与当前收款账户或版本不匹配，请刷新原记录。");
  return row;
}
export function c2cAppealOrder(value: unknown, orderId: unknown) {
  const row = c2cObject(value),
    market = c2cObject(row.market);
  if (
    row.orderId !== orderId ||
    !uuid(row.orderId) ||
    !text(market.asset) ||
    !text(market.fiat) ||
    !money(row.quantity) ||
    !money(row.fiatAmount) ||
    ![
      "RESERVING",
      "PAYMENT_PENDING",
      "PAID",
      "APPEALED",
      "RELEASE_PENDING",
      "REFUND_PENDING",
      "COMPLETED",
      "CANCELED",
      "EXPIRED",
      "FAILED",
    ].includes(String(row.status))
  )
    throw Error("申诉原订单响应不匹配或不完整。");
  positiveInt64(row.buyerUserId, "买方 ID");
  positiveInt64(row.sellerUserId, "卖方 ID");
  return {
    ...row,
    buyerUserId: positiveInt64(row.buyerUserId, "买方 ID"),
    sellerUserId: positiveInt64(row.sellerUserId, "卖方 ID"),
  };
}
export function c2cDecisions(section: C2cReviewSection, row: UnknownRecord): string[] {
  if (section === "ads")
    return row.status === "ACTIVE" ? ["PAUSE"] : row.status === "PAUSED" ? ["RESUME"] : [];
  if (section === "appeals")
    return ["OPEN", "REVIEWING"].includes(String(row.status)) ? ["RELEASE", "REFUND"] : [];
  if (section === "payment-accounts")
    return row.status === "PENDING"
      ? ["APPROVE", "REJECT", "DISABLE"]
      : row.status !== "DISABLED"
        ? ["DISABLE"]
        : [];
  return [
    ...(row.status !== "APPROVED" && row.bondStatus === "LOCKED" && row.kycStatus === "VERIFIED"
      ? ["APPROVE"]
      : []),
    ...(row.status === "PENDING" ? ["REJECT"] : []),
    ...(row.status !== "SUSPENDED" ? ["SUSPEND"] : []),
  ];
}
