import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, redisStore, fileStore } from '../lib/store.js';

test('file store round-trips and keeps tokens separate', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chog-')), 'd.json');
  const s = fileStore(file);
  assert.equal(await s.get('1'), null);
  await s.set('1', { xp: 10 });
  await s.set('2', { xp: 99 });
  assert.deepEqual(await s.get('1'), { xp: 10 });
  assert.deepEqual(await s.get('2'), { xp: 99 });
});

test('redis store sends authenticated commands and parses results', async () => {
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
    const [cmd] = JSON.parse(init.body);
    return { ok: true, json: async () => ({ result: cmd === 'GET' ? JSON.stringify({ xp: 5 }) : 'OK' }) };
  };
  const s = redisStore('https://example.upstash.io/', 'tok', fake);
  await s.set('7', { xp: 5 });
  assert.deepEqual(await s.get('7'), { xp: 5 });
  assert.equal(calls[0].url, 'https://example.upstash.io');
  assert.equal(calls[0].auth, 'Bearer tok');
  assert.deepEqual(calls[0].body, ['SET', 'chog:7', JSON.stringify({ xp: 5 })]);
  assert.deepEqual(calls[1].body, ['GET', 'chog:7']);
});

test('redis store returns null for a missing key and surfaces errors', async () => {
  const none = redisStore('https://x.io', 't', async () => ({ ok: true, json: async () => ({ result: null }) }));
  assert.equal(await none.get('1'), null);
  const bad = redisStore('https://x.io', 't', async () => ({ ok: false, status: 401 }));
  await assert.rejects(() => bad.get('1'), /redis 401/);
});

test('store selection: Vercel KV vars win, then DATA_FILE, then ephemeral on Vercel, then local file', () => {
  assert.equal(createStore({ env: { KV_REST_API_URL: 'https://a', KV_REST_API_TOKEN: 't', VERCEL: '1' } }).kind, 'redis');
  assert.equal(createStore({ env: { UPSTASH_REDIS_REST_URL: 'https://a', UPSTASH_REDIS_REST_TOKEN: 't' } }).kind, 'redis');
  assert.equal(createStore({ env: { DATA_FILE: '/x/y.json', VERCEL: '1' } }).kind, 'file');
  assert.equal(createStore({ env: { VERCEL: '1' } }).kind, 'ephemeral');
  assert.equal(createStore({ env: {}, defaultFile: '/tmp/z.json' }).kind, 'file');
});
