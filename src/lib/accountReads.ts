import type { UnknownRecord } from "../types";
import { errorMessage } from "./adminData";

export type AccountRead = { response: UnknownRecord | null; error: string };

/** A failed section must never hide independently loaded balances or become an empty list. */
export async function readAccountSections(reads: Record<string, { request: Promise<unknown>; array: string; optionalArrays?: string[]; expected?: Record<string, string> }>): Promise<Record<string, AccountRead>> {
  const results = await Promise.all(Object.entries(reads).map(async ([key, read]) => {
    try {
      const response = await read.request;
      if (!response || typeof response !== "object" || Array.isArray(response)) throw new Error("接口返回格式异常，请重试。");
      const rows = (response as UnknownRecord)[read.array];
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("接口记录格式异常，请重试。");
      for (const field of read.optionalArrays ?? []) {
        const value = (response as UnknownRecord)[field];
        if (value !== undefined && (!Array.isArray(value) || value.some(row => !row || typeof row !== "object" || Array.isArray(row)))) throw new Error("接口记录格式异常，请重试。");
      }
      const expectedFields = Object.entries(read.expected ?? {});
      if (rows.some(row => expectedFields.some(([field, expected]) => row[field] != null && String(row[field]) !== expected))) throw new Error("接口记录与当前用户或产品线不一致，数据未展示。");
      return [key, { response: response as UnknownRecord, error: "" }] as const;
    } catch (error) {
      return [key, { response: null, error: errorMessage(error) }] as const;
    }
  }));
  return Object.fromEntries(results);
}

export function accountReadPage(read?: AccountRead) {
  const response = read?.response;
  return {
    nextCursor: typeof response?.nextCursor === "string" ? response.nextCursor : "",
    hasMore: response?.hasMore === true,
    limit: typeof response?.limit === "number" ? response.limit : 0,
    sort: typeof response?.sort === "string" ? response.sort : ""
  };
}
