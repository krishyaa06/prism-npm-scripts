#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const N = require("../src");
const { c, header, width, pad, plural } = require("../src/ui");
const pkgSelf = require("../package.json");

const HELP = `${header("nr", "find and run package.json scripts")}

${c.bold("Usage")}
  nr                  pick a script (arrow keys / type to filter) — or list when not a TTY
  nr <query> [args]   fuzzy-run: ${c.cyan("nr d")} → dev, ${c.cyan("nr b:p")} → build:prod, ${c.cyan("nr tw")} → test:watch
  nr -l, --list       list scripts grouped, with descriptions
  nr --json           scripts as JSON

${c.bold("Options")}
  -p, --pm <pm>       force npm | pnpm | yarn | bun (default: from lockfile)
  -n, --dry-run       print the command instead of running it
  -C, --cwd <dir>     start from another folder
  -v, --version / -h, --help

Describe scripts with ${c.dim('"scripts-info": { "dev": "Start Vite on :5173" }')} or ${c.dim('"//dev": "…"')} keys.
Args after the query are passed through: ${c.cyan("nr test --watch")}`;

const argv = process.argv.slice(2);
const opts = { pm: null, dry: false, cwd: ".", list: false, json: false };
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const x = argv[i];
  if (pos.length) { pos.push(x); continue; } // everything after the query passes through
  if (x === "-h" || x === "--help") { console.log(HELP); process.exit(0); }
  else if (x === "-v" || x === "--version") { console.log(pkgSelf.version); process.exit(0); }
  else if (x === "-l" || x === "--list") opts.list = true;
  else if (x === "--json") opts.json = true;
  else if (x === "-n" || x === "--dry-run") opts.dry = true;
  else if (x === "-p" || x === "--pm") { opts.pm = argv[++i]; if (!["npm", "pnpm", "yarn", "bun"].includes(opts.pm)) { console.error(c.red(`✖ --pm must be npm, pnpm, yarn or bun`)); process.exit(2); } }
  else if (x === "-C" || x === "--cwd") opts.cwd = argv[++i];
  else if (x.startsWith("-")) { console.error(c.red(`✖ Unknown option ${x}`)); process.exit(2); }
  else pos.push(x);
}
const pkgFile = N.findPkg(opts.cwd || ".");
if (!pkgFile) { console.error(c.red("✖ No package.json found here or in any parent folder")); process.exit(2); }
const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
const dir = path.dirname(pkgFile);
const pm = opts.pm || N.detectPM(dir, pkg);
const list = N.scripts(pkg);
const relDir = path.relative(process.cwd(), dir) || ".";

if (opts.json) { console.log(JSON.stringify({ package: pkg.name || null, dir, pm, scripts: list }, null, 2)); process.exit(0); }
if (!list.length) { console.log(`${header("nr", pkg.name || relDir)}\n\n${c.dim("No scripts in package.json.")}`); process.exit(0); }

const GC = { dev: c.green, build: c.cyan, test: c.yellow, quality: c.accent, db: c.accent2, release: c.red, other: c.dim, hooks: c.dim };
const nameW = Math.min(26, Math.max(...list.map((s) => width(s.name))));
const cols = process.stdout.columns || 100;
const line = (s, hi = false) => { const right = s.desc ? s.desc : c.dim(s.cmd); const room = Math.max(20, cols - nameW - 8); const txt = width(right) > room ? right.slice(0, room - 1) + "…" : right; return `${hi ? c.accent("❯") : " "} ${(hi ? (x) => c.bold(c.under(x)) : c.bold)(pad(s.name, nameW))}  ${s.desc ? txt : c.dim(txt)}`; };

function printList() {
  console.log(header("nr", `${pkg.name || relDir} · ${plural(list.length, "script")} · ${pm}`));
  for (const g of N.GROUPS) {
    const items = list.filter((s) => s.group === g); if (!items.length) continue;
    console.log(`\n${GC[g](c.bold(g.toUpperCase()))}`);
    for (const s of items) console.log(line(s));
  }
  console.log(`\n${c.dim("Run with")} ${c.cyan("nr <name>")} ${c.dim("— fuzzy: nr d, nr b:p, nr tw")}`);
}

