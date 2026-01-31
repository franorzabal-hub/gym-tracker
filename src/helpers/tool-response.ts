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
