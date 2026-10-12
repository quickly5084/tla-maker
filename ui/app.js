"use strict";
const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10);
const T = window.__TAURI__;
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Catégories de couleurs (clé de Fitzgerald modifiée) : [nom, fond, bordure]
const CAT = {
  pron: ["Pronom", "#fff3a0", "#e0b800"], verbe: ["Verbe", "#c4f2b8", "#2e9e2e"], nom: ["Nom", "#ffdca8", "#e08a00"],
  adj: ["Adjectif", "#bfdcff", "#2a7fd1"], petit: ["Petit mot", "#ffc9e5", "#d6409f"], social: ["Social", "#e6d0ff", "#8a46d6"],
  non: ["Négation / stop", "#ffb8b8", "#d63a3a"], quest: ["Question", "#ffd0e6", "#c83c78"], dossier: ["Dossier", "#e4eaf0", "#5b7083"], autre: ["Autre", "#ffffff", "#8a8f98"],
};
const DEF = { voice: "", rate: 1, pitch: 1, mode: "word", autoHome: true, pred: true, lab: "bottom", size: 1, scan: false, ms: 1.2 };

let db, S, stack, editing = false, msg = [], kbdOpen = false, buf = "", pending = null, slot = null, vocab = null;

// --- couleurs (OBF : "rgb(r, g, b)") ---
const toHex = (c) => {
  const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(c || "");
  if (m) return "#" + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, "0")).join("");
  return /^#[0-9a-f]{6}$/i.test(c || "") ? c : "#ffffff";
};
const toRgb = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;

// --- dialogue maison (prompt/confirm/alert natifs peu fiables dans la webview) ---
function ask(text, { input = null, cancel = true } = {}) {
  const d = $("ask");
  $("ask-m").textContent = text;
  $("ask-i").hidden = input === null; $("ask-i").value = input ?? "";
  $("ask-c").hidden = !cancel;
  d.returnValue = "";
  return new Promise((ok) => {
    d.onclose = () => ok(d.returnValue === "ok" ? (input === null ? true : $("ask-i").value.trim()) : null);
    d.showModal();
  });
}

// --- données ---
let st;
const save = () => { vocab = null; clearTimeout(st); st = setTimeout(() => Store.save(db).catch(() => ask("Sauvegarde impossible.", { cancel: false })), 200); };
const cur = () => db.boards[stack[stack.length - 1]];
const curId = () => stack[stack.length - 1];
const btnOf = (b, id) => b.buttons.find((x) => x.id === id);
const imgOf = (b, id) => b.images.find((x) => x.id === id)?.data;

function gcImages(b) {
  const used = new Set(b.buttons.map((x) => x.image_id));
  b.images = b.images.filter((i) => used.has(i.id));
}

