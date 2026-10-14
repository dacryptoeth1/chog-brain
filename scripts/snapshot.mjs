// Downloads every Chog's traits once and saves them to data/chogs.json.
//   npm run snapshot
// Safe to stop and re-run: it resumes where it left off. Takes a few minutes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTokenURI, readMetadata, CHOG_CONTRACT, MAX_ID } from '../lib/chain.js';
import { buildSnapshot, serialize } from '../lib/snapshot.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'chogs.json');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? Number(process.argv[i + 1]) : dflt; };
const from = arg('from', 0), to = arg('to', MAX_ID), concurrency = arg('concurrency', 5);

let existing = {};
try { existing = JSON.parse(fs.readFileSync(out, 'utf8')).tokens || {}; } catch { /* first run */ }

const ids = Array.from({ length: to - from + 1 }, (_, i) => from + i);
const have = ids.filter((id) => existing[String(id)]).length;
console.log(`Chog snapshot: ${ids.length} tokens (${from}-${to}), ${have} already saved, concurrency ${concurrency}`);

const save = (tokens) => fs.writeFileSync(out, serialize(tokens, CHOG_CONTRACT));
const started = Date.now();
const { tokens, failed } = await buildSnapshot({
  ids, existing, concurrency,
  readURI: readTokenURI,
  readMeta: (uri) => readMetadata(uri),
  onCheckpoint: save,
  onProgress: ({ done, total, ok, failed: bad }) => {
    if (done % 25 === 0 || done === total) {
      const secs = Math.round((Date.now() - started) / 1000);
      console.log(`  ${done}/${total}  ok ${ok}  failed ${bad}  (${secs}s)`);
    }
  },
});
save(tokens);

const saved = Object.keys(tokens).length;
console.log(`\nSaved ${saved} Chogs to data/chogs.json`);
const failedIds = Object.keys(failed);
if (failedIds.length) {
  console.log(`${failedIds.length} failed (first few):`);
  for (const id of failedIds.slice(0, 5)) console.log(`  #${id}: ${failed[id]}`);
  console.log('Run `npm run snapshot` again to retry just those.');
  process.exit(1);
}
console.log('All done. Now: git add . ; git commit -m "Add Chog snapshot" ; git push');
