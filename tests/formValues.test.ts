import { describe, expect, test } from "bun:test";
import { installConfigFixture } from "./configFixture";
installConfigFixture();
const { assetCode } = await import("../src/lib/formValues");

describe("asset catalog input", () => {
  test.each(["USDT", "1INCH", "AB", "A".repeat(20)])("accepts the real catalog code %s", code => {
    expect(assetCode(code)).toBe(code);
  });
  test("normalizes the same uppercase code displayed by catalog forms", () => {
    expect(assetCode(" 1inch ")).toBe("1INCH");
  });
  test.each(["", " ", "A", "A".repeat(21), "BTC-USDT", "USDT_", "US DT", "币种"])("rejects invalid catalog code %s", code => {
    expect(() => assetCode(code)).toThrow();
  });
});
