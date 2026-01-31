import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Build tool responses: content text (for model narration) + optional isError.
 */
export function toolResponse(data: Record<string, unknown>, isError?: boolean) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * Register an MCP tool that automatically injects `_meta["ui/resourceUri"]`
 * into every tool result so hosts know which widget to render.
 */
export function registerAppToolWithMeta(
  server: McpServer,
  name: string,
  config: any,
  handler: (...args: any[]) => Promise<any>,
) {
  return (registerAppTool as any)(server, name, config, handler);
}
