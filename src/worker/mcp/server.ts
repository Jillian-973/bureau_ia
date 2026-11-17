/**
 * The chef's MCP server, served statelessly on `/mcp` (MCP 2026-07-28 with
 * the official SDK's `createMcpHandler`; 2025 clients get the stateless
 * fallback). A fresh server is built for every request.
 */
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { registerTools } from './tools';
import type { ToolEnvironment } from './tools';
import { SERVER_INSTRUCTIONS } from './trigger';

export const SERVER_VERSION = '0.2.0';

export function createBureauServer(tools: ToolEnvironment): McpServer {
  const server = new McpServer(
    { name: 'bureau', title: "Bureau d'agents IA", version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerTools(server, tools);

  // "/bureau" as a command, for clients that show prompts as commands (level 4).
  server.registerPrompt(
    'bureau',
    {
      title: 'Bureau',
      description: "Utiliser le bureau d'agents : seul, ouvre la vue du bureau ; avec une demande, la traite.",
      argsSchema: z.object({
        demande: z.string().optional().describe('Ce que le bureau doit faire. Vide : afficher le bureau.'),
      }),
    },
    ({ demande }) => ({
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: demande?.trim() ? `/bureau ${demande.trim()}` : '/bureau' },
        },
      ],
    }),
  );

  return server;
}

/** Handler of `/mcp`, behind OAuth: the caller has already checked the access token. */
export const mcpApiHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = new URL(request.url).origin;
    const handler = createMcpHandler(() => createBureauServer({ env, origin }), {
      onerror: (error) => console.error('MCP request failed', error),
    });
    return handler.fetch(request);
  },
} satisfies ExportedHandler<Env>;
