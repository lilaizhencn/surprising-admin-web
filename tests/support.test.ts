import { expect, test } from "bun:test";
import { ApiError } from "../src/api/client";
import {
  supportOverview,
  supportTicketPage,
  supportNotePage,
  supportMutation,
  supportWriteUncertain,
} from "../src/lib/support";

const userId = "9007199254740993",
  ticketId = "9223372036854775807",
  iso = "2026-10-27T01:00:00Z";
const ticket = {
  ticketId,
  userId,
  status: "OPEN",
  priority: "MEDIUM",
  category: "GENERAL",
  title: "合成工单",
  assignedAdminUserId: null,
  createdByUserId: "1",
  resolvedByUserId: null,
  createdAt: iso,
  updatedAt: iso,
  closedAt: null,
};
const note = {
  noteId: "9007199254740994",
  ticketId,
  adminUserId: "1",
  noteType: "NOTE",
  visibility: "INTERNAL",
  body: "合成内部备注",
  createdAt: iso,
};
const filters = { status: "", limit: 25, sort: "updatedAt.desc", cursor: "" };
const list = {
  tickets: [ticket],
  ticketCount: 1,
  hasMore: false,
  nextCursor: null,
  limit: 25,
  sort: "updatedAt.desc",
};
const overview = {
  generatedAt: iso,
  user: { userId, username: "Synthetic", email: null, status: "ACTIVE", createdAt: iso },
  compliance: {
    kycStatus: "VERIFIED",
    kycLevel: "L1",
    country: null,
    kycExpiresAt: null,
    activeRiskTags: 0,
    criticalRiskTags: "0",
    openAmlCases: 0,
    maxAmlRiskScore: 0,
  },
};

test("support summary binds the exact user and never invents zero risk for missing data", () => {
  expect(supportOverview(overview, userId).compliance.activeRiskTags).toBe(0);
  for (const bad of [
    {},
    { ...overview, user: { ...overview.user, userId: "2" } },
    { ...overview, compliance: {} },
    { ...overview, compliance: { ...overview.compliance, openAmlCases: undefined } },
  ])
    expect(() => supportOverview(bad, userId)).toThrow();
});
test("support ticket identities retain int64 precision and reject unsafe numeric IDs", () => {
  expect(supportTicketPage(list, userId, filters).items[0].ticketId).toBe(ticketId);
  expect(() =>
    supportTicketPage({ ...list, tickets: [{ ...ticket, ticketId: Number(ticketId) }] }, userId, filters),
  ).toThrow();
  expect(() =>
    supportTicketPage({ ...list, tickets: [{ ...ticket, userId: "2" }] }, userId, filters),
  ).toThrow();
});
test("support pages reject incomplete metadata, duplicate records, wrong filters and stuck cursors", () => {
  for (const bad of [
    { tickets: [] },
    { ...list, ticketCount: 0 },
    { ...list, tickets: [ticket, ticket], ticketCount: 2 },
    { ...list, hasMore: true },
    { ...list, sort: "createdAt.asc" },
    { ...list, limit: 100 },
  ])
    expect(() => supportTicketPage(bad, userId, filters)).toThrow();
  expect(() => supportTicketPage(list, userId, { ...filters, status: "CLOSED" })).toThrow();
  expect(() =>
    supportTicketPage({ ...list, hasMore: true, nextCursor: "same" }, userId, { ...filters, cursor: "same" }),
  ).toThrow();
});
test("support notes cannot cross ticket targets and require explicit visibility and complete pagination", () => {
  const page = {
      notes: [note],
      noteCount: 1,
      hasMore: false,
      nextCursor: null,
      limit: 50,
      sort: "createdAt.asc",
    },
    expected = { limit: 50, sort: "createdAt.asc", cursor: "" };
  expect(supportNotePage(page, ticketId, expected).items[0].body).toBe(note.body);
  for (const row of [
    { ...note, ticketId: "2" },
    { ...note, visibility: "PUBLIC" },
    { ...note, noteType: "UNKNOWN" },
  ])
    expect(() => supportNotePage({ ...page, notes: [row] }, ticketId, expected)).toThrow();
});
test("support mutation receipts bind both the original user and ticket before success", () => {
  const receipt = { ticket, notes: [note], noteCount: 1 };
  expect(supportMutation(receipt, userId, ticketId).ticket.ticketId).toBe(ticketId);
  expect(() => supportMutation(receipt, userId, "2")).toThrow();
  expect(() => supportMutation({ ...receipt, noteCount: 0 }, userId)).toThrow();
  expect(() => supportMutation({ ...receipt, notes: [{ ...note, ticketId: "2" }] }, userId)).toThrow();
});
test("support rejects unknown status and date fields instead of enabling stale controls", () => {
  for (const row of [
    { ...ticket, status: "SUCCESS" },
    { ...ticket, priority: "CRITICAL" },
    { ...ticket, updatedAt: "tomorrow" },
  ])
    expect(() => supportTicketPage({ ...list, tickets: [row] }, userId, filters)).toThrow();
});
test("uncertain writes require a read before any repeat; explicit business rejection remains distinct", () => {
  expect(supportWriteUncertain(new ApiError(400, "invalid", null))).toBe(false);
  for (const error of [
    new ApiError(408, "timeout", null),
    new ApiError(503, "unavailable", null),
    new Error("bad receipt"),
  ])
    expect(supportWriteUncertain(error)).toBe(true);
});
