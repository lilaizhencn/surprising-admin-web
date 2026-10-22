import { ApiError } from "../api/client";
import { type UnknownRecord } from "../types";
import { compactNumber } from "../config";

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function records<T extends UnknownRecord>(items: T[] | undefined | null): UnknownRecord[] {
  return items ? [...items] : [];
}

export function fieldText(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

export function objectValue(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

export function extractRows(value: unknown, arrayKeys: string[] = []): UnknownRecord[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as UnknownRecord[];
  const object = objectValue(value);
  for (const key of arrayKeys) {
    const nested = object[key];
    if (Array.isArray(nested)) {
      return nested.filter((item) => item && typeof item === "object") as UnknownRecord[];
    }
  }
  return Object.keys(object).length ? [object] : [];
}

export function ppmPercent(value: unknown): string {
  return `${compactNumber(Number(value ?? 0) / 10_000)}%`;
}
