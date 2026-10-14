// Reads Chog Genesis NFTs from Monad. If the RPC or metadata host is
// unreachable, callers get { source: 'fallback' } with seeded traits so the
// demo never breaks. Contract + chain verified from the public OpenSea page.
import { createPublicClient, http, defineChain, parseAbi } from 'viem';
import { hash } from './brain.js';
import snapshot from '../data/chogs.json' with { type: 'json' };

export const CHOG_CONTRACT = '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763';
export const MAX_ID = 1968; // 1,969 items; ids may be 0- or 1-based, so we allow 0..1968

export const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC || 'https://rpc.monad.xyz'] } },
});

const abi = parseAbi([
  'function ownerOf(uint256) view returns (address)',
  'function tokenURI(uint256) view returns (string)',
]);

const client = createPublicClient({ chain: monad, transport: http(undefined, { timeout: 5000, retryCount: 0 }) });

const GATEWAYS = (process.env.IPFS_GATEWAYS ||
  'https://ipfs.io/ipfs/,https://dweb.link/ipfs/,https://w3s.link/ipfs/,https://gateway.pinata.cloud/ipfs/,https://4everland.io/ipfs/')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Turn any metadata/image URI into a list of http(s) URLs to try. Only ipfs/http(s) are allowed.
function candidates(uri) {
  if (uri.startsWith('ipfs://')) {
    const p = uri.slice(7).replace(/^ipfs\//, '');
    return GATEWAYS.map((g) => g + p);
  }
  if (/^https?:\/\//i.test(uri)) return [uri];
  throw new Error('unsupported uri scheme');
}

// Try every candidate URL at once and use the first that answers. Errors name the host so failures are diagnosable.
async function fetchFirst(uri, timeoutMs = 8000) {
  const attempts = candidates(uri).map(async (u) => {
    const host = new URL(u).host;
    try {
      const res = await fetch(u, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json,image/*,*/*', 'user-agent': 'ChogBrain/1.0 (Chogathon 2026 entry)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      const msg = /timeout|abort/i.test(String(e.message)) ? `no answer in ${timeoutMs / 1000}s` : String(e.message);
      throw new Error(`${host}: ${msg}`);
    }
  });
  try {
    return await Promise.any(attempts);
  } catch (e) {
    throw new Error((e.errors || [e]).map((x) => x.message).join(' | '));
  }
}

export async function readMetadata(uri) {
  if (uri.startsWith('data:')) {
    const comma = uri.indexOf(',');
    const head = uri.slice(0, comma);
    const body = uri.slice(comma + 1);
    const text = head.includes('base64') ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body);
    return JSON.parse(text);
  }
  return (await fetchFirst(uri)).json();
}

// Fetch the NFT's image bytes (used by the /image route so the browser never needs an IPFS gateway).
export async function fetchImage(rawUrl) {
  if (rawUrl.startsWith('data:')) {
    const comma = rawUrl.indexOf(',');
    const head = rawUrl.slice(5, comma);
    const type = head.split(';')[0] || 'image/png';
    const body = rawUrl.slice(comma + 1);
    const buf = head.includes('base64') ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body));
    return { buf, type };
  }
  const res = await fetchFirst(rawUrl, 10000);
  return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'image/png' };
}

// Trait pools used ONLY for the offline fallback (names match the real collection's categories)
const POOL = {
  Tier: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
  Aura: ['none', 'violet', 'gold', 'flame', 'frost'],
  Background: ['sky', 'night', 'grass', 'sunset', 'void'],
  Body: ['hoodie', 'armor', 'cape', 'tee', 'suit'],
  Head: ['cap', 'crown', 'bandana', 'none', 'helmet'],
  Eyes: ['wide', 'sleepy', 'laser', 'happy', 'angry'],
  Mouth: ['smile', 'grin', 'tongue', 'flat', 'shout'],
  Accessory: ['none', 'chain', 'shades', 'sword', 'wand'],
  Skin: ['purple', 'green', 'gold', 'ghost', 'classic'],
};

export function fallbackAttributes(tokenId) {
  const out = [];
  for (const [k, vals] of Object.entries(POOL)) {
    out.push({ trait_type: k, value: vals[hash(`${k}:${tokenId}`) % vals.length] });
  }
  return out;
}

const cache = new Map();     // successful chain reads, kept for the life of the server
const failCache = new Map(); // failed reads are remembered briefly so repeat clicks stay fast
const FAIL_TTL_MS = 60_000;
const DEADLINE_MS = 15000;   // each phase (chain read, metadata read) must finish inside this

function withDeadline(promise, ms) {
  let t;
  const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms); });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

export async function loadChog(tokenId, { wantOwner = false } = {}) {
  const key = String(tokenId);
  // Pre-downloaded traits (npm run snapshot): instant, no chain or IPFS call needed.
  const snap = snapshot?.tokens?.[key];
  if (snap) {
    return {
      source: 'chain', from: 'snapshot', tokenURI: null, owner: null,
      name: snap.name, imageRaw: snap.image || null, image: null, attributes: snap.attributes || [],
    };
  }
  if (!wantOwner && cache.has(key)) return cache.get(key);
  const failed = failCache.get(key);
  if (!wantOwner && failed && failed.until > Date.now()) return failed.nft;
  const id = BigInt(tokenId);
  let step = 'tokenURI';
  let uri = null;
  try {
    const [tokenUri, owner] = await withDeadline(Promise.all([
      client.readContract({ address: CHOG_CONTRACT, abi, functionName: 'tokenURI', args: [id] }),
      wantOwner
        ? client.readContract({ address: CHOG_CONTRACT, abi, functionName: 'ownerOf', args: [id] })
        : Promise.resolve(null),
    ]), DEADLINE_MS);
    uri = tokenUri;
    step = 'metadata';
    const meta = await withDeadline(readMetadata(uri), DEADLINE_MS);
    const nft = {
      source: 'chain',
      tokenURI: uri,
      owner,
      name: meta.name || `CHOG #${tokenId}`,
      imageRaw: meta.image || meta.image_url || null,
      image: null, // filled in by the server as a local /image URL
      attributes: meta.attributes || [],
    };
    cache.set(key, nft);
    return nft;
  } catch (err) {
    const nft = {
      source: 'fallback',
      tokenURI: uri, // public on-chain value; shown so a failing metadata host is easy to identify
      reason: `${step}: ${String(err.shortMessage || err.message || err).slice(0, 240)}`,
      owner: null,
      name: `CHOG #${tokenId}`,
      imageRaw: null,
      image: null,
      attributes: fallbackAttributes(tokenId),
    };
    failCache.set(key, { nft, until: Date.now() + FAIL_TTL_MS });
    return nft;
  }
}

// Is the Monad RPC reachable from where the server runs? Returns a short, honest status.
export async function chainStatus() {
  try {
    const id = await client.getChainId();
    return { reachable: true, chainId: id, rpc: monad.rpcUrls.default.http[0] };
  } catch (err) {
    return { reachable: false, rpc: monad.rpcUrls.default.http[0], reason: String(err.shortMessage || err.message || err).slice(0, 160) };
  }
}

export function readTokenURI(tokenId) {
  return client.readContract({ address: CHOG_CONTRACT, abi, functionName: 'tokenURI', args: [BigInt(tokenId)] });
}

export const snapshotSize = () => Object.keys(snapshot?.tokens || {}).length;

export async function ownerOf(tokenId) {
  try {
    return await client.readContract({ address: CHOG_CONTRACT, abi, functionName: 'ownerOf', args: [BigInt(tokenId)] });
  } catch {
    return null;
  }
}
