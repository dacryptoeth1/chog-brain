// Turn-based battle engine. Pure and deterministic: the same state + move + seed always gives the
// same result, so the server can referee every turn and tests can replay whole fights.
// A fighter's real stats (from its NFT traits) decide how good each move is.
import { hash, rng } from './brain.js';

export const MOVES = ['attack', 'special', 'guard'];
export const SPECIAL_COOLDOWN = 3;   // turns you wait after using the special
export const MAX_ID_DEFAULT = 1969;

export const isBossStage = (stage) => stage % 5 === 0;

// Which Chog do you fight? Arena opponents depend on the day, your Chog and the stage; the daily boss is
// the same for everyone that day. Never the player's own Chog.
export function pickOpponent(playerId, stage, day, mode, maxId = MAX_ID_DEFAULT) {
  const key = mode === 'daily' ? `daily:${day}` : `arena:${day}:${playerId}:${stage}`;
  let id = 1 + (hash(key) % maxId);
  if (String(id) === String(playerId)) id = (id % maxId) + 1;
  return String(id);
}

// Opponents get tougher each stage; bosses and the daily boss are tougher still.
export function scaleEnemy(brain, stage, { daily = false } = {}) {
  const boss = daily || isBossStage(stage);
  const add = Math.round((stage - 1) * 1.3) - 4 + (daily ? 8 : 0) + (!daily && boss ? 2 : 0);
  const stats = Object.fromEntries(Object.entries(brain.stats).map(([k, v]) => [k, v + add]));
  const hp = Math.round(brain.hp * (0.85 + (stage - 1) * 0.05) * (daily ? 1.5 : boss ? 1.15 : 1));
  return { ...brain, stats, hp, boss };
}

export function newState(playerHp, playerMax, enemyHp) {
  return {
    round: 0,
    p: { hp: playerHp, max: playerMax, cd: 0 },
    e: { hp: enemyHp, max: enemyHp, cd: 0 },
  };
}

// Healing between arena stages: win a fight, get back 60% of max HP.
export const carryHp = (hp, max) => Math.min(max, hp + Math.round(max * 0.6));

export function stageScore(stage, hpFrac, rounds) {
  return 100 * stage + Math.round(Math.max(0, Math.min(1, hpFrac)) * 50) + Math.max(0, 10 - rounds) * 5;
}

function enemyChoose(E, st, r) {
  const u = r(), u2 = r();
  const hpFrac = st.e.hp / st.e.max;
  const specialP = E.boss ? 0.6 : 0.4;
  if (st.e.cd === 0 && u < specialP) return 'special';
  if (hpFrac < 0.35 && u2 < 0.3) return 'guard';
  return 'attack';
}

const sideName = { p: 'player', e: 'enemy' };

// Resolve one full round: the player's chosen move and the enemy's reply.
// Returns { state, events, over, winner, enemyMove }. Throws on an illegal move.
export function resolveTurn(P, E, state, move, seed) {
  if (!MOVES.includes(move)) throw new Error('unknown move');
  if (move === 'special' && state.p.cd > 0) throw new Error('special is not ready');
  const st = JSON.parse(JSON.stringify(state));
  st.round += 1;
  const r = rng(hash(`${seed}:${st.round}`));
  const enemyMove = enemyChoose(E, st, r);
  const moves = { p: move, e: enemyMove };
  const brains = { p: P, e: E };
  const events = [];

  // Guarding goes first (it is a stance). Otherwise the faster Chog acts first; ties go to the player.
  const rank = (s) => (moves[s] === 'guard' ? 1000 : 0) + brains[s].stats.speed;
  const order = rank('p') >= rank('e') ? ['p', 'e'] : ['e', 'p'];
  const guarding = { p: false, e: false };

  const snap = () => ({ p: st.p.hp, e: st.e.hp });

  for (const s of order) {
    const o = s === 'p' ? 'e' : 'p';
    if (st[s].hp <= 0 || st[o].hp <= 0) break;
    const mv = moves[s];
    const A = brains[s], D = brains[o];

    if (mv === 'guard') {
      guarding[s] = true;
      const heal = Math.min(st[s].max - st[s].hp, Math.round(st[s].max * 0.06));
      st[s].hp += heal;
      events.push({ type: 'guard', who: sideName[s], heal, hp: snap() });
      continue;
    }

    let mult = 1;
    let missed;
    if (mv === 'special') {
      mult = 1.8;
      st[s].cd = SPECIAL_COOLDOWN + 1; // ticks down at the end of this round
      missed = r() >= 0.85;
    } else {
      missed = r() < D.stats.speed / 220;
    }
    if (missed) {
      events.push({ type: 'miss', who: sideName[s], move: mv, hp: snap() });
      continue;
    }
    const crit = r() < A.stats.luck / 100;
    let dmg = (A.stats.power * (0.8 + r() * 0.6) + A.stats.charm * 0.2) * mult * (crit ? 1.6 : 1) * (s === 'p' ? 1.25 : 1); // the player gets a small edge
    const blocked = guarding[o];
    if (blocked) dmg *= 0.4;
    dmg = Math.max(1, Math.round(dmg));
    st[o].hp = Math.max(0, st[o].hp - dmg);
    events.push({ type: 'hit', who: sideName[s], move: mv, dmg, crit, blocked, hp: snap() });

    // A guarding Chog may counter a hit it blocked, depending on its speed.
    if (blocked && st[o].hp > 0 && r() < D.stats.speed / 60) {
      const counter = Math.max(1, Math.round(D.stats.power * 0.6));
      st[s].hp = Math.max(0, st[s].hp - counter);
      events.push({ type: 'counter', who: sideName[o], dmg: counter, hp: snap() });
    }
  }

  st.p.cd = Math.max(0, st.p.cd - 1);
  st.e.cd = Math.max(0, st.e.cd - 1);

  const over = st.p.hp <= 0 || st.e.hp <= 0 || st.round >= 30;
  let winner = null;
  if (over) {
    winner = st.p.hp <= 0 ? 'enemy' : st.e.hp <= 0 ? 'player' : st.p.hp / st.p.max >= st.e.hp / st.e.max ? 'player' : 'enemy';
  }
  return { state: st, events, over, winner, enemyMove };
}
