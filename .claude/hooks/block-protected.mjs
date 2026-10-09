#!/usr/bin/env node
// PreToolUse hook: refuse direct edits to secrets and lockfiles.
// Exit 2 blocks the edit and tells Claude why. `*.example` templates stay editable.
import { basename } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;

let file;
try {
  file = JSON.parse(input)?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!file) process.exit(0);

const name = basename(file);
const isExample = /\.example$/.test(name);
const secret =
  !isExample && (/^\.env(\..+)?$/.test(name) || /^\.dev\.vars(\..+)?$/.test(name) || /\.(pem|key)$/.test(name));
const lockfile = ["package-lock.json", "uv.lock"].includes(name);

if (secret) {
  process.stderr.write(`Blocked: ${name} holds secrets. Ask the user to change it; edit the *.example template instead.\n`);
  process.exit(2);
}
if (lockfile) {
  process.stderr.write(`Blocked: ${name} is generated. Use the package manager (npm / uv) so the lockfile stays consistent.\n`);
  process.exit(2);
}
