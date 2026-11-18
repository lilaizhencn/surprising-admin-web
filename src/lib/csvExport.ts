import type { UnknownRecord } from "../types";
import { tableColumnLabel } from "./tableRows";

function escapeCsvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let text: string;
  if (typeof raw === "object") {
    text = JSON.stringify(raw);
  } else {
    text = String(raw);
  }
  // Prevent CSV formula injection in spreadsheet tools while preserving negative numbers like "-12.34".
  if (/^[=@+\t\r]/.test(text) || (/^-/.test(text) && !/^-\d+(?:\.\d+)?$/.test(text))) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function rowsToCsv(rows: readonly UnknownRecord[], columns?: readonly string[]): string {
  if (!rows.length) return "";
  const resolvedColumns = columns?.length
    ? [...columns]
    : Array.from(
        rows.reduce((keys, row) => {
          for (const key of Object.keys(row)) keys.add(key);
          return keys;
        }, new Set<string>()),
      );
  const header = resolvedColumns.map((col) => escapeCsvCell(tableColumnLabel(col))).join(",");
  const body = rows.map((row) => resolvedColumns.map((col) => escapeCsvCell(row[col])).join(","));
  return `\uFEFF${[header, ...body].join("\r\n")}`;
}

export function downloadRowsAsCsv(
  filename: string,
  rows: readonly UnknownRecord[],
  columns?: readonly string[],
): boolean {
  const csv = rowsToCsv(rows, columns);
  if (!csv || typeof document === "undefined") return false;
  const safeName = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
