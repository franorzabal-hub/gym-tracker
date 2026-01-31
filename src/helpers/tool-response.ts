import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Build error tool responses: full JSON in content (model needs to see errors).
 */
export function toolResponse(data: Record<string, unknown>, isError?: boolean) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * Build widget tool responses: brief instruction for LLM, full data for widget.
 * - content: short message telling the LLM what was displayed (DO NOT repeat in response)
 * - structuredContent: full data the widget renders visually
 */
export function widgetResponse(llmNote: string, data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: llmNote }],
    structuredContent: data,
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
