import { json } from './http';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') return json({ ok: true });

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
