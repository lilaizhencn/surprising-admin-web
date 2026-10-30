import { installConfigFixture } from "./configFixture";
import { expect, test } from "bun:test";
installConfigFixture();
const { parseAnnouncement, parseAnnouncementPage } = await import("../src/api/announcements");
const { announcementSave, localDateTimeValue, requirePublishable } = await import("../src/lib/announcementDraft");
const row = {
  announcementId: "9007199254740993", version: "9223372036854775807", category: "GENERAL", status: "DRAFT", effectiveStatus: "DRAFT",
  priority: 0, placements: ["CENTER"], productLines: ["SPOT"], platforms: ["WEB"],
  startsAt: "2026-10-26T10:20:39.123456Z", expiresAt: "2026-10-27T10:20:45.987654Z",
  createdAt: "2026-10-26T10:00:00Z", updatedAt: "2026-10-26T10:00:00Z",
  translations: [{ locale: "zh-CN", title: "合成标题", summary: "", body: "合成正文" }, { locale: "en-US", title: "Synthetic title", summary: "", body: "Synthetic body" }]
};
const summary = { ...row, translations: row.translations.map(({ locale, title, summary }) => ({ locale, title, summary })) };
const draft = { category: row.category, priority: "0", placements: row.placements, productLines: row.productLines, platforms: row.platforms,
  startsAt: localDateTimeValue(row.startsAt), expiresAt: localDateTimeValue(row.expiresAt),
  translations: Object.fromEntries(row.translations.map(item => [item.locale, item])) };
test("announcement reads retain exact IDs and versions", () => {
  expect(parseAnnouncement(row).announcementId).toBe(row.announcementId);
  expect(parseAnnouncement(row).version).toBe(row.version);
  expect(parseAnnouncementPage({ announcements: [summary], count: 1, offset: 0, limit: 25, hasMore: false }).announcements).toHaveLength(1);
});
test("malformed announcement metadata and duplicate pages fail closed", () => {
  for (const value of [{}, { ...row, announcementId: 9007199254740992 }, { ...row, version: "0" }, { ...row, effectiveStatus: "PUBLISHED" }, { ...row, productLines: ["ALL", "SPOT"] }, { ...row, translations: [] }])
    expect(() => parseAnnouncement(value)).toThrow();
  expect(() => parseAnnouncementPage({ announcements: [summary, summary], count: 2, offset: 0, limit: 25, hasMore: false })).toThrow();
});
test("editing text preserves exact scheduled instants when date fields were untouched", () => {
  const saved = announcementSave(draft, parseAnnouncement(row));
  expect(saved.startsAt).toBe(row.startsAt);
  expect(saved.expiresAt).toBe(row.expiresAt);
  expect(saved.productLines).toEqual(["SPOT"]);
});
test("draft validation rejects empty translations, fractional priority and reversed dates", () => {
  for (const value of [{ ...draft, translations: {} }, { ...draft, priority: "1.5" }, { ...draft, priority: "" }, { ...draft, expiresAt: "bad" }, { ...draft, expiresAt: "2020-01-01T00:00" }])
    expect(() => announcementSave(value, parseAnnouncement(row))).toThrow();
});
test("publication requires a saved draft with complete selected translations", () => {
  expect(() => requirePublishable(parseAnnouncement(row))).not.toThrow();
  expect(() => requirePublishable(parseAnnouncement({ ...row, translations: row.translations.slice(0, 1) }))).not.toThrow();
  expect(() => requirePublishable(parseAnnouncement({ ...row, status: "WITHDRAWN", effectiveStatus: "WITHDRAWN" }))).toThrow();
});
