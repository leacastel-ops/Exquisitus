# Exquisit : version serveur avec Fal

Un jeu multijoueur en ligne. Chaque joueur propose un style ; le site tire au sort **un style** et **un modèle Fal**. Chacun décrit ensuite en secret une partie du corps, le modèle tiré au sort dessine chaque partie dans ce style, puis un modèle d'édition assemble le tout en un seul personnage. Les personnages terminés rejoignent l'historique de la page d'accueil.

## Architecture

```
navigateur (public/)  ──Socket.IO──►  serveur Node (server.js)  ──API──►  Fal
  index.html, client.js,               parties en mémoire,                 1. une image par partie (modèle tiré au sort)
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
- **Modèles Fal tirés au sort** : la liste `MODELS` dans `game.js` (nom, identifiant Fal, format des paramètres). Pour en garder seulement certains sans toucher au code, remplissez `FAL_PART_MODELS` dans `.env`. Si le modèle tiré au sort échoue, le serveur réessaie avec FLUX.1 [schnell].
- **Modèle d'assemblage** : `FAL_ASSEMBLE_MODEL` dans `.env`. Le modèle d'assemblage doit accepter un champ `image_urls` (plusieurs images). Vérifiez sur fal.ai/models le nombre d'images qu'il accepte : à 8 joueurs, il en faut 8.

## Limites connues

- L'historique est gardé dans `history.json` sur le serveur. Sur l'offre gratuite de Render, ce fichier est effacé à chaque redéploiement (et parfois au redémarrage) : pour un historique permanent, il faudra une base de données ou un disque persistant.

- Les parties sont gardées en mémoire : un redémarrage du serveur les efface.
- Les images Fal sont hébergées par Fal (adresses temporaires). Téléchargez celles que vous voulez garder.
- Chaque manche coûte quelques centimes de crédit Fal : environ une image par joueur, plus l'assemblage.
