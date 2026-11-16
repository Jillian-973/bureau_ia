# Bureau d'agents IA

Bureau virtuel en HD-2D où Claude, le chef, répartit des missions entre des agents IA. Le projet complet est décrit dans [`docs/CAHIER_DES_CHARGES.md`](docs/CAHIER_DES_CHARGES.md).

**État actuel : Phase 1, socle serveur.**

- Phase 0 (faite) : prototype HD-2D, une salle, un avatar provisoire, lumière calée sur l'heure de Paris, effets, 3 niveaux de qualité.
- Phase 1 (faite) : Worker Cloudflare, base D1 avec données initiales, couche de services avec journal d'événements et annulation, temps réel par WebSocket, connexion par mot de passe, API REST.
- À venir : serveur MCP et OAuth (Phase 2), agents IA (Phase 3), interface complète (Phase 4).

L'interface affiche encore la salle du prototype : elle ne lit pas encore les données du serveur (ce sera la Phase 4).

## Prérequis

- Node.js 22.12 ou plus récent (testé avec la version 26.13)
- Git

Aucun compte Cloudflare n'est nécessaire pour travailler en local : le Worker, la base et le temps réel tournent sur ta machine.

## Installation

```bash
npm install
```

Puis deux étapes, une seule fois :

1. **Secrets locaux.** Copie `.dev.vars.example` en `.dev.vars` et renseigne les deux valeurs (le fichier explique lesquelles). `.dev.vars` est ignoré par Git : il ne doit jamais être committé.
2. **Base locale.** Crée les tables et les données initiales :

   ```bash
   npm run db:migrate:local
   ```

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance le bureau en local sur `http://localhost:5173` (interface + Worker), avec rechargement à chaud |
| `npm run build` | Vérifie les types, puis construit le Worker (`dist/bureau/`), la page web (`dist/client/`) et la version MCP App (`dist/client/mcp-app/`) |
| `npm run preview` | Sert la version construite sur `http://localhost:4173`, comme en production |
| `npm test` | Lance tous les tests (Vitest) |
| `npm run typecheck` | Génère les types du Worker, puis vérifie les types TypeScript |
| `npm run db:migrate:local` | Applique les migrations à la base locale |
| `npm run db:migrate:remote` | Applique les migrations à la base en ligne (à partir de la Phase 2) |
| `npm run deploy` | Construit puis déploie sur Cloudflare (à partir de la Phase 2) |

## Tester

### Le bureau

1. `npm run dev`, puis ouvre `http://localhost:5173`.
2. La page de connexion s'affiche : entre le mot de passe de ton fichier `.dev.vars`.
3. Le bureau s'ouvre. Clique sur une case libre du sol pour déplacer l'avatar, glisse pour déplacer la vue, molette pour zoomer.
4. Le panneau en haut à gauche affiche les images par seconde et permet de changer la qualité ou de simuler une heure.

Cinq mots de passe faux de suite bloquent la connexion pendant 15 minutes pour ton adresse.

### L'API, depuis la console du navigateur

Une fois connecté, ouvre la console du navigateur (F12) sur la page du bureau :

```js
// Lire les agents
await (await fetch('/api/elements/agent')).json();

// Donner un pseudo au Chercheur
const reponse = await (await fetch('/api/elements/agent/agent-chercheur', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ pseudo: 'Sherlock' }),
})).json();

// Annuler cette modification à partir de son événement
await (await fetch(`/api/events/${reponse.event.id}/undo`, { method: 'POST' })).json();

// Voir le journal
await (await fetch('/api/events')).json();
```

Pour voir le temps réel, ouvre le bureau dans deux onglets et colle ceci dans le premier, puis fais une modification dans le second :

```js
new WebSocket(`ws://${location.host}/ws`).onmessage = (message) => console.log(JSON.parse(message.data));
```

### Comme dans le chat Claude (aperçu MCP App)

1. `npm run build`, puis `npm run preview`.
2. Ouvre `http://localhost:4173/mcp-app-preview.html` et connecte-toi.

La page charge le bureau, construit en un seul fichier HTML, dans un cadre isolé avec la politique de sécurité par défaut de la spécification MCP Apps. Cet aperçu ne remplace pas un essai dans la vraie app Claude, qui demande le serveur MCP (phases 2 et 5).

### Paramètres d'adresse

| Paramètre | Valeurs | Effet |
| --- | --- | --- |
| `heure` | de `0` à `24`, décimales admises (`20.5` = 20 h 30) | Simule une heure de Paris |
| `qualite` | `auto`, `elevee`, `moyenne`, `basse` | Force un niveau de qualité, sans l'enregistrer |

Exemple : `http://localhost:5173/?heure=20.5&qualite=moyenne`.

## Architecture

Un seul Worker Cloudflare sert tout le projet. Chaque requête passe d'abord par lui, ce qui permet de ne rien servir avant la connexion.

| Route | Rôle | Protection |
| --- | --- | --- |
| `/login`, `/logout` | Connexion par mot de passe, déconnexion | Publique |
| `/api/health` | Vérification que le Worker répond | Publique |
| `/api/*` | API REST de la page web | Session |
| `/ws` | Temps réel (WebSocket) | Session |
| tout le reste | L'interface (fichiers statiques) | Session |
| `/mcp` et routes OAuth | Serveur MCP du chef | Phase 2 |

### Couche de services

