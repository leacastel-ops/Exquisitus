// =========================================================
// EXQUISIT — code du navigateur
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
const THEME = { home: "t-red", history: "t-red", lobby: "t-blue", style: "t-pink", write: "t-green", gen: "t-blue", reveal: "t-red" };
const PART_COLORS = ["c-green", "c-blue", "c-red", "c-pink"];   // le jaune est trop pâle pour du texte
const STAR_COLORS = ["#f0d32b", "#3f76bb", "#058f39", "#e169a4"];   // sans le rouge

// ---------- État local ----------
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} },
};
let pid = store.get("cx_pid");
if(!pid){ pid = "p" + Math.random().toString(36).slice(2, 10); store.set("cx_pid", pid); }
const S = { name: store.get("cx_name") || "", codeDraft: "", game: null, error: "", drafts: {}, sent: {}, mounted: "",
            deadline: 0, autoSent: "", history: null, showHistory: false };

const socket = io();
socket.on("state", g => {
  S.game = g;
  if(g.phase === "write" || g.phase === "style") S.deadline = Date.now() + g.remainingMs;   // on se cale sur le chrono du serveur
  render();
});
socket.on("history", list => { S.history = list; if(!S.game || S.showHistory){ S.mounted = ""; render(); } });
// Après une coupure réseau, on se reconnecte automatiquement à la même partie
socket.on("connect", () => {
  const code = store.get("cx_code");
  if(code && S.name) socket.emit("join", { code, name: S.name, pid }, r => { if(r?.error){ store.set("cx_code", null); S.game = null; render(); } });
});
fetch("/api/history").then(r => r.json()).then(list => { S.history = list; S.mounted = ""; render(); }).catch(() => { S.history = []; render(); });

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
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + "." + String(s % 60).padStart(2, "0"); };
const isHost = () => S.game && S.game.hostPid === pid;
const nameOf = id => (S.game.players.find(p => p.pid === id) || {}).name || "Un joueur";
const myParts = () => (S.game.order || []).filter(p => S.game.assign[p] === pid);

// ---------- Actions ----------
function checkName(){
  S.name = (document.getElementById("name")?.value || S.name).trim().slice(0, 24);
  if(!S.name){ S.error = "Choisis d'abord un pseudo."; S.mounted = ""; render(); return false; }
  store.set("cx_name", S.name); return true;
}
function createGame(){
  if(!checkName()) return;
  socket.emit("create", { name: S.name, pid }, r => { if(r.error){ S.error = r.error; S.mounted = ""; render(); } else store.set("cx_code", r.code); });
}
function joinGame(code){
  if(!checkName()) return;
  socket.emit("join", { code, name: S.name, pid }, r => { if(r.error){ S.error = r.error; S.mounted = ""; render(); } else store.set("cx_code", r.code); });
}
function leaveGame(){ socket.emit("leave"); store.set("cx_code", null); S.game = null; S.mounted = ""; render(); }
function submitPart(part, auto){
  const k = S.game.round + "_" + part, desc = (S.drafts[k] || "").trim();
  if(!desc && !auto) return toast("Décris ta partie avant d'envoyer");
  socket.emit("submit", { part, desc }, r => {
    if(r?.error) return toast(r.error);
    S.sent[k] = S.drafts[k]; if(!auto) toast("Description envoyée"); updateWrite();
  });
}
function submitStyle(auto){
  const k = "style_" + S.game.round, text = (S.drafts[k] || "").trim();
  if(!text && !auto) return toast("Décris un style avant d'envoyer");
  socket.emit("style", { text }, r => {
    if(r?.error) return toast(r.error);
    S.sent[k] = S.drafts[k]; if(!auto) toast("Style envoyé"); updateStyle();
  });
}
async function download(url){
  try{
    const blob = await (await fetch(url)).blob();
    const a = h("a", { href: URL.createObjectURL(blob), download: `exquisit-${S.game.code}-manche${S.game.round}.png` });
    document.body.append(a); a.click(); a.remove();
  }catch(e){ window.open(url, "_blank"); }
}

