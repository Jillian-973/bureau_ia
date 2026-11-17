# Bureau d'agents IA

Bureau virtuel en HD-2D où Claude, le chef, répartit des missions entre des agents IA. Le projet complet est décrit dans [`docs/CAHIER_DES_CHARGES.md`](docs/CAHIER_DES_CHARGES.md).

**État actuel : Phase 2, serveur MCP.**

- Phase 0 (faite) : prototype HD-2D, une salle, un avatar provisoire, lumière calée sur l'heure de Paris, effets, 3 niveaux de qualité.
- Phase 1 (faite) : Worker Cloudflare, base D1 avec données initiales, couche de services avec journal d'événements et annulation, temps réel par WebSocket, connexion par mot de passe, API REST.
- Phase 2 (faite) : serveur MCP sur `/mcp` avec les 14 outils du chef, protégé par OAuth 2.1, déclenchement par « @bureau » ou « /bureau ».
- À venir : agents IA (Phase 3), interface complète (Phase 4), vue dans le chat (Phase 5), mise en production (Phase 6).

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

### Les outils du chef, avec MCP Inspector

1. `npm run dev`, puis connecte-toi sur `http://localhost:5173`.
2. Ouvre `http://localhost:5173/connexions` et crée un client : les valeurs proposées (« MCP Inspector », `http://localhost:6274/oauth/callback`) conviennent. Note son identifiant.
3. Dans un autre terminal : `npx @modelcontextprotocol/inspector`. Inspector s'ouvre dans le navigateur.
4. Choisis le transport « Streamable HTTP », l'adresse `http://localhost:5173/mcp`, et colle l'identifiant du client dans les réglages d'autorisation (Client ID, sans secret).
5. Connecte-toi : la page du bureau demande le mot de passe s'il le faut, puis d'autoriser Inspector.
6. Liste les outils et appelle-les. Essaie un appel sans `declencheur`, ou avec une autre valeur : il doit être refusé.

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
| `/mcp` | Serveur MCP du chef | Jeton OAuth |
| `/.well-known/oauth-*`, `/oauth/token` | Découverte OAuth et échange de jetons | Publique (protocole OAuth) |
| `/authorize` | Autoriser une application à se connecter (Claude, Inspector) | Session |
| `/connexions` | Clients pré-enregistrés et applications connectées | Session |
| `/api/*` | API REST de la page web | Session |
| `/ws` | Temps réel (WebSocket) | Session |
| tout le reste | L'interface (fichiers statiques) | Session |

### Couche de services

Toute lecture et toute modification passent par `src/worker/services`. L'API REST et les outils MCP l'appellent tous les deux : c'est ce qui garantit que la page web et le chef peuvent faire les mêmes choses, avec le même résultat. Chaque modification :

- est validée par un schéma Zod partagé (`src/shared/schemas`), avec des messages en français ;
- écrit un événement dans la table `events` (auteur, type, cible, état avant, état après), dans la même transaction ;
- est diffusée en direct par le Durable Object « Bureau » ;
- peut être annulée à partir de son événement.

Une suppression envoie à la corbeille, vidée chaque nuit de ce qui a plus de 30 jours. La suppression définitive ne se fait que depuis la corbeille, en deux temps, avec un jeton à usage unique valable 10 minutes. C'est la seule action qui ne s'annule pas : tout le reste est annulable.

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
| `POST /api/elements/:type/:id/purge` | Demander la suppression définitive d'un élément de la corbeille (renvoie un jeton) |
| `POST /api/purge/confirm` | Confirmer avec le jeton |
| `GET /api/events` | Lire le journal (`apres`, `type_cible`, `id_cible`, `limite`) |
| `POST /api/events/:id/undo` | Annuler un événement |
| `GET /api/catalogue` | Catalogue des meubles |
| `GET /api/agents/:id/versions` | Historique des fonctions et consignes d'un agent |
| `GET /api/apercu` | Vue d'ensemble : agents, missions en cours, salles |
| `GET /api/budget` | Dépenses du mois et plafonds par fournisseur |
| `GET`, `POST /api/clients-oauth` | Lister ou créer un client OAuth pré-enregistré |
| `DELETE /api/clients-oauth/:id` | Supprimer un client et révoquer ses accès |
| `GET /api/acces`, `DELETE /api/acces/:id` | Applications connectées, et les déconnecter |

### Serveur MCP

Le chef (Claude) utilise le bureau par le serveur MCP de `/mcp` : transport Streamable HTTP, spécification sans état du 28 juillet 2026, `createMcpHandler` du SDK officiel. Les clients de 2025 sont servis par la compatibilité sans état du SDK.

