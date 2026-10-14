import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrain, normalizeTraits } from '../lib/brain.js';
import { fallbackAttributes } from '../lib/chain.js';
import { planBrawl, cleanLine, cannedLine, cannedTaunt, assembleScript, voiceFor, parseJson, writeScript, MAX_WORDS } from '../lib/brawl.js';

const mk = (id) => buildBrain(id, normalizeTraits(fallbackAttributes(id)));
const words = (s) => s.split(' ').length;

test('brawl lasts 6-8 rounds, is deterministic, and ends with a valid winner', () => {
  for (let i = 1; i < 40; i += 2) {
    const a = mk(i), b = mk(i + 1);
    const p = planBrawl(a, b, 'x');
    assert.deepEqual(p, planBrawl(a, b, 'x'));
    assert.ok(p.rounds.length >= 6 && p.rounds.length <= 8, `rounds=${p.rounds.length}`);
    assert.ok([a.tokenId, b.tokenId].includes(p.winner));
    assert.ok(p.rounds.slice(0, -1).every((r) => r.kind !== 'ko'));
  }
});

test('a different nonce gives a different fight (rematch)', () => {
  const a = mk(1), b = mk(2);
  const seen = new Set(['a', 'b', 'c', 'd', 'e'].map((n) => JSON.stringify(planBrawl(a, b, n).rounds)));
  assert.ok(seen.size > 1);
});

test('filter rejects long, unsafe and link lines but keeps roasts', () => {
  assert.equal(cleanLine('Nice dodge, Chog #2. My cap hits harder than you.'), 'Nice dodge, Chog #2. My cap hits harder than you.');
  assert.equal(cleanLine('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'), null);
  assert.equal(cleanLine('I will kill you'), null);
  assert.equal(cleanLine('visit http://x.io'), null);
  assert.equal(cleanLine('Elon would be ashamed'), null);
  assert.equal(cleanLine(''), null);
  assert.equal(cleanLine(42), null);
});

test('every canned line is clean, short and mentions the event', () => {
  const a = mk(3), b = mk(4);
  for (const kind of ['miss', 'hit', 'knockdown', 'low', 'ko']) {
    for (const side of ['first', 'second']) {
      const t = cannedLine({ n: 1, kind, move: 'Nad Nuke' }, side, a, b);
      assert.ok(cleanLine(t), t);
      assert.ok(words(t) <= MAX_WORDS, t);
    }
  }
  assert.ok(cleanLine(cannedTaunt(a, b)));
});

test('bad model output falls back per line; good lines are kept', () => {
  const a = mk(5), b = mk(6), p = planBrawl(a, b, 'y');
  const parsed = { rounds: [{ n: 1, first: 'You swing like a sleepy snail.', second: 'I will kill you' }], taunt: 'ok' };
  const s = assembleScript(a, b, p, parsed);
  assert.equal(s.rounds[0].lines[0].text, 'You swing like a sleepy snail.');
  assert.notEqual(s.rounds[0].lines[1].text, 'I will kill you');
  assert.ok(s.rounds.every((r) => r.lines.length === 2 && r.lines.every((l) => cleanLine(l.text))));
  assert.equal(s.by, 'llm');
  assert.equal(assembleScript(a, b, p, null).by, 'canned');
});

test('writeScript survives a throwing model and a missing key', async () => {
  const a = mk(5), b = mk(6), p = planBrawl(a, b, 'y');
  assert.equal((await writeScript(null, a, b, p, 'm')).by, 'canned');
  const bad = { messages: { create: async () => { throw new Error('boom'); } } };
  assert.equal((await writeScript(bad, a, b, p, 'm')).by, 'canned');
  const junk = { messages: { create: async () => ({ content: [{ type: 'text', text: 'not json' }] }) } };
  assert.equal((await writeScript(junk, a, b, p, 'm')).by, 'canned');
});

test('voices differ between two Chogs and are stable', () => {
  const a = mk(7), b = mk(8);
  const va = voiceFor(a), vb = voiceFor(b, va);
  assert.deepEqual(va, voiceFor(a));
  assert.ok(Math.abs(va.pitch - vb.pitch) >= 0.25);
  assert.ok(va.pitch >= 0.7 && va.pitch <= 1.7);
});

test('parseJson pulls JSON out of chatter', () => {
  assert.deepEqual(parseJson('here: {"a":1} done'), { a: 1 });
  assert.equal(parseJson('nope'), null);
});

test('stage directions and emojis are stripped; fillers are allowed', () => {
  assert.equal(cleanLine('*laughs* Uh, come on bro 😂 (sigh) that was weak.'), 'Uh, come on bro that was weak.');
  assert.equal(cleanLine('Ha! Bro, is that ALL you got?'), 'Ha! Bro, is that ALL you got?');
});
