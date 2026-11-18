import { installConfigFixture } from "./configFixture";
import { describe, expect, test } from "bun:test";
installConfigFixture();
const { rowsToCsv } = await import("../src/lib/csvExport");

describe("inline CSV export", () => {
  test("preserves exact bigints, negative numbers, UTF-8 BOM and neutralizes formula cells", () => {
    const csv = rowsToCsv(
      [
        {
          orderId: "9223372036854775807",
          amountUnits: "-15000000",
          reason: "=CMD|'/C calc'!A0",
          note: "hello, \"world\"",
        },
      ],
      ["orderId", "amountUnits", "reason", "note"],
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("9223372036854775807,-15000000,'=CMD|'/C calc'!A0,\"hello, \"\"world\"\"\"");
  });

  test("returns empty string for empty datasets", () => {
    expect(rowsToCsv([])).toBe("");
  });
});
