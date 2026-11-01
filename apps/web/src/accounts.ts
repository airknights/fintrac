import type { Account } from "./api/client.js";

export const DEBT_TYPES = new Set(["credit", "loan"]);

export const INSTITUTIONS = [
  "TD Canada Trust",
  "CIBC",
  "CTFS (Canadian Tire Financial Services)",
  "Financeit",
  "Tangerine",
  "Fairstone",
  "Affirm",
];

export const NO_INSTITUTION = "No bank set";

// Words in an account name that identify the bank, incl. well-known card/product names.
const INSTITUTION_KEYWORDS: Array<[institution: string, pattern: RegExp]> = [
  ["TD Canada Trust", /\btd\b|\btd canada\b/i],
  ["CIBC", /\bcibc\b|\baventura\b/i],
  ["CTFS (Canadian Tire Financial Services)", /\bctfs\b|\bcanadian tire\b|\btriangle\b|\bct\b/i],
  ["Financeit", /\bfinance ?it\b/i],
  ["Tangerine", /\btangerine\b/i],
  ["Fairstone", /\bfairstone\b/i],
  ["Affirm", /\baffirm\b/i],
];

// Words in an account name that identify what kind of account it is. First
// match wins, so more specific patterns come first ("TFSA savings" is a TFSA).
const KIND_KEYWORDS: Array<[pattern: RegExp, kind: { type: string; subtype: string }]> = [
  [/\bline of credit\b|\bloc\b|\bheloc\b/i, { type: "credit", subtype: "line of credit" }],
  [/\bmortgage\b/i, { type: "loan", subtype: "mortgage" }],
  [/\b(car|auto|vehicle) loan\b/i, { type: "loan", subtype: "auto loan" }],
  [/\bstudent loan\b|\bosap\b/i, { type: "loan", subtype: "student loan" }],
  [/\bloan\b|\bfinanc(e|ing)\b/i, { type: "loan", subtype: "loan" }],
  [/\bvisa\b|\bmastercard\b|\bamex\b|\bamerican express\b|\bcredit card\b|\bcard\b/i, { type: "credit", subtype: "credit card" }],
  [/\btfsa\b/i, { type: "investment", subtype: "tfsa" }],
  [/\brrsp\b/i, { type: "investment", subtype: "rrsp" }],
  [/\bfhsa\b/i, { type: "investment", subtype: "fhsa" }],
  [/\bresp\b/i, { type: "investment", subtype: "resp" }],
  [/\bgic\b/i, { type: "investment", subtype: "gic" }],
  [/\bbrokerage\b|\binvest(ing|ment)?\b/i, { type: "investment", subtype: "brokerage" }],
  [/\bcheq(uing)?\b|\bcheck(ing)?\b/i, { type: "depository", subtype: "chequing" }],
  [/\bsavings?\b/i, { type: "depository", subtype: "savings" }],
];

// Guesses type + subtype from a typed account name, e.g. "TD Visa" → credit / credit card.
export function inferAccountKind(accountName: string): { type: string; subtype: string } | null {
  for (const [pattern, kind] of KIND_KEYWORDS) {
    if (pattern.test(accountName)) return kind;
  }
  // Lenders that only offer loans: "Affirm" alone is still a loan.
  const institution = inferInstitution(accountName);
  if (institution && LOAN_ONLY_INSTITUTIONS.has(institution)) return { type: "loan", subtype: "loan" };
  return null;
}

const LOAN_ONLY_INSTITUTIONS = new Set(["Financeit", "Fairstone", "Affirm"]);

// Guesses the bank from a typed account name, e.g. "Triangle Mastercard" → CTFS.
export function inferInstitution(accountName: string): string | null {
  for (const [institution, pattern] of INSTITUTION_KEYWORDS) {
    if (pattern.test(accountName)) return institution;
  }
  return null;
}

export interface InstitutionGroup {
  institution: string;
  accounts: Account[];
  net: number; // assets minus debts at this bank
}

// Groups accounts by bank, alphabetically, with accounts that have no bank last.
// Account order within a group is preserved.
export function groupByInstitution(accounts: Account[]): InstitutionGroup[] {
  const groups = new Map<string, InstitutionGroup>();
  for (const a of accounts) {
    const institution = a.institution_name?.trim() || NO_INSTITUTION;
    let g = groups.get(institution);
    if (!g) groups.set(institution, (g = { institution, accounts: [], net: 0 }));
    g.accounts.push(a);
    const bal = a.current_balance ?? 0;
    g.net += DEBT_TYPES.has(a.type) ? -bal : bal;
  }
  return [...groups.values()].sort((x, y) => {
    if (x.institution === NO_INSTITUTION) return 1;
    if (y.institution === NO_INSTITUTION) return -1;
    return x.institution.localeCompare(y.institution);
  });
}
