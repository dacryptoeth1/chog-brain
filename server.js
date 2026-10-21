import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { buildBrain, normalizeTraits, runDuel, templateNarration } from './lib/brain.js';
import { loadChog, ownerOf, chainStatus, fetchImage, snapshotSize, MAX_ID, CHOG_CONTRACT } from './lib/chain.js';
import { artFor } from './lib/art.js';
import { createStore } from './lib/store.js';
import { resolveTurn, newState, scaleEnemy, pickOpponent, carryHp, stageScore, isBossStage, MOVES } from './lib/battle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const llm = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// Progression is keyed by token ID (the NFT is the save file). See lib/store.js.
const store = createStore({ defaultFile: path.join(__dirname, 'data.json') });
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ xp: 0, wins: 0, losses: 0, lastRun: null, lastDaily: null, bestStage: 0, bestScore: 0, runs: 0, memory: [] });
const levelOf = (xp) => 1 + Math.floor(Math.sqrt(xp / 20));

function validId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_ID ? String(n) : null;
}

async function fullChog(id, opts) {
  const nft = await loadChog(id, opts);
  const brain = buildBrain(id, normalizeTraits(nft.attributes));
  const st = { ...blank(), ...((await store.get(id)) || {}) };
  // Progression feeds back into the brain: levels add flat stats.
  const lvl = levelOf(st.xp);
  for (const k of Object.keys(brain.stats)) brain.stats[k] += lvl - 1;
  brain.hp += (lvl - 1) * 4;
  return { nft, brain, progress: { ...st, level: lvl } };
}

// Opponents are fought at their base strength (no progression), so fights stay fair.
async function baseChog(id) {
  const nft = await loadChog(id);
  return { nft, brain: buildBrain(id, normalizeTraits(nft.attributes)) };
}

const publicNft = (id, nft) => ({ name: nft.name, source: nft.source, reason: nft.reason, image: nft.imageRaw ? `/api/chog/${id}/image` : null });
const fighterOut = (id, nft, brain, extra = {}) => ({ id, nft: publicNft(id, nft), brain, art: artFor(brain), ...extra });
const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

async function narrate(a, b, duel) {
  if (!llm) return { text: templateNarration(a, b, duel), by: 'template' };
  try {
    const msg = await llm.messages.create({
      model: process.env.NARRATOR_MODEL || 'claude-haiku-5-5',
      max_tokens: 700,
      system:
        'You are a hype sports commentator for a cute NFT creature arena. Narrate the duel in 6-9 short lines. ' +
        'Use each fighter\'s temperament and quirk. Stay faithful to the round data: who hit, dodged, crit, and who wins. No markdown.',
      messages: [{
        role: 'user',
        content: JSON.stringify({
          fighters: [a, b].map((x) => ({ id: x.tokenId, personality: x.personality, signatureMove: x.signatureMove, stats: x.stats })),
          rounds: duel.rounds,
          winner: duel.winner,
        }),
      }],
    });
    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('').trim();
    return text ? { text, by: 'llm' } : { text: templateNarration(a, b, duel), by: 'template' };
  } catch {
    return { text: templateNarration(a, b, duel), by: 'template' };
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (_req, res) =>
  res.json({ ok: true, contract: CHOG_CONTRACT, narrator: llm ? 'llm' : 'template', chain: await chainStatus(), store: store.kind, snapshot: snapshotSize() }));

app.get('/api/chog/:id', async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: `token id must be 1-${MAX_ID}` });
  const { nft, brain, progress } = await fullChog(id);
  // The browser loads the art through our own route, so it never depends on an IPFS gateway.
  const out = { ...nft, image: nft.imageRaw ? `/api/chog/${id}/image` : null };
  delete out.imageRaw;
  res.json({ nft: out, brain, progress, art: artFor(brain), today: today() });
});

