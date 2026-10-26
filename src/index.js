"use strict";
const fs = require("node:fs");
const path = require("node:path");

/** Find nearest package.json upward. */
function findPkg(start) {
  let d = path.resolve(start);
  for (;;) { const f = path.join(d, "package.json"); if (fs.existsSync(f)) return f; const up = path.dirname(d); if (up === d) return null; d = up; }
}
/** Detect package manager from lockfiles / packageManager field, walking up (monorepos). */
function detectPM(dir, pkg = {}) {
  const pmField = /^(npm|pnpm|yarn|bun)@/.exec(pkg.packageManager || "");
  if (pmField) return pmField[1];
  let d = path.resolve(dir);
  for (;;) {
    for (const [f, pm] of [["bun.lockb", "bun"], ["bun.lock", "bun"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"], ["npm-shrinkwrap.json", "npm"]]) if (fs.existsSync(path.join(d, f))) return pm;
    const up = path.dirname(d); if (up === d) return "npm"; d = up;
  }
}
/** Script descriptions: "scripts-info" / "scriptsInfo" objects or "//name" / "// name" keys in scripts. */
function scripts(pkg) {
  const s = pkg.scripts || {}, info = pkg["scripts-info"] || pkg.scriptsInfo || pkg.ntl?.descriptions || {};
  const out = [];
  for (const [name, cmd] of Object.entries(s)) {
    if (name.startsWith("//")) continue;
    const desc = info[name] || s["//" + name] || s["// " + name] || null;
    out.push({ name, cmd, desc, group: group(name, cmd) });
  }
  return out;
}
function group(name, cmd) {
  const n = name.toLowerCase();
  if (/^(pre|post)/.test(n) && n !== "prepare" && n !== "preview") return "hooks";
  if (/(^|:)(test|e2e|spec|coverage|cy|playwright)/.test(n) || /\b(jest|vitest|mocha|node --test|playwright)\b/.test(cmd)) return "test";
  if (/(^|:)(dev|start|serve|watch|preview)/.test(n)) return "dev";
  if (/(^|:)(build|compile|bundle|export)/.test(n)) return "build";
  if (/(^|:)(lint|format|fmt|prettier|typecheck|check|tsc)/.test(n)) return "quality";
  if (/(^|:)(deploy|release|publish|version)/.test(n)) return "release";
  if (/(^|:)(db|migrate|seed|prisma|generate)/.test(n)) return "db";
  return "other";
}
const GROUPS = ["dev", "build", "test", "quality", "db", "release", "other", "hooks"];

/** Fuzzy match: exact > prefix > segment initials (b:p → build:prod) > subsequence. */
function score(q, name) {
  q = q.toLowerCase(); const n = name.toLowerCase();
  if (q === n) return 1000;
  if (n.startsWith(q)) return 800 - n.length;
  const segs = n.split(/[:\-_.]/), qs = q.split(/[:\-_.]/);
  if (qs.length === segs.length && qs.every((x, i) => segs[i].startsWith(x))) return 700 - n.length;
  if (q.length <= segs.length && [...q].every((ch, i) => segs[i]?.[0] === ch) && !/[:\-_.]/.test(q)) return 600 - n.length;
  if (n.includes(q)) return 500 - n.indexOf(q) - n.length;
  let i = 0, gaps = 0, last = -1;
  for (let j = 0; j < n.length && i < q.length; j++) if (n[j] === q[i]) { if (last >= 0) gaps += j - last - 1; last = j; i++; }
  return i === q.length ? 300 - gaps * 5 - n.length : -1;
}
function match(q, list) { return list.map((s) => ({ ...s, score: score(q, s.name) })).filter((s) => s.score >= 0).sort((a, b) => b.score - a.score); }

/** Command to run a script with a package manager. */
function runCmd(pm, name, args = []) {
  if (pm === "npm") return ["npm", ["run", name, ...(args.length ? ["--", ...args] : [])]];
  if (pm === "yarn") return ["yarn", ["run", name, ...args]];
  return [pm, ["run", name, ...args]];
}
module.exports = { findPkg, detectPM, scripts, group, GROUPS, score, match, runCmd };
