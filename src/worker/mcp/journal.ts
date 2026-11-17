import type { Trigger } from '../../shared/schemas/events';

export interface ToolCallRecord {
  outil: string;
  declencheur: Trigger;
  succes: boolean;
  erreur?: string;
  dureeMs: number;
}

/** Records one tool call with its trigger. A failure to record never fails the call. */
export async function recordToolCall(db: D1Database, call: ToolCallRecord, now = new Date()): Promise<void> {
  try {
    await db
      .prepare(
        'INSERT INTO appels_mcp (horodatage, outil, declencheur, succes, erreur, duree_ms) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(
        now.toISOString(),
        call.outil,
        call.declencheur,
        call.succes ? 1 : 0,
        call.erreur?.slice(0, 500) ?? null,
        Math.round(call.dureeMs),
      )
      .run();
  } catch (error) {
    console.error('Could not record the tool call', error);
  }
}
