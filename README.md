# Cadavre exquis : version serveur avec Fal

Un jeu multijoueur en ligne. Chaque joueur décrit en secret une partie du corps, Fal dessine chaque partie, puis assemble le tout en un seul personnage.

## Architecture

```
navigateur (public/)  ──Socket.IO──►  serveur Node (server.js)  ──API──►  Fal
  index.html, client.js,               parties en mémoire,                 1. une image par partie (FAL_PART_MODEL)
  style.css                            chrono, attribution,                2. assemblage multi-images (FAL_ASSEMBLE_MODEL)
                                       clé FAL_KEY (secrète)
```

| Fichier | Rôle |
|---|---|
| `server.js` | Serveur web, temps réel, déroulé de la partie, appels Fal |
| `game.js` | Parties du corps, découpage selon le nombre de joueurs, prompts envoyés à Fal |
| `public/client.js` | Écrans du jeu dans le navigateur |
| `public/style.css` | Apparence |
| `.env` | Votre clé Fal et le choix des modèles (à créer, jamais publié) |

## Lancer en local

1. Installez [Node.js](https://nodejs.org) 20 ou plus récent.
2. Créez une clé sur https://fal.ai/dashboard/keys.
3. Dans ce dossier :
   ```bash
   cp .env.example .env      # puis collez votre clé dans .env
   npm install
   npm start
   ```
4. Ouvrez http://localhost:3000. Pour tester à plusieurs sur un seul ordinateur, ouvrez une fenêtre normale et une fenêtre de navigation privée.

## Mettre en ligne (exemple avec Render.com, gratuit)

1. Poussez ce dossier sur un dépôt GitHub. Le fichier `.env` est ignoré, c'est voulu.
2. Sur render.com : **New → Web Service**, puis choisissez le dépôt.
3. Build command : `npm install`. Start command : `npm start`.
4. Dans **Environment**, ajoutez `FAL_KEY` avec votre clé.
5. Partagez l'adresse obtenue à vos amis.

Railway, Fly.io ou un petit VPS marchent aussi. Évitez les hébergements « serverless » (Vercel, Netlify) : ils ne gardent pas de connexion WebSocket ouverte.

## Personnaliser

- **Découpage du corps** : `SPLITS` dans `game.js`. Mettez à jour la copie dans `public/client.js`, qui sert à l'affichage.
- **Style des images** : `STYLE` dans `game.js`. Un style commun et précis rend l'assemblage bien plus cohérent.
- **Modèles Fal** : `FAL_PART_MODEL` et `FAL_ASSEMBLE_MODEL` dans `.env`. Le modèle d'assemblage doit accepter un champ `image_urls` (plusieurs images). Vérifiez sur fal.ai/models le nombre d'images qu'il accepte : à 8 joueurs, il en faut 8.

## Limites connues

- Les parties sont gardées en mémoire : un redémarrage du serveur les efface.
- Les images Fal sont hébergées par Fal (adresses temporaires). Téléchargez celles que vous voulez garder.
- Chaque manche coûte quelques centimes de crédit Fal : environ une image par joueur, plus l'assemblage.
