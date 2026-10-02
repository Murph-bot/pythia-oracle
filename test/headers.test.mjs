import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const pub = new URL('../public/', import.meta.url);
const read = (f) => readFileSync(new URL(f, pub), 'utf8');

test('_headers sets a strict CSP and anti-framing headers for every path', () => {
  assert.ok(existsSync(new URL('_headers', pub)), 'public/_headers exists');
  const h = read('_headers');
  const csp = h.match(/Content-Security-Policy:\s*(.+)/)?.[1] ?? '';
  const scriptSrc = csp.match(/script-src ([^;]+)/)?.[1] ?? '';
  assert.match(scriptSrc, /'self'/);
  assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(h, /X-Frame-Options: DENY/);
  assert.match(h, /Permissions-Policy:/);
});

test('index.html has no inline script, so script-src self is enough', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<script>(?!\s*<\/script>)/);
  assert.match(html, /<script src="\/app\.js" defer><\/script>/);
});
