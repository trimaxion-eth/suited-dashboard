function group(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function money(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  const d = Math.abs(n) >= 1000 && digits === 2 ? 0 : digits;
  const neg = n < 0;
  const [w, f] = Math.abs(n).toFixed(d).split(".");
  return `${neg ? "-" : ""}${group(w)}${f != null ? `.${f}` : ""}`;
}

export function moneyK(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return money(n, 2);
}

export function int(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return group(String(Math.round(n)));
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function usdg6(raw: unknown): number | null {
  if (typeof raw !== "number") return null;
  return raw / 1e6;
}

export function last<T>(xs: T[] | undefined | null): T | undefined {
  return xs && xs.length ? xs[xs.length - 1] : undefined;
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function avg(xs: number[]): number | null {
  return xs.length ? sum(xs) / xs.length : null;
}

export function trailing(xs: { date: string; value: number }[], days: number): number[] {
  return xs.slice(-days).map((d) => d.value);
}

export function delta(now: number | null | undefined, prev: number | null | undefined): string {
  if (now == null || prev == null) return "";
  const d = now - prev;
  if (d === 0) return "flat";
  const sign = d > 0 ? "+" : "";
  return `${sign}${money(d, Math.abs(d) >= 10 ? 0 : 2)}`;
}

export function when(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + " utc";
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}
