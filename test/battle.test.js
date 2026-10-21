import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrain, normalizeTraits } from '../lib/brain.js';
import { fallbackAttributes } from '../lib/chain.js';
import { resolveTurn, newState, scaleEnemy, pickOpponent, carryHp, stageScore, isBossStage, SPECIAL_COOLDOWN } from '../lib/battle.js';

const mk = (id) => buildBrain(id, normalizeTraits(fallbackAttributes(id)));

function fight(P, E, pick, seed = 's') {
  let st = newState(P.hp, P.hp, E.hp);
  const all = [];
  for (let i = 0; i < 60; i++) {
    const r = resolveTurn(P, E, st, pick(st), seed);
    st = r.state; all.push(r);
    if (r.over) return { st, all, last: r };
  }
  throw new Error('fight never ended');
}

test('a fight is deterministic and always ends with a winner', () => {
  const P = mk(1), E = mk(2);
  const a = fight(P, E, () => 'attack'), b = fight(P, E, () => 'attack');
  assert.deepEqual(a.all, b.all);
  assert.ok(['player', 'enemy'].includes(a.last.winner));
  assert.ok(a.st.round <= 30);
});

test('HP never goes below zero or above max', () => {
  for (let id = 1; id < 30; id++) {
    const P = mk(id), E = mk(id + 100);
    const f = fight(P, E, (s) => (s.p.cd === 0 ? 'special' : 'guard'), `x${id}`);
    for (const r of f.all) {
      assert.ok(r.state.p.hp >= 0 && r.state.p.hp <= r.state.p.max);
      assert.ok(r.state.e.hp >= 0 && r.state.e.hp <= r.state.e.max);
    }
  }
});

test('special has a cooldown and cannot be spammed', () => {
  const P = mk(3), E = scaleEnemy(mk(4), 1);
  let st = newState(P.hp, P.hp, E.hp);
  const r = resolveTurn(P, E, st, 'special', 'cd');
  assert.equal(r.state.p.cd, SPECIAL_COOLDOWN);
  assert.throws(() => resolveTurn(P, E, r.state, 'special', 'cd'), /not ready/);
});

test('unknown moves are rejected', () => {
  const P = mk(1), E = mk(2);
  assert.throws(() => resolveTurn(P, E, newState(P.hp, P.hp, E.hp), 'laser', 's'), /unknown move/);
});

test('guarding reduces damage taken compared with attacking', () => {
  let guarded = 0, open = 0;
  for (let id = 1; id < 40; id++) {
    const P = mk(id), E = mk(id + 50);
    const sumDmgToPlayer = (move) => {
      const r = resolveTurn(P, E, newState(P.hp, P.hp, E.hp), move, `g${id}`);
      return r.events.filter((e) => e.who === 'enemy' && e.type === 'hit').reduce((n, e) => n + e.dmg, 0);
    };
    guarded += sumDmgToPlayer('guard');
    open += sumDmgToPlayer('attack');
  }
  assert.ok(guarded < open, `guard ${guarded} should be below open ${open}`);
});

test('enemies get tougher each stage and bosses are tougher still', () => {
  const b = mk(5);
  const s1 = scaleEnemy(b, 1), s4 = scaleEnemy(b, 4), s5 = scaleEnemy(b, 5);
  assert.ok(s4.stats.power > s1.stats.power);
  assert.ok(s5.hp > s4.hp);
  assert.equal(s5.boss, true);
  assert.equal(s1.boss, false);
  assert.equal(isBossStage(10), true);
  assert.ok(scaleEnemy(b, 1, { daily: true }).hp > s1.hp);
});

test('opponents are valid ids, never the player, and the daily boss is shared', () => {
  for (let st = 1; st < 40; st++) {
    const id = Number(pickOpponent('7', st, '2026-10-21', 'arena'));
    assert.ok(id >= 1 && id <= 1969 && id !== 7);
  }
  assert.equal(pickOpponent('1', 1, '2026-10-21', 'daily'), pickOpponent('99', 1, '2026-10-21', 'daily'));
  assert.notEqual(pickOpponent('1', 1, '2026-10-21', 'daily'), pickOpponent('1', 1, '2026-10-22', 'daily'));
});

test('score rewards deeper stages and remaining health', () => {
  assert.ok(stageScore(3, 1, 4) > stageScore(2, 1, 4));
  assert.ok(stageScore(2, 1, 4) > stageScore(2, 0.1, 4));
  assert.equal(carryHp(10, 100), 70);
  assert.equal(carryHp(90, 100), 100);
});
