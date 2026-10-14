// Builds data/chogs.json: every Chog's name, image and traits, fetched once so the app never has to
// ask the chain or IPFS for them at request time. Pure logic with injected readers so it is testable.

export const SNAPSHOT_VERSION = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ids: array of token ids. readURI(id) -> tokenURI string. readMeta(uri) -> metadata JSON.
// existing: previously saved tokens (resume). Returns { tokens, failed }.
export async function buildSnapshot({
  ids,
  readURI,
  readMeta,
  existing = {},
  concurrency = 6,
  retries = 3,
  backoffMs = 800,
  onProgress = () => {},
  onCheckpoint = () => {},
  checkpointEvery = 50,
}) {
  const tokens = { ...existing };
  const failed = {};
  const todo = ids.filter((id) => !tokens[String(id)]);
  let done = 0, ok = 0, bad = 0, sinceCheckpoint = 0;
  let next = 0;

  async function one(id) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const uri = await readURI(id);
        const meta = await readMeta(uri);
        if (!meta || typeof meta !== 'object') throw new Error('metadata was not an object');
        tokens[String(id)] = {
          name: meta.name || `CHOG #${id}`,
          image: meta.image || meta.image_url || null,
          attributes: Array.isArray(meta.attributes) ? meta.attributes : [],
        };
        return;
      } catch (e) {
        lastErr = e;
        if (attempt < retries) await sleep(backoffMs * (attempt + 1));
      }
    }
    failed[String(id)] = String(lastErr?.message || lastErr).slice(0, 200);
  }

  async function worker() {
    while (next < todo.length) {
      const id = todo[next++];
      await one(id);
      done++;
      tokens[String(id)] ? ok++ : bad++;
      if (++sinceCheckpoint >= checkpointEvery) { sinceCheckpoint = 0; onCheckpoint(tokens); }
      onProgress({ done, total: todo.length, ok, failed: bad, skipped: ids.length - todo.length });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(todo.length, 1)) }, worker));
  onCheckpoint(tokens);
  return { tokens, failed };
}

export function serialize(tokens, contract) {
  const sorted = Object.fromEntries(Object.keys(tokens).sort((a, b) => Number(a) - Number(b)).map((k) => [k, tokens[k]]));
  return JSON.stringify({ version: SNAPSHOT_VERSION, contract, generatedAt: new Date().toISOString(), tokens: sorted });
}
