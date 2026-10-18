#!/usr/bin/env node
/**
 * Fails the build if UI code drifts into patterns we have ruled out:
 * gradients, shadows, blur/glass, hover animations, rounded cards, neon glows,
 * coloured side stripes, emoji, em dashes, icon packs and overused fonts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["app", "components", "lib", "README.md", "docs", "api", "package.json"];
const EXT = new Set([".ts", ".tsx", ".css", ".md", ".mjs", ".json"]);
const RULES = [
  [/—/, "em dash"],
  [/\p{Extended_Pictographic}/u, "emoji or pictograph"],
  [/(linear|radial|conic)-gradient\(/, "gradient"],
  [/box-shadow\s*:/, "drop shadow"],
  [/text-shadow\s*:/, "text glow"],
  [/backdrop-filter|filter\s*:\s*blur/, "blur / liquid glass"],
  [/transition\s*:/, "transition (hover animation)"],
  [/:hover[^{]*\{[^}]*(transform|animation)/, "hover animation"],
  [/border-radius\s*:\s*(?:[5-9]|\d{2,})px/, "soft corner radius over 4px"],
  [/border-radius\s*:\s*(?:50%|999)/, "pill or circle radius"],
  [/border-left\s*:\s*[2-9]px/, "coloured left stripe"],
  [/lucide|heroicons|react-icons|phosphor/i, "icon pack", "code"],
  [/["'\s]Inter["',]|Geist|Space Grotesk/, "overused font", "code"],
  [/Sparkles|sparkle/i, "sparkle icon", "code"],
];
// Lines that describe the rules themselves are allowed to name them.
const ALLOW = /check-design|design rules|vibecode/i;

const files = [];
const walk = p => {
  const s = statSync(p);
  if (s.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
  else if (EXT.has(extname(p))) files.push(p);
};
for (const r of ROOTS) { try { walk(r); } catch { /* missing root */ } }

let failures = 0;
for (const file of files) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (ALLOW.test(line)) return;
    for (const [re, name, scope] of RULES) {
      if (scope === "code" && file.endsWith(".md")) continue; // docs may name what they ban
      if (re.test(line)) { console.error(`${file}:${i + 1}  ${name}: ${line.trim().slice(0, 100)}`); failures++; }
    }
  });
}
if (failures) { console.error(`\n${failures} design rule violation(s).`); process.exit(1); }
console.log(`Design rules: ${files.length} files clean.`);
