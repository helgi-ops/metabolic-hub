// Icelandic kennitala helpers (isomorphic — used by the signup form and the
// server action). A kennitala is DDMMYY-NNVC: 8 digits, a check digit V and a
// century digit C (9 = 1900s, 0 = 2000s; 8 = 1800s, still technically valid).

export function normalizeKennitala(input: string): string {
  return input.replace(/[\s-]/g, "");
}

const WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2];

export function isValidKennitala(input: string): boolean {
  const kt = normalizeKennitala(input);
  if (!/^\d{10}$/.test(kt)) return false;

  const d = kt.split("").map(Number);
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * d[i], 0);
  const rem = sum % 11;
  const check = rem === 0 ? 0 : 11 - rem;
  if (check === 10 || check !== d[8]) return false;

  if (![8, 9, 0].includes(d[9])) return false;

  // Day 1–31 (companies add 40 to the day: 41–71), month 1–12.
  const day = d[0] * 10 + d[1];
  const month = d[2] * 10 + d[3];
  const realDay = day > 40 ? day - 40 : day;
  return realDay >= 1 && realDay <= 31 && month >= 1 && month <= 12;
}

/** Display as DDMMYY-NNNN. */
export function formatKennitala(input: string): string {
  const kt = normalizeKennitala(input);
  return kt.length === 10 ? `${kt.slice(0, 6)}-${kt.slice(6)}` : kt;
}
