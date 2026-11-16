/** Small helpers shared by every HTTP route of the Worker. */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

/** JSON response. API answers are never cached: they depend on the session. */
export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, 'cache-control': 'no-store', ...init.headers },
  });
}

/** Machine-readable error code plus a message in French, shown to the user as is. */
export function jsonError(status: number, code: string, message: string, details?: unknown): Response {
  return json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}
