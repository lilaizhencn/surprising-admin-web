import { installConfigFixture } from "./configFixture";
import { describe, expect, mock, test } from "bun:test";
installConfigFixture();
import { createElement } from "react";
import { renderToString } from "react-dom/server";
const { default: FeesPage } = await import("../src/pages/FeesPage");
const { feeScheduleFormTemplate, feeSchedulePayload } = await import("../src/features/fees/feeScheduleForm");

describe("real fee schedule operations", () => {
  test("an empty new form renders without submitting or inventing a VIP engine", () => {
    const html = renderToString(createElement(FeesPage));
    expect(html).toContain("新增/更新费率计划");
    expect(html).toContain("用户当前有效费率");
    expect(html).not.toContain("新增/更新 VIP 档位");
    expect(html).not.toContain("刷新活跃用户 VIP");
  });
  test("schedule IDs stay decimal strings, rates stay validated ppm integers", () => {
    const request = feeSchedulePayload({ ...feeScheduleFormTemplate(), feeScheduleId: "9223372036854775807", userId: "9007199254740993", instrumentId: "2147483647", reason: "核对" });
    expect(request).toMatchObject({ feeScheduleId: "9223372036854775807", userId: "9007199254740993", instrumentId: "2147483647", makerFeeRatePpm: 200, takerFeeRatePpm: 500 });
  });
  test.each([
    { userId: "" }, { userId: "1.5" }, { userId: "9223372036854775808" }, { instrumentId: "BTC-USDT" }, { instrumentId: "2147483648" }, { feeScheduleId: "0" }, { makerFeeRatePpm: "1.5" }, { makerFeeRatePpm: "1000001" }, { reason: " " }, { effectiveTime: "invalid" }, { effectiveTime: "2026-10-23T00:00:00Z", expireTime: "2026-10-22T00:00:00Z" }
  ])("invalid schedule inputs cannot reach approval: %j", patch => {
    expect(() => feeSchedulePayload({ ...feeScheduleFormTemplate(), userId: "9", ...patch })).toThrow();
  });
});
