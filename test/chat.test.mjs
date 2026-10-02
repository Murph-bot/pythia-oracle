import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, cleanReply } from '../functions/api/chat.js';

const GEMMA = '@cf/google/gemma-4-26b-a4b-it';
const LLAMA = '@cf/meta/llama-3.2-3b-instruct';

function stubCaches() {
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
}

// Records every env.AI.run call ({ model, opts }) and delegates to `impl`.
function makeEnv(impl) {
  const calls = [];
  const env = {
    AI: {
      run: async (model, opts) => {
        calls.push({ model, opts });
        return impl(model, opts);
      },
    },
  };
  return { env, calls };
}

function makeRequest(body) {
  return { headers: { get: () => '203.0.113.9' }, json: async () => body };
}

test('gemma-shaped response wins: gemma tried first with thinking disabled, reply cleaned', async () => {
  stubCaches();
  const { env, calls } = makeEnv(async () => ({
    choices: [{ message: { content: '**PYTHIA:** "Hello there."' }, finish_reason: 'stop' }],
  }));

  const res = await onRequestPost({ request: makeRequest({ message: 'hi' }), env });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { reply: 'Hello there.' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, GEMMA);
  assert.equal(calls[0].opts.chat_template_kwargs.enable_thinking, false);
});

test('first model erroring with 5035 falls back to llama and returns its response', async () => {
  stubCaches();
  const { env, calls } = makeEnv(async (model) => {
    if (model === GEMMA) throw { code: 5035 };
    return { response: 'Llama speaks.' };
  });

  const res = await onRequestPost({ request: makeRequest({ message: 'hi' }), env });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { reply: 'Llama speaks.' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, GEMMA);
  assert.equal(calls[1].model, LLAMA);
});

test('budget error (3036) stops the chain immediately, no fallback call', async () => {
  stubCaches();
  const { env, calls } = makeEnv(async () => { throw { code: 3036 }; });

  const res = await onRequestPost({ request: makeRequest({ message: 'hi' }), env });

  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'BUDGET' });
  assert.equal(calls.length, 1);
});

test('cleanReply strips the speaker prefix, markdown emphasis, and wrapping quotes', () => {
  assert.equal(cleanReply('**PYTHIA:** "Hello there."', false), 'Hello there.');
});

test('cleanReply cuts a truncated reply back to the last sentence end', () => {
  assert.equal(cleanReply('One. Two. Thr', true), 'One. Two.');
});

test('history entries with bad roles or types are filtered before reaching the model', async () => {
  stubCaches();
  const { env, calls } = makeEnv(async () => ({ response: 'ok' }));
  const history = [
    { role: 'user', content: 'valid one' },
    { role: 'system', content: 'bad role' },
    { role: 'user', content: 123 },
    { role: 'assistant' },
    null,
    { role: 'assistant', content: 'valid two' },
  ];

  await onRequestPost({ request: makeRequest({ message: 'hi', history }), env });

  assert.deepEqual(calls[0].opts.messages.slice(1), [
    { role: 'user', content: 'valid one' },
    { role: 'assistant', content: 'valid two' },
    { role: 'user', content: 'hi' },
  ]);
});

test('mode "fortune" sends the fortune task text as the last user message and max_tokens 80', async () => {
  stubCaches();
  const { env, calls } = makeEnv(async () => ({ response: 'A proverb.' }));

  const res = await onRequestPost({ request: makeRequest({ mode: 'fortune' }), env });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { reply: 'A proverb.' });
  const sent = calls[0].opts.messages;
  assert.equal(
    sent[sent.length - 1].content,
    'The visitor typed the incantation "fortune". Give one original fortune-cookie proverb for developers and makers: one or two sentences, witty and true. Output only the proverb.'
  );
  assert.equal(calls[0].opts.max_tokens, 80);
});

test('unknown mode returns 400 BAD_MODE with no AI call', async () => {
  stubCaches();
  const { env, calls } = makeEnv(async () => ({ response: 'unused' }));

  for (const mode of ['nonsense', 'toString', '__proto__']) {
    const res = await onRequestPost({ request: makeRequest({ mode }), env });
    assert.equal(res.status, 400, mode);
    assert.deepEqual(await res.json(), { error: 'BAD_MODE' });
  }
  assert.equal(calls.length, 0);
});

test('mode "prophecy" with no message is accepted', async () => {
  stubCaches();
  const { env } = makeEnv(async () => ({ response: 'A prophecy.' }));

  const res = await onRequestPost({ request: makeRequest({ mode: 'prophecy' }), env });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { reply: 'A prophecy.' });
});

test('capacity error (3040) retries the same model once before falling back', async () => {
  stubCaches();
  let gemmaCalls = 0;
  const { env, calls } = makeEnv(async (model) => {
    if (model === GEMMA && gemmaCalls++ === 0) throw { code: 3040 };
    return { choices: [{ message: { content: 'Second wind.' }, finish_reason: 'stop' }] };
  });

  const res = await onRequestPost({ request: makeRequest({ message: 'hi' }), env });

  assert.deepEqual(await res.json(), { reply: 'Second wind.' });
  assert.deepEqual(calls.map((c) => c.model), [GEMMA, GEMMA]);
});

test('non-object JSON bodies (null, number, array) return 400 BAD_JSON without an AI call', async () => {
  stubCaches();
  const { env, calls } = makeEnv(async () => ({ response: 'unused' }));
  for (const body of [null, 5, 'str', true, []]) {
    const res = await onRequestPost({ request: makeRequest(body), env });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(await res.json(), { error: 'BAD_JSON' });
  }
  assert.equal(calls.length, 0);
});