Toute lecture et toute modification passent par `src/worker/services`. L'API REST l'appelle aujourd'hui, les outils MCP l'appelleront en Phase 2 : c'est ce qui garantit que la page web et le chef peuvent faire les mêmes choses, avec le même résultat. Chaque modification :

- est validée par un schéma Zod partagé (`src/shared/schemas`), avec des messages en français ;
- écrit un événement dans la table `events` (auteur, type, cible, état avant, état après), dans la même transaction ;
- est diffusée en direct par le Durable Object « Bureau » ;
- peut être annulée à partir de son événement.

Une suppression envoie à la corbeille, vidée chaque nuit de ce qui a plus de 30 jours. La suppression définitive se fait en deux temps, avec un jeton à usage unique valable 10 minutes ; c'est la seule action qui ne s'annule pas.

### API REST

Les réponses sont en JSON : `{ "data": … , "event": … }` en cas de succès, `{ "error": { "code", "message" } }` sinon. Types d'éléments : `agent`, `mission`, `tache`, `salle`, `meuble`, `avatar`, `reglage`.

| Méthode et route | Rôle |
| --- | --- |
| `GET /api/elements/:type` | Lister (filtres par colonne, `corbeille=1`, `limite`) |
| `POST /api/elements/:type` | Créer |
| `GET /api/elements/:type/:id` | Lire |
| `PATCH /api/elements/:type/:id` | Modifier par correctif partiel |
| `DELETE /api/elements/:type/:id` | Envoyer à la corbeille |
| `POST /api/elements/:type/:id/restore` | Sortir de la corbeille |
| `POST /api/elements/:type/:id/purge` | Demander une suppression définitive (renvoie un jeton) |
| `POST /api/purge/confirm` | Confirmer avec le jeton |
| `GET /api/events` | Lire le journal (`apres`, `type_cible`, `id_cible`, `limite`) |
| `POST /api/events/:id/undo` | Annuler un événement |
| `GET /api/catalogue` | Catalogue des meubles |
| `GET /api/agents/:id/versions` | Historique des fonctions et consignes d'un agent |

### Données

Les tables suivent la section 6 du cahier des charges (`migrations/0001_schema.sql`). Les données initiales (`migrations/0002_seed.sql`) créent les 5 agents, les 6 salles, un catalogue de 16 modèles de meubles, 31 meubles, 5 avatars et les réglages par défaut.

Pour modifier le schéma, ajoute un fichier `migrations/NNNN_nom.sql` : ne modifie jamais une migration déjà appliquée.

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
migrations/           Schéma et données initiales de la base D1
public/               Fichiers servis tels quels (page d'aperçu MCP App)
src/shared/           Code partagé entre l'interface et le Worker
  schemas/            Schémas Zod des éléments et des événements
  simulation/         Grille, heure de Paris, cycle jour-nuit, hasard reproductible
src/worker/           Worker Cloudflare
  index.ts            Routage
  auth/               Mot de passe, session, page de connexion
  api/                API REST
  services/           Couche de services (la seule à écrire en base)
  do/                 Durable Object « Bureau » (temps réel)
src/ui/               Interface React
  scene/              Scène 3D : salle, meubles, lumières, effets, qualité, caméra
  avatars/            Avatar, planche de sprites, calcul de chemin (EasyStar)
  panels/             Panneau de contrôle
tests/unit/           Tests de logique pure (Node.js)
tests/worker/         Tests exécutés dans le moteur des Workers
wrangler.jsonc        Configuration Cloudflare
```

## Tests

`npm test` lance deux groupes de tests :

- `unit` : règles partagées et calculs de la scène, dans Node.js ;
- `worker` : services, authentification, API et temps réel, dans le vrai moteur des Workers avec une base construite à partir des migrations (`@cloudflare/vitest-plugin`).

## Secrets

Aucun secret n'est dans le code ni dans le dépôt.

| Secret | Rôle | En local | En ligne |
| --- | --- | --- | --- |
| `BUREAU_PASSWORD` | Mot de passe du bureau (12 caractères au moins) | `.dev.vars` | `npx wrangler secret put BUREAU_PASSWORD` |
| `SESSION_SECRET` | Clé qui signe le cookie de session (32 caractères au moins) | `.dev.vars` | `npx wrangler secret put SESSION_SECRET` |

Les clés Gemini et DeepSeek ne seront jamais dans le projet : elles seront stockées dans l'AI Gateway de Cloudflare (Phase 3).

## Graphismes provisoires

Tous les graphismes actuels sont dessinés par le code et destinés à être remplacés. Ils sont regroupés dans des fichiers au nom explicite :

- `src/ui/scene/placeholder-textures.ts` : sol, murs, tapis, plante
- `src/ui/scene/PlaceholderFurniture.tsx` : meubles en volumes simples
- `src/ui/avatars/placeholder-avatar-sprite.ts` : planche de sprites de l'avatar

Leur origine et leur licence sont listées dans [`CREDITS`](CREDITS).

## Organisation Git

- `main` ne contient que des phases validées.
- Chaque phase a sa branche d'intégration (`phase-1-server-foundation`).
- Chaque étape se fait sur une branche courte (`feat/…`, `fix/…`, `docs/…`, `chore/…`), fusionnée dans la branche de phase avec un commit de fusion.

## Déploiement

Le premier déploiement, sur une adresse de test `workers.dev`, se fera en fin de Phase 2 ; la mise en production sur le sous-domaine en Phase 6. Cette section sera complétée à ce moment-là.
