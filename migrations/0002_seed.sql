-- Bureau d'agents IA — initial data: rooms, agents, avatars, furniture, settings.
-- Everything here can be changed afterwards, by hand or by the chef.

-- Rooms (section 10), laid out side by side on the office grid ----------------
INSERT INTO salles (id, type, nom, position_x, position_y, largeur, profondeur, decor, cree_le, modifie_le) VALUES
  ('salle-bureau-chef', 'bureau',     'Bureau du chef',   0,  0,  8,  8, '{"sol":"parquet","murs":"platre"}',   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('salle-open-space',  'open_space', 'Open space',       9,  0, 14, 10, '{"sol":"parquet","murs":"platre"}',   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('salle-reunion',     'reunion',    'Salle de réunion', 24, 0, 10,  8, '{"sol":"moquette","murs":"platre"}',  '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('salle-cafeteria',   'cafeteria',  'Cafétéria',        0, 11, 12, 10, '{"sol":"carrelage","murs":"platre"}', '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('salle-pause',       'pause',      'Salle de pause',  13, 11, 10,  8, '{"sol":"moquette","murs":"platre"}',  '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('salle-jeux',        'jeux',       'Salle de jeux',   24, 11, 10, 10, '{"sol":"moquette","murs":"platre"}',  '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z');

-- Agents (section 4). Model names stay empty until they are set in the settings.
INSERT INTO agents (id, parent_id, fournisseur, modele, nom, fonction, accepte_prive, avatar_id, salle_bureau_id, cree_le, modifie_le) VALUES
  ('agent-chef',        NULL,               'claude',   NULL, 'Chef',        'Comprend la demande, découpe, délègue, vérifie, exécute le critique et le privé', 1, 'avatar-chef',        'salle-bureau-chef', '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('agent-redacteur',   NULL,               'gemini',   NULL, 'Rédacteur',   'Rédaction, communication, marketing, contenus en français',                       0, 'avatar-redacteur',   'salle-open-space',  '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('agent-chercheur',   NULL,               'gemini',   NULL, 'Chercheur',   'Recherche, synthèse de gros documents',                                           0, 'avatar-chercheur',   'salle-open-space',  '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('agent-technicien',  NULL,               'deepseek', NULL, 'Technicien',  'Code simple, tâches répétitives, renfort quand Gemini est saturé',                0, 'avatar-technicien',  'salle-open-space',  '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('agent-developpeur', 'agent-technicien', 'deepseek', NULL, 'Développeur', 'Génération et relecture de code',                                                 0, 'avatar-developpeur', 'salle-open-space',  '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z');

-- First version of each agent's role and instructions
INSERT INTO agent_versions (agent_id, version, fonction, consignes, auteur, cree_le)
SELECT id, 1, fonction, consignes, 'systeme', cree_le FROM agents;

-- One avatar per agent --------------------------------------------------------
INSERT INTO avatars (id, agent_id, silhouette, calques, couleurs, personnalite, cree_le, modifie_le) VALUES
  ('avatar-chef',        'agent-chef',        'grande',  '{"coiffure":"courte","haut":"veste","bas":"pantalon","chaussures":"ville","accessoires":["lunettes"]}', '{"peau":"#f2c9a0","cheveux":"#3a2a20","haut":"#34495e","bas":"#2c3e50","chaussures":"#2b2233"}', 'bosseur',  '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('avatar-redacteur',   'agent-redacteur',   'moyenne', '{"coiffure":"longue","haut":"chemise","bas":"pantalon","chaussures":"ville","accessoires":[]}',         '{"peau":"#e8b890","cheveux":"#8a4b2a","haut":"#d9534f","bas":"#3b4a7a","chaussures":"#2b2233"}', 'sociable', '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('avatar-chercheur',   'agent-chercheur',   'moyenne', '{"coiffure":"bouclee","haut":"pull","bas":"pantalon","chaussures":"baskets","accessoires":["lunettes"]}', '{"peau":"#c98e62","cheveux":"#1f1a17","haut":"#4f9a5a","bas":"#4a4a55","chaussures":"#e6e6e6"}', 'dormeur',  '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('avatar-technicien',  'agent-technicien',  'petite',  '{"coiffure":"courte","haut":"sweat","bas":"jean","chaussures":"baskets","accessoires":[]}',            '{"peau":"#f0d0b0","cheveux":"#d1a23c","haut":"#3f7f8f","bas":"#33415c","chaussures":"#c9584c"}', 'joueur',   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('avatar-developpeur', 'agent-developpeur', 'moyenne', '{"coiffure":"mi-longue","haut":"sweat","bas":"jean","chaussures":"baskets","accessoires":["casque"]}',  '{"peau":"#8d5a3c","cheveux":"#15110f","haut":"#7a4fa3","bas":"#2f3640","chaussures":"#2b2233"}', 'gourmand', '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z');

-- Furniture catalogue: every model has at least three shapes and three colours -
INSERT INTO catalogue_meubles (modele_id, categorie, nom, variantes, coloris, jauge_satisfaite, empreinte_largeur, empreinte_profondeur, bloquant) VALUES
  ('bureau-travail',  'bureau',    'Bureau',           '["droit","angle","assis-debout"]',       '["chene","blanc","noir"]',        NULL,             2, 1, 1),
  ('chaise-bureau',   'bureau',    'Chaise de bureau', '["classique","ergonomique","tabouret"]', '["bleu","gris","rouge"]',         NULL,             1, 1, 1),
  ('bibliotheque',    'bureau',    'Bibliothèque',     '["haute","basse","murale"]',             '["chene","blanc","noir"]',        NULL,             2, 1, 1),
  ('table-reunion',   'reunion',   'Table de réunion', '["ovale","rectangulaire","ronde"]',      '["chene","blanc","noir"]',        'social',         4, 2, 1),
  ('tableau-blanc',   'reunion',   'Tableau blanc',    '["mural","sur-pied","vitre"]',           '["blanc","noir","liege"]',        NULL,             2, 1, 1),
  ('comptoir',        'cafeteria', 'Comptoir',         '["droit","angle","ilot"]',               '["chene","blanc","noir"]',        'faim',           2, 1, 1),
  ('machine-cafe',    'cafeteria', 'Machine à café',   '["expresso","filtre","capsules"]',       '["noir","inox","rouge"]',         'faim',           1, 1, 1),
  ('table-cafeteria', 'cafeteria', 'Table',            '["carree","ronde","haute"]',             '["chene","blanc","noir"]',        'social',         2, 2, 1),
  ('canape',          'pause',     'Canapé',           '["deux-places","angle","meridienne"]',   '["bleu","gris","vert"]',          'energie',        2, 1, 1),
  ('lit',             'pause',     'Lit',              '["simple","superpose","futon"]',         '["chene","blanc","gris"]',        'energie',        1, 2, 1),
  ('borne-arcade',    'jeux',      'Borne d''arcade',  '["retro","moderne","flipper"]',          '["rouge","bleu","noir"]',         'divertissement', 1, 1, 1),
  ('baby-foot',       'jeux',      'Baby-foot',        '["classique","competition","mini"]',     '["chene","noir","vert"]',         'divertissement', 2, 1, 1),
  ('console-tv',      'jeux',      'Console et écran', '["salon","retro","murale"]',             '["noir","blanc","gris"]',         'divertissement', 2, 1, 1),
  ('lampadaire',      'deco',      'Lampadaire',       '["arc","trepied","colonne"]',            '["laiton","noir","blanc"]',       NULL,             1, 1, 1),
  ('plante',          'deco',      'Plante',           '["ficus","monstera","cactus"]',          '["terracotta","blanc","gris"]',   NULL,             1, 1, 1),
  ('tapis',           'deco',      'Tapis',            '["rectangle","rond","couloir"]',         '["rouge","bleu","beige"]',        NULL,             4, 3, 0);

-- A few pieces of furniture per room -----------------------------------------
INSERT INTO meubles (id, salle_id, modele_id, variante, coloris, x, y, rotation, cree_le, modifie_le) VALUES
  -- Bureau du chef
  ('meuble-001', 'salle-bureau-chef', 'bureau-travail', 'angle',       'chene',      3, 2, 0,   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-002', 'salle-bureau-chef', 'chaise-bureau',  'ergonomique', 'gris',       3, 3, 180, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-003', 'salle-bureau-chef', 'bibliotheque',   'haute',       'chene',      0, 0, 0,   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-004', 'salle-bureau-chef', 'plante',         'ficus',       'terracotta', 7, 0, 0,   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-005', 'salle-bureau-chef', 'lampadaire',     'arc',         'laiton',     0, 7, 0,   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  -- Open space: one desk and one chair per agent
  ('meuble-006', 'salle-open-space', 'bureau-travail', 'droit',     'chene', 1,  2, 0,   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-007', 'salle-open-space', 'chaise-bureau',  'classique', 'bleu',  1,  3, 180, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-008', 'salle-open-space', 'bureau-travail', 'droit',     'chene', 5,  2, 0,   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-009', 'salle-open-space', 'chaise-bureau',  'classique', 'bleu',  5,  3, 180, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-010', 'salle-open-space', 'bureau-travail', 'droit',     'chene', 9,  2, 0,   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-011', 'salle-open-space', 'chaise-bureau',  'classique', 'bleu',  9,  3, 180, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-012', 'salle-open-space', 'bureau-travail', 'droit',     'chene', 5,  6, 0,   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-013', 'salle-open-space', 'chaise-bureau',  'classique', 'bleu',  5,  7, 180, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-014', 'salle-open-space', 'plante',         'monstera',  'blanc', 13, 0, 0,   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-015', 'salle-open-space', 'lampadaire',     'trepied',   'noir',  0,  9, 0,   '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  -- Salle de réunion
  ('meuble-016', 'salle-reunion', 'table-reunion', 'ovale',  'chene',      3, 3, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-017', 'salle-reunion', 'tableau-blanc', 'mural',  'blanc',      4, 0, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-018', 'salle-reunion', 'plante',        'ficus',  'terracotta', 9, 0, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  -- Cafétéria
  ('meuble-019', 'salle-cafeteria', 'comptoir',        'droit',    'blanc', 1, 0, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-020', 'salle-cafeteria', 'machine-cafe',    'expresso', 'inox',  4, 0, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-021', 'salle-cafeteria', 'table-cafeteria', 'ronde',    'chene', 2, 4, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-022', 'salle-cafeteria', 'table-cafeteria', 'ronde',    'chene', 7, 4, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  -- Salle de pause
  ('meuble-023', 'salle-pause', 'lit',        'simple',      'chene', 0, 0, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-024', 'salle-pause', 'canape',     'deux-places', 'bleu',  4, 0, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-025', 'salle-pause', 'tapis',      'rectangle',   'beige', 3, 3, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-026', 'salle-pause', 'lampadaire', 'colonne',     'blanc', 9, 0, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  -- Salle de jeux
  ('meuble-027', 'salle-jeux', 'borne-arcade', 'retro',     'rouge', 0, 0, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-028', 'salle-jeux', 'borne-arcade', 'flipper',   'bleu',  1, 0, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-029', 'salle-jeux', 'console-tv',   'salon',     'noir',  6, 0, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-030', 'salle-jeux', 'canape',       'angle',     'gris',  6, 3, 180, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z'),
  ('meuble-031', 'salle-jeux', 'baby-foot',    'classique', 'chene', 2, 6, 0, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z');

-- Settings. Values are JSON. Budget caps stay empty until the user sets them.
INSERT INTO reglages (cle, valeur, modifie_le) VALUES
  ('nom_bureau',               '"Bureau"', '2026-11-16T00:00:00.000Z'),
  ('qualite_graphique',        '"auto"',   '2026-11-16T00:00:00.000Z'),
  ('theme',                    '"nuit"',   '2026-11-16T00:00:00.000Z'),
  ('prive_vers_deepseek',      'false',    '2026-11-16T00:00:00.000Z'),
  ('plafond_mensuel_deepseek', 'null',     '2026-11-16T00:00:00.000Z'),
  ('plafond_par_mission',      'null',     '2026-11-16T00:00:00.000Z');
