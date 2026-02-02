import { useState, useCallback } from "react";
import { useAppContext, type HostType } from "./app-context.js";

/** Hook to get the current tool output data */
export function useToolOutput<T = any>(): T | null {
  return useAppContext().toolOutput;
}

/** Hook to call a tool on the MCP server (works in both MCP Apps and OpenAI hosts) */
export function useCallTool() {
  const { callTool: contextCallTool } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callTool = useCallback(
    async (name: string, args: Record<string, any> = {}) => {
      setLoading(true);
      setError(null);
      try {
        return await contextCallTool(name, args);
      } catch (err: any) {
        setError(err.message || "Unknown error");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [contextCallTool],
  );

  return { callTool, loading, error };
}

/** Hook to get the current theme ("light" | "dark") */
export function useTheme(): "light" | "dark" {
  return useAppContext().theme;
}

/** Hook to get the current host type ("mcp-apps" | "openai") */
export function useHostType(): HostType {
  return useAppContext().hostType;
}
