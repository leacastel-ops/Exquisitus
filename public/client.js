// =========================================================
// CADAVRE EXQUIS — code du navigateur
// Parle au serveur via Socket.IO. Aucune clé Fal ici.
// =========================================================

// Libellés affichés (le serveur a la même liste dans game.js)
const PARTS = {
  haut: ["Le haut du corps", "tête, visage, torse, bras"],
  bas: ["Le bas du corps", "bassin, jambes, pieds"],
  tete: ["La tête", "visage, yeux, cheveux, expression, couvre-chef…"],
  cou: ["Le cou et les épaules", "cou, col, épaulettes, carrure…"],
  torse: ["Le torse", "poitrine, ventre, vêtement, texture…"],
  torse_bras: ["Le torse et les bras", "buste, vêtement, bras, mains…"],
  bras: ["Les bras", "forme, matière, manches, coudes…"],
  bras_mains: ["Les bras et les mains", "bras, poignets, mains, doigts…"],
  mains: ["Les mains", "doigts, ongles, gants, objets tenus…"],
  bassin: ["Le bassin et les hanches", "ceinture, hanches, queue éventuelle…"],
  jambes: ["Les jambes", "cuisses, genoux, mollets, matière…"],
  jambes_genoux: ["Les jambes et les genoux", "cuisses, genoux, mollets…"],
  jambes_pieds: ["Les jambes et les pieds", "jambes, genoux, chevilles, pieds…"],
  pieds: ["Les pieds", "orteils, chaussures, sabots, chevilles…"],
};
const SPLITS = {
  1: ["tete", "torse_bras", "jambes_pieds"], 2: ["haut", "bas"], 3: ["tete", "torse_bras", "jambes_pieds"],
  4: ["tete", "torse", "bras_mains", "jambes_pieds"], 5: ["tete", "torse", "bras_mains", "jambes", "pieds"],
  6: ["tete", "cou", "torse", "bras_mains", "jambes", "pieds"], 7: ["tete", "cou", "torse", "bras", "mains", "jambes", "pieds"],
  8: ["tete", "cou", "torse", "bras", "mains", "bassin", "jambes_genoux", "pieds"],
};
const label = p => PARTS[p][0], hint = p => PARTS[p][1];

// ---------- État local ----------
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} },
};
let pid = store.get("cx_pid");
if(!pid){ pid = "p" + Math.random().toString(36).slice(2, 10); store.set("cx_pid", pid); }
const S = { name: store.get("cx_name") || "", game: null, error: "", drafts: {}, sent: {}, mounted: "", deadline: 0, autoSent: -1 };

const socket = io();
socket.on("state", g => {
  S.game = g;
  if(g.phase === "write") S.deadline = Date.now() + g.remainingMs;   // on se cale sur le chrono du serveur
  render();
});
// Après une coupure réseau, on se reconnecte automatiquement à la même partie
socket.on("connect", () => {
  const code = store.get("cx_code");
  if(code && S.name) socket.emit("join", { code, name: S.name, pid }, r => { if(r?.error){ store.set("cx_code", null); S.game = null; render(); } });
});

