import { expect, test } from "bun:test";
import {
  approvalListPage,
  approvalRecords,
  canDecideApproval,
  permissionDifference,
  draftPermissionCodes,
  rolePermissionResult,
  securityCatalogue,
} from "../src/lib/securityReview";
const approval = {
  approvalId: "9007199254740993",
  requesterUserId: "9223372036854775807",
  requesterUsername: "Synthetic requester",
  status: "PENDING",
  service: "gateway-admin",
  httpMethod: "POST",
  requestPath: "/api/v1/admin/roles/OPERATOR/permissions",
  queryString: null,
  requestBodySha256: "a".repeat(64),
  reason: "Synthetic request",
  requestedAt: "2026-10-26T10:00:00Z",
  expiresAt: "2030-01-01T00:00:00Z",
};
test("role reads cannot attach another role's permissions to the current selection", () => {
  expect(
    rolePermissionResult({ roleCode: "OPERATOR", permissions: ["admin.users.read"] }, "OPERATOR")
      .permissions,
  ).toEqual(["admin.users.read"]);
  expect(() =>
    rolePermissionResult({ roleCode: "ADMIN", permissions: ["*"] }, "OPERATOR"),
  ).toThrow();
  expect(() => securityCatalogue({ count: 2, roles: [{ roleCode: "ADMIN" }] }, "roles")).toThrow();
});
test("permission changes preserve unknown existing codes and expose exact additions/removals", () => {
  const draft = draftPermissionCodes("admin.users.read, admin.orders.write\nadmin.orders.write");
  expect(draft).toEqual(["admin.users.read", "admin.orders.write"]);
  expect(permissionDifference(["admin.users.read", "custom.*"], draft)).toEqual({
    added: ["admin.orders.write"],
    removed: ["custom.*"],
  });
});
test("approval records preserve long identities and reject incomplete binding metadata", () => {
  expect(approvalRecords([approval])[0].approvalId).toBe("9007199254740993");
  for (const value of [
    [approval, approval],
    [{ ...approval, requestBodySha256: "not-a-digest" }],
    [{ ...approval, status: "UNKNOWN" }],
    [{ ...approval, approvalId: 9007199254740992 }],
  ])
    expect(() => approvalRecords(value)).toThrow();
});
test("self approval, expiry and handled requests are not actionable", () => {
  const row = approvalRecords([approval])[0];
  expect(canDecideApproval(row, "1", Date.parse("2026-10-26T10:00:00Z"))).toBe(true);
  expect(canDecideApproval(row, row.requesterUserId, 0)).toBe(false);
  expect(canDecideApproval(row, "1", Date.parse(row.expiresAt))).toBe(false);
  expect(canDecideApproval({ ...row, status: "CONSUMED" }, "1", 0)).toBe(false);
});
test("approval page metadata cannot invent a successful empty page", () => {
  expect(
    approvalListPage({
      approvals: [approval],
      count: 1,
      limit: 200,
      hasMore: false,
      nextCursor: null,
      sort: "requestedAt.desc",
    }).approvals,
  ).toHaveLength(1);
  expect(() => approvalListPage({ approvals: [] })).toThrow();
  expect(() =>
    approvalListPage({
      approvals: [approval],
      count: 1,
      limit: 200,
      hasMore: true,
      nextCursor: null,
      sort: "requestedAt.desc",
    }),
  ).toThrow();
});
