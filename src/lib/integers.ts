const MIN_INT64 = -9223372036854775808n;
const MAX_INT64 = 9223372036854775807n;

/** JSON decimal strings bind to backend long fields without passing through Number. */
export function int64String(value: unknown, label: string, minimum = MIN_INT64): string {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error(`${label}不能使用不精确的数字。`);
  const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!/^-?(0|[1-9]\d*)$/.test(text)) throw new Error(`${label}必须填写十进制整数。`);
  if (text.length > 20) throw new Error(`${label}超出整数范围。`);
  const integer = BigInt(text);
  if (integer < minimum || integer > MAX_INT64) throw new Error(`${label}超出整数范围。`);
  return integer.toString();
}

export function positiveInt64(value: unknown, label = "ID"): string {
  return int64String(value, label, 1n);
}

export function positiveInt32(value: unknown, label = "ID"): string {
  const text = positiveInt64(value, label);
  if (BigInt(text) > 2147483647n) throw new Error(`${label}超出正整数 ID 范围。`);
  return text;
}

export function optionalPositiveInt64(value: string, label = "ID"): string | undefined {
  return value.trim() ? positiveInt64(value, label) : undefined;
}

/** Bounded counters and ppm settings remain numbers; financial units and IDs do not. */
export function safeInteger(value: string, label: string): number {
  const text = int64String(value, label);
  const integer = Number(text);
  if (!Number.isSafeInteger(integer)) throw new Error(`${label}超出安全整数范围。`);
  return integer;
}

const POSITIVE_INT32_FIELDS = new Set(["instrumentId", "underlyingInstrumentId", "baseAssetId", "quoteAssetId", "settleAssetId", "contractValueAssetId", "assetId", "networkId"]);

const POSITIVE_ID_FIELDS = new Set(["userId", "adminUserId", "assignedAdminUserId", "feeScheduleId"]);

/** Validate before hashing so approval and execution use exactly the same bytes. */
export function serializeAdminBody(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  return JSON.stringify(body, (key, value: unknown) => {
    if (value === null || value === undefined) return value;
    if (POSITIVE_INT32_FIELDS.has(key)) return positiveInt32(value, key);
    if (POSITIVE_ID_FIELDS.has(key)) return positiveInt64(value, key);
    if (["expectedChangeId", "expectedVersion", "revision"].includes(key)) return int64String(value, key, 0n);
    if (/(Units|Ticks|Steps)$/.test(key)) return int64String(value, key);
    if (key === "accountIds" || key === "instrumentIds") {
      if (!Array.isArray(value)) throw new Error(`${key}必须是 ID 列表。`);
      return value.map(item => key === "instrumentIds" ? positiveInt32(item, key) : positiveInt64(item, key));
    }
    if (typeof value === "number" && (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)))
      throw new Error(`${key}不能使用不精确或非有限数字。`);
    return value;
  });
}
