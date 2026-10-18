// Self-check: node test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { Vault } = require('./vault');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locker-test-'));
  const data = crypto.randomBytes(2.5 * (1 << 20) | 0); // spans 3 chunks
  const src = path.join(dir, 'clip.mp4');
  fs.writeFileSync(src, data);

  const v = new Vault(path.join(dir, 'vault'));
  await v.unlock('pw');
  await v.add(src);
  assert(!fs.existsSync(src), 'original deleted after import');
  const { id } = v.items[0];
  assert(!fs.readFileSync(v.file(id)).includes(data.subarray(0, 64)), 'stored file is not plaintext');

  const range = async (s, e) => { const out = []; for await (const b of v.read(id, s, e)) out.push(b); return Buffer.concat(out); };
  for (const [s, e] of [[0, data.length - 1], [5, 5], [(1 << 20) - 3, (1 << 20) + 3], [2 << 20, data.length - 1]])
    assert((await range(s, e)).equals(data.subarray(s, e + 1)), `range ${s}-${e}`);

  const out = path.join(dir, 'out.mp4');
  await v.export(id, out);
  assert(fs.readFileSync(out).equals(data), 'export round-trips');

  v.lock();
  await assert.rejects(v.unlock('nope'), /Wrong password/);
  await v.unlock('pw');
  assert.equal(v.items[0].name, 'clip.mp4', 'index survives relock');

  await v.remove(id);
  assert(!fs.existsSync(v.file(id)) && v.items.length === 0, 'remove');

  fs.rmSync(dir, { recursive: true });
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });
