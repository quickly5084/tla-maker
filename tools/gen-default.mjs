// Génère ui/default-boards.js : vocabulaire de base (OBF) avec pictogrammes ARASAAC tirés de ui/pictos.bin.
// Usage : node tools/gen-default.mjs
import fs from "node:fs";
import vm from "node:vm";
const ui = new URL("../ui/", import.meta.url).pathname;
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(ui + "pictos-index.js", "utf8"), ctx);
const bin = fs.readFileSync(ui + "pictos.bin");
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const IDX = ctx.window.PICTOS.map((p) => ({ p, k: p[3].split("|").map(norm) }));

const CAT = {
  pron: ["rgb(255, 243, 160)", "rgb(224, 184, 0)"],
  verbe: ["rgb(196, 242, 184)", "rgb(46, 158, 46)"],
  nom: ["rgb(255, 220, 168)", "rgb(224, 138, 0)"],
  adj: ["rgb(191, 220, 255)", "rgb(42, 127, 209)"],
  petit: ["rgb(255, 201, 229)", "rgb(214, 64, 159)"],
  social: ["rgb(230, 208, 255)", "rgb(138, 70, 214)"],
  non: ["rgb(255, 184, 184)", "rgb(214, 58, 58)"],
  quest: ["rgb(255, 208, 230)", "rgb(200, 60, 120)"],
  dossier: ["rgb(228, 234, 240)", "rgb(91, 112, 131)"],
};
// [libellé, catégorie, mot-clé ARASAAC (sinon libellé)]
const HOME = [
  ["je","pron"],["tu","pron"],["il","pron"],["elle","pron"],["on","pron","tout le monde"],["nous","pron"],["vous","pron"],["ça","pron","cela"],
  ["veux","verbe","vouloir"],["aime","verbe","aimer"],["peux","verbe","pouvoir"],["fais","verbe","faire"],["vais","verbe","aller"],["mets","verbe","mettre"],["vois","verbe","voir"],["aide","verbe","aider"],
  ["oui","social"],["non","non"],["pas","non","interdit"],["plus","petit"],["encore","petit"],["stop","non"],["merci","social"],["s'il te plaît","social"],
  ["bon","adj"],["mauvais","adj"],["grand","adj"],["petit","adj"],["chaud","adj"],["froid","adj"],["fini","adj","terminer"],["beau","adj"],
  ["gens","dossier","famille",{popup:1}],["manger","dossier"],["sentiments","dossier","content"],["lieux","dossier","maison"],["jouer","dossier"],["corps","dossier"],["verbes","dossier","action",{popup:1}],["questions","dossier","question",{popup:1}],
  ["Listes de mots","dossier","liste",{at:[0,8],load:"themes"}],["Personnel","dossier","personne",{at:[1,8],load:"perso"}],["Petits mots","dossier",false,{at:[2,8],load:"petits"}],
  ["Ponctuation","dossier",false,{at:[3,8],load:"ponct"}],["Formes de mots","dossier","mot",{at:[4,8],act:":forms"}],
];
const THEMES = ["gens","manger","sentiments","lieux","jouer","corps","verbes","questions"];
const QUICK = [
  ["J'ai besoin d'aide","social","aider"],["Je ne comprends pas","non","comprendre"],["Attends s'il te plaît","social","attendre"],["Je veux aller aux toilettes","social","toilettes"],
  ["J'ai faim","social","faim"],["J'ai soif","social","soif"],["J'ai mal","non","mal"],["Je suis fatigué","social","fatigué"],
  ["Je veux jouer","verbe","jouer"],["Je veux arrêter","non","arrêter"],["Bonjour","social","bonjour"],["Au revoir","social","au revoir"],
  ["Merci beaucoup","social","merci"],["Excuse-moi","social","pardon"],["Je t'aime","social","amour"],["Peux-tu répéter ?","quest","répéter"],
  ["Je ne sais pas","non","ne pas savoir"],["C'est à moi","pron","moi"],["Viens ici","verbe","venir"],["C'est quoi ?","quest","question"],
];
const PERSO = [
  ["mon prénom","pron","personne"],["mon âge","pron",false],["mon adresse","nom","maison"],["mon téléphone","nom","téléphone"],["ma famille","nom","famille"],["mon école","nom","école"],
  ["mon médecin","nom","médecin"],["ma maîtresse","nom","maîtresse"],["mon ami","nom","ami"],["mon animal","nom","animal"],
];
const PETITS = ["à","et","le","la","les","un","une","de","du","des","dans","sur","avec","pour","que","qui","si","mais","ou","donc","ce","mon","ma","mes","ne","se","en","y"].map((w) => [w, "petit", false]);
const PONCT = [".",",","?","!","'",":",";","…","(",")","-","«","»"].map((w) => [w, "petit", false]);
const SUB = {
  gens: ["Gens","nom",[["maman"],["papa"],["frère"],["sœur"],["ami"],["mamie","nom","grand-mère"],["papi","nom","grand-père"],["maîtresse"],["docteur","nom","médecin"],["bébé"],["garçon"],["fille"],["famille"],["monsieur"],["madame"],["moi"],["copain"],["voisin"]]],
  manger: ["Manger","nom",[["manger","verbe"],["boire","verbe"],["pain"],["pomme"],["banane"],["eau"],["lait"],["jus"],["gâteau"],["fromage"],["viande"],["poisson"],["légumes"],["pâtes"],["riz"],["soupe"],["œuf"],["glace"]]],
  sentiments: ["Sentiments","adj",[["content"],["triste"],["en colère","adj","colère"],["peur"],["fatigué"],["malade"],["faim"],["soif"],["surpris"],["calme"],["gêné"],["jaloux"],["ennui"],["inquiet"],["fier"],["amoureux"],["seul"],["courage"]]],
  lieux: ["Lieux","nom",[["maison"],["école"],["toilettes"],["chambre"],["cuisine"],["jardin"],["parc"],["magasin"],["hôpital"],["voiture"],["bus"],["salle de bain"],["dehors"],["dedans"],["piscine"],["plage"],["ville"],["cinéma"]]],
  jouer: ["Jouer","verbe",[["jouer"],["ballon"],["jeu"],["dessiner"],["livre"],["musique"],["télévision"],["tablette"],["danser"],["chanter"],["vélo"],["balançoire"],["puzzle"],["poupée"],["cubes"],["peinture"],["ordinateur"],["histoire"]]],
  corps: ["Corps","nom",[["tête"],["main"],["pied"],["ventre"],["dos"],["bouche"],["yeux"],["oreille"],["nez"],["bras"],["jambe"],["dent"],["gorge"],["cheveux"],["cœur"],["doigt"],["genou"],["mal"]]],
  verbes: ["Verbes","verbe",[["venir"],["donner"],["prendre"],["ouvrir"],["fermer"],["dormir"],["laver"],["habiller"],["lire"],["écrire"],["écouter"],["parler"],["attendre"],["marcher"],["courir"],["asseoir"],["changer"],["finir","verbe","terminer"]]],
  questions: ["Questions","quest",[["qui"],["quoi"],["où"],["quand"],["pourquoi"],["comment"],["combien"],["quel"]]],
};

