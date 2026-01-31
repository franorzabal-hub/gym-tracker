import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Helper to build tool responses compatible with both MCP Apps and OpenAI Apps SDK.
 * Returns structuredContent (for widgets) + content text (for model narration).
 */
export function toolResponse(data: Record<string, unknown>, isError?: boolean) {
  return {
    structuredContent: data,
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
  const resourceUri =
    config._meta?.ui?.resourceUri ??
    config._meta?.["ui/resourceUri"];

  const wrappedHandler = async (...args: any[]) => {
    const result = await handler(...args);
    if (resourceUri && result && !result._meta) {
      result._meta = { "ui/resourceUri": resourceUri };
    }
    return result;
  };

  return (registerAppTool as any)(server, name, config, wrappedHandler);
}
