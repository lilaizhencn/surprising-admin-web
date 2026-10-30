import { installConfigFixture } from "./configFixture";
import { expect, test } from "bun:test";
installConfigFixture();
const { parseLegalRow, parseLegalRevision } = await import("../src/api/legal");
const row = { revisionId: "9007199254740993", version: "9223372036854775807", type: "USER_AGREEMENT", revisionLabel: "2026-10-31.1", status: "DRAFT", createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z", publishedAt: null };
const translation = { locale: "ar-SA", title: "اتفاقية المستخدم", bodyHtml: "<p>الشروط</p>" };
test("legal summaries preserve exact revision and concurrency versions", () => {
  expect(parseLegalRow(row)).toEqual(row);
  expect(parseLegalRevision({ ...row, translations: [translation] }).translations).toEqual([translation]);
});
test("malformed legal IDs, status, dates and translations are rejected", () => {
  for (const patch of [{ revisionId: 9007199254740992 }, { version: "0" }, { status: "UNKNOWN" }, { type: "UNKNOWN" }, { publishedAt: "invalid" }])
    expect(() => parseLegalRow({ ...row, ...patch })).toThrow();
  for (const translations of [[], [translation, translation], [{ ...translation, locale: "xx" }], [{ ...translation, bodyHtml: "" }]])
    expect(() => parseLegalRevision({ ...row, translations })).toThrow();
});
