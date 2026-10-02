import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const pub = new URL('../public/', import.meta.url);

test('robots.txt and a real 404 page exist (no soft 404s)', () => {
  assert.ok(existsSync(new URL('robots.txt', pub)));
  assert.match(readFileSync(new URL('robots.txt', pub), 'utf8'), /^User-agent: \*/m);
  assert.ok(existsSync(new URL('404.html', pub)));
});

test('index.html carries canonical and share-card meta', () => {
  const html = readFileSync(new URL('index.html', pub), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/pythia-oracle\.pages\.dev\/">/);
  for (const p of ['og:title', 'og:description', 'og:url', 'og:type']) assert.match(html, new RegExp(`property="${p}"`));
  assert.match(html, /name="twitter:card"/);
});