// --- voix ---
function voices() { return (window.speechSynthesis?.getVoices() || []).slice().sort((a, b) => (b.lang.startsWith("fr") | 0) - (a.lang.startsWith("fr") | 0)); }
function say(text) {
  if (!text || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR"; u.rate = S.rate; u.pitch = S.pitch;
  const v = voices().find((x) => x.name === S.voice);
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
const speakMsg = () => say(msg.map((m) => m.vocal || m.label).join(" "));

// --- rendu ---
function cellEl(b, board, r, c) {
  const d = document.createElement("div");
  d.dataset.r = r; d.dataset.c = c;
  if (!b) { d.className = "cell empty"; if (editing) d.onclick = () => openCell(r, c); return d; }
  const folder = !!b.load_board?.id;
  d.className = "cell" + (folder ? " folder" : "") + (S.lab === "top" ? " top" : "");
  d.style.background = b.background_color || "#fff";
  const bc = b.border_color || "#8a8f98";
  d.style.borderColor = bc; d.style.setProperty("--bc", bc);
  d.dataset.scan = "";
  const im = b.image_id && imgOf(board, b.image_id);
  if (im) { const i = document.createElement("img"); i.src = im; i.alt = ""; i.draggable = false; d.append(i); }
  if (S.lab !== "none" || !im) { const l = document.createElement("span"); l.className = "lb"; l.textContent = b.label || ""; d.append(l); }
  d.onclick = () => (editing ? openCell(r, c) : press(b));
  return d;
}

function render() {
  const b = cur();
  document.title = "TLA Maker — " + b.name;
  $("title").textContent = b.name;
  $("back").disabled = stack.length < 2;
  $("eb").hidden = !editing;
  $("edit").classList.toggle("on", editing);
  document.body.classList.toggle("edit", editing);
  const g = $("grid"), { rows, columns } = b.grid;
  g.style.gridTemplate = `repeat(${rows}, minmax(0,1fr)) / repeat(${columns}, minmax(0,1fr))`;
  g.style.fontSize = `calc(${S.size} * clamp(.8rem, 1.5vw, 1.4rem))`;
  g.replaceChildren();
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const el = cellEl(btnOf(b, b.grid.order[r]?.[c]), b, r, c);
    if (editing) wireDrag(el);
    g.append(el);
  }
  renderMsg();
  if (editing) {
    $("boards").replaceChildren(...Object.entries(db.boards).map(([id, v]) => new Option(v.name, id, false, id === curId())));
    $("rows").value = rows; $("cols").value = columns;
  }
  if (kbdOpen) renderKbd();
  scanReset();
}

function chip(m) {
  const d = document.createElement("div");
  d.className = "chip"; d.style.background = m.bg || "#fff"; d.style.borderColor = m.bd || "#8a8f98";
  if (m.img) { const i = document.createElement("img"); i.src = m.img; i.alt = ""; d.append(i); }
  d.append(document.createTextNode(m.label));
  return d;
}
function renderMsg() {
  const el = $("msg");
  el.replaceChildren(...msg.map((m) => { const c = chip(m); c.onclick = (e) => { e.stopPropagation(); say(m.vocal || m.label); }; return c; }));
  el.scrollLeft = el.scrollWidth;
}

// --- actions ---
function addWord(item, speak = true) {
  msg.push(item);
  const k = norm(item.label);
  db.hist[k] = (db.hist[k] || 0) + 1;
  renderMsg(); save();
  if (speak && S.mode === "word") say(item.vocal || item.label);
}
function press(b) {
  const board = cur(), a = b.action || "";
  if (b.load_board?.id && db.boards[b.load_board.id]) { stack.push(b.load_board.id); return render(); }
  if (a === ":speak") return speakMsg();
  if (a === ":clear") { msg = []; return renderMsg(); }
  if (a === ":backspace") { msg.pop(); return renderMsg(); }
  if (a === ":space") return commitBuf();
  if (a === ":home") { stack = [db.root]; return render(); }
  if (a === ":back") { if (stack.length > 1) stack.pop(); return render(); }
  addWord({ label: b.label, vocal: a.startsWith("+") ? a.slice(1) : b.vocalization || "", img: b.image_id && imgOf(board, b.image_id), bg: b.background_color, bd: b.border_color });
  if (S.autoHome && stack.length > 1) { stack = [db.root]; render(); }
}
$("b-spk").onclick = speakMsg;
$("msg").onclick = speakMsg;
$("b-del").onclick = () => { msg.pop(); renderMsg(); };
$("b-clr").onclick = () => { msg = []; renderMsg(); };
$("back").onclick = () => { stack.pop(); render(); };
$("home").onclick = () => { stack = [db.root]; render(); };

// --- clavier + prédiction ---
function vocabMap() {
  if (vocab) return vocab;
  vocab = new Map();
  for (const b of Object.values(db.boards)) for (const x of b.buttons) {
    if (!x.label || x.load_board || (x.action && !x.action.startsWith("+"))) continue;
    const k = norm(x.label);
    if (!vocab.has(k) || (!vocab.get(k).img && x.image_id)) vocab.set(k, { label: x.label, vocal: x.vocalization || "", img: x.image_id && imgOf(b, x.image_id), bg: x.background_color, bd: x.border_color });
  }
  return vocab;
}
function commitBuf(speak = true) {
  const w = buf.trim(); buf = "";
  if (w) addWord(vocabMap().get(norm(w)) ? { ...vocabMap().get(norm(w)) } : { label: w }, speak);
  renderKbd();
}
function renderKbd() {
  const p = $("pred"), v = vocabMap(), q = norm(buf);
  const cand = S.pred ? [...v.entries()].filter(([k]) => !q || k.startsWith(q)).sort((a, b) => (db.hist[b[0]] || 0) - (db.hist[a[0]] || 0) || a[0].length - b[0].length).slice(0, 7) : [];
  const bf = document.createElement("span"); bf.className = "buf"; bf.textContent = buf || "…";
  p.replaceChildren(bf, ...cand.map(([, it]) => { const x = document.createElement("button"); x.textContent = it.label; x.onclick = () => { buf = ""; addWord({ ...it }); renderKbd(); }; return x; }));
  const rows = ["azertyuiop", "qsdfghjklm", "wxcvbn'-éèàùç"], keys = $("keys");
  keys.replaceChildren(...rows.map((r) => { const d = document.createElement("div"); d.className = "r"; for (const ch of r) { const x = document.createElement("button"); x.textContent = ch; x.onclick = () => { buf += ch; renderKbd(); }; d.append(x); } return d; }));
  const last = document.createElement("div"); last.className = "r";
  const mk = (t, f, w) => { const x = document.createElement("button"); x.textContent = t; if (w) x.className = "w"; x.onclick = f; last.append(x); };
  mk("⌫", backKey); mk("espace", () => commitBuf(), true); mk("↵ lire", () => { commitBuf(false); speakMsg(); });
  keys.append(last);
}
function backKey() { if (buf) buf = buf.slice(0, -1); else msg.pop(); renderMsg(); renderKbd(); }
$("kb").onclick = () => { kbdOpen = !kbdOpen; $("kbd").hidden = !kbdOpen; buf = ""; if (kbdOpen) renderKbd(); scanReset(); };

// --- balayage (switch) ---
let scanIdx = -1, scanTimer;
const scanItems = () => [...document.querySelectorAll("[data-scan]")].filter((e) => e.offsetParent);
function scanMark() { document.querySelectorAll(".scan").forEach((e) => e.classList.remove("scan")); scanItems()[scanIdx]?.classList.add("scan"); }
function scanReset() {
  clearInterval(scanTimer); scanIdx = -1; scanMark();
  if (S.scan && !editing) scanTimer = setInterval(() => { scanIdx = (scanIdx + 1) % scanItems().length; scanMark(); }, S.ms * 1000);
}
document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (S.scan && !editing && (e.key === " " || e.key === "Enter")) { e.preventDefault(); scanItems()[scanIdx]?.click(); return; }
  if (!kbdOpen || editing) return;
  if (e.key === "Backspace") backKey();
  else if (e.key === " ") { e.preventDefault(); commitBuf(); }
  else if (e.key === "Enter") { commitBuf(false); speakMsg(); }
  else if (e.key.length === 1) { buf += e.key.toLowerCase(); renderKbd(); }
});