// ---------- Navigation ----------
function goHome(){
  if(S.showHistory){ S.showHistory = false; S.mounted = ""; return render(); }
  if(S.game){
    if(["lobby", "reveal"].includes(S.game.phase)) leaveGame();
    else toast("Partie en cours : utilise « quitter » en bas de page");
  } else window.scrollTo({ top: 0, behavior: "smooth" });
}
function goPlay(){
  if(S.showHistory){ S.showHistory = false; S.mounted = ""; return render(); }
  document.getElementById("play")?.scrollIntoView({ behavior: "smooth" });
}
function goHistory(){
  if(!S.game) return document.getElementById("historique")?.scrollIntoView({ behavior: "smooth" });
  S.showHistory = true; S.mounted = ""; render(); window.scrollTo({ top: 0 });
}

// ---------- Chrono, envoi automatique, étoile ----------
setInterval(() => {
  const g = S.game; if(!g || !["write", "style"].includes(g.phase)) return;
  const tag = g.phase + g.round;
  if(Date.now() >= S.deadline && S.autoSent !== tag){
    S.autoSent = tag;
    if(g.phase === "style"){ const k = "style_" + g.round; if((S.drafts[k] || "").trim() && S.drafts[k] !== S.sent[k]) submitStyle(true); }
    else myParts().forEach(p => { const k = g.round + "_" + p; if((S.drafts[k] || "").trim() && S.drafts[k] !== S.sent[k]) submitPart(p, true); });
  }
  g.phase === "style" ? updateStyle() : updateWrite();
}, 500);
let starIdx = 0;
setInterval(() => {   // couleur de l'étoile changée toutes les 0,5 s, jamais deux fois la même
  starIdx = (starIdx + 1 + Math.floor(Math.random() * (STAR_COLORS.length - 1))) % STAR_COLORS.length;
  document.querySelectorAll(".burst polygon").forEach(p => p.style.fill = STAR_COLORS[starIdx]);
}, 500);

// =========================================================
// AFFICHAGE
// =========================================================
const $app = document.getElementById("app");
function render(){
  const g = S.game;
  const view = S.showHistory && g ? "history" : g ? g.phase : "home";
  const key = (view === "write" || view === "style") ? `${view}|${g.round}|${g.hostPid}` : view === "home" ? "home" : "";
  if(key && key === S.mounted){ view === "write" ? updateWrite() : view === "style" ? updateStyle() : null; return; }   // garde les zones de texte
  S.mounted = key;
  $app.className = document.body.className = THEME[view] || "t-red";
  const scr = ({ home: homeScreen, history: historyPage, lobby: lobbyScreen, style: styleScreen, write: writeScreen, gen: genScreen, reveal: revealScreen }[view] || homeScreen)();
  scr.classList.add("screen", "screen-" + view);
  $app.replaceChildren(topbar(view), scr);
  if(view === "write") updateWrite();
  if(view === "style") updateStyle();
}

function topbar(view){
  const g = S.game;
  const right = (view === "write" || view === "style")
      ? h("div", { class: "timer", id: "timerbox" }, h("div", { class: "label" }, "Temps restants"), h("div", { class: "display num", id: "timer" }, fmt(S.deadline - Date.now())))
    : view === "reveal" ? h("div", { class: "timer c-pink" }, h("div", { class: "label" }, "Temps restants"), h("div", { class: "display num" }, "0.00"))
    : g && view !== "history" ? h("div", { class: "right label" }, "Partie", h("br"), g.code) : null;
  return h("div", { class: "top" },
    h("nav", { class: "nav" },
      h("button", { class: view === "home" ? "on" : "", onclick: goHome }, "Accueil"),
      h("button", { class: view !== "home" && view !== "history" ? "on" : "", onclick: goPlay }, "Joue maintenant"),
      h("button", { class: view === "history" ? "on" : "", onclick: goHistory }, "Historique")),
    right);
}