const images = new Map(); // id picto -> image OBF
const miss = [];
function img(key, label) {
  if (key === false) return null;
  const k = norm(key || label);
  const hit = IDX.find((e) => e.k.includes(k)) || IDX.find((e) => e.k.some((w) => w.startsWith(k + " ")));
  if (!hit) { miss.push(label); return null; }
  const [id, off, len] = hit.p, iid = "p" + id;
  if (!images.has(iid)) images.set(iid, { id: iid, content_type: "image/webp", width: 160, height: 160, data: "data:image/webp;base64," + bin.subarray(off, off + len).toString("base64") });
  return iid;
}
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-");
function board(id, name, rows, cols, items, flow = cols) {
  const buttons = [], order = Array.from({ length: rows }, () => Array(cols).fill(null));
  items.forEach(([label, cat, key, o = {}], i) => {
    const b = { id: "b" + id + i, label, background_color: CAT[cat][0], border_color: CAT[cat][1] };
    const im = img(key, label); if (im) b.image_id = im;
    if (o.act) b.action = o.act;
    else if (cat === "dossier") b.load_board = { id: o.load || slug(label) };
    if (o.popup) b.ext_tla_popup = true;
    const [r, c] = o.at || [Math.floor(i / flow), i % flow];
    buttons.push(b); order[r][c] = b.id;
  });
  return { format: "open-board-0.1", id, locale: "fr", name, grid: { rows, columns: cols, order }, buttons, images: [] };
}
const boards = { home: board("home", "Accueil", 5, 9, HOME, 8) };
boards.themes = board("themes", "Listes de mots", 2, 5, THEMES.map((id) => [SUB[id][0], "dossier", SUB[id][2][0][0], { load: id }]));
boards.quick = board("quick", "Phrases rapides", 4, 5, QUICK);
boards.perso = board("perso", "Personnel", 2, 5, PERSO);
boards.petits = board("petits", "Petits mots", 4, 7, PETITS);
boards.ponct = board("ponct", "Ponctuation", 2, 7, PONCT);
for (const [id, [name, cat, items]] of Object.entries(SUB)) boards[id] = board(id, name, 3, 6, items.map(([l, c, k]) => [l, c || cat, k]));
for (const b of Object.values(boards)) {
  const used = new Set(b.buttons.map((x) => x.image_id));
  b.images = [...images.values()].filter((i) => used.has(i.id));
}
fs.writeFileSync(ui + "default-boards.js", "window.DEFAULT_DB=" + JSON.stringify({ root: "home", boards }) + ";\n");
console.log("manquants:", miss.join(", "), "| images:", images.size);
