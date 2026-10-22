import type { UnknownRecord } from "../../types";
import { optionalPositiveInt64, positiveInt64, positiveInt32, safeInteger } from "../../lib/integers";
import { fieldText } from "../../lib/adminData";
import { textOrNull, enumOrDefault } from "../../lib/formValues";
import { PRODUCT_LINES } from "../../lib/products";

export const FEE_STATUSES = ["ACTIVE", "DISABLED"];
export const FEE_SOURCE_TYPES = ["USER_OVERRIDE", "VIP", "MARKET_MAKER", "PROMOTION", "RISK_OVERRIDE"];

export function feeScheduleFormTemplate() {
  return {
    feeScheduleId: "",
    productLine: "LINEAR_PERPETUAL",
    userId: "",
    instrumentId: "",
    makerFeeRatePpm: "200",
    takerFeeRatePpm: "500",
    sourceType: "USER_OVERRIDE",
    tierCode: "",
    reason: "Manual fee override",
    status: "ACTIVE",
    effectiveTime: "",
    expireTime: ""
  };
}

export function feeScheduleFormFromRecord(row: UnknownRecord) {
  return {
    feeScheduleId: fieldText(row.feeScheduleId),
    productLine: enumOrDefault(row.productLine, PRODUCT_LINES.filter(Boolean), "LINEAR_PERPETUAL"),
    userId: fieldText(row.userId),
    instrumentId: fieldText(row.instrumentId),
    makerFeeRatePpm: fieldText(row.makerFeeRatePpm),
    takerFeeRatePpm: fieldText(row.takerFeeRatePpm),
    sourceType: enumOrDefault(row.sourceType, FEE_SOURCE_TYPES, "USER_OVERRIDE"),
    tierCode: fieldText(row.tierCode),
    reason: fieldText(row.reason) || "Manual fee override",
    status: enumOrDefault(row.status, FEE_STATUSES, "ACTIVE"),
    effectiveTime: fieldText(row.effectiveTime),
    expireTime: fieldText(row.expireTime)
  };
}

export function feeSchedulePayload(form: ReturnType<typeof feeScheduleFormTemplate>): UnknownRecord {
  if (!form.reason.trim()) throw new Error("请填写费率调整原因。");
  const makerFeeRatePpm = safeInteger(form.makerFeeRatePpm, "Maker ppm");
  const takerFeeRatePpm = safeInteger(form.takerFeeRatePpm, "Taker ppm");
  if ([makerFeeRatePpm, takerFeeRatePpm].some(value => value < -1_000_000 || value > 1_000_000)) throw new Error("费率 ppm 范围为 -1,000,000 至 1,000,000。");
  for (const value of [form.effectiveTime, form.expireTime]) if (value && !Number.isFinite(Date.parse(value))) throw new Error("请填写有效的生效、到期时间。");
  if (form.effectiveTime && form.expireTime && Date.parse(form.expireTime) <= Date.parse(form.effectiveTime)) throw new Error("到期时间必须晚于生效时间。");

  return {
    feeScheduleId: optionalPositiveInt64(form.feeScheduleId, "费率计划 ID"),
    productLine: form.productLine,
    userId: positiveInt64(form.userId, "用户 ID"),
    instrumentId: form.instrumentId.trim() ? positiveInt32(form.instrumentId) : null,
    makerFeeRatePpm,
    takerFeeRatePpm,
    sourceType: form.sourceType,
    tierCode: textOrNull(form.tierCode.toUpperCase()),
    reason: form.reason.trim(),
    status: form.status,
    effectiveTime: textOrNull(form.effectiveTime),
    expireTime: textOrNull(form.expireTime)
  };
}
