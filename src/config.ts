export const config = {
  gatewayBaseUrl: (import.meta.env.VITE_GATEWAY_BASE_URL || "http://localhost:9094").replace(/\/$/, ""),
  sessionKey: "surprising-admin.session"
};

export function compactNumber(value: unknown): string {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(number);
}

export function formatDate(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return compactNumber(value);
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return formatDate(text);
  return text;
}
