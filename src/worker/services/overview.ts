/**
 * Read-only summaries shared by the chef's tools and the web page: the state
 * of the office at a glance, and the spending of the month.
 */
import type { ElementRecord } from '../../shared/schemas/elements';
import type { ServiceContext } from './context';
import { listElements, readElement } from './elements';

const PARIS_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' });

/** Current month on Paris time, as `YYYY-MM`. */
export function parisMonth(date: Date): string {
  return PARIS_MONTH.format(date).slice(0, 7);
}

export interface OfficeOverview {
  nom_bureau: unknown;
  agents: ElementRecord[];
  missions_ouvertes: ElementRecord[];
  salles: ElementRecord[];
}

export async function getOfficeOverview(ctx: ServiceContext): Promise<OfficeOverview> {
  const [nom, agents, missions, salles, counts] = await Promise.all([
    readElement(ctx, 'reglage', 'nom_bureau'),
    listElements(ctx, 'agent'),
    listElements(ctx, 'mission', { filters: { statut: 'ouverte' } }),
    listElements(ctx, 'salle'),
    ctx.db
      .prepare(
        `SELECT mission_id, COUNT(*) AS total, SUM(statut IN ('terminee', 'echouee')) AS finies
         FROM taches WHERE supprime_le IS NULL GROUP BY mission_id`,
      )
      .all<{ mission_id: string; total: number; finies: number }>(),
  ]);
  const tasksByMission = new Map(counts.results.map((row) => [row.mission_id, row]));
  const roomNames = new Map(salles.map((room) => [room.id, room.nom]));

  return {
    nom_bureau: nom.valeur,
    agents: agents.map((agent) => ({
      id: agent.id,
      nom: agent.nom,
      pseudo: agent.pseudo,
      fournisseur: agent.fournisseur,
      statut: agent.statut,
      parent_id: agent.parent_id,
      salle: agent.salle_bureau_id ? roomNames.get(agent.salle_bureau_id) : null,
    })),
    missions_ouvertes: missions.map((mission) => {
      const tasks = tasksByMission.get(String(mission.id));
      return {
        id: mission.id,
        titre: mission.titre,
        type: mission.type,
        taches: tasks ? `${tasks.finies}/${tasks.total}` : '0/0',
      };
    }),
    salles: salles.map((room) => ({ id: room.id, type: room.type, nom: room.nom })),
  };
}

export interface ProviderSpending {
  fournisseur: string;
  depense: number;
  plafond: number | null;
  restant: number | null;
}

export interface BudgetState {
  mois: string;
  fournisseurs: ProviderSpending[];
  plafond_par_mission: number | null;
}

const PAID_PROVIDERS = ['deepseek', 'gemini'] as const;

/**
 * Spending of the month per provider, from the costs recorded on tasks, with
 * the monthly cap of the settings (DeepSeek) or of the `budgets` table.
 */
export async function getBudgetState(ctx: ServiceContext): Promise<BudgetState> {
  const mois = parisMonth(ctx.now());
  const [spent, budgets, monthlyCap, missionCap] = await Promise.all([
    ctx.db
      .prepare(
        `SELECT agents.fournisseur AS fournisseur, COALESCE(SUM(taches.cout), 0) AS depense
         FROM taches JOIN agents ON agents.id = taches.agent_id
         WHERE taches.cree_le >= ? GROUP BY agents.fournisseur`,
      )
      .bind(`${mois}-01`)
      .all<{ fournisseur: string; depense: number }>(),
    ctx.db.prepare('SELECT fournisseur, plafond FROM budgets WHERE mois = ?').bind(mois).all<{
      fournisseur: string;
      plafond: number | null;
    }>(),
    readElement(ctx, 'reglage', 'plafond_mensuel_deepseek'),
    readElement(ctx, 'reglage', 'plafond_par_mission'),
  ]);

  const spentBy = new Map(spent.results.map((row) => [row.fournisseur, row.depense]));
  const capBy = new Map(budgets.results.map((row) => [row.fournisseur, row.plafond]));
  if (typeof monthlyCap.valeur === 'number') capBy.set('deepseek', monthlyCap.valeur);

  return {
    mois,
    fournisseurs: PAID_PROVIDERS.map((fournisseur) => {
      const depense = Math.round((spentBy.get(fournisseur) ?? 0) * 10_000) / 10_000;
      const plafond = capBy.get(fournisseur) ?? null;
      return {
        fournisseur,
        depense,
        plafond,
        restant: plafond === null ? null : Math.max(0, Math.round((plafond - depense) * 10_000) / 10_000),
      };
    }),
    plafond_par_mission: typeof missionCap.valeur === 'number' ? missionCap.valeur : null,
  };
}
