import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Two builds of the same application:
 * - default: the Worker (`dist/bureau/`) and the web page (`dist/client/`),
 *   run together by the Cloudflare plugin;
 * - `--mode mcp-app`: one self-contained HTML file in `dist/client/mcp-app/`,
 *   as required to display the office inside the Claude chat (MCP App). The
 *   sandbox there blocks every external request, so scripts and styles must
 *   be inlined.
 */
export default defineConfig(({ mode }) => {
  const isMcpApp = mode === 'mcp-app';
  return {
    plugins: [react(), ...(isMcpApp ? [viteSingleFile()] : [cloudflare()])],
    // The MCP App build is a single file: it must not copy the public folder again.
    publicDir: isMcpApp ? false : 'public',
    build: {
      ...(isMcpApp ? { outDir: 'dist/client/mcp-app', emptyOutDir: false } : {}),
      // The minifier must keep class and function names: without them the
      // post-processing effects render nothing in the production build.
      rolldownOptions: {
        output: {
          minify: {
            mangle: { keepNames: true },
            compress: { keepNames: { function: true, class: true } },
          },
        },
      },
    },
  };
});