app.get('/api/chog/:id/image', async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).end();
  const nft = await loadChog(id);
  if (!nft.imageRaw) return res.status(404).end();
  try {
    const img = await fetchImage(nft.imageRaw);
    // Immutable art: browsers keep it a day, Vercel's edge keeps it a year, so each image is fetched once for everyone.
    res.set('content-type', img.type).set('cache-control', 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400').send(img.buf);
  } catch {
    res.status(502).end();
  }
});

// Ownership gate: with a wallet address, we require ownerOf(token) === address.
// If chain is unreachable we say so instead of silently allowing it.
app.post('/api/verify', async (req, res) => {
  const id = validId(req.body?.tokenId);
  const addr = String(req.body?.address || '').toLowerCase();
  if (!id || !/^0x[0-9a-f]{40}$/.test(addr)) return res.status(400).json({ error: 'tokenId and address required' });
  const owner = await ownerOf(id);
  if (!owner) return res.json({ verified: false, reason: 'chain unreachable or token not found' });
  res.json({ verified: owner.toLowerCase() === addr, owner });
});

app.post('/api/duel', async (req, res) => {
  const a = validId(req.body?.a);
  const b = validId(req.body?.b);
  if (!a || !b || a === b) return res.status(400).json({ error: 'two different valid token ids required' });
  const [A, B] = await Promise.all([fullChog(a), fullChog(b)]);
  const duel = runDuel(A.brain, B.brain, today());
  const story = await narrate(A.brain, B.brain, duel);

  await Promise.all([[a, duel.winner === a], [b, duel.winner === b]].map(async ([id, won]) => {
    const s = (await store.get(id)) || blank();
    s.xp += won ? 30 : 10;
    won ? (s.wins += 1) : (s.losses += 1);
    s.memory = [...s.memory, `${today()}: ${won ? 'won' : 'lost'} vs #${id === a ? b : a}`].slice(-10);
    await store.set(id, s);
  }));
  res.json({ a: A.brain, b: B.brain, duel, narration: story.text, narratedBy: story.by });
});

// Daily expedition: one per Chog per UTC day. Outcome depends on the brain.
app.post('/api/expedition/:id', async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: `token id must be 1-${MAX_ID}` });
  const s = (await store.get(id)) || blank();
  if (s.lastRun === today()) return res.status(429).json({ error: 'already ran today', next: 'tomorrow (UTC)' });
  const { brain } = await fullChog(id);
  const roll = (brain.stats.luck + brain.stats.charm) % 5;
  const finds = ['a shiny validator badge', 'a stack of MON dust', 'a rare aura shard', 'a mysterious map', 'nothing but a nap'];
  const gain = 15 + roll * 5;
  s.xp += gain;
  s.lastRun = today();
  s.memory = [...s.memory, `${today()}: expedition, found ${finds[roll]}`].slice(-10);
  await store.set(id, s);
  res.json({ found: finds[roll], xpGained: gain, level: levelOf(s.xp), temperament: brain.personality.temperament });
});


// ---------- Game mode: arena ladder and daily boss ----------
const modeOf = (m) => (m === 'daily' ? 'daily' : m === 'arena' ? 'arena' : null);
const seedOf = (mode, player, stage) => `${mode}:${today()}:${player}:${stage}`;

// Start a fight. Arena: stage N of your run. Daily: today's boss, one attempt per Chog per UTC day.
app.get('/api/stage', async (req, res) => {
  const player = validId(req.query.player);
  const mode = modeOf(req.query.mode);
  if (!player || !mode) return res.status(400).json({ error: 'player and mode (arena|daily) required' });
  const stage = mode === 'daily' ? 1 : num(req.query.stage, 1, 999, 1);
  const P = await fullChog(player);
  if (mode === 'daily') {
    if (P.progress.lastDaily === today()) return res.status(429).json({ error: 'Daily boss already fought today. Come back tomorrow (UTC).' });
    await store.set(player, { ...P.progress, level: undefined, lastDaily: today() });
  }
  const enemyId = pickOpponent(player, stage, today(), mode, MAX_ID);
  const E = await baseChog(enemyId);
  const enemy = scaleEnemy(E.brain, stage, { daily: mode === 'daily' });
  const startHp = mode === 'arena' && stage > 1 ? num(req.query.hp, 1, P.brain.hp, P.brain.hp) : P.brain.hp;
  res.json({
    mode, stage, boss: enemy.boss, seed: seedOf(mode, player, stage), today: today(),
    player: fighterOut(player, P.nft, P.brain, { level: P.progress.level }),
    enemy: fighterOut(enemyId, E.nft, enemy),
    state: newState(startHp, P.brain.hp, enemy.hp),
    best: { stage: P.progress.bestStage, score: P.progress.bestScore },
  });
});

