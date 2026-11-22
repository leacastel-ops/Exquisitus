// =========================================================
// Règles du jeu : parties du corps, découpage, prompts Fal
// (partagé par le serveur ; modifiez librement ce fichier)
// =========================================================

export const PARTS = {
  haut:          { label: "Le haut du corps", hint: "tête, visage, torse, bras", en: "upper body: head, face, torso and arms" },
  bas:           { label: "Le bas du corps", hint: "bassin, jambes, pieds", en: "lower body: hips, legs and feet" },
  tete:          { label: "La tête", hint: "visage, yeux, cheveux, expression, couvre-chef…", en: "head and face" },
  cou:           { label: "Le cou et les épaules", hint: "cou, col, épaulettes, carrure…", en: "neck and shoulders" },
  torse:         { label: "Le torse", hint: "poitrine, ventre, vêtement, texture…", en: "torso (chest and belly)" },
  torse_bras:    { label: "Le torse et les bras", hint: "buste, vêtement, bras, mains…", en: "torso with both arms and hands" },
  bras:          { label: "Les bras", hint: "forme, matière, manches, coudes…", en: "a pair of arms (no hands)" },
  bras_mains:    { label: "Les bras et les mains", hint: "bras, poignets, mains, doigts…", en: "a pair of arms with hands" },
  mains:         { label: "Les mains", hint: "doigts, ongles, gants, objets tenus…", en: "a pair of hands" },
  bassin:        { label: "Le bassin et les hanches", hint: "ceinture, hanches, queue éventuelle…", en: "pelvis and hips" },
  jambes:        { label: "Les jambes", hint: "cuisses, genoux, mollets, matière…", en: "a pair of legs (no feet)" },
  jambes_genoux: { label: "Les jambes et les genoux", hint: "cuisses, genoux, mollets…", en: "a pair of legs with knees" },
  jambes_pieds:  { label: "Les jambes et les pieds", hint: "jambes, genoux, chevilles, pieds…", en: "a pair of legs with feet" },
  pieds:         { label: "Les pieds", hint: "orteils, chaussures, sabots, chevilles…", en: "a pair of feet" },
};

// Découpage du corps selon le nombre de joueurs, de haut en bas.
// Avec 1 joueur (mode test), il décrit les 3 parties.
export const SPLITS = {
  1: ["tete", "torse_bras", "jambes_pieds"],
  2: ["haut", "bas"],
  3: ["tete", "torse_bras", "jambes_pieds"],
  4: ["tete", "torse", "bras_mains", "jambes_pieds"],
  5: ["tete", "torse", "bras_mains", "jambes", "pieds"],
  6: ["tete", "cou", "torse", "bras_mains", "jambes", "pieds"],
  7: ["tete", "cou", "torse", "bras", "mains", "jambes", "pieds"],
  8: ["tete", "cou", "torse", "bras", "mains", "bassin", "jambes_genoux", "pieds"],
};
export const MAX_PLAYERS = 8;

// Style visuel commun : la clé d'un assemblage cohérent.
export const STYLE =
  "Style: colorful storybook illustration, engraving-like ink linework, thick black outlines, flat bold colors, " +
  "simple cel shading, soft light from the top left, front view, isolated on a plain light beige background, no text, no watermark.";

// Prompt pour une partie du corps.
export function partPrompt(part, desc) {
  const p = PARTS[part];
  const d = (desc || "").trim() || "invent a surprising, poetic and strange version of it";
  return `A single isolated ${p.en} of a fantastical character, nothing else of the body visible, centered, filling the frame. ` +
         `Player's description (written in French, follow every detail: colors, materials, shapes, accessories): "${d}". ${STYLE}`;
}

// Prompt pour l'assemblage final (les images sont envoyées dans le même ordre).
export function assemblePrompt(items) {
  const list = items.map((it, i) =>
    `Image ${i + 1} = ${PARTS[it.part].en}${it.desc ? ` (described as: "${it.desc}")` : ""}`).join("; ");
  return `Combine the reference images into ONE single full-body character standing upright, front view, from head to toe, ` +
         `in this top-to-bottom order: ${list}. Keep every specific feature of each part exactly (colors, shapes, materials, accessories) ` +
         `so each part stays recognizable, and join them seamlessly at the neck, shoulders, waist and ankles. ` +
         `Tall vertical composition, whole body visible. ${STYLE}`;
}
