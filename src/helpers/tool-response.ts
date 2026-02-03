import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Standard prefix injected into every tool description so the LLM
 * always has app context regardless of which tool it reads first.
 */
export const APP_CONTEXT = `[Gym Tracker — personal training assistant. The user talks naturally in Spanish or English.
MANDATORY: Call initialize_gym_session BEFORE responding to the user's FIRST message, no matter what they ask. You need the user context to give a proper answer. Never skip this step.
Data tools return JSON (no UI). Display tools (show_*) render visual widgets — do NOT repeat widget data in text.]

`;

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
 * - _meta: optional metadata (only visible to widget in OpenAI, ignored by MCP Apps)
 */
export function widgetResponse(
  llmNote: string,
  data: Record<string, unknown>,
  meta?: Record<string, unknown>,
) {
  return {
    content: [{ type: "text" as const, text: llmNote }],
    structuredContent: data,
    ...(meta ? { _meta: meta } : {}),
  };
}

/**
 * Register an MCP tool with both MCP Apps and OpenAI metadata.
 * Injects `openai/outputTemplate` and `openai/widgetAccessible` into _meta
 * based on the MCP Apps `ui.resourceUri` when present.
 */
export function registerAppToolWithMeta(
  server: McpServer,
  name: string,
  config: any,
  handler: (...args: any[]) => Promise<any>,
) {
  const mcpAppsUri: string | undefined = config._meta?.ui?.resourceUri;

  const enrichedConfig = {
    ...config,
    _meta: {
      ...config._meta,
      // Add OpenAI metadata if tool has a widget
      ...(mcpAppsUri ? {
        "openai/outputTemplate": mcpAppsUri.replace("ui://gym-tracker/", "ui://gym-tracker-oai/"),
        "openai/widgetAccessible": true,
      } : {}),
    },
  };

  return (registerAppTool as any)(server, name, enrichedConfig, handler);
}

/**
 * Classifies an error and returns a user-friendly message.
 * Helps users understand whether to retry, fix their input, or report a bug.
 */
function classifyError(err: unknown): { message: string; retryable: boolean } {
  if (!(err instanceof Error)) {
    return { message: "An unexpected error occurred. Please try again.", retryable: true };
  }

  const msg = err.message.toLowerCase();
  const code = (err as { code?: string }).code;

  // Database errors
  if (code === '23505') {
    return { message: "A duplicate entry already exists.", retryable: false };
  }
  if (code === '23503') {
    return { message: "Referenced record not found.", retryable: false };
  }
  if (code === '23502') {
    return { message: "Required field is missing.", retryable: false };
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return { message: "The operation timed out. Please try again.", retryable: true };
  }
  if (msg.includes('connection') || msg.includes('econnrefused') || msg.includes('enotfound')) {
    return { message: "Connection error. Please try again in a moment.", retryable: true };
  }

  // Validation errors
  if (msg.includes('invalid') || msg.includes('must be') || msg.includes('required')) {
    return { message: err.message, retryable: false };
  }

  // Default
  return { message: "Something went wrong. Please try again.", retryable: true };
}

/**
 * Wraps a tool handler with try/catch error handling.
 * On unexpected errors, returns a structured error response with actionable messages
 * instead of letting the error propagate to the MCP framework (which produces opaque errors).
 */
export function safeHandler<T>(
  toolName: string,
  handler: (params: T) => Promise<ReturnType<typeof toolResponse>>
): (params: T) => Promise<ReturnType<typeof toolResponse>> {
  return async (params: T) => {
    try {
      return await handler(params);
    } catch (err) {
      console.error(`[${toolName}] Unhandled error:`, err instanceof Error ? err.stack : err);
      const { message, retryable } = classifyError(err);
      return toolResponse({ error: message, retryable }, true);
    }
  };
}
