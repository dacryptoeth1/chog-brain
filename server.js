import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { buildBrain, normalizeTraits, runDuel, templateNarration } from './lib/brain.js';
import { loadChog, ownerOf, chainStatus, fetchImage, snapshotSize, MAX_ID, CHOG_CONTRACT } from './lib/chain.js';
import { artFor } from './lib/art.js';
import { createStore } from './lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const llm = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// Progression is keyed by token ID (the NFT is the save file). See lib/store.js.
const store = createStore({ defaultFile: path.join(__dirname, 'data.json') });
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ xp: 0, wins: 0, losses: 0, lastRun: null, memory: [] });
const levelOf = (xp) => 1 + Math.floor(Math.sqrt(xp / 20));

function validId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_ID ? String(n) : null;
}

async function fullChog(id, opts) {
  const nft = await loadChog(id, opts);
  const brain = buildBrain(id, normalizeTraits(nft.attributes));
  const st = (await store.get(id)) || blank();
  // Progression feeds back into the brain: levels add flat stats.
  const lvl = levelOf(st.xp);
  for (const k of Object.keys(brain.stats)) brain.stats[k] += lvl - 1;
  brain.hp += (lvl - 1) * 4;
  return { nft, brain, progress: { ...st, level: lvl } };
}

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
  if (!id) return res.status(400).json({ error: `token id must be 0-${MAX_ID}` });
  const { nft, brain, progress } = await fullChog(id);
  // The browser loads the art through our own route, so it never depends on an IPFS gateway.
  const out = { ...nft, image: nft.imageRaw ? `/api/chog/${id}/image` : null };
  delete out.imageRaw;
  res.json({ nft: out, brain, progress, art: artFor(brain) });
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
  if (!id) return res.status(400).json({ error: `token id must be 0-${MAX_ID}` });
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
