import { parseApiJson } from "../api/client";
import { type UnknownRecord } from "../types";
import { fieldText } from "./adminData";

export function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function enumOrDefault(value: unknown, allowed: string[], fallback: string) {
  const normalized = fieldText(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

export function exportParams(value: string): Record<string, string> {
  const parsed = parseApiJson<unknown>(value || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("导出参数必须是 JSON object。");
  }
  const params: Record<string, string> = {};
  for (const [key, item] of Object.entries(parsed as Record<string, unknown>)) {
    if (item === undefined || item === null || item === "") continue;
    params[key] = String(item);
  }
  return params;
}

export function jsonObject(value: string): UnknownRecord {
  const parsed = parseApiJson<unknown>(value || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("内容必须是 JSON object。");
  }
  return parsed as UnknownRecord;
}

export function finiteDecimal(value: string, label: string): number {
  if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value.trim())) throw new Error(`${label}必须填写有限十进制数。`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label}超出数值范围。`);
  return number;
}

/** Match the shared asset catalog: 2–20 uppercase letters or digits, including 1INCH. */
export function assetCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(code)) throw new Error("币种代码须为 2–20 个大写字母或数字。");
  return code;
}
