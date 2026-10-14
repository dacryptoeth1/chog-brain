import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrain, normalizeTraits } from '../lib/brain.js';
import { fallbackAttributes } from '../lib/chain.js';
import { swordFor, artFor } from '../lib/art.js';

const mk = (id, over = {}) => {
  const attrs = fallbackAttributes(id).map((a) => (over[a.trait_type] ? { ...a, value: over[a.trait_type] } : a));
  return buildBrain(id, normalizeTraits(attrs));
};

test('each Chog gets its own sword, stable across calls', () => {
  assert.equal(swordFor(mk(0)).svg, swordFor(mk(0)).svg);
  const svgs = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => swordFor(mk(i)).svg));
  assert.ok(svgs.size >= 8, `expected mostly unique swords, got ${svgs.size}/10`);
});

test('changing a trait changes the sword', () => {
  assert.notEqual(swordFor(mk(3)).svg, swordFor(mk(3, { Aura: 'zzz-new', Accessory: 'qqq-new', Head: 'xxx-new' })).svg);
});

test('output is well-formed SVG with no scripts', () => {
  for (let i = 0; i < 25; i++) {
    const a = artFor(mk(i));
    for (const s of [a.sword.svg, a.placeholder]) {
      assert.match(s, /^<svg [^>]*viewBox=/);
      assert.match(s, /<\/svg>$/);
      assert.ok(!/<script|onload|onerror/i.test(s));
    }
  }
});

test('crying placeholder is valid, safe, and different from the normal one', () => {
  const a = artFor(mk(4));
  assert.notEqual(a.placeholderCry, a.placeholder);
  assert.match(a.placeholderCry, /^<svg [^>]*viewBox=/);
  assert.ok(!/<script|onload|onerror/i.test(a.placeholderCry));
});

test('high tier swords glow, low tier do not', () => {
  assert.equal(swordFor(mk(1, { Tier: 'legendary' })).glow, true);
  assert.equal(swordFor(mk(1, { Tier: 'common' })).glow, false);
});
