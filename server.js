// =========================================================
// CADAVRE EXQUIS — serveur (Node.js + Express + Socket.IO + Fal)
// ---------------------------------------------------------
// - Sert le site (dossier public/)
// - Gère les parties en mémoire et le temps réel (Socket.IO)
// - Appelle Fal UNIQUEMENT ici : la clé FAL_KEY ne quitte jamais le serveur
// =========================================================
import "dotenv/config";
import express from "express";
import http from "node:http";
import fs from "node:fs";
import { Server } from "socket.io";
import { fal } from "@fal-ai/client";
import { PARTS, SPLITS, MAX_PLAYERS, STYLE_SEC, partPrompt, assemblePrompt, modelPool, pickModel, FALLBACK_MODEL } from "./game.js";

const PORT = process.env.PORT || 3000;
const MODEL_POOL = modelPool(process.env.FAL_PART_MODELS);   // modèles tirés au sort pour dessiner les parties
const ASSEMBLE_MODEL = process.env.FAL_ASSEMBLE_MODEL || "fal-ai/nano-banana-2/edit";

console.log("Modèles Fal tirés au sort :", MODEL_POOL.map(m => m.id).join(", "));
if (!process.env.FAL_KEY) console.warn("⚠️  FAL_KEY manquante : copie .env.example en .env et ajoute ta clé.");
fal.config({ credentials: process.env.FAL_KEY });

const app = express();
app.use(express.static("public"));

// ---------- Historique des personnages ----------
// Gardé en mémoire et copié dans history.json. Attention : sur l'offre gratuite de Render, ce fichier
// est effacé à chaque redéploiement. Les images restent hébergées chez Fal.
const HISTORY_FILE = process.env.HISTORY_FILE || "history.json";
let history = [];
try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch { history = []; }
function addToHistory(entry) {
  history.unshift(entry);
  history = history.slice(0, 300);
  fs.writeFile(HISTORY_FILE, JSON.stringify(history), () => {});
  io.emit("history", history);
}
app.get("/api/history", (req, res) => res.json(history));
const server = http.createServer(app);
const io = new Server(server);

// ---------- Les parties, gardées en mémoire ----------
// (si le serveur redémarre, les parties en cours sont perdues : suffisant pour un jeu entre amis)
const games = new Map();   // code -> partie

function newCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";  // sans 0/O ni 1/I/L
  let c;
  do { c = Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join(""); } while (games.has(c));
  return c;
}
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Ce que chaque joueur a le droit de voir (les descriptions restent secrètes jusqu'à la révélation)
function publicState(g) {
  const reveal = g.phase === "reveal";
  return {
    code: g.code, phase: g.phase, round: g.round, timerSec: g.timerSec, hostPid: g.hostPid,
    players: [...g.players.values()].map(p => ({ pid: p.pid, name: p.name, online: p.online })),
    order: g.order, assign: g.assign,
    remainingMs: ["style", "write"].includes(g.phase) ? Math.max(0, g.deadline - Date.now()) : 0,
    styleSubmitted: Object.keys(g.styles),
    style: g.style,                                   // style tiré au sort (visible à partir de l'écriture)
    model: g.model ? { id: g.model.id, name: g.model.name } : null,
    submitted: Object.keys(g.subs),
    progress: g.progress,
    done: Object.keys(g.images),
    images: reveal ? g.images : {},
    descs: reveal ? Object.fromEntries(Object.entries(g.subs).map(([k, v]) => [k, { desc: v.desc, name: v.name }])) : {},
    finalUrl: reveal ? g.finalUrl : null,
    error: g.error,
  };
}
function broadcast(g) { io.to(g.code).emit("state", publicState(g)); }

// ---------- Temps réel ----------
io.on("connection", socket => {
  let me = null;   // { code, pid }

  // Créer une partie
  socket.on("create", ({ name, pid } = {}, cb) => {
    name = clean(name, 24); if (!name) return cb?.({ error: "Choisis un pseudo." });
    const code = newCode();
    const g = {
      code, hostPid: pid, phase: "lobby", round: 0, timerSec: 120, deadline: 0, timer: null,
      players: new Map(), order: [], assign: {}, subs: {}, images: {}, finalUrl: null, progress: null, error: null,
      styles: {}, style: null, model: null,
    };
    games.set(code, g);
    joinRoom(g, pid, name); cb?.({ code });
  });

  // Rejoindre (ou revenir après une déconnexion avec le même pid)
  socket.on("join", ({ code, name, pid } = {}, cb) => {
    code = clean(code, 6).toUpperCase(); name = clean(name, 24);
    const g = games.get(code);
    if (!g) return cb?.({ error: `Aucune partie avec le code ${code}.` });
    if (!name) return cb?.({ error: "Choisis un pseudo." });
    if (!g.players.has(pid) && g.players.size >= MAX_PLAYERS) return cb?.({ error: "Partie complète (8 joueurs maximum)." });
    joinRoom(g, pid, name); cb?.({ code });
  });

  function joinRoom(g, pid, name) {
    if (!pid || typeof pid !== "string") pid = "p" + Math.random().toString(36).slice(2, 10);
    me = { code: g.code, pid };
    const p = g.players.get(pid) || { pid, joinedAt: Date.now() };
    Object.assign(p, { name, online: true, socketId: socket.id });
    g.players.set(pid, p);
    socket.join(g.code);
    broadcast(g);
  }
  const myGame = () => me && games.get(me.code);
  const amHost = g => g && g.hostPid === me.pid;

  socket.on("setTimer", sec => {
    const g = myGame(); if (!amHost(g) || g.phase !== "lobby") return;
    if ([60, 120, 180, 300].includes(sec)) { g.timerSec = sec; broadcast(g); }
  });

  // L'hôte lance une manche
  socket.on("start", () => {
    const g = myGame(); if (!amHost(g) || !["lobby", "reveal"].includes(g.phase)) return;
    const list = [...g.players.values()].filter(p => p.online);
    const n = Math.min(list.length, MAX_PLAYERS); if (n < 1) return;
    g.order = SPLITS[n];
    const who = shuffle(list.slice(0, n));
    g.assign = Object.fromEntries(g.order.map((part, i) => [part, who[i % who.length].pid]));
    Object.assign(g, { round: g.round + 1, phase: "style", subs: {}, images: {}, finalUrl: null, progress: null, error: null,
      styles: {}, style: null, model: null });
    g.deadline = Date.now() + STYLE_SEC * 1000;
    clearTimeout(g.timer);
    g.timer = setTimeout(() => closeStyle(g), STYLE_SEC * 1000 + 3000);   // 3 s de marge pour les derniers envois
    broadcast(g);
  });

  // Un joueur propose (ou modifie) un style
  socket.on("style", ({ text } = {}, cb) => {
    const g = myGame(); if (!g || g.phase !== "style") return cb?.({ error: "Trop tard !" });
    g.styles[me.pid] = { text: clean(text, 400), name: g.players.get(me.pid)?.name };
    cb?.({ ok: true });
    broadcast(g);
    const online = [...g.players.values()].filter(p => p.online);
    if (online.every(p => g.styles[p.pid])) closeStyle(g);   // tout le monde a proposé : on tire au sort
  });
  socket.on("forceStyle", () => { const g = myGame(); if (amHost(g)) closeStyle(g); });

  // Un joueur envoie (ou renvoie) sa description
  socket.on("submit", ({ part, desc } = {}, cb) => {
    const g = myGame(); if (!g || g.phase !== "write") return cb?.({ error: "Trop tard !" });
    if (g.assign[part] !== me.pid) return cb?.({ error: "Cette partie n'est pas à toi." });
    g.subs[part] = { desc: clean(desc, 800), pid: me.pid, name: g.players.get(me.pid)?.name };
    cb?.({ ok: true });
    broadcast(g);
    if (g.order.every(p => g.subs[p])) generate(g);   // tout le monde a fini : on n'attend pas le chrono
  });

  socket.on("forceGenerate", () => { const g = myGame(); if (amHost(g)) generate(g); });

  socket.on("replay", () => {
    const g = myGame(); if (!amHost(g) || g.phase !== "reveal") return;
    Object.assign(g, { phase: "lobby", progress: null, error: null }); broadcast(g);
  });

  socket.on("leave", () => leave(true));
  socket.on("disconnect", () => leave(false));

  function leave(forGood) {
    const g = myGame(); if (!g) return;
    const p = g.players.get(me.pid);
    if (p && p.socketId === socket.id) {
      if (forGood) g.players.delete(me.pid); else p.online = false;
    }
    socket.leave(g.code);
    // Passation d'hôte si l'hôte est parti
    if (g.hostPid === me.pid && (forGood || !p?.online)) {
      const next = [...g.players.values()].find(x => x.online && x.pid !== me.pid);
      if (next) g.hostPid = next.pid;
    }
    // Partie vide depuis 10 min : on la supprime
    if (![...g.players.values()].some(x => x.online)) {
      setTimeout(() => { if (![...g.players.values()].some(x => x.online)) { clearTimeout(g.timer); games.delete(g.code); } }, 10 * 60 * 1000);
    }
    broadcast(g);
    if (forGood) me = null;
  }
});

// ---------- Fin de l'étape du style : tirage au sort du style ET du modèle Fal ----------
function closeStyle(g) {
  if (g.phase !== "style") return;
  clearTimeout(g.timer);
  const props = Object.values(g.styles).filter(s => s.text);
  const pick = props.length ? props[Math.floor(Math.random() * props.length)] : null;
  g.style = pick ? { text: pick.text, name: pick.name, count: props.length } : null;
  g.model = pickModel(MODEL_POOL);
  console.log(`[${g.code}] manche ${g.round} : style « ${g.style?.text || "par défaut"} », modèle ${g.model.id}`);
  g.phase = "write";
  g.deadline = Date.now() + g.timerSec * 1000;
  g.timer = setTimeout(() => generate(g), g.timerSec * 1000 + 3000);
  broadcast(g);
}

// Appelle le modèle tiré au sort ; en cas d'échec, réessaie avec le modèle de secours
async function drawWith(model, prompt) {
  const { data } = await fal.subscribe(model.id, { input: model.input(prompt) });
  const url = data?.images?.[0]?.url || data?.image?.url;
  if (!url) throw new Error("Réponse Fal sans image");
  return url;
}

// ---------- Génération avec Fal ----------
async function generate(g) {
  if (g.phase !== "write") return;          // évite de lancer deux fois
  clearTimeout(g.timer);
  g.phase = "gen";
  const total = g.order.length + 1;
  const step = label => { g.progress = { done: Object.keys(g.images).length + (g.finalUrl ? 1 : 0), total, label }; broadcast(g); };
  step("Les illustrateurs taillent leurs crayons…");

  try {
    // 1) Une image par partie, toutes en parallèle
    await Promise.all(g.order.map(async part => {
      try {
        const prompt = partPrompt(part, g.subs[part]?.desc, g.style?.text);
        try {
          g.images[part] = await drawWith(g.model, prompt);
        } catch (e) {
          console.error(`Fal (${g.model.id}) a échoué pour ${part}, essai avec ${FALLBACK_MODEL.id}`, e?.body || e?.message || e);
          g.images[part] = await drawWith(FALLBACK_MODEL, prompt);
        }
      } catch (e) {
        console.error("Fal (partie)", part, e?.body || e);
        g.images[part] = null;
      }
      step(`${PARTS[part].label} : dessinée`);
    }));

    const ok = g.order.filter(p => g.images[p]);
    if (!ok.length) throw new Error("Aucune image n'a pu être générée.");

    // 2) Assemblage : on envoie toutes les images, dans l'ordre, au modèle d'édition multi-images
    step("Assemblage du personnage…");
    const { data } = await fal.subscribe(ASSEMBLE_MODEL, {
      input: {
        prompt: assemblePrompt(ok.map(part => ({ part, desc: g.subs[part]?.desc })), g.style?.text),
        image_urls: ok.map(p => g.images[p]),
        num_images: 1,
        aspect_ratio: "9:16",
      },
    });
    g.finalUrl = data.images[0].url;
  } catch (e) {
    console.error("Fal (assemblage)", e?.body || e);
    g.error = "L'assemblage a échoué : voici les parties empilées, à la manière d'un vrai cadavre exquis.";
  }
  g.phase = "reveal"; g.progress = null;
  const parts = g.order.map(p => g.images[p]).filter(Boolean);
  if (g.finalUrl || parts.length) {
    addToHistory({
      id: `${g.code}_r${g.round}`, createdAt: Date.now(),
      url: g.finalUrl, parts: g.finalUrl ? [] : parts,
      names: [...new Set(g.order.map(p => g.subs[p]?.name || g.players.get(g.assign[p])?.name).filter(Boolean))],
      style: g.style?.text || "", model: g.model?.name || "",
    });
  }
  broadcast(g);
}

// Mise à jour régulière du chrono pour tous les joueurs
setInterval(() => { for (const g of games.values()) if (["style", "write"].includes(g.phase)) broadcast(g); }, 5000);

server.listen(PORT, () => console.log(`🎨 Cadavre exquis en ligne sur http://localhost:${PORT}`));
