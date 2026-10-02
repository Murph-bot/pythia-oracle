import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const outDir = readFileSync(join(root, 'wrangler.toml'), 'utf8').match(/^pages_build_output_dir\s*=\s*"([^"]*)"/m)?.[1];

function walk(dir, base = '') {
  return readdirSync(dir).flatMap((name) => {
    const rel = base ? `${base}/${name}` : name;
    return statSync(join(dir, name)).isDirectory() ? walk(join(dir, name), rel) : [rel];
  });
}

test('Pages publishes a dedicated folder, not the repo root', () => {
  assert.ok(outDir, 'pages_build_output_dir is set');
  assert.notEqual(outDir.replace(/^\.\/?/, ''), '', 'output dir must not be the repo root');
});

test('published folder holds only site files (no docs, config, tests, source)', () => {
  const files = walk(join(root, outDir));
  const allowed = /^(index\.html|404\.html|robots\.txt|_headers|og\.png|favicon\.svg)$/;
  const leaked = files.filter((f) => !allowed.test(f));
  assert.deepEqual(leaked, []);
});