// The server referees every round: you pick a move, it resolves your move and the enemy's reply.
app.post('/api/turn', async (req, res) => {
  const player = validId(req.body?.player);
  const mode = modeOf(req.body?.mode);
  const move = String(req.body?.move || '');
  const s = req.body?.state;
  if (!player || !mode || !MOVES.includes(move) || !s?.p || !s?.e) return res.status(400).json({ error: 'player, mode, move and state required' });
  const stage = mode === 'daily' ? 1 : num(req.body.stage, 1, 999, 1);
  const P = await fullChog(player);
  const enemyId = pickOpponent(player, stage, today(), mode, MAX_ID);
  const E = await baseChog(enemyId);
  const enemy = scaleEnemy(E.brain, stage, { daily: mode === 'daily' });
  // Clamp the client's state to legal values so it can't invent health or skip cooldowns.
  const state = {
    round: num(s.round, 0, 29, 0),
    p: { hp: num(s.p.hp, 1, P.brain.hp, P.brain.hp), max: P.brain.hp, cd: num(s.p.cd, 0, 4, 0) },
    e: { hp: num(s.e.hp, 1, enemy.hp, enemy.hp), max: enemy.hp, cd: num(s.e.cd, 0, 4, 0) },
  };
  try {
    const out = resolveTurn(P.brain, enemy, state, move, seedOf(mode, player, stage));
    const result = { ...out };
    if (out.over && out.winner === 'player' && mode === 'arena') {
      result.score = stageScore(stage, out.state.p.hp / out.state.p.max, out.state.round);
      result.nextHp = carryHp(out.state.p.hp, out.state.p.max);
    }
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// End of a run (arena) or of the boss fight (daily): pay out XP, wins/losses and personal bests.
app.post('/api/finish', async (req, res) => {
  const player = validId(req.body?.player);
  const mode = modeOf(req.body?.mode);
  if (!player || !mode) return res.status(400).json({ error: 'player and mode required' });
  const cleared = num(req.body.cleared, 0, 999, 0);
  const score = num(req.body.score, 0, 1_000_000, 0);
  const won = !!req.body.won;
  const s = { ...blank(), ...((await store.get(player)) || {}) };
  delete s.level;
  let xp = 0;
  if (mode === 'arena') {
    xp = cleared * 25;
    s.runs += 1;
    if (cleared > s.bestStage) s.bestStage = cleared;
    if (score > s.bestScore) s.bestScore = score;
    s.wins += cleared;
    s.losses += 1;
    s.memory = [...s.memory, `${today()}: arena run, cleared ${cleared} stages (${score} pts)`].slice(-10);
  } else {
    xp = won ? 60 : 15;
    won ? (s.wins += 1) : (s.losses += 1);
    s.memory = [...s.memory, `${today()}: daily boss, ${won ? 'beat it' : 'lost'}`].slice(-10);
  }
  s.xp += xp;
  await store.set(player, s);
  res.json({ xpGained: xp, level: levelOf(s.xp), xp: s.xp, bestStage: s.bestStage, bestScore: s.bestScore, newBest: mode === 'arena' && cleared >= s.bestStage && cleared > 0 });
});

// Any unexpected error becomes a clean JSON response instead of an HTML error page.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server error, please try again' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, (err) => {
    if (err) {
      console.error(`Could not start on port ${PORT}: ${err.code || err.message}. Another copy is probably still running; close it and try again.`);
      process.exit(1);
    }
    console.log(`Chog Brain on http://localhost:${PORT}`);
  });
}
export default app;
