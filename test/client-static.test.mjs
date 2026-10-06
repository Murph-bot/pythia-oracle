// Static guards for client fixes (no DOM harness in this zero-build repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('the input shows a visible keyboard focus ring', () => {
  assert.match(html, /#input-line:focus-within\s*\{[^}]*outline:/);
});

test('clicks only refocus the input from the terminal background, not from links or text', () => {
  assert.doesNotMatch(js, /document\.addEventListener\('click', \(\) => \$cmd\.focus\(\)\)/);
  assert.match(js, /getSelection\(\)\.toString\(\)/);
});

test('the verdict overlay is a modal dialog that Escape closes', () => {
  assert.match(html, /id="verdict" role="dialog" aria-modal="true"/);
  assert.match(js, /e\.key === 'Escape'/);
});

test('Greek replies are spoken with a Greek voice', () => {
  assert.match(js, /el-GR/);
});

test('restored memory never feeds stored HTML to innerHTML', () => {
  const restore = js.slice(js.indexOf('function restoreMemory'), js.indexOf('function restoreMemory') + 1200);
  assert.match(restore, /DOMParser/);
});

test('client and server agree on message and history limits', () => {
  const server = readFileSync(new URL('../functions/api/chat.js', import.meta.url), 'utf8');
  const num = (src, re) => Number(src.match(re)?.[1]);
  assert.equal(num(server, /MAX_MESSAGE = (\d+)/), Number(html.match(/maxlength="(\d+)"/)?.[1]));
  assert.equal(num(server, /MAX_MESSAGE = (\d+)/), num(js, /e\.s\.slice\(0, (\d+)\)/));
  assert.equal(num(server, /MAX_HISTORY = (\d+)/), num(js, /history\.slice\(-(\d+)\)/));
});

test('chat replies keep their signature and send it back as history', () => {
  assert.match(js, /addEntry\('text', 'oracle', res\.reply, 'assistant', res\.sig \? \{ g: res\.sig \}/);
  assert.match(js, /role: 'assistant', content: e\.s, sig: e\.g/);
});

test('the privacy notice is reachable from the footer and as an incantation', () => {
  assert.match(html, /id="privacy-link"/);
  assert.match(js, /privacy: cmdPrivacy/);
  assert.match(js, /does not store your conversations/);
});