// --- édition ---
function wireDrag(el) {
  el.draggable = true;
  el.ondragstart = (e) => e.dataTransfer.setData("text/plain", el.dataset.r + "," + el.dataset.c);
  el.ondragover = (e) => { e.preventDefault(); el.classList.add("over"); };
  el.ondragleave = () => el.classList.remove("over");
  el.ondrop = (e) => {
    e.preventDefault();
    const [r0, c0] = e.dataTransfer.getData("text/plain").split(",").map(Number), o = cur().grid.order, r1 = +el.dataset.r, c1 = +el.dataset.c;
    [o[r0][c0], o[r1][c1]] = [o[r1][c1], o[r0][c0]];
    save(); render();
  };
}
$("f-cat").replaceChildren(new Option("Personnalisé", ""), ...Object.entries(CAT).map(([k, v]) => new Option(v[0], k)));
$("f-cat").onchange = (e) => { const c = CAT[e.target.value]; if (c) { $("f-bg").value = c[1]; $("f-bd").value = c[2]; } };
const actVal = (b) => (b.load_board ? "load" : b.action?.startsWith("+") ? "" : b.action || "");
const syncAct = () => { $("f-lw").hidden = $("f-a").value !== "load"; };
$("f-a").onchange = syncAct;

function preview(data) {
  const p = $("f-prev"); p.replaceChildren();
  if (data) { const i = document.createElement("img"); i.src = data; p.append(i); }
}
function openCell(r, c) {
  const board = cur(), b = btnOf(board, board.grid.order[r][c]) || {};
  slot = { r, c, id: b.id || null };
  pending = null;
  $("f-t").value = b.label || ""; $("f-s").value = b.vocalization || "";
  $("f-a").value = actVal(b);
  $("f-l").replaceChildren(...Object.entries(db.boards).filter(([id]) => id !== curId()).map(([id, v]) => new Option(v.name, id)));
  $("f-l").value = b.load_board?.id || "";
  $("f-bg").value = toHex(b.background_color || "#ffffff"); $("f-bd").value = toHex(b.border_color || "#8a8f98");
  $("f-cat").value = ""; $("f-i").value = ""; $("f-ri").checked = false;
  preview(b.image_id && imgOf(board, b.image_id));
  $("f-del").hidden = !b.id;
  syncAct();
  $("dlg").showModal();
}
$("form").addEventListener("submit", (ev) => {
  if (ev.submitter?.value !== "ok") return;
  const board = cur(), a = $("f-a").value;
  const old = slot.id ? btnOf(board, slot.id) : null;
  const b = old || { id: "b" + uid() };
  b.label = $("f-t").value.trim();
  const s = $("f-s").value.trim(); s ? (b.vocalization = s) : delete b.vocalization;
  b.background_color = toRgb($("f-bg").value); b.border_color = toRgb($("f-bd").value);
  delete b.load_board; delete b.action;
  if (a === "load" && $("f-l").value) b.load_board = { id: $("f-l").value };
  else if (a && a !== "load") b.action = a;
  if ($("f-ri").checked) delete b.image_id;
  if (pending) { const id = "i" + uid(); board.images.push({ id, ...pending }); b.image_id = id; }
  if (!old) board.buttons.push(b);
  board.grid.order[slot.r][slot.c] = b.id;
  gcImages(board); save(); render();
});
$("f-del").onclick = () => {
  const board = cur();
  board.grid.order[slot.r][slot.c] = null;
  board.buttons = board.buttons.filter((x) => x.id !== slot.id);
  gcImages(board); $("dlg").close(); save(); render();
};
$("f-ri").onchange = () => { if ($("f-ri").checked) { pending = null; preview(null); } };