function run(s, args) {
  const [cmd, cargs] = N.runCmd(pm, s.name, args);
  console.log(`${c.accent("◆")} ${c.bold(s.name)} ${c.dim("→")} ${c.dim(s.cmd)}${args.length ? " " + c.cyan(args.join(" ")) : ""}`);
  if (opts.dry) { console.log(`${cmd} ${cargs.join(" ")}`); process.exit(0); }
  const t0 = Date.now();
  const ch = spawn(cmd, cargs, { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
  ch.on("error", (e) => { console.error(c.red(`✖ ${e.code === "ENOENT" ? `${cmd} is not installed` : e.message}`)); process.exit(127); });
  const fwd = (sig) => ch.kill(sig); process.on("SIGINT", fwd); process.on("SIGTERM", fwd);
  ch.on("exit", (code, sig) => { const t = ((Date.now() - t0) / 1000).toFixed(1) + "s"; console.log(code === 0 ? `\n${c.green("✔")} ${s.name} ${c.dim(t)}` : `\n${c.red("✖")} ${s.name} ${c.dim(sig ? `killed by ${sig}` : `exit ${code}`)} ${c.dim(t)}`); process.exit(code ?? 1); });
}

if (opts.list || (!pos.length && !(process.stdin.isTTY && process.stdout.isTTY))) { printList(); process.exit(0); }

if (pos.length) {
  const [q, ...args] = pos;
  const m = N.match(q, list);
  if (!m.length) { console.error(c.red(`✖ No script matches "${q}"`) + c.dim(`  — available: ${list.map((s) => s.name).join(", ")}`)); process.exit(2); }
  if (m.length > 1 && m[0].score === m[1].score && m[0].score < 1000) {
    console.error(c.yellow(`⚠ "${q}" is ambiguous:`) + " " + m.filter((x) => x.score === m[0].score).map((x) => c.bold(x.name)).join(", ")); process.exit(2);
  }
  run(m[0], args);
} else {
  // interactive picker
  let q = "", sel = 0, shown = list, drawn = 0;
  const rl = require("node:readline"); rl.emitKeypressEvents(process.stdin); process.stdin.setRawMode(true);
  const out = process.stdout, max = Math.min(12, (out.rows || 20) - 4);
  const draw = () => {
    if (drawn) out.write(`\x1b[${drawn}A\x1b[J`);
    shown = q ? N.match(q, list) : list; sel = Math.min(sel, Math.max(0, shown.length - 1));
    const start = Math.max(0, Math.min(sel - Math.floor(max / 2), shown.length - max));
    const rows = [`${c.accent("?")} ${c.bold("Run script")} ${c.dim(`(${pm})`)} ${q ? c.cyan(q) : c.dim("type to filter")}`];
    shown.slice(start, start + max).forEach((s, i) => rows.push(line(s, i + start === sel)));
    if (!shown.length) rows.push(c.dim("  no matches"));
    rows.push(c.dim("  ↑↓ move · enter run · esc quit"));
    out.write(rows.join("\n") + "\n"); drawn = rows.length;
  };
  const quit = (code) => { process.stdin.setRawMode(false); out.write(`\x1b[${drawn}A\x1b[J`); process.stdin.pause(); return code; };
  process.stdin.on("keypress", (str, k = {}) => {
    if (k.ctrl && k.name === "c" || k.name === "escape") { quit(); process.exit(130); }
    if (k.name === "return") { const s = shown[sel]; if (!s) return; quit(); process.stdin.removeAllListeners("keypress"); return run(s, []); }
    if (k.name === "up") sel = (sel - 1 + shown.length) % Math.max(1, shown.length);
    else if (k.name === "down") sel = (sel + 1) % Math.max(1, shown.length);
    else if (k.name === "backspace") { q = q.slice(0, -1); sel = 0; }
    else if (str && str.length === 1 && str >= " ") { q += str; sel = 0; }
    draw();
  });
  draw();
}
