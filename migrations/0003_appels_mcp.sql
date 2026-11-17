-- Journal of the chef's tool calls (section 5, "Déclenchement", level 2):
-- every call is recorded with its trigger word, whether it changed something or not.
CREATE TABLE appels_mcp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  horodatage TEXT NOT NULL,
  outil TEXT NOT NULL,
  declencheur TEXT NOT NULL CHECK (declencheur IN ('@bureau', '/bureau')),
  succes INTEGER NOT NULL CHECK (succes IN (0, 1)),
  -- Short French error message when the call failed
  erreur TEXT,
  duree_ms INTEGER NOT NULL
);

CREATE INDEX idx_appels_mcp_horodatage ON appels_mcp (horodatage);
