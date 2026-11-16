-- Bureau d'agents IA — initial schema (section 6 of the specification).
-- Table and column names follow the specification (French, no accents).
-- Dates are ISO 8601 UTC strings. JSON values are stored as TEXT.
-- `supprime_le` marks an item as being in the trash (emptied after 30 days).

CREATE TABLE salles (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('bureau', 'open_space', 'reunion', 'cafeteria', 'pause', 'jeux')),
  nom TEXT NOT NULL,
  -- Position and size on the office floor grid, in cells
  position_x INTEGER NOT NULL,
  position_y INTEGER NOT NULL,
  largeur INTEGER NOT NULL CHECK (largeur > 0),
  profondeur INTEGER NOT NULL CHECK (profondeur > 0),
  decor TEXT NOT NULL DEFAULT '{}',
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  supprime_le TEXT
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  -- A sub-agent points to its parent and uses the same provider
  parent_id TEXT REFERENCES agents (id),
  fournisseur TEXT NOT NULL CHECK (fournisseur IN ('claude', 'gemini', 'deepseek')),
  -- Model name sent to the provider. A setting, never a constant in the code.
  modele TEXT,
  nom TEXT NOT NULL,
  pseudo TEXT,
  fonction TEXT NOT NULL,
  consignes TEXT NOT NULL DEFAULT '',
  accepte_prive INTEGER NOT NULL DEFAULT 0 CHECK (accepte_prive IN (0, 1)),
  statut TEXT NOT NULL DEFAULT 'disponible' CHECK (statut IN ('disponible', 'occupe', 'inactif')),
  -- No foreign key here: avatars already point to their agent
  avatar_id TEXT,
  salle_bureau_id TEXT REFERENCES salles (id),
  cout_cumule REAL NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  supprime_le TEXT
);

-- Every change of an agent's role or instructions adds a version (never edited).
CREATE TABLE agent_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES agents (id),
  version INTEGER NOT NULL,
  fonction TEXT NOT NULL,
  consignes TEXT NOT NULL,
  auteur TEXT NOT NULL,
  cree_le TEXT NOT NULL,
  UNIQUE (agent_id, version)
);

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  titre TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('recherche', 'cadrage', 'conception', 'dev', 'marketing', 'communication', 'perso')),
  statut TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte', 'cloturee')),
  brief TEXT NOT NULL DEFAULT '',
  bilan TEXT,
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  cloturee_le TEXT,
  supprime_le TEXT
);

CREATE TABLE taches (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions (id),
  agent_id TEXT NOT NULL REFERENCES agents (id),
  brief TEXT NOT NULL,
  -- A private task never goes to the free Gemini tier
  privee INTEGER NOT NULL DEFAULT 0 CHECK (privee IN (0, 1)),
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_cours', 'terminee', 'echouee')),
  resume TEXT,
  cle_livrable_r2 TEXT,
  tokens_entree INTEGER,
  tokens_sortie INTEGER,
  cout REAL,
  duree_ms INTEGER,
  erreur TEXT,
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  supprime_le TEXT
);

-- Journal of every change: history, real-time feed and undo.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  horodatage TEXT NOT NULL,
  auteur TEXT NOT NULL CHECK (auteur IN ('utilisateur', 'chef', 'agent', 'systeme')),
  -- Agent id when the author is an agent
  auteur_id TEXT,
  type TEXT NOT NULL,
  type_cible TEXT NOT NULL,
  id_cible TEXT NOT NULL,
  avant TEXT,
  apres TEXT,
  -- Trigger word of the MCP call that caused the change, when there is one
  declencheur TEXT,
  -- Set once the event has been undone, to the id of the undo event
  annule_par INTEGER REFERENCES events (id)
);

CREATE TABLE catalogue_meubles (
  modele_id TEXT PRIMARY KEY,
  categorie TEXT NOT NULL CHECK (categorie IN ('bureau', 'reunion', 'cafeteria', 'pause', 'jeux', 'deco')),
  nom TEXT NOT NULL,
  variantes TEXT NOT NULL,
  coloris TEXT NOT NULL,
  jauge_satisfaite TEXT CHECK (jauge_satisfaite IN ('energie', 'faim', 'divertissement', 'social')),
  empreinte_largeur INTEGER NOT NULL DEFAULT 1 CHECK (empreinte_largeur > 0),
  empreinte_profondeur INTEGER NOT NULL DEFAULT 1 CHECK (empreinte_profondeur > 0),
  bloquant INTEGER NOT NULL DEFAULT 1 CHECK (bloquant IN (0, 1))
);

CREATE TABLE meubles (
  id TEXT PRIMARY KEY,
  salle_id TEXT NOT NULL REFERENCES salles (id),
  modele_id TEXT NOT NULL REFERENCES catalogue_meubles (modele_id),
  variante TEXT NOT NULL,
  coloris TEXT NOT NULL,
  -- Cell inside the room, from its top-left corner
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  rotation INTEGER NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  supprime_le TEXT
);

CREATE TABLE avatars (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents (id),
  silhouette TEXT NOT NULL DEFAULT 'moyenne' CHECK (silhouette IN ('petite', 'moyenne', 'grande')),
  calques TEXT NOT NULL DEFAULT '{}',
  couleurs TEXT NOT NULL DEFAULT '{}',
  personnalite TEXT NOT NULL DEFAULT 'bosseur',
  emploi_du_temps TEXT NOT NULL DEFAULT '{}',
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  supprime_le TEXT
);

CREATE TABLE budgets (
  fournisseur TEXT NOT NULL,
  -- Month as YYYY-MM
  mois TEXT NOT NULL,
  plafond REAL,
  depense REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (fournisseur, mois)
);

CREATE TABLE reglages (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL,
  modifie_le TEXT NOT NULL
);

-- Failed logins, used to limit the number of attempts per address.
CREATE TABLE tentatives_connexion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  horodatage TEXT NOT NULL
);

-- Single-use tokens that confirm a permanent deletion. Only a hash is stored.
CREATE TABLE jetons_confirmation (
  jeton_hash TEXT PRIMARY KEY,
  type_cible TEXT NOT NULL,
  id_cible TEXT NOT NULL,
  expire_le TEXT NOT NULL
);

CREATE INDEX idx_agents_parent ON agents (parent_id);
CREATE INDEX idx_agent_versions_agent ON agent_versions (agent_id, version);
CREATE INDEX idx_taches_mission ON taches (mission_id);
CREATE INDEX idx_taches_agent ON taches (agent_id);
CREATE INDEX idx_events_cible ON events (type_cible, id_cible);
CREATE INDEX idx_meubles_salle ON meubles (salle_id);
CREATE INDEX idx_avatars_agent ON avatars (agent_id);
CREATE INDEX idx_tentatives_ip ON tentatives_connexion (ip, horodatage);
