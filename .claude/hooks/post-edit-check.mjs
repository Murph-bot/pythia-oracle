#!/usr/bin/env node
// PostToolUse hook: fast per-file check after Edit/Write/MultiEdit.
// Exit 2 feeds the output back to Claude so it fixes the problem immediately.
// Silent no-op when the tool (eslint / ruff) is not installed locally.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;

let file;
try {
  file = JSON.parse(input)?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!file || !existsSync(file)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ext = extname(file);
const run = (cmd, args) =>
  spawnSync(cmd, args, { cwd: root, encoding: "utf8", timeout: 50_000 });

let result;
let label = "";
if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro"].includes(ext)) {
  const eslint = join(root, "node_modules", ".bin", "eslint");
  if (existsSync(eslint)) {
    label = "eslint";
    result = run(eslint, [file]);
  } else if ([".js", ".mjs", ".cjs"].includes(ext)) {
    label = "node --check";
    result = run(process.execPath, ["--check", file]);
  }
} else if (ext === ".py") {
  label = "ruff";
  result = run("ruff", ["check", file]);
  if (result.error) result = run("python3", ["-m", "ruff", "check", file]);
  if (result.error || /No module named ruff/.test(result.stderr || "")) result = undefined;
}

if (result && !result.error && result.status !== 0) {
  process.stderr.write(`${label} failed for ${file}:\n${result.stdout || ""}${result.stderr || ""}`);
  process.exit(2);
}
