/**
 * The event journal. Every change made in the office writes one event, which
 * feeds the history, the real-time feed and the undo.
 */
import { z } from 'zod';
import type { ElementRecord } from './elements';

/** Who made a change: the user by hand, the chef (Claude), an agent or the system. */
export const AUTHORS = ['utilisateur', 'chef', 'agent', 'systeme'] as const;
export type Author = (typeof AUTHORS)[number];

export const EVENT_TYPES = [
  'creation',
  'modification',
  'suppression',
  'restauration',
  'suppression_definitive',
  'annulation',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** The two words that allow the chef to use the office (section 5). */
export const TRIGGERS = ['@bureau', '/bureau'] as const;
export const triggerSchema = z.enum(TRIGGERS);
export type Trigger = (typeof TRIGGERS)[number];

export interface BureauEvent {
  id: number;
  horodatage: string;
  auteur: Author;
  /** Agent id when the author is an agent. */
  auteur_id: string | null;
  type: EventType;
  type_cible: string;
  id_cible: string;
  /**
   * Changed fields before and after. A creation has no `avant`; a permanent
   * deletion has no `apres`.
   */
  avant: ElementRecord | null;
  apres: ElementRecord | null;
  declencheur: Trigger | null;
  /** Id of the event that undid this one, if any. */
  annule_par: number | null;
}

/** Messages pushed to connected clients over the WebSocket. */
export type RealtimeMessage =
  | { type: 'bienvenue'; dernier_evenement_id: number }
  | { type: 'evenement'; evenement: BureauEvent };
