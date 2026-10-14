// Original, trait-driven art. Every Chog gets its own sword (deterministic:
// same traits -> same sword). We never redraw the Chog character itself: the
// real NFT image is shown when available, otherwise a generic placeholder.
import { hash } from './brain.js';

const BLADES = ['#cfd8ff', '#ffd9a0', '#b7f0e0', '#f5b8ff', '#ffb3a7', '#c3ffb0', '#a8c8ff', '#fff2a0'];
const GEMS = ['#836ef9', '#ff5d8f', '#4ade80', '#fbbf24', '#38bdf8', '#f97316'];
const SKINS = ['#836ef9', '#6ee7b7', '#fbbf24', '#e5e7eb', '#f472b6', '#60a5fa'];
const PREFIX = ['Violet', 'Ember', 'Frost', 'Gilded', 'Void', 'Dawn', 'Moss', 'Thunder'];
const SUFFIX = ['Fang', 'Edge', 'Brand', 'Splitter', 'Whisper', 'Cleaver'];

const pick = (arr, n) => arr[n % arr.length];
const trait = (b, k) => `${k}:${b.traits?.[k] ?? 'none'}`;

export function swordFor(brain) {
  const id = brain.tokenId;
  const h = (k) => hash(trait(brain, k));
  const tier = ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(String(brain.traits?.Tier || '').toLowerCase());
  const glow = tier >= 3;

  const len = Math.min(130, 80 + brain.stats.power * 2);   // power -> blade length
  const half = 5 + (h('Body') % 4);                          // blade half-width
  const shape = h('Head') % 3;                               // 0 straight, 1 leaf, 2 broad
  const blade = pick(BLADES, h('Aura'));
  const gem = pick(GEMS, h('Background'));
  const guard = h('Accessory') % 3;                          // 0 bar, 1 winged, 2 disc
  const cx = 30, base = 150, tip = base - len;

  let bladePath;
  if (shape === 0) {
    bladePath = `M${cx - half},${base} L${cx - half},${tip + 14} L${cx},${tip} L${cx + half},${tip + 14} L${cx + half},${base} Z`;
  } else if (shape === 1) {
    const mid = base - len * 0.45;
    bladePath = `M${cx - half},${base} Q${cx - half - 5},${mid} ${cx},${tip} Q${cx + half + 5},${mid} ${cx + half},${base} Z`;
  } else {
    bladePath = `M${cx - half - 3},${base} L${cx - half - 3},${tip + 30} L${cx},${tip} L${cx + half + 3},${tip + 30} L${cx + half + 3},${base} Z`;
  }

  const guardSvg = [
    `<rect x="12" y="148" width="36" height="7" rx="3" fill="#6b5b95"/>`,
    `<path d="M8,152 Q18,140 30,148 Q42,140 52,152 Q42,158 30,155 Q18,158 8,152 Z" fill="#6b5b95"/>`,
    `<ellipse cx="30" cy="151" rx="19" ry="6" fill="#6b5b95"/>`,
  ][guard];

  const id_ = `g${String(id).replace(/\W/g, '')}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 200" role="img" aria-label="Sword of Chog #${id}">` +
    (glow ? `<defs><filter id="${id_}" x="-60%" y="-20%" width="220%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` : '') +
    `<g${glow ? ` filter="url(#${id_})"` : ''}>` +
    `<path d="${bladePath}" fill="${blade}" stroke="#ffffff" stroke-opacity=".5" stroke-width="1"/>` +
    `<line x1="${cx}" y1="${tip + 10}" x2="${cx}" y2="${base - 4}" stroke="#000" stroke-opacity=".18" stroke-width="2"/>` +
    `</g>` +
    guardSvg +
    `<rect x="26" y="155" width="8" height="24" rx="2" fill="#3b2f63"/>` +
    `<path d="M26,160 L34,164 M26,166 L34,170 M26,172 L34,176" stroke="#836ef9" stroke-opacity=".6" stroke-width="1.5"/>` +
    `<circle cx="30" cy="184" r="6" fill="#6b5b95"/><circle cx="30" cy="184" r="3.2" fill="${gem}"/>` +
    `</svg>`;

  return { name: `${pick(PREFIX, h('Aura'))} ${pick(SUFFIX, h('Eyes'))}`, svg, glow };
}

// Generic placeholder (NOT a Chog): a plain round fighter tinted by traits.
export function placeholderFor(brain) {
  const c = pick(SKINS, hash(trait(brain, 'Skin')));
  const e = hash(trait(brain, 'Eyes')) % 3;
  const eyes = [
    '<circle cx="42" cy="58" r="5"/><circle cx="78" cy="58" r="5"/>',
    '<rect x="36" y="56" width="12" height="4" rx="2"/><rect x="72" y="56" width="12" height="4" rx="2"/>',
    '<path d="M36,60 Q42,52 48,60 M72,60 Q78,52 84,60" stroke="#120e24" stroke-width="3" fill="none"/>',
  ][e];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 130" role="img" aria-label="Placeholder fighter">` +
    `<ellipse cx="60" cy="118" rx="30" ry="6" fill="#000" opacity=".25"/>` +
    `<circle cx="34" cy="26" r="12" fill="${c}"/><circle cx="86" cy="26" r="12" fill="${c}"/>` +
    `<rect x="22" y="22" width="76" height="92" rx="34" fill="${c}"/>` +
    `<g fill="#120e24">${eyes}</g>` +
    `<path d="M48,84 Q60,94 72,84" stroke="#120e24" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `</svg>`
  );
}

// Same generic placeholder, crying: squeezed eyes, frown, tears. Shown for the duel's loser.
export function placeholderCryFor(brain) {
  const c = pick(SKINS, hash(trait(brain, 'Skin')));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 130" role="img" aria-label="Placeholder fighter, crying">` +
    `<ellipse cx="60" cy="118" rx="30" ry="6" fill="#000" opacity=".25"/>` +
    `<circle cx="34" cy="30" r="12" fill="${c}"/><circle cx="86" cy="30" r="12" fill="${c}"/>` +
    `<rect x="22" y="26" width="76" height="88" rx="34" fill="${c}"/>` +
    `<path d="M34,52 L48,60 L34,68 M86,52 L72,60 L86,68" stroke="#120e24" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M40,70 Q34,84 40,94 Q47,84 40,70 Z" fill="#7dd3fc"/><path d="M80,70 Q73,84 80,94 Q87,84 80,70 Z" fill="#7dd3fc"/>` +
    `<path d="M46,96 Q60,82 74,96" stroke="#120e24" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `</svg>`
  );
}

export function artFor(brain) {
  const sword = swordFor(brain);
  return {
    sword: { name: sword.name, svg: sword.svg, glow: sword.glow },
    placeholder: placeholderFor(brain),
    placeholderCry: placeholderCryFor(brain),
  };
}
