const DECIMAL_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** Parse finite decimal input without treating blank or base-prefixed text as a number. */
export function parseDecimal(raw: string): number | undefined {
  if (!DECIMAL_PATTERN.test(raw.trim())) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
