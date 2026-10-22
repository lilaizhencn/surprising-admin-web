import { describe, expect, test } from "bun:test";
import { int64String, positiveInt32, optionalPositiveInt64, positiveInt64, safeInteger, serializeAdminBody } from "../src/lib/integers";

describe("financial decimal integer boundary", () => {
  test.each(["9007199254740991", "9007199254740992", "9007199254740993", "9223372036854775807", "-9223372036854775808", "-9007199254740993", "0"])("preserves exact signed int64 %s", value => {
    expect(int64String(value, "金额")).toBe(value);
  });
  test.each(["", " ", "1.5", "1e3", "+1", "01", "NaN", "Infinity", "9223372036854775808", "-9223372036854775809", undefined, null, Number.MAX_SAFE_INTEGER + 1])("rejects invalid integer %j", value => {
    expect(() => int64String(value, "金额")).toThrow();
  });
  test("positive IDs and optional empty filters have distinct semantics", () => {
    expect(positiveInt64("9223372036854775807")).toBe("9223372036854775807");
    expect(optionalPositiveInt64("")).toBeUndefined();
    expect(() => positiveInt64("0")).toThrow();
    expect(() => positiveInt64("-1")).toThrow();
    expect(() => optionalPositiveInt64("invalid")).toThrow();
    expect(positiveInt32("2147483647")).toBe("2147483647");
    expect(() => positiveInt32("2147483648")).toThrow();
    expect(() => safeInteger("1.5", "ppm")).toThrow();
    expect(() => safeInteger("9007199254740993", "ppm")).toThrow();
  });
  test("write serialization covers adjustments, fees, instrument fields and maker ID arrays", () => {
    const body = { userId: "9007199254740993", amountUnits: "-9223372036854775808", feeScheduleId: "9223372036854775807", instrumentId: "2147483647", maxNotionalUnits: "9223372036854775807", minAssetBalanceUnits: "9007199254740993", accountIds: [1, "9007199254740993"], instrumentIds: ["2147483647"], makerFeeRatePpm: -50, reason: "精度审计" };
    expect(JSON.parse(serializeAdminBody(body)!)).toEqual({ ...body, accountIds: ["1", "9007199254740993"] });
    expect(() => serializeAdminBody({ amountUnits: Number("9007199254740993") })).toThrow();
    expect(() => serializeAdminBody({ userId: "" })).toThrow();
    expect(() => serializeAdminBody({ accountIds: ["0"] })).toThrow();
    expect(() => serializeAdminBody({ amountUnits: "1.5" })).toThrow();
    for (const key of ["assetId", "networkId", "baseAssetId", "quoteAssetId", "settleAssetId", "contractValueAssetId"]) {
      expect(JSON.parse(serializeAdminBody({ [key]: "2147483647" })!)[key]).toBe("2147483647");
      expect(() => serializeAdminBody({ [key]: "2147483648" })).toThrow();
    }
  });
});