/* Étoile pleine, 12 pointes aiguës de longueurs inégales */
function burst(){
  const OUT = [99, 86, 96, 80, 99, 90, 84, 98, 88, 95, 82, 97], n = OUT.length, pts = [];
  for(let i = 0; i < n * 2; i++){
    const a = Math.PI * i / n - Math.PI / 2 + (i % 2 ? 0 : (i % 3 - 1) * 0.04);
    const r = i % 2 ? 40 + (i % 5) * 1.5 : OUT[i / 2];
    pts.push((100 + r * Math.cos(a)).toFixed(1) + "," + (100 + r * Math.sin(a)).toFixed(1));
  }
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200"); svg.setAttribute("class", "burst"); svg.setAttribute("aria-hidden", "true");
  const poly = document.createElementNS(NS, "polygon");
  poly.setAttribute("points", pts.join(" ")); poly.style.fill = STAR_COLORS[starIdx]; svg.append(poly);
  return svg;
}

/* --- Accueil --- */
function homeScreen(){
  const codeIn = h("input", { class: "line codein c-blue", id: "code", maxlength: 6, placeholder: "CODE", autocomplete: "off",
    oninput: e => { S.codeDraft = e.target.value; }, onkeydown: e => { if(e.key === "Enter") joinGame(codeIn.value); } });
  codeIn.value = S.codeDraft;
  return h("div", { class: "grow", style: "display:flex;flex-direction:column" },
    h("div", { class: "home-hero" }, burst(),
      h("h1", { class: "display logo", style: "position:relative" }, "Exquisit"),
      h("div", { style: "position:relative;margin-top:8px" }, "Le jeu du cadavre exquis 2.0 avec l'IA")),
    h("section", { id: "play", class: "mt-l" },
      S.error ? h("p", { class: "msg lc" }, S.error) : null,
      h("div", { class: "play-grid" },
        h("div", {},
          h("div", { class: "field" }, h("label", { class: "label", for: "name" }, "Ton pseudo"),
            h("input", { class: "line", id: "name", maxlength: 24, placeholder: "Ex. Léa", value: S.name, oninput: e => { S.name = e.target.value; } })),
          h("div", { class: "mt" }, h("button", { class: "act", onclick: createGame }, "Créer une partie"))),
        h("div", { class: "c-blue" },
          h("div", { class: "field" }, h("label", { class: "label", for: "code" }, "Ou rejoins une partie avec son code"), codeIn),
          h("div", { class: "mt-s" }, h("button", { class: "act", onclick: () => joinGame(codeIn.value) }, "Rejoindre"))))),
    h("section", { class: "mt-l how" },
      h("div", { class: "c-red" }, h("b", {}, "1"), "L'hôte crée la partie et partage le code"),
      h("div", { class: "c-blue" }, h("b", {}, "2"), "Chacun propose un style : un style et un modèle d'IA sont tirés au sort"),
      h("div", { class: "c-green" }, h("b", {}, "3"), "Chacun décrit en secret sa partie du corps"),
      h("div", { class: "c-pink" }, h("b", {}, "4"), "L'IA dessine, assemble… et on révèle")),
    historySection());
}

