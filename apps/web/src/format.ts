export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

export function months(n: number): string {
  if (n <= 0) return "0 months";
  const years = Math.floor(n / 12);
  const rem = n % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} yr`);
  if (rem) parts.push(`${rem} mo`);
  return parts.join(" ") || `${n} mo`;
}

const ACRONYMS = new Set(["tfsa", "rrsp", "fhsa", "resp", "gic", "heloc"]);

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
