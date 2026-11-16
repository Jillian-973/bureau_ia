import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const count = async (table: string, where = '1 = 1') =>
  (await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`).first<{ total: number }>())
    ?.total;

describe('database migrations and initial data', () => {
  it('creates the five agents, the chef included', async () => {
    expect(await count('agents')).toBe(5);
    expect(await count('agents', "fournisseur = 'claude'")).toBe(1);
    expect(await count('agents', "fournisseur = 'gemini'")).toBe(2);
    expect(await count('agents', "fournisseur = 'deepseek'")).toBe(2);
  });

  it('makes the developer a sub-agent of the technician, on the same provider', async () => {
    const row = await env.DB.prepare(
      `SELECT child.fournisseur AS child, parent.fournisseur AS parent, parent.id AS parent_id
       FROM agents child JOIN agents parent ON parent.id = child.parent_id
       WHERE child.id = 'agent-developpeur'`,
    ).first();
    expect(row).toEqual({ child: 'deepseek', parent: 'deepseek', parent_id: 'agent-technicien' });
  });

  it('never lets a free-tier Gemini agent accept private tasks', async () => {
    expect(await count('agents', "fournisseur = 'gemini' AND accepte_prive = 1")).toBe(0);
  });

  it('gives every agent a first version and an avatar', async () => {
    expect(await count('agent_versions', 'version = 1')).toBe(5);
    expect(await count('avatars')).toBe(5);
    expect(
      await count('agents', 'avatar_id NOT IN (SELECT id FROM avatars WHERE agent_id = agents.id)'),
    ).toBe(0);
  });

  it('creates every room type of the specification', async () => {
    const { results } = await env.DB.prepare('SELECT type FROM salles ORDER BY type').all<{ type: string }>();
    expect(results.map((row) => row.type)).toEqual([
      'bureau',
      'cafeteria',
      'jeux',
      'open_space',
      'pause',
      'reunion',
    ]);
  });

  it('puts some furniture in every room, inside its walls', async () => {
    expect(await count('salles', 'id NOT IN (SELECT salle_id FROM meubles)')).toBe(0);
    expect(
      await count(
        'meubles JOIN salles ON salles.id = meubles.salle_id',
        'meubles.x < 0 OR meubles.y < 0 OR meubles.x >= salles.largeur OR meubles.y >= salles.profondeur',
      ),
    ).toBe(0);
  });

  it('offers at least three shapes and three colours per furniture model', async () => {
    expect(
      await count('catalogue_meubles', 'json_array_length(variantes) < 3 OR json_array_length(coloris) < 3'),
    ).toBe(0);
  });

  it('only uses shapes and colours that exist in the catalogue', async () => {
    expect(
      await count(
        'meubles JOIN catalogue_meubles c ON c.modele_id = meubles.modele_id',
        `NOT EXISTS (SELECT 1 FROM json_each(c.variantes) WHERE value = meubles.variante)
         OR NOT EXISTS (SELECT 1 FROM json_each(c.coloris) WHERE value = meubles.coloris)`,
      ),
    ).toBe(0);
  });

  it('enforces foreign keys', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO meubles (id, salle_id, modele_id, variante, coloris, x, y, cree_le, modifie_le)
         VALUES ('meuble-x', 'salle-inconnue', 'plante', 'ficus', 'blanc', 0, 0, 'now', 'now')`,
      ).run(),
    ).rejects.toThrow();
  });
});
