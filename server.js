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
import { Server } from "socket.io";
import { fal } from "@fal-ai/client";
import { PARTS, SPLITS, MAX_PLAYERS, partPrompt, assemblePrompt } from "./game.js";

const PORT = process.env.PORT || 3000;
const PART_MODEL = process.env.FAL_PART_MODEL || "fal-ai/flux/schnell";
const ASSEMBLE_MODEL = process.env.FAL_ASSEMBLE_MODEL || "fal-ai/nano-banana-2/edit";

if (!process.env.FAL_KEY) console.warn("⚠️  FAL_KEY manquante : copie .env.example en .env et ajoute ta clé.");
fal.config({ credentials: process.env.FAL_KEY });

const app = express();
app.use(express.static("public"));
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
    remainingMs: g.phase === "write" ? Math.max(0, g.deadline - Date.now()) : 0,
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
    Object.assign(g, { round: g.round + 1, phase: "write", subs: {}, images: {}, finalUrl: null, progress: null, error: null });
    g.deadline = Date.now() + g.timerSec * 1000;
    clearTimeout(g.timer);
    g.timer = setTimeout(() => generate(g), g.timerSec * 1000 + 3000);   // 3 s de marge pour les derniers envois
    broadcast(g);
  });

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
        const { data } = await fal.subscribe(PART_MODEL, {
          input: { prompt: partPrompt(part, g.subs[part]?.desc), image_size: "square_hd", num_images: 1 },
        });
        g.images[part] = data.images[0].url;
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
        prompt: assemblePrompt(ok.map(part => ({ part, desc: g.subs[part]?.desc }))),
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
  broadcast(g);
}

// Mise à jour régulière du chrono pour tous les joueurs
setInterval(() => { for (const g of games.values()) if (g.phase === "write") broadcast(g); }, 5000);

server.listen(PORT, () => console.log(`🎨 Cadavre exquis en ligne sur http://localhost:${PORT}`));
