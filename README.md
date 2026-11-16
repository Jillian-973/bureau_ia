# Bureau d'agents IA

Bureau virtuel en HD-2D où Claude, le chef, répartit des missions entre des agents IA. Le projet complet est décrit dans [`docs/CAHIER_DES_CHARGES.md`](docs/CAHIER_DES_CHARGES.md).

**État actuel : Phase 0, prototype HD-2D.** Une salle, un avatar provisoire qui se déplace, la lumière calée sur l'heure de Paris, les effets visuels et 3 niveaux de qualité. Il n'y a pas encore de serveur, de base de données ni de connexion à Claude : ils arrivent à partir de la Phase 1.

## Prérequis

- Node.js 22.12 ou plus récent (testé avec la version 26.13)
- Git

## Installation

```bash
npm install
```

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance le prototype en local sur `http://localhost:5173`, avec rechargement à chaud |
| `npm run build` | Vérifie les types, puis construit la page web dans `dist/` et la version MCP App dans `dist/mcp-app/` |
| `npm run preview` | Sert le contenu de `dist/` sur `http://localhost:4173`, comme en production |
| `npm test` | Lance les tests (Vitest) |
| `npm run typecheck` | Vérifie les types TypeScript sans rien construire |

## Tester le prototype

### Sur ordinateur

1. `npm run dev`
2. Ouvrir `http://localhost:5173`
3. Cliquer sur une case libre du sol : l'avatar s'y rend en contournant les meubles. Sans action, il flâne tout seul.
4. Glisser pour déplacer la vue, utiliser la molette pour zoomer.
5. Cliquer sur le panneau en haut à gauche pour changer la qualité graphique ou simuler une heure.

Le panneau affiche le nombre d'images par seconde (« i/s »). L'objectif de la Phase 0 est d'au moins 30.

### Comme dans le chat Claude (aperçu MCP App)

Dans le chat, Claude affiche une MCP App dans un cadre isolé qui bloque toute requête externe. Une page d'aperçu reproduit ces conditions en local :

1. `npm run build`
2. `npm run preview`
3. Ouvrir `http://localhost:4173/mcp-app-preview.html`

La page charge le fichier unique `dist/mcp-app/index.html` dans un cadre isolé, avec la politique de sécurité par défaut de la spécification MCP Apps. Trois tailles sont proposées : dans le chat, étroit, plein écran.

Cet aperçu ne remplace pas un essai dans la vraie app Claude, qui demande un serveur MCP (phases 2 et 5).

### Sur téléphone (plus tard)

Le téléphone n'est pas la priorité pour l'instant. Pour un premier essai, avec le téléphone sur le même Wi-Fi que l'ordinateur : `npm run dev -- --host`, puis ouvrir l'adresse « Network » affichée dans le terminal.

### Paramètres d'adresse

Deux paramètres facultatifs servent à forcer un réglage, par exemple `http://localhost:5173/?heure=20.5&qualite=moyenne` :

| Paramètre | Valeurs | Effet |
| --- | --- | --- |
| `heure` | de `0` à `24`, décimales admises (`20.5` = 20 h 30) | Simule une heure de Paris |
| `qualite` | `auto`, `elevee`, `moyenne`, `basse` | Force un niveau de qualité, sans l'enregistrer |

## Niveaux de qualité

| Niveau | Résolution | Ombres | Effets |
| --- | --- | --- | --- |
| Élevée | Jusqu'à 2× | 2048 px | Tilt-shift, bloom, étalonnage, vignettage, anticrénelage |
| Moyenne | Jusqu'à 1,5× | 1024 px | Les mêmes, allégés |
| Basse | 1× | Aucune, simple tache sous les sprites | Vignettage seul |

En mode « Auto », le niveau de départ est « Moyenne » sur un appareil tactile et « Élevée » ailleurs. Il baisse d'un cran si la moyenne reste sous 30 images par seconde. Un choix manuel est mémorisé dans le navigateur.

## Structure du dépôt

```
docs/                 Cahier des charges
public/               Fichiers servis tels quels (page d'aperçu MCP App)
src/shared/           Code partagé, sans dépendance au navigateur
  simulation/         Grille, heure de Paris, cycle jour-nuit, hasard reproductible
src/ui/               Interface React
  scene/              Scène 3D : salle, meubles, lumières, effets, qualité, caméra
  avatars/            Avatar, planche de sprites, calcul de chemin (EasyStar)
  panels/             Panneau de contrôle
tests/                Tests Vitest
```

Les dossiers `src/worker/`, `migrations/`, `assets/` et `plugin/` prévus par le cahier des charges seront créés dans les phases suivantes.

## Graphismes provisoires

Tous les graphismes actuels sont dessinés par le code et destinés à être remplacés. Ils sont regroupés dans des fichiers au nom explicite :

- `src/ui/scene/placeholder-textures.ts` : sol, murs, tapis, plante
- `src/ui/scene/PlaceholderFurniture.tsx` : meubles en volumes simples
- `src/ui/avatars/placeholder-avatar-sprite.ts` : planche de sprites de l'avatar

Leur origine et leur licence sont listées dans [`CREDITS`](CREDITS).

## Organisation Git

- `main` ne contient que des phases validées.
- Chaque phase a sa branche d'intégration (`phase-0-prototype`).
- Chaque étape se fait sur une branche courte (`feat/…`, `fix/…`, `docs/…`, `chore/…`), fusionnée dans la branche de phase avec un commit de fusion.

## Déploiement

Pas encore de déploiement : le Worker Cloudflare arrive en Phase 1 et la mise en production en Phase 6. Cette section sera complétée à ce moment-là.