/* --- Historique --- */
function fmtDate(ts){
  const d = new Date(ts), p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} · ${p(d.getHours())}h${p(d.getMinutes())}`;
}
function historySection(){
  const list = S.history;
  return h("section", { id: "historique", class: "mt-l", style: "padding-top:24px" },
    h("h2", { class: "display h2" }, "Historique des personnages"),
    h("p", { class: "lc mt-s", style: "margin-bottom:26px" }, "Tous les personnages créés par les joueurs précédents, du plus récent au plus ancien."),
    list === null ? h("p", { class: "busy" }, "Chargement…")
    : !list.length ? h("p", { class: "lc" }, "Aucun personnage pour l'instant : lancez la première partie !")
    : h("div", { class: "gallery" }, list.map((x, i) => h("figure", {},
        x.url ? h("img", { src: x.url, alt: "Personnage créé par " + x.names.join(", "), loading: "lazy" })
              : h("div", { class: "stacked" }, x.parts.map(u => h("img", { src: u, alt: "", loading: "lazy", style: "aspect-ratio:1/1" }))),
        h("figcaption", { class: PART_COLORS[i % PART_COLORS.length] },
          h("span", { class: "d" }, fmtDate(x.createdAt)), x.names.join(" · "))))));
}
function historyPage(){
  return h("div", {},
    h("button", { class: "act plain", onclick: () => { S.showHistory = false; S.mounted = ""; render(); } }, "← Retour à la partie"),
    historySection());
}

/* --- Salon --- */
function lobbyScreen(){
  const g = S.game, online = g.players.filter(p => p.online), n = Math.min(Math.max(online.length, 1), 8);
  return h("div", {},
    h("div", { class: "label" }, "Code d'accès"),
    h("h1", { class: "display h1", style: "letter-spacing:.04em" }, g.code),
    h("div", { class: "acts mt-s" },
      h("button", { class: "act plain", onclick: async () => { try{ await navigator.clipboard.writeText(g.code); toast("Code copié"); }catch(e){ toast("Note le code"); } } }, "Copier le code")),
    h("p", { class: "lc mt" }, "Partage ce code : les autres joueurs l'entrent sur la page d'accueil."),
    h("div", { class: "mt-l label" }, `Joueurs ${online.length}/8`),
    h("ul", { class: "list mt-s" }, g.players.map(p => h("li", { class: p.online ? "" : "off" },
      h("span", {}, p.name),
      h("span", { class: "tag" }, [p.pid === g.hostPid ? "Hôte" : null, p.pid === pid ? "Toi" : null, p.online ? null : "Hors ligne"].filter(Boolean).join(" · "))))),
    h("div", { class: "mt-l label c-green" }, `Découpage du corps avec ${n} joueur${n > 1 ? "s" : ""}`),
    h("ul", { class: "list mt-s c-green" }, SPLITS[n].map((p, i) => h("li", {}, h("span", {}, `${i + 1}.${label(p)}`), h("span", { class: "tag lc" }, hint(p))))),
    n === 1 ? h("p", { class: "lc mt-s c-green" }, "Mode test : seul, tu décriras les trois parties.") : null,
    h("div", { class: "mt-l field" }, h("label", { class: "label" }, "Temps pour écrire"),
      h("select", { class: "line", disabled: !isHost(), onchange: e => socket.emit("setTimer", Number(e.target.value)) },
        [60, 120, 180, 300].map(s => h("option", { value: s, selected: g.timerSec === s }, s / 60 + " min")))),
    h("div", { class: "acts mt-l" },
      isHost() ? h("button", { class: "act c-red", onclick: () => socket.emit("start") }, "Lancer la partie")
               : h("span", { class: "busy" }, "En attente de l'hôte…"),
      h("button", { class: "act plain", onclick: leaveGame }, "Quitter")));
}

/* --- Style --- */
function styleScreen(){
  const g = S.game, k = "style_" + g.round;
  const ta = h("textarea", { maxlength: 400, "aria-label": "Style du personnage",
    placeholder: "Ex. : aquarelle délavée, pixel art 8 bits, gravure du XIXe siècle, pâte à modeler, manga des années 80, vitrail…",
    oninput: e => { S.drafts[k] = e.target.value; updateStyle(); } });
  ta.value = S.drafts[k] || "";
  return h("div", {},
    h("section", { class: "part" },
      h("h1", { class: "display h1" }, "0.Le style"),
      h("div", { class: "mt-s" }, "Décris le style du personnage"),
      h("p", { class: "lc", style: "margin:6px 0 18px" }, "Technique, trait, couleurs, matière, époque, ambiance… Chaque joueur propose un style, puis le site tire au sort un style et un modèle d'IA Fal pour dessiner tout le personnage."),
      ta,
      h("div", { class: "foot" }, h("span", { class: "label", id: "style-count" }), h("button", { class: "act", id: "style-send", onclick: () => submitStyle() }, "Envoyer"))),
    h("div", { class: "mt-l label" }, "Manche " + g.round + " · propositions"),
    h("div", { class: "who mt-s", id: "style-chips" }),
    isHost() ? h("div", { class: "mt" }, h("button", { class: "act", onclick: () => socket.emit("forceStyle") }, "Tirer au sort maintenant")) : null,
    h("p", { class: "lc mt" }, "Ensuite, chacun décrira en secret sa partie du corps."));
}
function updateStyle(){
  const g = S.game; if(!g || g.phase !== "style") return;
  const t = document.getElementById("timer");
  if(t){ const left = S.deadline - Date.now(); t.textContent = fmt(left); document.getElementById("timerbox").classList.toggle("urgent", left < 10000); }
  const k = "style_" + g.round, c = document.getElementById("style-count"), b = document.getElementById("style-send");
  if(c) c.textContent = `${(S.drafts[k] || "").length}/400` + (S.sent[k] != null ? (S.sent[k] === S.drafts[k] ? " · envoyé" : " · modifié, renvoie-le") : "");
  if(b) b.textContent = S.sent[k] == null ? "Envoyer" : S.sent[k] === S.drafts[k] ? "Envoyé" : "Renvoyer";
  const chips = document.getElementById("style-chips");
  if(chips) chips.replaceChildren(...g.players.filter(p => p.online).map(p => {
    const done = g.styleSubmitted.includes(p.pid);
    return h("span", { class: done ? "" : "off" }, (done ? "✓ " : "… ") + p.name);
  }));
}
/* Rappel du style et du modèle tirés au sort */
function chosen(cls){
  const g = S.game, st = g.style;
  return h("div", { class: "c-pink " + (cls || "") },
    h("div", { class: "label" }, st ? `Style tiré au sort${st.count > 1 ? " parmi " + st.count + " propositions" : ""} · proposé par ${st.name}` : "Style par défaut"),
    h("div", { class: "lc", style: "font-size:16px;margin-top:4px" }, st ? "« " + st.text + " »" : "Personne n'a proposé de style."),
    g.model ? h("div", { class: "label mt-s" }, "Modèle Fal tiré au sort · " + g.model.name) : null);
}

/* --- Écriture --- */
function writeScreen(){
  const g = S.game, mine = myParts();
  return h("div", {},
    chosen(),
    h("div", { class: "mt-l" }),
    mine.length ? null : h("div", {}, h("h1", { class: "display h1" }, "Tu observes"),
      h("p", { class: "lc mt-s" }, "Tu as rejoint la partie en cours : tu joueras à la prochaine manche.")),
    mine.map((part, i) => {
      const k = g.round + "_" + part;
      const ta = h("textarea", { maxlength: 800, "aria-label": label(part),
        placeholder: "Forme, matière, couleurs, taille, accessoires, détails étranges… plus c'est précis, plus le dessin sera fidèle.",
        oninput: e => { S.drafts[k] = e.target.value; updateWrite(); } });
      ta.value = S.drafts[k] || "";
      return h("section", { class: "part " + PART_COLORS[i % PART_COLORS.length] },
        h("h1", { class: "display h1" }, `${g.order.indexOf(part) + 1}.${label(part)}`),
        h("div", { class: "mt-s" }, "Remplis le formulaire"),
        h("p", { class: "lc", style: "margin:6px 0 18px" }, "À décrire : " + hint(part)),
        ta,
        h("div", { class: "foot" }, h("span", { class: "label", "data-count": k }),
          h("button", { class: "act", "data-send": k, onclick: () => submitPart(part) }, "Envoyer")));
    }),
    h("div", { class: "mt-l label" }, "Manche " + g.round + " · avancement"),
    h("div", { class: "who mt-s", id: "chips" }),
    isHost() ? h("div", { class: "mt" }, h("button", { class: "act", onclick: () => socket.emit("forceGenerate") }, "Générer maintenant")) : null,
    h("p", { class: "lc mt" }, "Les autres joueurs ne voient pas ta description. Tu peux la modifier et la renvoyer tant que le temps n'est pas écoulé."));
}
function updateWrite(){
  const g = S.game; if(!g || g.phase !== "write") return;
  const t = document.getElementById("timer");
  if(t){ const left = S.deadline - Date.now(); t.textContent = fmt(left); document.getElementById("timerbox").classList.toggle("urgent", left < 15000); }
  document.querySelectorAll("[data-count]").forEach(el => {
    const k = el.dataset.count;
    el.textContent = `${(S.drafts[k] || "").length}/800` + (S.sent[k] != null ? (S.sent[k] === S.drafts[k] ? " · envoyé" : " · modifié, renvoie-le") : "");
  });
  document.querySelectorAll("[data-send]").forEach(b => { const k = b.dataset.send; b.textContent = S.sent[k] == null ? "Envoyer" : S.sent[k] === S.drafts[k] ? "Envoyé" : "Renvoyer"; });
  const chips = document.getElementById("chips");
  if(chips) chips.replaceChildren(...g.order.map(p => { const d = g.submitted.includes(p); return h("span", { class: d ? "" : "off" }, (d ? "✓ " : "… ") + nameOf(g.assign[p])); }));
}

/* --- Génération --- */
function genScreen(){
  const g = S.game, pr = g.progress || { done: 0, total: g.order.length + 1, label: "Préparation…" };
  const last = pr.done >= pr.total - 1;
  return h("div", {},
    h("div", { class: "label" }, "Manche " + g.round),
    h("h1", { class: "display h1" }, "L'IA dessine"),
    h("div", { class: "display num mt" }, Math.round(100 * pr.done / pr.total) + "%"),
    h("p", { class: "lc busy" }, pr.label),
    chosen("mt"),
    h("ul", { class: "list mt-l" },
      g.order.map((p, i) => { const ok = g.done.includes(p); return h("li", { class: PART_COLORS[i % PART_COLORS.length] }, h("span", {}, `${i + 1}.${label(p)}`), h("span", { class: ok ? "" : "busy" }, ok ? "Dessinée ✓" : "En cours")); }),
      h("li", { class: "c-red" }, h("span", {}, "Assemblage final"), h("span", { class: last ? "busy" : "" }, last ? "En cours" : "À venir"))),
    h("p", { class: "lc mt" }, "Les dessins restent pliés jusqu'à la révélation."));
}

/* --- Révélation --- */
function revealScreen(){
  const g = S.game;
  const visual = g.finalUrl ? h("img", { class: "final", src: g.finalUrl, alt: "Le personnage final" })
    : h("div", { class: "stacked" }, g.order.filter(p => g.images[p]).map(p => h("img", { src: g.images[p], alt: label(p) })));
  return h("div", {},
    h("h1", { class: "display logo", style: "margin-top:-6px" }, "Exquisit"),
    g.error ? h("p", { class: "msg lc mt" }, g.error) : null,
    h("div", { class: "mt-l" }, visual),
    h("div", { class: "center mt" }, "Et voilà le résultat — à toi de partager !"),
    chosen("mt center"),
    h("div", { class: "acts mt", style: "justify-content:center" },
      g.finalUrl ? h("button", { class: "act", onclick: () => download(g.finalUrl) }, "Télécharger") : null,
      isHost() ? h("button", { class: "act c-blue", onclick: () => socket.emit("replay") }, "Rejouer") : null,
      h("button", { class: "act plain c-pink", onclick: leaveGame }, "Quitter")),
    h("div", { class: "label mt-l" }, "Le cadavre déplié · manche " + g.round),
    h("div", { class: "unfold mt-s" }, g.order.map((p, i) => h("article", { class: PART_COLORS[i % PART_COLORS.length] },
      g.images[p] ? h("img", { src: g.images[p], alt: label(p) }) : h("div", { class: "label" }, "Pas d'image"),
      h("div", {}, h("h2", { class: "display h2" }, `${i + 1}.${label(p)}`),
        h("div", { class: "label mt-s" }, "Par " + (g.descs[p]?.name || nameOf(g.assign[p]))),
        h("div", { class: "desc lc" }, g.descs[p]?.desc ? "« " + g.descs[p].desc + " »" : "(aucune description : l'IA a improvisé)"))))));
}

render();