const readImg = (file) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 256 / Math.max(im.width, im.height)), cv = document.createElement("canvas");
      cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
      ok({ data: cv.toDataURL("image/png"), content_type: "image/png", width: cv.width, height: cv.height });
    };
    im.onerror = ko; im.src = r.result;
  };
  r.onerror = ko; r.readAsDataURL(file);
});
$("f-i").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { pending = await readImg(f); $("f-ri").checked = false; preview(pending.data); } catch { ask("Image illisible.", { cancel: false }); }
};

// --- bibliothèque (emojis + dessins ARASAAC hors ligne) ---
let tab = "e", seq = 0, pbin;
const EM = (window.EMOJI || []).map((x) => ({ x, k: norm(x[1] + " " + x[2]) }));
const PI = (window.PICTOS || []).map((p) => ({ p, k: norm(p[3]) }));
const pbuf = () => (pbin ||= fetch("pictos.bin").then((r) => r.arrayBuffer()));
const dataUri = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
function pickEmoji(x) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 160;
  const g = cv.getContext("2d");
  g.font = "120px 'Noto Color Emoji','Segoe UI Emoji','Apple Color Emoji',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(x[0], 80, 88);
  pending = { data: cv.toDataURL("image/png"), content_type: "image/png", width: 160, height: 160 };
  if (!$("f-t").value) $("f-t").value = x[1];
  $("f-ri").checked = false; preview(pending.data); $("pk").close();
}
async function pickDraw(p) {
  pending = { data: await dataUri(new Blob([(await pbuf()).slice(p[1], p[1] + p[2])], { type: "image/webp" })), content_type: "image/webp", width: 160, height: 160 };
  if (!$("f-t").value) $("f-t").value = p[3].split("|")[0];
  $("f-ri").checked = false; preview(pending.data); $("pk").close();
}
async function lib() {
  const q = norm($("pk-q").value.trim()), r = $("pk-r"), s = $("pk-s"), me = ++seq, ws = q.split(/\s+/);
  if (tab === "e") {
    const hits = EM.filter((e) => !q || ws.every((w) => e.k.includes(w)));
    s.textContent = hits.length + " emojis";
    return r.replaceChildren(...hits.map(({ x }) => {
      const b = document.createElement("button"); b.type = "button"; b.title = x[1];
      const e = document.createElement("span"); e.className = "em"; e.textContent = x[0]; b.append(e); b.onclick = () => pickEmoji(x); return b;
    }));
  }
  r.replaceChildren();
  if (!q) { s.textContent = "Tape un mot pour chercher parmi les dessins."; return; }
  const hits = PI.filter((e) => ws.every((w) => e.k.includes(w)));
  hits.sort((x, y) => (y.k.startsWith(q) | 0) - (x.k.startsWith(q) | 0));
  s.textContent = hits.length + " dessins" + (hits.length > 200 ? " (200 affichés, précise ta recherche)" : "");
  const buf = await pbuf();
  if (me !== seq) return;
  r.replaceChildren(...hits.slice(0, 200).map(({ p }) => {
    const kw = p[3].split("|")[0], b = document.createElement("button"); b.type = "button"; b.title = kw;
    const im = document.createElement("img"); im.alt = kw; im.src = URL.createObjectURL(new Blob([buf.slice(p[1], p[1] + p[2])], { type: "image/webp" }));
    b.append(im, document.createTextNode(kw)); b.onclick = () => pickDraw(p); return b;
  }));
}
let qt; $("pk-q").oninput = () => { clearTimeout(qt); qt = setTimeout(lib, tab === "e" ? 100 : 300); };
const setTab = (t) => { tab = t; $("pk-e").classList.toggle("on", t === "e"); $("pk-d").classList.toggle("on", t === "d"); lib(); };
$("pk-e").onclick = () => setTab("e"); $("pk-d").onclick = () => setTab("d");
$("pk-x").onclick = () => $("pk").close();
$("f-pick").onclick = () => { $("pk").showModal(); setTab(tab); $("pk-q").focus(); };

