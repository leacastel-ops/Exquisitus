// =========================================================
// Règles du jeu : parties du corps, découpage, modèles Fal, prompts
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
export const STYLE_SEC = 60;   // temps pour proposer un style

// ---------------------------------------------------------
// Modèles Fal tirés au sort à chaque manche (un seul modèle par manche,
// pour que toutes les parties du corps aient le même rendu).
// `input` adapte le prompt au format attendu par chaque modèle.
// Vérifiez sur fal.ai/models que ces modèles existent toujours ;
// ajoutez ou retirez des lignes librement.
// ---------------------------------------------------------
const square = p => ({ prompt: p, image_size: "square_hd", num_images: 1 });
export const MODELS = [
  { id: "fal-ai/flux/schnell",                name: "FLUX.1 [schnell]",            input: square },
  { id: "fal-ai/flux/dev",                    name: "FLUX.1 [dev]",                input: square },
  { id: "fal-ai/recraft/v3/text-to-image",    name: "Recraft V3",                  input: p => ({ prompt: p.slice(0, 1000), image_size: "square_hd" }) },
  { id: "fal-ai/stable-diffusion-v35-large",  name: "Stable Diffusion 3.5 Large",  input: square },
  { id: "wan/v2.6/text-to-image",             name: "Wan 2.6",                     input: p => ({ prompt: p, image_size: "square_hd", max_images: 1 }) },
  { id: "fal-ai/nano-banana-2",               name: "Nano Banana 2",               input: p => ({ prompt: p, num_images: 1, aspect_ratio: "1:1" }) },
];
// Modèle de secours si le modèle tiré au sort échoue
export const FALLBACK_MODEL = MODELS[0];

// Liste des modèles autorisés : tous, ou ceux listés dans FAL_PART_MODELS (séparés par des virgules)
export function modelPool(envList) {
  const ids = String(envList || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!ids.length) return MODELS;
  return ids.map(id => MODELS.find(m => m.id === id) || { id, name: id, input: square });
}
export const pickModel = pool => pool[Math.floor(Math.random() * pool.length)];

// Style par défaut si personne n'a proposé de style
export const DEFAULT_STYLE =
  "naive joyful felt-pen drawing, thick slightly wobbly outlines, limited palette of yellow #f0d32b, blue #3f76bb, " +
  "green #058f39, red #e62c28, pink #e169a4 and black, simple stripes and dots";

const clip = (s, n) => { s = String(s || "").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };
const styleLine = style =>
  style ? `Art style chosen by the players (written in French, apply it faithfully and recognizably): "${clip(style, 260)}".`
        : `Art style: ${DEFAULT_STYLE}.`;

// Prompt pour une partie du corps (gardé court : certains modèles limitent la longueur)
export function partPrompt(part, desc, style) {
  const p = PARTS[part];
  const d = clip(desc, 420) || "invent a surprising, poetic and strange version of it";
  return `${styleLine(style)} A single isolated ${p.en} of a fantastical character, nothing else of the body visible, ` +
         `centered, front view, plain white background, no text. Player's description (in French, follow every detail: ` +
         `colors, materials, shapes, accessories): "${d}".`;
}

// Prompt pour l'assemblage final (les images sont envoyées dans le même ordre)
export function assemblePrompt(items, style) {
  const list = items.map((it, i) => `image ${i + 1} = ${PARTS[it.part].en}`).join("; ");
  return `Combine the reference images into ONE single full-body character standing upright, front view, head to toe, ` +
         `in this top-to-bottom order: ${list}. Keep every specific feature of each part exactly (colors, shapes, materials, ` +
         `accessories) so each part stays recognizable, and join them seamlessly at the neck, shoulders, waist and ankles. ` +
         `${styleLine(style)} Plain white background, whole body visible, no text.`;
}
