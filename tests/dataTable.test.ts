import { installConfigFixture } from "./configFixture";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
installConfigFixture();
const { DataTable } = await import("../src/components/AdminDataTable");
const { tableColumnLabel, tableRowIdentity, tableRowKeys } = await import("../src/lib/tableRows");

describe("admin data table", () => {
  const row = { orderId: "9223372036854775807", productLine: "OPTION", quantitySteps: "9007199254740993" };
  test("makes row details explicit and keeps financial identities unrounded", () => {
    const html = renderToString(createElement(DataTable, { rows: [row], onRowClick: () => {}, rowActionLabel: "查看时间线", isSelected: () => true }));
    expect(html).toContain("9223372036854775807");
    expect(html).toContain("9007199254740993");
    expect(html).toContain("数量 (steps)");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('scope="col"');
    expect(html.match(/查看时间线<svg/g)?.length).toBe(2);
  });
  test("mobile cards keep both the primary action and existing business actions", () => {
    const html = renderToString(createElement(DataTable, { rows: [row], mobileAction: { label: "查看订单", onClick: () => {} }, actions: () => createElement("button", { type: "button" }, "撤单") }));
    expect(html.match(/>撤单<\/button>/g)?.length).toBe(2);
    expect(html.match(/查看订单<svg/g)?.length).toBe(2);
  });
  test("keeps product scopes separate in stable row identity and unknown columns inspectable", () => {
    expect(tableRowIdentity(row, 0)).not.toBe(tableRowIdentity({ ...row, productLine: "SPOT" }, 0));
    expect(tableRowIdentity(row, 0)).toContain("9223372036854775807");
    expect(tableColumnLabel("customAuditField")).toBe("customAuditField");
  });
  test("represents a genuine empty list as a status", () => {
    const html = renderToString(createElement(DataTable, { rows: [] }));
    expect(html).toContain('role="status"');
    expect(html).toContain("暂无数据");
  });
  test("duplicate candidate identities cannot collapse rows during reconciliation", () => {
    const keys = tableRowKeys([{ userId: "1", instrumentId: "2", value: "A" }, { userId: "2", instrumentId: "2", value: "B" }]);
    expect(new Set(keys).size).toBe(2);
  });
  test("pending user writes can disable selection in both responsive views", () => {
    const html = renderToString(createElement(DataTable, { rows: [row], onRowClick: () => {}, rowActionDisabled: true }));
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });
});
