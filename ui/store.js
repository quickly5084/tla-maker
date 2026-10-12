"use strict";
// Stockage (IndexedDB) + import/export Open Board Format (.obf / .obz, zip).
const Store = (() => {
  const idb = () => new Promise((ok, ko) => {
    const r = indexedDB.open("tla-maker", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
  const tx = async (mode, fn) => {
    const d = await idb();
    return new Promise((ok, ko) => {
      const t = d.transaction("kv", mode), q = fn(t.objectStore("kv"));
      t.oncomplete = () => ok(q.result); t.onerror = () => ko(t.error);
    });
  };
  const load = () => tx("readonly", (s) => s.get("db"));
  const save = (db) => tx("readwrite", (s) => s.put(db, "db"));

  // --- zip (stockage seul à l'écriture, deflate-raw accepté à la lecture) ---
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
  const enc = new TextEncoder(), dec = new TextDecoder();
  function zip(files) {
    const parts = [], cd = [];
    let off = 0;
    for (const { name, data } of files) {
      const n = enc.encode(name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, n.length, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, n.length, true); ch.setUint32(42, off, true);
      parts.push(new Uint8Array(lh.buffer), n, data); cd.push(new Uint8Array(ch.buffer), n);
      off += 30 + n.length + data.length;
    }
    const cdLen = cd.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(end.buffer)], { type: "application/zip" });
  }
  async function unzip(buf) {
    const u = new Uint8Array(buf), v = new DataView(buf), out = {};
    let e = u.length - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("zip invalide");
    let p = v.getUint32(e + 16, true);
    for (let i = v.getUint16(e + 10, true); i > 0; i--) {
      const method = v.getUint16(p + 10, true), cs = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
      const name = dec.decode(u.subarray(p + 46, p + 46 + nl));
      const ds = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
      let data = u.subarray(ds, ds + cs);
      if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
      else if (method !== 0) throw new Error("compression zip non gérée");
      out[name] = data;
      p += 46 + nl + el + cl;
    }
    return out;
  }

  // --- OBF ---
  const EXT = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/svg+xml": "svg" };
  const MIME = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml" };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toDataUri = (bytes, mime) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(new Blob([bytes], { type: mime })); });

  async function exportObz(db) {
    const files = [], paths = { boards: {}, images: {} }, seen = new Set();
    for (const [id, b] of Object.entries(db.boards)) {
      const copy = { ...b, images: [] };
      for (const im of b.images || []) {
        const m = /^data:([^;,]+);base64,(.*)$/.exec(im.data || "");
        if (!m) continue;
        const path = `images/${im.id}.${EXT[m[1]] || "bin"}`;
        if (!seen.has(path)) { seen.add(path); files.push({ name: path, data: unb64(m[2]) }); paths.images[im.id] = path; }
        const { data, ...rest } = im; copy.images.push({ ...rest, path, content_type: m[1] });
      }
      const bp = `boards/${id}.obf`; paths.boards[id] = bp;
      files.unshift({ name: bp, data: enc.encode(JSON.stringify(copy)) });
    }
    files.unshift({ name: "manifest.json", data: enc.encode(JSON.stringify({ format: "open-board-0.1", root: paths.boards[db.root], paths })) });
    return zip(files);
  }

  async function fixImages(board, read) {
    for (const im of board.images || []) {
      if (im.data) continue;
      const bytes = im.path && read(im.path);
      if (bytes) im.data = await toDataUri(bytes, im.content_type || MIME[im.path.split(".").pop().toLowerCase()] || "image/png");
      delete im.path; delete im.url;
    }
    board.images = (board.images || []).filter((i) => i.data);
    return board;
  }
  const check = (b) => {
    if (!b || !b.id || !b.grid || !Array.isArray(b.buttons)) throw new Error("fichier OBF invalide");
    b.grid.order = (b.grid.order || []).map((r) => r.map((x) => x ?? null));
    b.grid.rows = b.grid.rows || b.grid.order.length; b.grid.columns = b.grid.columns || (b.grid.order[0] || []).length;
    return b;
  };
  // Retourne {root, boards} (.obz) ou {boards:{id:board}} (.obf seul).
  async function importFile(file) {
    const buf = await file.arrayBuffer();
    if (!/\.obz$|\.zip$/i.test(file.name)) {
      const b = check(JSON.parse(dec.decode(buf)));
      return { boards: { [b.id]: await fixImages(b, () => null) } };
    }
    const f = await unzip(buf), man = JSON.parse(dec.decode(f["manifest.json"] || new Uint8Array()) || "{}");
    const boards = {};
    for (const [id, path] of Object.entries(man.paths?.boards || {})) {
      if (!f[path]) continue;
      const b = check(JSON.parse(dec.decode(f[path])));
      boards[b.id] = await fixImages(b, (p) => f[p]);
    }
    const root = Object.values(boards).find((b) => man.paths?.boards?.[b.id] === man.root)?.id;
    if (!root) throw new Error("tableau racine introuvable");
    return { root, boards };
  }
  return { load, save, exportObz, importFile };
})();
