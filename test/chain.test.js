import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Two local "IPFS gateways": one broken (404), one healthy but slow-ish. The reader must use the healthy one.
const good = http.createServer((req, res) => {
  if (req.url === '/ipfs/bafyMETA/5') { setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ name: 'CHOG #5', image: 'ipfs://bafyIMG/5.png', attributes: [{ trait_type: 'Tier', value: 'epic' }] })); }, 150); }
  else if (req.url === '/ipfs/bafyIMG/5.png') { res.setHeader('content-type', 'image/png'); res.end(Buffer.from([137, 80, 78, 71])); }
  else { res.statusCode = 404; res.end('nope'); }
}).listen(0);
const bad = http.createServer((_q, res) => { res.statusCode = 404; res.end('nope'); }).listen(0);
const slow = http.createServer(() => { /* never answers */ }).listen(0);
process.env.IPFS_GATEWAYS = [bad, good].map((s) => `http://127.0.0.1:${s.address().port}/ipfs/`).join(',');

const { readMetadata, fetchImage } = await import('../lib/chain.js');
test.after(() => { good.close(); bad.close(); slow.close(); });

test('metadata is read from whichever gateway answers, even if another is broken', async () => {
  const meta = await readMetadata('ipfs://bafyMETA/5');
  assert.equal(meta.name, 'CHOG #5');
  assert.equal(meta.attributes[0].value, 'epic');
});

test('image bytes come back with their content type', async () => {
  const img = await fetchImage('ipfs://bafyIMG/5.png');
  assert.equal(img.type, 'image/png');
  assert.equal(img.buf.length, 4);
});

test('data: URIs work without any network', async () => {
  const json = JSON.stringify({ name: 'inline' });
  assert.equal((await readMetadata('data:application/json;base64,' + Buffer.from(json).toString('base64'))).name, 'inline');
  assert.equal((await readMetadata('data:application/json,' + encodeURIComponent(json))).name, 'inline');
});

test('failures name the host and the problem; unsupported schemes are refused', async () => {
  await assert.rejects(() => readMetadata('ipfs://bafyMISSING/1'), /127\.0\.0\.1:\d+: HTTP 404/);
  await assert.rejects(() => readMetadata('file:///etc/passwd'), /unsupported uri scheme/);
});
