# Bureau d'agents IA — Cahier des charges v1

Nov 15, 2026 · @Killian

## 1. Vision et objectifs

Un bureau virtuel en HD-2D, réservé à un seul utilisateur, où Claude, le chef, répartit chaque mission entre des agents IA spécialisés et garde son propre quota pour ce qu'il fait le mieux.

- **Usages professionnels** : recherche en tout genre, cadrage de projet, conception, développement web et application, marketing digital, communication digitale. Le bureau fonctionne comme une agence 360°.
- **Usages personnels** : les mêmes agents servent aussi pour des projets moins professionnels.
- **Économie** : Claude délègue aux agents gratuits ou peu chers ce qu'ils font bien. Il garde son quota Claude Pro pour l'exécution, la vérification et les tâches où il est meilleur.
- **Contrôle total** : le chef peut tout faire dans le bureau sur simple demande. L'utilisateur peut aussi tout modifier à la main, sans passer par le chat.
- **Un lieu vivant** : chaque agent a un avatar personnalisable qui travaille quand il a une tâche, et vit dans les salles communes le reste du temps.

## 2. Décisions validées

Le périmètre est fixé : un seul utilisateur, Claude Pro comme chef, des agents sur offres API gratuites et un hébergement Cloudflare.

| Sujet | Décision |
| --- | --- |
| Utilisateurs | Toi seul, personne d'autre ne sera ajouté |
| Chef | Claude, depuis l'app Claude (web, desktop, mobile), avec l'abonnement Pro. Le bureau y est ajouté comme connecteur personnalisé |
| Agents | Deux fournisseurs seulement, tous deux appelés via l'AI Gateway de Cloudflare : Gemini (offre gratuite) et DeepSeek (prépayé) |
| Non retenu | Mistral (clés API devenues payantes), Copilot (pas d'API gratuite), Workers AI, comptes gratuits des sites de chat (non utilisables par un programme), API de Cursor (payante et spécialisée) |
| Hébergement | Cloudflare, un seul Worker, sans serveur à louer, sur un sous-domaine de ton domaine déjà chez Cloudflare. L'enregistrement DNS et le certificat HTTPS sont créés automatiquement (Custom Domain) |
| Interfaces | Le bureau dans le chat Claude (MCP App) + une page web protégée par mot de passe, qui réutilise le même composant |
| Déclenchement | Le bureau n'est appelé que si ton message contient « @bureau » ou « /bureau » |
| Style | HD-2D inspiré du remake de Dragon Quest III, avec des graphismes originaux |

**Questions ouvertes**

- [ ] Nom du sous-domaine : `bureau` par défaut (donc bureau.tondomaine.fr). Avant de le brancher, vérifier qu'aucun enregistrement DNS n'existe déjà sous ce nom
- [ ] Graphismes : générés par code en 64 px, ou modélisés dans Blender puis rendus en sprites (meubles en .glb)
- [ ] Plafond mensuel de dépense pour DeepSeek

## 3. Architecture et stack technique

Tout tient dans un seul Worker Cloudflare : il sert le serveur MCP du chef, l'API de la page web, le temps réel et l'interface du bureau.

| Brique | Technologie | Rôle |
| --- | --- | --- |
| Langage | TypeScript | Un seul langage pour le serveur, l'interface et le MCP |
| Hébergement | Cloudflare Workers + Static Assets, Custom Domain | Sert tout le projet sur ton sous-domaine. DNS et HTTPS créés automatiquement, aucun serveur à louer |
| Serveur MCP | SDK MCP TypeScript officiel, `createMcpHandler`, transport Streamable HTTP | Expose les outils du chef sur `/mcp`, selon la spécification MCP du 28 juillet 2026, sans état. Ni `McpAgent` ni SSE |
| Authentification MCP | Workers OAuth Provider | Permet à l'app Claude de se connecter au serveur protégé. La page de connexion demande ton mot de passe |
| Authentification web | Session par cookie après le même mot de passe | Protège la page du bureau. Si Cloudflare Access est utilisé, `/mcp` doit en être exclu |
| État et temps réel | Un Durable Object « Bureau » + WebSockets en hibernation | Garde l'état partagé et diffuse chaque événement en direct |
| Base de données | D1 (SQLite) | Agents, missions, tâches, historique, salles, meubles, avatars |
| Fichiers | R2 | Livrables complets, graphismes, exports |
| Tâches longues | Cloudflare Workflows | Missions en plusieurs étapes, reprise après échec |
| Appels aux IA | AI Gateway (gateway « bureau ») via le binding `env.AI`, bibliothèque `@cloudflare/ai-gateway` ou Vercel AI SDK avec `ai-gateway-provider` | Passage obligé vers Gemini et DeepSeek. Logs, coûts par agent, limitation de débit, nouvelles tentatives |
| Clés des fournisseurs | Clés stockées dans l'AI Gateway (BYOK, Secrets Store), gateway authentifié | Les clés Gemini et DeepSeek ne sont ni dans le code, ni dans les requêtes |
| Rendu HD-2D | React + React Three Fiber + drei + @react-three/postprocessing | Scène 3D, sprites en pixel art, lumières, effets |
| Déplacements | EasyStar.js | Chemins des avatars sur la grille au sol |
| Vue dans le chat | Extension MCP Apps (`@modelcontextprotocol/ext-apps`) | Affiche le bureau dans la conversation, en plein écran |
| Outillage | Wrangler, Vite, Vitest, MCP Inspector | Développement, tests, déploiement |

&#91;embedded content: architecture · 1 Worker, 2 fournisseurs IA via l'AI Gateway\]

Le chef et la page web passent par la même couche de services : c'est elle qui garantit que toute action est possible des deux côtés.

## 4. Agents, sous-agents et règles de délégation

L'équipe de départ compte un chef, trois agents et un sous-agent, sur deux fournisseurs : Gemini et DeepSeek, appelés via l'AI Gateway. Le chef peut ensuite changer leurs fonctions et créer d'autres sous-agents.

| Agent | Fournisseur | Fonction de départ | Coût |
| --- | --- | --- | --- |
| Chef | Claude, via l'app | Comprend la demande, découpe, délègue, vérifie, exécute le critique et le privé | Inclus dans Claude Pro |
| Rédacteur | Gemini Flash (offre gratuite) | Rédaction, communication, marketing, contenus en français | Gratuit dans les limites de l'offre |
| Chercheur | Gemini Flash (offre gratuite) | Recherche, synthèse de gros documents | Gratuit dans les limites de l'offre |
| Technicien | DeepSeek | Code simple, tâches répétitives, renfort quand Gemini est saturé | Prépayé, sous plafond |
| Développeur (sous-agent du Technicien) | DeepSeek | Génération et relecture de code | Prépayé, sous plafond |

**Règles de délégation**

1. **Retour court.** Chaque agent range son livrable complet dans R2 et renvoie au chef un résumé de 150 mots maximum, avec le lien. Le chef n'ouvre le livrable complet que s'il en a besoin.
2. **Données privées.** Une tâche marquée « privée » n'est jamais envoyée à l'offre gratuite de Gemini, qui peut utiliser les données pour entraîner ses modèles. Elle reste chez le chef, ou va à DeepSeek si tu l'autorises dans les réglages.
3. **Ordre de repli.** Rédaction et recherche : Gemini, puis DeepSeek si le quota gratuit est épuisé ou si Gemini ne répond pas, puis le chef. Technique : DeepSeek, puis le chef.
4. **Quotas gratuits.** Si Gemini répond « trop de requêtes », nouvelle tentative avec attente, puis repli selon la règle 3. Chaque repli est journalisé.
5. **Budget.** Un plafond mensuel pour DeepSeek et un plafond par mission, vérifiés avant chaque appel. Au-delà, l'appel est bloqué et une alerte s'affiche.
6. **Fonctions évolutives.** La fonction et les consignes de chaque agent sont modifiables par toi ou par le chef. Chaque changement crée une nouvelle version, consultable et restaurable.
7. **Sous-agents.** Un sous-agent utilise le fournisseur de son parent, avec sa propre fonction, ses propres consignes et son propre avatar.
8. **Tous les appels passent par l'AI Gateway.** Aucun appel direct aux API de Gemini ou de DeepSeek.

## 5. Outils MCP du chef et règle de parité

Toute action possible à la main dans le bureau existe aussi comme outil pour le chef, et l'inverse. Les deux passent par la même couche de services côté serveur, donc le résultat est identique.

| Outil | Rôle |
| --- | --- |
| `bureau_lire` | Lire n'importe quel élément ou une liste filtrée (agents, missions, salles, meubles, avatars, réglages) |
| `bureau_creer` | Créer un élément de n'importe quel type |
| `bureau_modifier` | Modifier un élément par un correctif partiel |
| `bureau_supprimer` | Envoyer un élément à la corbeille |
| `bureau_restaurer` | Sortir un élément de la corbeille |
| `historique_annuler` | Annuler un événement précis du journal |
| `bureau_afficher` | Ouvrir la vue du bureau dans le chat (MCP App) |
| `mission_ouvrir` / `mission_cloturer` | Créer une mission et la clôturer avec un bilan |
| `tache_deleguer` | Confier une tâche à un agent : brief, format de retour, case « privée » |
| `tache_resultat` | Lire le résumé d'une tâche, ou le livrable complet sur demande |
| `agent_modifier_fonction` | Changer la fonction et les consignes d'un agent, avec versionnage |
| `agent_creer_sous_agent` | Créer un sous-agent sous un agent existant |
| `budget_etat` | Voir les quotas restants et les dépenses du mois par fournisseur |

Types d'éléments gérés par les outils généraux : agent, mission, tâche, salle, meuble, avatar, thème, réglage.

**Garde-fous**

- Chaque entrée est validée par un schéma strict (Zod). Une donnée invalide est refusée avec un message clair.
- Chaque modification écrit un événement dans le journal, avec l'état avant et après, et l'auteur (toi, le chef, un agent ou le système).
- Toute modification est annulable depuis le journal.
- Une suppression envoie à la corbeille, vidée après 30 jours.
- Une suppression définitive se fait en deux temps : demande, puis confirmation avec un jeton à usage unique.
- Les descriptions d'outils restent courtes et précises, et les réponses compactes, pour économiser le contexte du chef.

### Déclenchement : uniquement avec @bureau ou /bureau

Le chef n'utilise le bureau que si ton message contient « @bureau » ou « /bureau ». Sans l'un des deux, Claude répond normalement, sans appeler aucun outil du bureau, même pour une simple lecture.

| Ce que tu écris | Ce que fait le chef |
| --- | --- |
| `/bureau` seul | Ouvre la vue du bureau (`bureau_afficher`) |
| `@bureau` ou `/bureau` suivi d'une demande | Traite la demande avec les outils du bureau : mission, délégation, modification… |
| Un message sans déclencheur | Aucun appel au bureau. Si le bureau serait utile, Claude peut le suggérer en une phrase |

Le déclencheur vaut pour le message où il apparaît. Pour poursuivre une mission au message suivant, il faut l'écrire à nouveau.

**Mise en œuvre, en 4 niveaux** (le serveur ne voit pas tes messages, il ne peut donc pas tout bloquer seul) :

1. **Instructions du serveur MCP** (champ `instructions`) et description de chaque outil : elles rappellent la règle à Claude.
2. **Paramètre `declencheur` obligatoire** dans chaque outil, qui doit valoir `@bureau` ou `/bureau`. Sinon le serveur refuse l'appel avec un message qui rappelle la règle. Chaque appel est journalisé avec son déclencheur.
3. **Préférences personnelles dans Claude** : une phrase qui rappelle la règle (texte ci-dessous).
4. **Vraie commande `/bureau`** : un plugin Claude qui regroupe le connecteur et une commande `bureau`, importé depuis Customize > Plugins. « /bureau » devient alors une commande proposée par l'app. Sa disponibilité sur mobile est à vérifier.

**Limite** : les niveaux 1 à 3 reposent sur le respect de la règle par Claude. C'est fiable en pratique, mais ce n'est pas un verrou absolu. Les outils de suppression restent donc en plus sur « Needs approval » (approbation requise) dans les permissions du connecteur.

**Texte à ajouter dans tes préférences Claude** :

> N'utilise le connecteur Bureau, ni aucun de ses outils, que si mon message contient « @bureau » ou « /bureau ». Sinon, réponds sans lui.

## 6. Modèle de données

Tout ce qui est personnalisable est un champ en base, ce qui le rend modifiable autant par toi que par le chef. Les tables D1 :

| Table | Champs principaux |
| --- | --- |
| `agents` | id, parent\_id, fournisseur, modèle, nom, pseudo, fonction, consignes, accepte\_prive, statut, avatar\_id, salle\_bureau\_id, coût\_cumulé, dates |
| `agent_versions` | agent\_id, version, fonction, consignes, auteur, date |
| `missions` | id, titre, type (recherche, cadrage, conception, dev, marketing, communication, perso), statut, brief, bilan, dates |
| `taches` | id, mission\_id, agent\_id, brief, privée, statut, résumé, clé\_livrable\_r2, tokens\_entrée, tokens\_sortie, coût, durée\_ms, erreur, dates |
| `events` | id, horodatage, auteur (toi, chef, agent, système), type, type\_cible, id\_cible, avant (JSON), après (JSON) |
| `salles` | id, type (bureau, open space, réunion, cafétéria, pause, jeux), nom, position, taille, décor (JSON) |
| `catalogue_meubles` | modèle\_id, catégorie, variantes (JSON), coloris (JSON), jauge\_satisfaite, empreinte au sol |
| `meubles` | id, salle\_id, modèle\_id, variante, coloris, x, y, rotation |
| `avatars` | id, agent\_id, silhouette, calques (JSON), couleurs (JSON), personnalité, emploi\_du\_temps (JSON) |
| `budgets` | fournisseur, mois, plafond, dépensé |
| `reglages` | clé, valeur (qualité graphique, thème, nom du bureau…) |

La table `events` sert à trois choses : l'historique des missions, le fil temps réel et l'annulation. Les éléments supprimés gardent une date `supprime_le`, ce qui forme la corbeille.

Dans R2 : `livrables/<mission>/<tache>.md` pour les livrables, `assets/` pour les graphismes, `exports/` pour les sauvegardes.

## 7. Interfaces et écrans

Le même composant d'interface s'affiche à deux endroits : dans le chat Claude, et sur la page web protégée de ton sous-domaine.

- **Dans le chat** : l'outil `bureau_afficher` ouvre le bureau comme une MCP App, en plein écran sur mobile. Le résultat texte de l'outil reste complet, au cas où l'affichage ne serait pas disponible.
- **Sur la page web** : connexion par mot de passe, puis accès à tout, sans consommer de messages Claude.

**Écrans**

1. **Vue du bureau** : la scène HD-2D, avec déplacement de caméra et zoom limité. Un clic sur un avatar ouvre sa fiche.
2. **Fiche agent (son bureau personnel)** :
   - nom de l'agent et pseudo modifiable, fournisseur et modèle ;
   - fonction et consignes modifiables, avec l'historique des versions ;
   - tableau des dernières actions : date, mission, action, coût, statut ;
   - statistiques : tâches réalisées, coût du mois, quota restant ;
   - personnalité, apparence, salle de rattachement.
3. **Tableau des missions** : l'historique complet, filtrable par type, agent et statut, avec le détail de chaque action.
4. **Panneau « en cours »** : la mission active et son fil d'actions, mis à jour en temps réel par WebSocket.
5. **Éditeur d'avatar** : tous les calques, couleurs et silhouettes (section 9).
6. **Mode édition du bureau** : placement des meubles et aménagement des salles.
7. **Réglages** : plafonds de budget, qualité graphique, mot de passe. L'état des clés API s'affiche (configurée ou non), jamais leur valeur.

Les menus reprennent le principe des fenêtres de dialogue des JRPG : fond bleu nuit, bordure claire, police pixel lisible. Le design reste original.

## 8. Univers visuel HD-2D

Le bureau est une maquette en 3D dans laquelle évoluent des personnages en pixel art, avec un éclairage dynamique et des effets modernes, dans l'esprit du remake HD-2D de Dragon Quest III.

- **Caméra** : fixe, en plongée d'environ 35°, zoom limité, déplacement d'une salle à l'autre.
- **Décor** : sols et murs en 3D, avec des textures en pixel art affichées sans lissage (filtrage « nearest »).
- **Meubles** : modèles en voxel créés avec MagicaVoxel (gratuit), puis convertis en glTF. Les petits objets (tasses, plantes, déco) sont des sprites 2D posés dans la scène.
- **Personnages** : sprites en pixel art toujours tournés vers la caméra. Animations : marche dans 4 directions, attente, assis au bureau, boire, dormir, jouer.
- **Lumière** : soleil réglé sur l'heure de Paris, lampes ponctuelles, ombres portées, éléments lumineux (écrans, machine à café).
- **Effets** : flou de profondeur façon maquette (tilt-shift), halo des lumières (bloom), vignettage, étalonnage des couleurs.
- **Qualité graphique** : 3 niveaux (élevé, moyen, bas), détectés automatiquement et modifiables. Niveau moyen par défaut sur mobile.

**Droits**

- Inspiration uniquement : aucun sprite, décor, monstre, musique, logo ou personnage du jeu n'est repris.
- Chaque graphisme utilisé a une licence compatible avec la modification et l'usage web, listée dans un fichier `CREDITS`.
- Avec le générateur LPC, les graphismes sont sous licence GPL 3.0 et/ou CC-BY-SA 3.0, et chaque auteur doit être crédité ([source](https://github.com/Orval1/Universal-LPC-Spritesheet-Character-Generator)).

## 9. Personnalisation

Tout est personnalisable, par toi à la main ou par le chef via le chat : avatars, meubles, salles et thème.

**Avatars** : un personnage est un empilement de calques interchangeables.

| Calque | Contenu |
| --- | --- |
| Silhouette | 3 tailles : petite, moyenne, grande |
| Visage | Yeux, sourcils, bouche, teint |
| Coiffure | Forme et couleur |
| Vêtements | Un ensemble complet, ou haut + bas + veste séparés |
| Chaussures | Modèle et couleur |
| Accessoires | 0 à 2 à la fois : lunettes, chapeau, écharpe… |

- Chaque silhouette a sa propre version de chaque vêtement, car le pixel art ne s'agrandit pas proprement. C'est pourquoi on se limite à 3 silhouettes.
- Les couleurs se changent par substitution de palette : un même dessin existe en plusieurs coloris sans être redessiné.

**Meubles**

- Chaque modèle de meuble a au moins 3 variantes de forme, et chaque variante plusieurs coloris.
- Le catalogue est classé par salle : bureau, réunion, cafétéria, pause, jeux, déco.
- **Mode édition** : grille au sol, glisser-déposer, rotation, changement de variante ou de coloris, suppression. Les collisions sont vérifiées et les chemins des avatars recalculés.

**Autres éléments** : sol, murs et taille des salles, ajout ou retrait de salles, thème des fenêtres, nom du bureau.

## 10. Écosystème vivant

Quand tu n'utilises pas le bureau, les avatars y vivent selon des règles simples, sans aucun appel à une IA, donc sans coût.

**Salles**

| Salle | Ce qu'on y fait | Jauge satisfaite |
| --- | --- | --- |
| Bureaux individuels / open space | Travailler sur une vraie tâche | — |
| Salle de réunion | Se réunir quand le chef répartit une mission | Social |
| Cafétéria | Déjeuner, prendre un café | Faim, social |
| Salle de pause | Dormir dans le lit, se poser dans le canapé | Énergie |
| Salle de jeux | Jouer | Divertissement |

**Comportement**

- Chaque avatar a 4 jauges de 0 à 100 : énergie, faim, divertissement, social. Elles baissent avec le temps, et chaque meuble en remonte une.
- Un trait de caractère (gourmand, bosseur, joueur, sociable, dormeur…) modifie la vitesse de baisse des jauges et les préférences.
- Ordre de priorité : vraie tâche, puis besoin critique, puis emploi du temps, puis flânerie.
- **Lien avec le vrai travail** : quand le chef délègue, les agents concernés passent par la salle de réunion, puis s'installent à leur bureau. Une fois la tâche finie, ils vont en pause.
- **Cycle jour-nuit** calé sur l'heure de Paris : lumière du matin, lampes le soir, avatars qui dorment la nuit.

**Fonctionnement technique**

- L'état de chaque avatar est calculé à partir de l'heure, d'une graine fixe et des événements réels du journal. Le résultat est donc toujours le même pour un même moment.
- Le calcul se fait dans ton navigateur à l'ouverture. Rien ne tourne sur le serveur en ton absence.
- Option v3 : Gemini génère une fois par jour quelques répliques pour les bulles de dialogue, mises en cache.

## 11. Sécurité, coûts et limites

Le coût prévu au départ est de 0 € en plus de Claude Pro, sauf le crédit DeepSeek que tu choisis d'ajouter.

**Sécurité**

- Les clés Gemini et DeepSeek sont stockées dans l'AI Gateway (BYOK, Secrets Store), et le gateway est authentifié. Les autres secrets (mot de passe, clé de session) sont des secrets Wrangler (fichier `.dev.vars` ignoré par Git en local). Aucun secret n'apparaît côté navigateur ni dans les réponses des outils.
- `/mcp` est protégé par OAuth. L'adresse de retour de Claude est `https://claude.ai/api/mcp/auth_callback`.
- Mot de passe fort, nombre de tentatives limité, cookies `HttpOnly`, `Secure` et `SameSite`.
- Les données privées suivent la règle de la section 4.

**Coûts**

| Poste | Coût prévu |
| --- | --- |
| Claude Pro (chef) | Déjà payé |
| Gemini | 0 € dans les limites de l'offre gratuite |
| DeepSeek | Prépayé, selon ton plafond |
| AI Gateway | Inclus dans ton compte Cloudflare |
| Cloudflare | Plan gratuit au départ. Plan Workers Paid (5 $ par mois minimum) seulement si une limite bloque |
| Nom de domaine et sous-domaine | Déjà payé ; le sous-domaine ne coûte rien |

**Limites à connaître**

- Les quotas gratuits peuvent changer sans préavis : Google a fortement réduit ceux de Gemini en 2026. Le routage doit tolérer ces changements.
- Claude Pro a ses propres limites d'usage, d'où l'importance des retours courts.
- Les effets HD-2D peuvent ralentir sur mobile et dans la vue intégrée au chat, d'où les niveaux de qualité.
- Le chef ne travaille que pendant une conversation. Les tâches longues continuent sur le serveur, mais aucune nouvelle décision du chef n'est prise en ton absence.

## 12. Découpage en versions et critères d'acceptation

Le projet avance en quatre étapes, et la première est un prototype qui valide le rendu HD-2D avant tout le reste.

| Étape | Contenu | Condition pour passer à la suite |
| --- | --- | --- |
| Phase 0 – Prototype | Une salle, un avatar qui marche, lumières, effets, 3 niveaux de qualité | Fluide (au moins 30 images par seconde) sur ton ordinateur, ton téléphone et dans le chat Claude, et rendu validé par toi |
| v1 – Fondations | MCP + OAuth, chef, 3 agents + le sous-agent Développeur, délégation avec retour court, missions, historique, temps réel, toutes les salles, avatars de base, 3 variantes pour les meubles principaux, fiches agents, page web | Tous les critères ci-dessous vérifiés |
| v2 – Personnalisation complète | Éditeur d'avatar avec tous les calques et les 3 silhouettes, catalogue complet de meubles, mode édition libre, thèmes | Chaque élément de la section 9 modifiable à la main et par le chef |
| v3 – Vie autonome riche | Jauges, personnalités, emplois du temps, cycle jour-nuit, répliques | Les avatars vivent de façon crédible pendant 24 h sans aucun appel IA hors répliques |

**Critères d'acceptation de la v1**

1. Depuis l'app Claude, « @bureau fais une recherche sur X » crée une mission, la délègue au Chercheur, renvoie un résumé et range le livrable dans R2. Tout est visible en direct dans le bureau.
2. Le chef peut renommer un agent et changer sa fonction. Le changement apparaît sur la page web.
3. Tu peux faire la même modification à la main, et le chef la voit ensuite.
4. Toute modification est annulable depuis le journal.
5. Une tâche privée n'est jamais envoyée à l'offre gratuite de Gemini.
6. Quand le quota gratuit de Gemini est épuisé, la tâche passe à DeepSeek, et le plafond de dépense est respecté.
7. Aucune clé API n'est visible côté navigateur ni dans les réponses des outils.
8. Le bureau s'affiche dans le chat sur le web, le desktop et le mobile.
9. Sans « @bureau » ni « /bureau » dans le message, aucun outil du bureau n'est appelé. Un appel sans déclencheur valide est refusé par le serveur. « /bureau » seul ouvre la vue du bureau.

## 13. Feuille de route jusqu'à la mise en production

Voici chaque étape que tu as à faire, dans l'ordre. Ton IA de code écrit le code, toi tu crées les comptes, tu fournis les clés, tu testes et tu valides. Coche au fur et à mesure.

### A. Préparer les comptes et les outils

- [ ] Vérifier que ton domaine est actif sur Cloudflare
- [ ] Créer une clé API Gemini sur Google AI Studio
- [ ] Créer un compte sur la plateforme API de DeepSeek, l'alimenter du montant choisi et créer une clé
- [ ] Créer l'AI Gateway : AI > AI Gateway > Create Gateway, nom `bureau`
- [ ] Régler le gateway : logs activés, cache désactivé ou court, limitation de débit, Authenticated Gateway activé
- [ ] Stocker les clés Gemini et DeepSeek dans le gateway (BYOK)
- [ ] Choisir un mot de passe fort pour le bureau et le ranger dans un gestionnaire de mots de passe
- [ ] Installer Node.js (version LTS), Git et un éditeur de code
- [ ] Créer un compte GitHub si tu n'en as pas, et choisir ton IA de code

### B. Lancer le développement

- [ ] Créer un dépôt GitHub privé
- [ ] Exporter ce cahier des charges en Markdown et le placer dans `docs/CAHIER_DES_CHARGES.md`
- [ ] Donner à ton IA de code le prompt de la section 14
- [ ] Connecter Wrangler à ton compte Cloudflare quand l'IA te le demande (`npx wrangler login`)

### C. Phase 0 : valider le prototype HD-2D

- [ ] Tester le prototype sur ton ordinateur et ton téléphone
- [ ] Trancher la source des graphismes (LPC ou pack payant)
- [ ] Valider le rendu, ou demander des ajustements avant de continuer

### D. Construire et tester la v1 en local

- [ ] Valider chaque fin de phase annoncée par l'IA
- [ ] Mettre tes clés dans `.dev.vars` (jamais dans le code)
- [ ] Tester les outils du chef avec MCP Inspector
- [ ] Vérifier un à un les critères d'acceptation de la section 12

### E. Déployer en préproduction

- [ ] Laisser l'IA créer la base D1, le stockage R2 et le Durable Object, puis vérifier qu'ils apparaissent dans Cloudflare
- [ ] Enregistrer les secrets restants avec `npx wrangler secret put` : mot de passe et clé de session (les clés Gemini et DeepSeek sont déjà dans l'AI Gateway)
- [ ] Déployer sur l'adresse de test `workers.dev`
- [ ] Dans Claude : Personnaliser > Connecteurs > + > Ajouter un connecteur personnalisé, coller l'adresse `/mcp`, puis se connecter avec ton mot de passe
- [ ] Dans les permissions du connecteur, régler les outils de suppression sur « Needs approval »
- [ ] Ajouter dans tes préférences Claude la phrase de la section 5 sur « @bureau » et « /bureau »
- [ ] Importer le plugin du bureau (commande `/bureau`) depuis Customize > Plugins
- [ ] Vérifier qu'un message sans déclencheur n'appelle pas le bureau, puis tester « /bureau » et « @bureau »
- [ ] Tester dans le chat sur le web, puis sur le desktop, puis sur mobile

### F. Mettre en production

- [ ] Dans les enregistrements DNS de ton domaine, vérifier qu'il n'existe rien sous le nom `bureau` (sinon le supprimer)
- [ ] Brancher le sous-domaine : ton IA de code ajoute `bureau.tondomaine.fr` en Custom Domain dans la configuration, puis déploie. Cloudflare crée seul l'enregistrement DNS et le certificat HTTPS
- [ ] Remplacer l'adresse du connecteur dans Claude par `https://bureau.tondomaine.fr/mcp`
- [ ] Activer les plafonds de budget et vérifier les logs de l'AI Gateway
- [ ] Mettre en place une sauvegarde régulière de la base D1 vers R2
- [ ] Lancer ta première vraie mission

### G. Ensuite

- [ ] Démarrer la v2 (personnalisation complète)
- [ ] Démarrer la v3 (vie autonome riche)

## Sources

- [Cloudflare – The next generation of MCP](https://blog.cloudflare.com/mcp-v2/)
- [Cloudflare Docs – Build a Remote MCP server](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)
- [Cloudflare Docs – Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare Docs – AI Gateway, Getting started](https://developers.cloudflare.com/ai-gateway/get-started/)
- [Cloudflare Docs – AI Gateway, BYOK (Store Keys)](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)
- [Cloudflare Docs – Using AI Gateway in Workers](https://developers.cloudflare.com/ai-gateway/usage/workers)
- [Claude – Custom connectors (remote MCP)](https://www.claude.com/docs/connectors/custom/remote-mcp)
- [Claude – Extend overview (connecteurs, skills, plugins)](https://claude.com/docs/extend/overview)
- [Claude Help Center – Use interactive connectors in Claude](https://support.claude.com/en/articles/13454812)
- [Claude Help Center – Permissions des outils d'un connecteur](https://support.claude.com/en/articles/11724452-use-the-connectors-directory-to-extend-claude-s-capabilities)
- [Claude Docs – MCP Apps design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines)
- [Yingtu – Gemini API free tier limits 2026](https://yingtu.ai/en/blog/google-gemini-api-free-tier-limits-2026)
- [BenchLM – DeepSeek API Pricing](https://www.benchlm.ai/deepseek/api-pricing)
- [AgentDeals – Mistral API Pricing 2026](https://agentdeals.dev/mistral-api-pricing-2026)
- [Universal LPC Spritesheet Character Generator](https://github.com/Orval1/Universal-LPC-Spritesheet-Character-Generator)
