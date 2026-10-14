// Progress storage, keyed by token ID (the NFT is the save file).
//  - Redis (Upstash REST, e.g. via Vercel Storage): permanent, shared across instances.
//  - File: local development.
//  - Ephemeral /tmp file: Vercel without a database. Works, but resets on cold starts.
import fs from 'node:fs';
import path from 'node:path';

export function redisStore(url, token, fetchImpl = fetch) {
  const base = url.replace(/\/+$/, '');
  async function cmd(args) {
    const res = await fetchImpl(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(`redis: ${j.error}`);
    return j.result;
  }
  return {
    kind: 'redis',
    async get(id) {
      const v = await cmd(['GET', `chog:${id}`]);
      return v ? JSON.parse(v) : null;
    },
    async set(id, value) {
      await cmd(['SET', `chog:${id}`, JSON.stringify(value)]);
    },
  };
}

export function fileStore(file, kind = 'file') {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  };
  return {
    kind,
    async get(id) { return read()[id] || null; },
    async set(id, value) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const all = read();
      all[id] = value;
      fs.writeFileSync(file, JSON.stringify(all, null, 2));
    },
  };
}

export function createStore({ env = process.env, defaultFile, fetchImpl = fetch } = {}) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return redisStore(url, token, fetchImpl);
  if (env.DATA_FILE) return fileStore(env.DATA_FILE);
  if (env.VERCEL) return fileStore('/tmp/chogbrain-data.json', 'ephemeral');
  return fileStore(defaultFile || 'data.json');
}
