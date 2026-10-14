import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrain, runDuel, templateNarration, normalizeTraits } from '../lib/brain.js';
import { fallbackAttributes } from '../lib/chain.js';

const mk = (id) => buildBrain(id, normalizeTraits(fallbackAttributes(id)));

test('same Chog always produces the same brain', () => {
  assert.deepEqual(mk(7), mk(7));
});

test('changing one trait changes the character (the NFT matters)', () => {
  const attrs = fallbackAttributes(7);
  const base = buildBrain(7, normalizeTraits(attrs));
  const changed = buildBrain(7, normalizeTraits(attrs.map((a) => (a.trait_type === 'Eyes' ? { ...a, value: 'zzz-new' } : a))));
  assert.notDeepEqual(base.stats, changed.stats);
});

test('different Chogs differ', () => {
  const sigs = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((i) => JSON.stringify(mk(i).stats)));
  assert.ok(sigs.size > 4);
});

test('duel is deterministic, terminates, and has a valid winner', () => {
  const a = mk(1), b = mk(2);
  const d1 = runDuel(a, b, 'x'), d2 = runDuel(a, b, 'x');
  assert.deepEqual(d1, d2);
  assert.ok(d1.rounds.length >= 1 && d1.rounds.length <= 12);
  assert.ok([a.tokenId, b.tokenId].includes(d1.winner));
});

test('template narration names the winner', () => {
  const a = mk(1), b = mk(2);
  const d = runDuel(a, b, 'x');
  assert.match(templateNarration(a, b, d), new RegExp(`Chog #${d.winner} wins`));
});
