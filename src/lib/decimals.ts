type ParsedDecimal = {
  value: bigint;
  scale: number;
};

function parseDecimal(value: unknown): ParsedDecimal | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  const text = String(value).trim();
  if (!text || text.length > 256) return null;
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(text);
  if (!match) return null;
  const exponent = Number(match[4] ?? "0");
  if (Math.abs(exponent) > 78) return null;
  const rawDigits = match[2] + (match[3] ?? "");
  const rawScale = (match[3]?.length ?? 0) - exponent;
  const digits = rawScale < 0 ? rawDigits + "0".repeat(-rawScale) : rawDigits;
  const scale = Math.max(0, rawScale);
  const magnitude = BigInt(digits);
  return { value: match[1] === "-" && magnitude !== 0n ? -magnitude : magnitude, scale };
}

function formatDecimal({ value, scale }: ParsedDecimal, fixedDecimals?: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const digits = abs.toString();
  const padded = scale > 0 ? digits.padStart(scale + 1, "0") : digits;
  const whole = scale > 0 ? padded.slice(0, -scale) : padded;
  const rawFraction = scale > 0 ? padded.slice(-scale) : "";
  if (fixedDecimals === undefined) {
    const fraction = rawFraction.replace(/0+$/, "");
    return `${negative && abs !== 0n ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
  }
  const fraction = rawFraction.slice(0, fixedDecimals).padEnd(fixedDecimals, "0");
  return `${negative && abs !== 0n ? "-" : ""}${whole}${fixedDecimals > 0 ? `.${fraction}` : ""}`;
}

export function sumBigIntUnits(values: Iterable<unknown>): bigint {
  let total = 0n;
  for (const item of values) {
    if (typeof item === "bigint") {
      total += item;
    } else if (typeof item === "number" && Number.isInteger(item)) {
      total += BigInt(item);
    } else if (typeof item === "string" && /^[+-]?\d+$/.test(item.trim())) {
      total += BigInt(item.trim());
    }
  }
  return total;
}

export function sumDecimals(values: Iterable<unknown>, fixedDecimals?: number): string {
  let totalValue = 0n;
  let totalScale = 0;
  for (const item of values) {
    const parsed = parseDecimal(item);
    if (!parsed) continue;
    if (parsed.scale > totalScale) {
      totalValue *= 10n ** BigInt(parsed.scale - totalScale);
      totalScale = parsed.scale;
    }
    const factor = totalScale > parsed.scale ? 10n ** BigInt(totalScale - parsed.scale) : 1n;
    totalValue += parsed.value * factor;
  }
  return formatDecimal({ value: totalValue, scale: totalScale }, fixedDecimals);
}

export function formatUsdtDecimal(value: number | string | bigint | undefined): string {
  const parsed = parseDecimal(value ?? "0");
  if (!parsed) return "0.00";
  const negative = parsed.value < 0n;
  const abs = negative ? -parsed.value : parsed.value;
  const digits = abs.toString();
  const padded = parsed.scale > 0 ? digits.padStart(parsed.scale + 1, "0") : digits;
  const whole = parsed.scale > 0 ? padded.slice(0, -parsed.scale) : padded;
  const fraction = (parsed.scale > 0 ? padded.slice(-parsed.scale) : "").slice(0, 2).padEnd(2, "0");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative && abs !== 0n ? "-" : ""}${grouped}.${fraction}`;
}
