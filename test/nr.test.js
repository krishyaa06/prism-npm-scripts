const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const N = require("../src");
const bin = path.join(__dirname, "../bin/nr.js");
const app = path.join(__dirname, "../examples/app");
const names = Object.keys(require("../examples/app/package.json").scripts).map((name) => ({ name }));
const best = (q) => N.match(q, names)[0]?.name;

test("fuzzy", () => {
  assert.equal(best("dev"), "dev"); assert.equal(best("d"), "dev"); assert.equal(best("tw"), "test:watch");
  assert.equal(best("t:e"), "test:e2e"); assert.equal(best("d:s"), "db:studio"); assert.equal(best("tyc"), "typecheck");
  assert.equal(best("zzz"), undefined);
});
test("groups + descriptions", () => {
  const s = N.scripts(require("../examples/app/package.json"));
  const g = Object.fromEntries(s.map((x) => [x.name, x.group]));
  assert.equal(g["test:watch"], "test"); assert.equal(g.dev, "dev"); assert.equal(g.postinstall, "hooks"); assert.equal(g["db:push"], "db"); assert.equal(g.preview, "dev");
  assert.equal(s.find((x) => x.name === "deploy").desc, "Ship to Vercel production");
  assert.equal(N.scripts({ scripts: { a: "x", "//a": "does a" } })[0].desc, "does a");
});
test("package manager", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nr-")); fs.mkdirSync(path.join(d, "pkg"));
  assert.equal(N.detectPM(path.join(d, "pkg")), "npm");
  fs.writeFileSync(path.join(d, "yarn.lock"), ""); assert.equal(N.detectPM(path.join(d, "pkg")), "yarn");
  assert.equal(N.detectPM(d, { packageManager: "bun@1.1.0" }), "bun");
  assert.deepEqual(N.runCmd("npm", "t", ["-w"]), ["npm", ["run", "t", "--", "-w"]]);
});
test("cli", () => {
  const r = (...a) => spawnSync(process.execPath, [bin, "-C", app, ...a], { encoding: "utf8" });
  assert.match(r("-n", "tw", "--x").stdout, /pnpm run test:watch --x/);
  assert.match(r("-l").stdout, /DB[\s\S]*db:push/);
  assert.equal(JSON.parse(r("--json").stdout).pm, "pnpm");
  assert.equal(r("-n", "zzz").status, 2);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nr-")); fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ scripts: { hi: "node -e \"process.exit(3)\"" } }));
  const run = spawnSync(process.execPath, [bin, "-C", d, "hi"], { encoding: "utf8" }); assert.equal(run.status, 3); assert.match(run.stdout, /exit 3/);
});
