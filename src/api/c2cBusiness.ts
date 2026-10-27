import { attachApproval } from "./admin";
import { ApiError, request } from "./client";
import { c2cObject } from "../lib/c2cReview";
export type C2cRow = Record<string, unknown>;
export const c2cBusinessRead = (owner: string, path: string, signal?: AbortSignal) =>
  request<C2cRow>(`/api/v1/admin/c2c${path}`, {
    expectedUserId: owner,
    signal,
  }).then(c2cObject);
export async function c2cBusinessWrite(
  owner: string,
  path: string,
  value: unknown,
  method = "POST",
) {
  const target = `/api/v1/admin/c2c${path}`,
    body = value === undefined ? undefined : JSON.stringify(value);
  const headers: Record<string, string> = {};
  const send = () =>
    request<C2cRow>(target, { method, body, headers, expectedUserId: owner }).then(c2cObject);
  try {
    return await send();
  } catch (failure) {
    if (
      !(failure instanceof ApiError) ||
      failure.status !== 403 ||
      !failure.payload ||
      typeof failure.payload !== "object" ||
      (failure.payload as C2cRow).code !== "C2C_APPROVAL_REQUIRED"
    )
      throw failure;
    await attachApproval(headers, "c2c", method, target, "", body, owner);
    return send();
  }
}