// ---------- Utilitaires ----------
function h(tag, attrs = {}, ...kids){
  const e = document.createElement(tag);
  for(const [k, v] of Object.entries(attrs || {})){
    if(v == null || v === false) continue;
    if(k === "class") e.className = v;
    else if(k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for(const kid of kids.flat()){ if(kid == null || kid === false) continue; e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return e;
}
function toast(msg){ const t = document.getElementById("toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 2600); }
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const isHost = () => S.game && S.game.hostPid === pid;
const nameOf = id => (S.game.players.find(p => p.pid === id) || {}).name || "Un joueur";
const myParts = () => (S.game.order || []).filter(p => S.game.assign[p] === pid);

// ---------- Actions ----------
function checkName(){
  S.name = (document.getElementById("name")?.value || S.name).trim().slice(0, 24);
  if(!S.name){ S.error = "Choisis d'abord un pseudo."; render(); return false; }
  store.set("cx_name", S.name); return true;
}
function createGame(){
  if(!checkName()) return;
  socket.emit("create", { name: S.name, pid }, r => { if(r.error){ S.error = r.error; render(); } else store.set("cx_code", r.code); });
}
function joinGame(code){
  if(!checkName()) return;
  socket.emit("join", { code, name: S.name, pid }, r => { if(r.error){ S.error = r.error; render(); } else store.set("cx_code", r.code); });
}
function leaveGame(){ socket.emit("leave"); store.set("cx_code", null); S.game = null; S.mounted = ""; render(); }
function submitPart(part, auto){
  const k = S.game.round + "_" + part, desc = (S.drafts[k] || "").trim();
  if(!desc && !auto) return toast("Décris ta partie avant d'envoyer !");
  socket.emit("submit", { part, desc }, r => {
    if(r?.error) return toast(r.error);
    S.sent[k] = S.drafts[k]; if(!auto) toast("Description envoyée ✓"); updateWrite();
  });
}
async function download(url){
  // On télécharge l'image Fal puis on la propose en fichier
  try{
    const blob = await (await fetch(url)).blob();
    const a = h("a", { href: URL.createObjectURL(blob), download: `cadavre-exquis-${S.game.code}-manche${S.game.round}.png` });
    document.body.append(a); a.click(); a.remove();
  }catch(e){ window.open(url, "_blank"); }
}

// ---------- Chrono et envoi automatique ----------
setInterval(() => {
  const g = S.game; if(!g || g.phase !== "write") return;
  if(Date.now() >= S.deadline && S.autoSent !== g.round){
    S.autoSent = g.round;
    myParts().forEach(p => { const k = g.round + "_" + p; if((S.drafts[k] || "").trim() && S.drafts[k] !== S.sent[k]) submitPart(p, true); });
  }
  updateWrite();
}, 500);

// =========================================================
// AFFICHAGE
// =========================================================
const $app = document.getElementById("app");
function render(){
  const g = S.game, view = g ? g.phase : "home";
  const key = view === "write" ? `write|${g.round}|${g.hostPid}` : view === "home" ? "home" : "";
  if(key && key === S.mounted){ view === "write" ? updateWrite() : updateHome(); return; }   // garde les zones de texte
  S.mounted = key;
  $app.replaceChildren(
    h("div", { class: "masthead" }, h("div", { class: "logo" }, "Cadavre ", h("i", {}, "exquis")), h("div", { class: "tag" }, g ? "Partie " + g.code : "Jeu de dessin à plusieurs")),
    ({ home: homeScreen, lobby: lobbyScreen, write: writeScreen, gen: genScreen, reveal: revealScreen }[view] || homeScreen)());
  if(view === "home") updateHome();
  if(view === "write") updateWrite();
}

function homeScreen(){
  const codeIn = h("input", { class: "input code-input", maxlength: 6, placeholder: "CODE", autocomplete: "off", onkeydown: e => { if(e.key === "Enter") joinGame(codeIn.value); } });
  return h("div", {},
    h("div", { class: "hero" },
      h("h1", {}, "Un corps, ", h("em", {}, "plusieurs"), h("br"), "imaginations."),
      h("p", {}, "Chacun décrit en secret une partie du corps. L'IA dessine chaque morceau, puis les recoud en un seul personnage. Personne ne sait ce que les autres ont écrit… jusqu'à la révélation.")),
    h("div", { id: "home-msg" }),
    h("div", { class: "field", style: "margin-bottom:18px;max-width:360px" }, h("label", { for: "name" }, "Ton pseudo"),
      h("input", { class: "input", id: "name", maxlength: 24, placeholder: "Ton pseudo", value: S.name })),
    h("div", { class: "folded" },
      h("section", {}, h("h2", {}, "Créer une partie"), h("p", { class: "muted" }, "Tu deviens l'hôte et tu reçois un code à partager."),
        h("button", { class: "btn red", onclick: createGame }, "Créer une partie")),
      h("section", {}, h("h2", {}, "Rejoindre"),
        h("div", { class: "stack" }, codeIn, h("button", { class: "btn", onclick: () => joinGame(codeIn.value) }, "Rejoindre la partie")))),
    h("div", { class: "how" },
      h("div", {}, h("b", {}, "1"), "L'hôte crée la partie et partage le code."),
      h("div", {}, h("b", {}, "2"), "Chacun reçoit une partie du corps au hasard."),
      h("div", {}, h("b", {}, "3"), "Décris-la avec le plus de détails possible."),
      h("div", {}, h("b", {}, "4"), "L'IA dessine, assemble… et on révèle !")));
}
function updateHome(){
  const m = document.getElementById("home-msg");
  if(m) m.replaceChildren(...(S.error ? [h("div", { class: "error", style: "margin-bottom:18px" }, S.error)] : []));
}

function lobbyScreen(){
  const g = S.game, online = g.players.filter(p => p.online), n = Math.min(Math.max(online.length, 1), 8);
  return h("div", { class: "stack", style: "gap:26px" },
    h("div", { class: "codebox" },
      h("div", {}, h("div", { class: "small muted" }, "Code d'accès"), h("div", { class: "code" }, g.code)),
      h("button", { class: "btn sm ghost", onclick: async () => { try{ await navigator.clipboard.writeText(g.code); toast("Code copié !"); }catch(e){ toast("Note le code."); } } }, "Copier")),
    h("div", { class: "stack" }, h("h2", {}, `Joueurs (${online.length}/8)`),
      h("ul", { class: "players" }, g.players.map(p => h("li", {},
        h("span", { class: "dot" + (p.online ? "" : " off") }), h("span", { class: "nm" }, p.name),
        p.pid === g.hostPid ? h("span", { class: "badge" }, "Hôte") : null,
        p.pid === pid ? h("span", { class: "badge me" }, "Toi") : null)))),
    h("div", { class: "stack" }, h("h3", {}, `Découpage du corps avec ${n} joueur${n > 1 ? "s" : ""}`),
      h("div", { class: "split" }, SPLITS[n].map(p => h("div", {}, label(p), h("span", {}, hint(p))))),
      n === 1 ? h("p", { class: "small muted" }, "Mode test : seul, tu décriras les trois parties.") : null),
    h("div", { class: "row", style: "justify-content:space-between" },
      h("div", { class: "row" }, h("span", { class: "small muted" }, "Temps pour écrire"),
        h("select", { class: "input", style: "width:auto", disabled: !isHost(), onchange: e => socket.emit("setTimer", Number(e.target.value)) },
          [60, 120, 180, 300].map(s => h("option", { value: s, selected: g.timerSec === s }, s / 60 + " min")))),
      isHost() ? h("button", { class: "btn red", onclick: () => socket.emit("start") }, "Lancer la partie")
               : h("span", { class: "muted" }, h("span", { class: "spinner" }), " En attente de l'hôte…")),
    h("button", { class: "btn ghost sm", style: "align-self:flex-start", onclick: leaveGame }, "Quitter la partie"));
}

function writeScreen(){
  const g = S.game, mine = myParts();
  return h("div", { class: "stack", style: "gap:22px" },
    h("div", { class: "row", style: "justify-content:space-between" },
      h("div", {}, h("div", { class: "small muted" }, "Manche " + g.round), h("h2", {}, mine.length ? "À toi de décrire" : "Tu observes cette manche")),
      h("div", { class: "timer", id: "timer" }, fmt(S.deadline - Date.now()))),
    mine.length ? null : h("p", { class: "note" }, "Tu as rejoint la partie en cours : tu joueras à la prochaine manche."),
    mine.map(part => {
      const k = g.round + "_" + part;
      const ta = h("textarea", { maxlength: 800, placeholder: "Forme, matière, couleurs, taille, accessoires, détails étranges… Plus c'est précis, plus le dessin sera fidèle.",
        oninput: e => { S.drafts[k] = e.target.value; updateWrite(); } });
      ta.value = S.drafts[k] || "";
      return h("div", { class: "partcard" },
        h("header", {}, h("h3", {}, label(part)), h("span", { class: "small" }, hint(part))),
        h("div", { class: "body" }, ta, h("div", { class: "foot" },
          h("span", { class: "small muted", "data-count": k }),
          h("button", { class: "btn blue", "data-send": k, onclick: () => submitPart(part) }, "Envoyer"))));
    }),
    h("div", { class: "stack" },
      h("div", { class: "row", style: "justify-content:space-between" }, h("h3", {}, "Avancement"),
        isHost() ? h("button", { class: "btn sm ghost", onclick: () => socket.emit("forceGenerate") }, "Générer maintenant") : null),
      h("div", { class: "chips", id: "chips" })),
    h("p", { class: "small muted" }, "Les autres joueurs ne voient pas ta description. Tu peux la modifier et la renvoyer tant que le temps n'est pas écoulé."));
}
function updateWrite(){
  const g = S.game; if(!g || g.phase !== "write") return;
  const t = document.getElementById("timer");
  if(t){ const left = S.deadline - Date.now(); t.textContent = fmt(left); t.classList.toggle("urgent", left < 15000); }
  document.querySelectorAll("[data-count]").forEach(el => {
    const k = el.dataset.count;
    el.textContent = `${(S.drafts[k] || "").length}/800 caractères` + (S.sent[k] != null ? (S.sent[k] === S.drafts[k] ? " · envoyé ✓" : " · modifié, pense à renvoyer") : "");
  });
  document.querySelectorAll("[data-send]").forEach(b => { const k = b.dataset.send; b.textContent = S.sent[k] == null ? "Envoyer" : S.sent[k] === S.drafts[k] ? "Envoyé ✓" : "Renvoyer"; });
  const chips = document.getElementById("chips");
  if(chips) chips.replaceChildren(...g.order.map(p => { const d = g.submitted.includes(p); return h("span", { class: "chip" + (d ? " done" : "") }, (d ? "✓ " : "… ") + nameOf(g.assign[p])); }));
}

function genScreen(){
  const g = S.game, pr = g.progress || { done: 0, total: g.order.length + 1, label: "Préparation…" };
  return h("div", { class: "stack", style: "gap:22px" },
    h("div", {}, h("div", { class: "small muted" }, "Manche " + g.round), h("h2", {}, "L'IA dessine en secret…")),
    h("div", { class: "bar" }, h("i", { style: `width:${Math.round(100 * pr.done / pr.total)}%` })),
    h("p", { class: "muted" }, pr.label),
    h("div", { class: "strips" },
      g.order.map(p => { const ok = g.done.includes(p); return h("div", { class: "strip " + (ok ? "ok" : "busy") }, label(p), h("span", { class: "st" }, ok ? "Dessinée ✓" : "En cours")); }),
      h("div", { class: "strip" }, "Assemblage final", h("span", { class: "st" }, "À venir"))),
    h("p", { class: "small muted" }, "Les dessins restent pliés jusqu'à la révélation."));
}

function revealScreen(){
  const g = S.game;
  const visual = g.finalUrl
    ? h("img", { src: g.finalUrl, alt: "Le personnage final" })
    : h("div", { class: "stacked" }, g.order.filter(p => g.images[p]).map(p => h("img", { src: g.images[p], alt: label(p) })));
  return h("div", { class: "stack", style: "gap:26px" },
    h("div", { class: "center" }, h("div", { class: "small muted" }, "Manche " + g.round),
      h("h1", { style: "font-size:clamp(2.2rem,7vw,3.6rem)" }, "Voici votre ", h("em", { style: "color:var(--red)" }, "créature"))),
    g.error ? h("div", { class: "note" }, g.error) : null,
    h("div", { class: "reveal-frame" }, visual),
    h("div", { class: "row", style: "justify-content:center" },
      g.finalUrl ? h("button", { class: "btn", onclick: () => download(g.finalUrl) }, "Télécharger l'image") : null,
      isHost() ? h("button", { class: "btn red", onclick: () => socket.emit("replay") }, "Rejouer") : null,
      h("button", { class: "btn ghost", onclick: leaveGame }, "Quitter")),
    h("h2", {}, "Le cadavre déplié"),
    h("div", { class: "unfold" }, g.order.map(p => h("article", {},
      g.images[p] ? h("img", { src: g.images[p], alt: label(p) }) : h("div", { class: "note small" }, "Pas d'image"),
      h("div", {}, h("h3", {}, label(p)),
        h("div", { class: "small muted" }, "par " + (g.descs[p]?.name || nameOf(g.assign[p]))),
        h("blockquote", {}, g.descs[p]?.desc ? "« " + g.descs[p].desc + " »" : "(aucune description : l'IA a improvisé)"))))));
}

render();