// --- tableaux ---
$("edit").onclick = () => { editing = !editing; render(); };
$("boards").onchange = (e) => { stack = [e.target.value]; render(); };
$("bnew").onclick = async () => {
  const n = await ask("Nom du nouveau tableau ?", { input: "" }); if (!n) return;
  const id = "t" + uid();
  db.boards[id] = { format: "open-board-0.1", id, locale: "fr", name: n, grid: { rows: 4, columns: 6, order: Array.from({ length: 4 }, () => Array(6).fill(null)) }, buttons: [], images: [] };
  stack = [id]; save(); render();
};
$("bren").onclick = async () => { const n = await ask("Nouveau nom ?", { input: cur().name }); if (n) { cur().name = n; save(); render(); } };
$("bdel").onclick = async () => {
  const id = curId();
  if (id === db.root) return ask("Le tableau d'accueil ne peut pas être supprimé.", { cancel: false });
  if (!(await ask(`Supprimer « ${cur().name} » ?`))) return;
  delete db.boards[id];
  for (const b of Object.values(db.boards)) b.buttons.forEach((x) => { if (x.load_board?.id === id) delete x.load_board; });
  stack = [db.root]; save(); render();
};
$("bhome").onclick = () => { db.root = curId(); stack = [db.root]; save(); ask("Tableau d'accueil défini.", { cancel: false }); };
async function resize() {
  const b = cur(), R = Math.min(12, Math.max(1, +$("rows").value || 1)), C = Math.min(14, Math.max(1, +$("cols").value || 1));
  const o = b.grid.order, lost = o.flatMap((row, r) => row.filter((id, c) => id && (r >= R || c >= C)));
  if (lost.length && !(await ask(`${lost.length} bouton(s) seront supprimés. Continuer ?`))) return render();
  const no = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => o[r]?.[c] ?? null));
  const keep = new Set(no.flat());
  b.buttons = b.buttons.filter((x) => keep.has(x.id));
  Object.assign(b.grid, { rows: R, columns: C, order: no });
  gcImages(b); save(); render();
}
$("rows").onchange = resize; $("cols").onchange = resize;
$("prt").onclick = () => window.print();