| Outil | Rôle |
| --- | --- |
| `bureau_lire` | Lire un élément ou une liste filtrée ; aussi `theme`, `historique` (journal) et `catalogue` |
| `bureau_creer` | Créer un agent, une mission, une tâche, une salle, un meuble ou un avatar |
| `bureau_modifier` | Modifier par correctif partiel (réglages et thème compris) |
| `bureau_supprimer` | Envoyer à la corbeille ; suppression définitive depuis la corbeille, avec jeton |
| `bureau_restaurer` | Sortir de la corbeille |
| `historique_annuler` | Annuler un événement du journal |
| `bureau_afficher` | Vue d'ensemble du bureau et lien vers la page web (la vue graphique dans le chat arrive en Phase 5) |
| `mission_ouvrir`, `mission_cloturer` | Ouvrir une mission, la clôturer avec un bilan |
| `tache_deleguer` | Confier une tâche à un agent (la tâche reste « en attente » jusqu'à la Phase 3) |
| `tache_resultat` | Lire le résumé d'une tâche |
| `agent_modifier_fonction` | Changer la fonction et les consignes d'un agent, avec versionnage |
| `agent_creer_sous_agent` | Créer un sous-agent, avec le fournisseur de son parent et son propre avatar |
| `budget_etat` | Dépenses du mois et plafonds |

**Déclenchement.** Chaque outil exige le paramètre `declencheur`, qui doit valoir `@bureau` ou `/bureau` ; toute autre valeur est refusée avec un message qui rappelle la règle. Les instructions du serveur et la description de chaque outil rappellent aussi la règle, et un prompt MCP `bureau` est proposé aux clients qui affichent les prompts comme commandes. Chaque appel accepté est journalisé avec son déclencheur dans la table `appels_mcp`.

**Données privées.** Une tâche privée n'est jamais confiée à Gemini. Elle reste au chef, ou va à un agent DeepSeek si le réglage `prive_vers_deepseek` est activé et si l'agent accepte les tâches privées (`accepte_prive`).

### OAuth

`/mcp` est protégé par OAuth 2.1 (`@cloudflare/workers-oauth-provider`). Le même Worker est serveur d'autorisation et ressource protégée.

- **Claude** se connecte avec son identité publiée (document de métadonnées client, CIMD) : il n'y a rien à créer pour lui.
- **Les autres outils**, comme MCP Inspector, utilisent un client pré-enregistré, créé sur la page `/connexions`.
- L'enregistrement dynamique des clients est désactivé : il est déprécié par la spécification MCP.

Quand une application demande l'accès, `/authorize` demande d'abord le mot de passe du bureau, puis affiche son nom, son domaine vérifié et l'adresse où l'accès sera envoyé. La page `/connexions` liste les applications connectées et permet de les déconnecter : leurs jetons cessent aussitôt de fonctionner.

Les clients, autorisations et jetons sont stockés dans l'espace KV `OAUTH_KV` (jetons et secrets seulement sous forme d'empreintes), exigé par la bibliothèque.

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
  mcp/                Serveur MCP : outils, déclenchement, journal des appels
  oauth/              Autorisation, consentement, clients pré-enregistrés
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
- `worker` : services, authentification, API, temps réel, OAuth et outils MCP, dans le vrai moteur des Workers avec une base construite à partir des migrations (`@cloudflare/vitest-plugin`). Les tests MCP passent par le parcours OAuth complet, puis appellent les outils avec le client MCP officiel.

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

## Déploiement de test (`workers.dev`)

La mise en production sur ton sous-domaine viendra en Phase 6. D'ici là, le bureau se teste sur une adresse `workers.dev`.

1. **Connecter Wrangler** à ton compte Cloudflare (une seule fois) : `npx wrangler login`.
2. **Déployer** : `npm run deploy`. Au premier déploiement, Wrangler crée lui-même la base D1 et l'espace KV, puis inscrit leurs identifiants dans `wrangler.jsonc` (ce ne sont pas des secrets : ils peuvent être committés). Le terminal affiche l'adresse, de la forme `https://bureau.<ton-sous-domaine>.workers.dev`.
3. **Créer les tables** : `npm run db:migrate:remote`.
4. **Enregistrer les secrets**, avec un mot de passe fort et différent de celui de `.dev.vars` :

   ```bash
   npx wrangler secret put BUREAU_PASSWORD
   npx wrangler secret put SESSION_SECRET
   ```

5. Ouvre l'adresse affichée et vérifie que la page de connexion répond.

### Connecter Claude

1. Dans Claude : Personnaliser > Connecteurs > + > Ajouter un connecteur personnalisé.
2. Adresse : `https://bureau.<ton-sous-domaine>.workers.dev/mcp`. Pour le client OAuth, garde l'option recommandée (identité publiée de Claude).
3. Connecte-toi : la page du bureau demande ton mot de passe, puis d'autoriser Claude.
4. Dans les permissions du connecteur, règle `bureau_supprimer` et `historique_annuler` sur « Needs approval ».
5. Ajoute dans tes préférences Claude :

   > N'utilise le connecteur Bureau, ni aucun de ses outils, que si mon message contient « @bureau » ou « /bureau ». Sinon, réponds sans lui.

6. Essaie un message sans déclencheur (aucun outil ne doit être appelé), puis « /bureau » seul, puis « @bureau ouvre une mission de recherche sur X ».
