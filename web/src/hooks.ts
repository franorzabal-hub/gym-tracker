import { useState, useCallback } from "react";
import { useDocumentTheme } from "@modelcontextprotocol/ext-apps/react";
import { useAppContext } from "./app-context.js";

/** Hook to get the current tool output data */
export function useToolOutput<T = any>(): T | null {
  return useAppContext().toolOutput;
}

/** Hook to call a tool on the MCP server */
export function useCallTool() {
  const { app } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callTool = useCallback(
    async (name: string, args: Record<string, any> = {}) => {
      if (!app) return null;
      setLoading(true);
      setError(null);
      try {
        const result = await app.callServerTool({ name, arguments: args });
        if (result?.structuredContent) return result.structuredContent;
        const textContent = result?.content?.find(
          (c) => c.type === "text",
        );
        if (textContent && "text" in textContent) {
          try {
            return JSON.parse(textContent.text);
          } catch {
            return textContent.text;
          }
        }
        return result;
      } catch (err: any) {
        setError(err.message || "Unknown error");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [app],
  );

  return { callTool, loading, error };
}

/** Hook to get the current theme ("light" | "dark") */
export function useTheme(): "light" | "dark" {
  return useDocumentTheme();
}