// --- import / export OBF ---
const baseName = (p) => p.split(/[\\/]/).pop();
async function saveBlob(blob, name, ext) {
  if (T?.dialog) {
    const p = await T.dialog.save({ defaultPath: name, filters: [{ name: "Open Board Format", extensions: [ext] }] });
    if (p) await T.fs.writeFile(p, new Uint8Array(await blob.arrayBuffer()));
  } else {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }
}
$("exp").onclick = async () => saveBlob(await Store.exportObz(db), "tla.obz", "obz");
$("expb").onclick = async () => {
  const b = structuredClone(cur()), one = { root: b.id, boards: { [b.id]: b }, settings: S, hist: {} };
  saveBlob(await Store.exportObz(one), baseName(b.name) + ".obz", "obz");
};
async function applyImport(file) {
  try {
    const r = await Store.importFile(file);
    if (r.root) {
      if (!(await ask("Remplacer tous les tableaux actuels ?"))) return;
      db.boards = r.boards; db.root = r.root; stack = [r.root];
    } else {
      Object.assign(db.boards, r.boards); stack = [Object.keys(r.boards)[0]];
    }
    save(); render();
  } catch (e) { ask("Import impossible : " + e.message, { cancel: false }); }
}
$("imp").onclick = async () => {
  if (T?.dialog) {
    const p = await T.dialog.open({ filters: [{ name: "Open Board Format", extensions: ["obz", "obf", "json"] }] });
    if (!p) return;
    const u8 = await T.fs.readFile(p);
    applyImport({ name: baseName(p), arrayBuffer: async () => u8.buffer });
  } else $("file").click();
};
$("file").onchange = (e) => { const f = e.target.files[0]; if (f) applyImport(f); e.target.value = ""; };

// --- réglages ---
function openSettings() {
  const v = $("s-voice");
  v.replaceChildren(new Option("Voix par défaut", ""), ...voices().map((x) => new Option(`${x.name} (${x.lang})`, x.name)));
  v.value = S.voice;
  $("s-rate").value = S.rate; $("s-pitch").value = S.pitch; $("s-mode").value = S.mode; $("s-home").checked = S.autoHome;
  $("s-pred").checked = S.pred; $("s-lab").value = S.lab; $("s-size").value = S.size; $("s-scan").checked = S.scan; $("s-ms").value = S.ms;
  $("sd").showModal();
}
$("set").onclick = openSettings;
$("sd").addEventListener("input", () => {
  Object.assign(S, { voice: $("s-voice").value, rate: +$("s-rate").value, pitch: +$("s-pitch").value, mode: $("s-mode").value, autoHome: $("s-home").checked, pred: $("s-pred").checked, lab: $("s-lab").value, size: +$("s-size").value, scan: $("s-scan").checked, ms: +$("s-ms").value || 1.2 });
  save(); render();
});
$("sd").addEventListener("change", (e) => { if (e.target.id === "s-voice") say("Bonjour"); });

// --- démarrage ---
(async () => {
  try { db = await Store.load(); } catch {}
  if (!db || !db.boards?.[db.root]) db = structuredClone(window.DEFAULT_DB);
  db.hist ||= {};
  S = db.settings = Object.assign({}, DEF, db.settings);
  stack = [db.root];
  render();
})();
