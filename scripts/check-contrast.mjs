#!/usr/bin/env node
/** Checks every text/background colour pair used in globals.css against WCAG 2.1 AA (4.5:1 text, 3:1 UI). */
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const token = name => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`Token --${name} not found`);
  return m[1];
};
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum]
const PAIRS = [
  ["ink", "paper", 4.5], ["ink", "surface", 4.5], ["ink-2", "paper", 4.5], ["ink-2", "surface", 4.5],
  ["muted", "paper", 4.5], ["muted", "surface", 4.5], ["accent", "paper", 4.5], ["accent", "surface", 4.5],
  ["accent-ink", "accent", 4.5], ["accent-ink", "danger", 4.5], ["danger", "paper", 4.5], ["danger", "surface", 4.5],
  ["ink", "danger-wash", 4.5], ["ink", "accent-wash", 4.5], ["accent", "accent-wash", 4.5], ["warn", "surface", 4.5],
  ["line-strong", "surface", 3], ["line-strong", "paper", 3], ["accent", "skeleton", 3],
];
let failed = 0;
for (const [fg, bg, min] of PAIRS) {
  const r = ratio(token(fg), token(bg));
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${fg} on ${bg}: ${r.toFixed(2)}:1 (needs ${min}:1)`);
}
if (failed) process.exit(1);
