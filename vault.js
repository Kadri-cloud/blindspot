// Encrypted storage: every file becomes a random-named blob of 1 MiB AES-256-GCM chunks,
// so any byte range (video seeking) can be decrypted without touching the rest.
const fs = require('fs'), fsp = fs.promises, path = require('path'), crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const CH = 1 << 20, ECH = CH + 28; // plain chunk, encrypted chunk (12 nonce + 16 tag)

const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', webm: 'video/webm', mkv: 'video/webm',
};
const EXTS = Object.keys(TYPES);

const aad = i => { const b = Buffer.alloc(4); b.writeUInt32BE(i); return b; };

// ponytail: chunk index in AAD stops reordering, not truncation at a chunk boundary; add an end-flag if that ever matters
function sealChunk(key, i, plain) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(aad(i));
  return Buffer.concat([iv, c.update(plain), c.final(), c.getAuthTag()]);
}

function openChunk(key, i, enc) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, enc.subarray(0, 12));
  d.setAAD(aad(i));
  d.setAuthTag(enc.subarray(enc.length - 16));
  return Buffer.concat([d.update(enc.subarray(12, enc.length - 16)), d.final()]);
}

const seal = (key, buf) => {
  const out = [];
  for (let i = 0, o = 0; o < buf.length; i++, o += CH) out.push(sealChunk(key, i, buf.subarray(o, o + CH)));
  return Buffer.concat(out);
};
const open = (key, enc) => {
  const out = [];
  for (let i = 0, o = 0; o < enc.length; i++, o += ECH) out.push(openChunk(key, i, enc.subarray(o, o + ECH)));
  return Buffer.concat(out);
};

class Vault {
  constructor(dir) { this.dir = dir; this.key = null; this.items = []; this.folders = []; }

  file(name) { return path.join(this.dir, name); }
  exists() { return fs.existsSync(this.file('salt')); }

  async unlock(password) {
    fs.mkdirSync(this.dir, { recursive: true });
    const isNew = !this.exists();
    const salt = isNew ? crypto.randomBytes(16) : fs.readFileSync(this.file('salt'));
    const key = await scrypt(password, salt, 32, { N: 1 << 17, r: 8, p: 1, maxmem: 256 << 20 });
    if (isNew) {
      this.key = key; this.items = []; this.folders = [];
      this.save();
      fs.writeFileSync(this.file('salt'), salt);
      return;
    }
    let index;
    try { index = JSON.parse(open(key, fs.readFileSync(this.file('index')))); }
    catch { throw new Error('Wrong password'); }
    // v1.0 lockers stored a bare array of items
    this.items = Array.isArray(index) ? index : index.items;
    this.folders = index.folders || [];
    this.key = key;
  }

  lock() { this.key?.fill(0); this.key = null; this.items = []; this.folders = []; }

  save() {
    const f = this.file('index');
    fs.writeFileSync(f + '.tmp', seal(this.key, Buffer.from(JSON.stringify({ items: this.items, folders: this.folders }))));
    fs.renameSync(f + '.tmp', f);
  }

  // Move a file in: encrypt, re-read and compare hashes, index it, and only then delete the original.
  async add(src, folder = null) {
    const st = await fsp.stat(src), id = crypto.randomBytes(16).toString('hex'), dst = this.file(id);
    const before = await this.encryptFile(src, dst + '.part');
    await fsp.rename(dst + '.part', dst);
    const after = crypto.createHash('sha256');
    for await (const b of this.read(id, 0, st.size - 1)) after.update(b);
    if (after.digest('hex') !== before) { await fsp.rm(dst); throw new Error('Verification failed'); }
    const ext = path.extname(src).slice(1).toLowerCase();
    this.items.push({ id, name: path.basename(src), type: TYPES[ext] || 'application/octet-stream', size: st.size, date: st.mtimeMs, folder });
    this.save();
    await fsp.rm(src);
  }

  addNote(folder = null) {
    const note = { id: crypto.randomBytes(16).toString('hex'), name: '', type: 'text/plain', text: '', size: 0, date: Date.now(), folder };
    this.items.push(note);
    this.save();
    return note;
  }

  update(id, patch) {
    Object.assign(this.items.find(x => x.id === id), patch);
    this.save();
  }

  addFolder(name) {
    if (!this.folders.includes(name)) this.folders.push(name);
    this.save();
  }

  removeFolder(name) {
    this.folders = this.folders.filter(f => f !== name);
    for (const it of this.items) if (it.folder === name) it.folder = null;
    this.save();
  }

  async encryptFile(src, dst) {
    const hash = crypto.createHash('sha256'), buf = Buffer.alloc(CH);
    const inp = await fsp.open(src, 'r'), out = await fsp.open(dst, 'w');
    try {
      for (let i = 0; ; i++) {
        let n = 0;
        while (n < CH) {
          const { bytesRead } = await inp.read(buf, n, CH - n, null);
          if (!bytesRead) break;
          n += bytesRead;
        }
        if (!n) break;
        hash.update(buf.subarray(0, n));
        await out.write(sealChunk(this.key, i, buf.subarray(0, n)));
        if (n < CH) break;
      }
    } finally { await inp.close(); await out.close(); }
    return hash.digest('hex');
  }

  // Decrypted bytes start..end (inclusive), one chunk at a time.
  async *read(id, start, end) {
    const fh = await fsp.open(this.file(id), 'r'), buf = Buffer.alloc(ECH);
    try {
      for (let i = Math.floor(start / CH); i <= Math.floor(end / CH); i++) {
        const { bytesRead } = await fh.read(buf, 0, ECH, i * ECH);
        const plain = openChunk(this.key, i, buf.subarray(0, bytesRead));
        yield plain.subarray(Math.max(0, start - i * CH), end - i * CH + 1);
      }
    } finally { await fh.close(); }
  }

  async export(id, dst) {
    const it = this.items.find(x => x.id === id);
    if (it.type === 'text/plain') return fsp.writeFile(dst, it.text);
    const out = await fsp.open(dst, 'w');
    try { for await (const b of this.read(id, 0, it.size - 1)) await out.write(b); }
    finally { await out.close(); }
  }

  async remove(id) {
    this.items = this.items.filter(x => x.id !== id);
    this.save();
    await fsp.rm(this.file(id), { force: true });
  }
}

module.exports = { Vault, EXTS, seal };
