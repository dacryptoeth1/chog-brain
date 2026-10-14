// Chog Brain core: turns a Chog's traits into a personality + combat stats,
// and runs a deterministic duel. Same Chog -> same brain, always.

export const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// FNV-1a string hash -> 32-bit int
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Small seeded PRNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEMPERAMENTS = [
  ['mischievous', 'cracks jokes mid-fight and loves chaos'],
  ['stoic', 'speaks rarely and never blinks'],
  ['hyperactive', 'cannot stand still and talks too fast'],
  ['dramatic', 'treats every move like a final boss moment'],
  ['sneaky', 'always has a trick up the sleeve'],
  ['noble', 'fights with honor and long speeches'],
  ['dreamy', 'is half asleep and still somehow winning'],
  ['grumpy', 'complains constantly but hits hard'],
];

const SIGNATURE_MOVES = [
  'Monad Slam', 'Parallel Punch', 'Gas-Free Dash', 'Block Time Burst',
  'Validator Veto', 'Mempool Mayhem', 'Finality Flip', 'Nad Nuke',
];

// Normalize attributes from OpenSea/ERC721 metadata into { trait_type: value }
export function normalizeTraits(attributes = []) {
  const out = {};
  for (const a of attributes) {
    if (!a || !a.trait_type) continue;
    out[String(a.trait_type)] = String(a.value ?? 'none');
  }
  return out;
}

function tierBonus(traits) {
  const t = (traits.Tier || traits.tier || '').toLowerCase();
  const i = TIERS.indexOf(t);
  return i >= 0 ? i : 0;
}

// Build the Brain from traits. Each trait value nudges a stat via its hash,
// so changing ANY trait changes the character. Tier gives a flat power bonus.
export function buildBrain(tokenId, traits) {
  const keys = Object.keys(traits).sort();
  const sig = keys.map((k) => `${k}=${traits[k]}`).join('|') || `token-${tokenId}`;
  const h = hash(sig);
  const r = rng(h);

  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const temperament = pick(TEMPERAMENTS);
  const move = pick(SIGNATURE_MOVES);

  const part = (k) => hash(`${k}:${traits[k] ?? 'none'}`) % 7; // 0..6
  const bonus = tierBonus(traits);

  const stats = {
    power: 8 + part('Body') + part('Accessory') + bonus * 2,
    speed: 8 + part('Head') + part('Eyes') + bonus,
    charm: 8 + part('Mouth') + part('Skin') + bonus,
    luck: 8 + part('Aura') + part('Background') + bonus,
  };
  const hp = 60 + bonus * 8 + (stats.power >> 1);

  return {
    tokenId: String(tokenId),
    traits,
    personality: { temperament: temperament[0], quirk: temperament[1] },
    signatureMove: move,
    stats,
    hp,
  };
}

// Deterministic duel. Returns structured rounds; narration is layered on top.
export function runDuel(a, b, seedExtra = '', { maxRounds = 12, minRounds = 1 } = {}) {
  const r = rng(hash(`${a.tokenId}:${b.tokenId}:${seedExtra}`));
  const hpNow = { [a.tokenId]: a.hp, [b.tokenId]: b.hp };
  const rounds = [];
  let attacker = a.stats.speed >= b.stats.speed ? a : b;
  let defender = attacker === a ? b : a;

  for (let n = 1; n <= maxRounds; n++) {
    const crit = r() < attacker.stats.luck / 100;
    const dodge = r() < defender.stats.speed / 220;
    let dmg = 0;
    if (!dodge) {
      dmg = Math.round(attacker.stats.power * (0.8 + r() * 0.8) + attacker.stats.charm * 0.25);
      if (crit) dmg = Math.round(dmg * 1.6);
    }
    // Before minRounds nobody can be knocked out, so a fight always lasts long enough to talk through.
    const before = hpNow[defender.tokenId];
    hpNow[defender.tokenId] = Math.max(n < minRounds ? 1 : 0, before - dmg);
    dmg = before - hpNow[defender.tokenId];
    rounds.push({
      n,
      attacker: attacker.tokenId,
      defender: defender.tokenId,
      move: crit ? attacker.signatureMove : 'a regular hit',
      dodge,
      crit,
      dmg,
      hp: { ...hpNow },
    });
    if (hpNow[defender.tokenId] === 0) break;
    [attacker, defender] = [defender, attacker];
  }

  const aHp = hpNow[a.tokenId];
  const bHp = hpNow[b.tokenId];
  const winner = aHp === bHp ? (a.stats.luck >= b.stats.luck ? a : b) : aHp > bHp ? a : b;
  return { winner: winner.tokenId, rounds, finalHp: hpNow };
}

// Template narration, used when no LLM key is set (and as a fallback on errors).
export function templateNarration(a, b, duel) {
  const byId = { [a.tokenId]: a, [b.tokenId]: b };
  const lines = [
    `Chog #${a.tokenId} (${a.personality.temperament}) squares up against Chog #${b.tokenId} (${b.personality.temperament}).`,
  ];
  for (const rd of duel.rounds) {
    const at = byId[rd.attacker];
    const df = byId[rd.defender];
    if (rd.dodge) {
      lines.push(`Round ${rd.n}: #${at.tokenId} swings, but #${df.tokenId} slips away. No damage.`);
    } else if (rd.crit) {
      lines.push(`Round ${rd.n}: #${at.tokenId} unleashes ${at.signatureMove}! ${rd.dmg} damage, and #${df.tokenId} feels it.`);
    } else {
      lines.push(`Round ${rd.n}: #${at.tokenId} lands a clean hit for ${rd.dmg}.`);
    }
  }
  const w = byId[duel.winner];
  lines.push(`Chog #${w.tokenId} wins. ${w.personality.quirk}, and today it paid off.`);
  return lines.join('\n');
}
