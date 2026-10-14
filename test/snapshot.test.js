import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, serialize, SNAPSHOT_VERSION } from '../lib/snapshot.js';

const meta = (id) => ({ name: `CHOG #${id}`, image: `ipfs://img/${id}.png`, attributes: [{ trait_type: 'Tier', value: 'Common' }] });

test('builds every token with name, image and traits', async () => {
  const { tokens, failed } = await buildSnapshot({
    ids: [0, 1, 2], readURI: async (id) => `ipfs://m/${id}`, readMeta: async (u) => meta(u.split('/').pop()), backoffMs: 1,
  });
  assert.deepEqual(Object.keys(tokens).sort(), ['0', '1', '2']);
  assert.equal(tokens['1'].image, 'ipfs://img/1.png');
  assert.equal(tokens['2'].attributes[0].value, 'Common');
  assert.deepEqual(failed, {});
});

test('retries flaky reads, then reports tokens that never succeed', async () => {
  const tries = {};
  const { tokens, failed } = await buildSnapshot({
    ids: [1, 2], retries: 2, backoffMs: 1,
    readURI: async (id) => { tries[id] = (tries[id] || 0) + 1; if (id === 1 && tries[id] < 3) throw new Error('rate limited'); return `u${id}`; },
    readMeta: async (u) => { if (u === 'u2') throw new Error('gateway down'); return meta(u.slice(1)); },
  });
  assert.ok(tokens['1'], 'token 1 succeeds on the 3rd try');
  assert.equal(tries[1], 3);
  assert.equal(tokens['2'], undefined);
  assert.match(failed['2'], /gateway down/);
});

test('resumes: tokens already saved are not fetched again', async () => {
  const fetched = [];
  const { tokens } = await buildSnapshot({
    ids: [0, 1, 2, 3], existing: { 0: meta(0), 1: meta(1) }, backoffMs: 1,
    readURI: async (id) => { fetched.push(id); return `u${id}`; }, readMeta: async (u) => meta(u.slice(1)),
  });
  assert.deepEqual(fetched.sort(), [2, 3]);
  assert.equal(Object.keys(tokens).length, 4);
});

test('respects the concurrency limit and saves checkpoints along the way', async () => {
  let live = 0, peak = 0; const checkpoints = [];
  await buildSnapshot({
    ids: Array.from({ length: 30 }, (_, i) => i), concurrency: 4, checkpointEvery: 10, backoffMs: 1,
    readURI: async (id) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return `u${id}`; },
    readMeta: async (u) => meta(u.slice(1)),
    onCheckpoint: (t) => checkpoints.push(Object.keys(t).length),
  });
  assert.ok(peak <= 4, `peak concurrency was ${peak}`);
  assert.ok(checkpoints.length >= 3 && checkpoints.at(-1) === 30);
});

test('serialize sorts ids numerically and stamps version + contract', () => {
  const out = JSON.parse(serialize({ 10: meta(10), 2: meta(2), 1: meta(1) }, '0xabc'));
  assert.equal(out.version, SNAPSHOT_VERSION);
  assert.equal(out.contract, '0xabc');
  assert.deepEqual(Object.keys(out.tokens), ['1', '2', '10']);
});
