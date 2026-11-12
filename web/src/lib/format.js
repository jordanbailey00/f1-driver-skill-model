import { DB } from "./data.js";

export const MINUS = "−";
export const Z90 = 1.645;

export function sgn(v, dig = 2) {
  const s = Math.abs(v).toFixed(dig);
  if (Number(s) === 0) return (0).toFixed(dig);
  return (v > 0 ? "+" : MINUS) + s;
}
export const pct = (v, dig = 2) => sgn(v, dig) + "%";
export const lapSecs = (v) => (Math.abs(v) * DB.meta.lap_seconds) / 100;
export const secs = (v) => lapSecs(v).toFixed(2) + " s";
export const secsSigned = (v) => sgn((v * DB.meta.lap_seconds) / 100) + " s";
export const ratio = (v) => Math.exp(-v / 100).toFixed(4);
export const span = (a, b) => (a === b ? String(a) : a + "–" + b);
export const spanShort = (a, b) => (a === b ? String(a) : a + "–" + String(b).slice(-2));
export const yrs = (d) => span(d.first, d.last);
export const fmtInt = (n) => Number(n).toLocaleString("en-US");
export const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const lastName = (d) => d.last_name || d.name.split(" ").slice(-1)[0];
export const plural = (n, one, many = one + "s") => fmtInt(n) + " " + (n === 1 ? one : many);
export const pctTick = (v, dig = 1) => (Math.abs(v) < 1e-9 ? "0" : (v > 0 ? "+" : MINUS) + Math.abs(v).toFixed(dig) + "%");
export const prob = (p) => Math.round(100 * p) + "%";
export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
export function titleText(d) {
  if (!d.titles) return null;
  const ys = d.title_years || [];
  return d.titles + "× world champion" + (ys.length ? " (" + compactYears(ys) + ")" : "");
}
// 1994, 1995, 2000, 2001, 2002 -> "1994–95, 2000–02"
export function compactYears(ys) {
  const out = [];
  let a = null, b = null;
  for (const y of ys.slice().sort((p, q) => p - q)) {
    if (a == null) { a = b = y; continue; }
    if (y === b + 1) { b = y; continue; }
    out.push(spanShort(a, b));
    a = b = y;
  }
  if (a != null) out.push(spanShort(a, b));
  return out.join(", ");
}
