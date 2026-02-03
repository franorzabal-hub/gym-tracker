import { useState, useCallback, useSyncExternalStore } from "react";
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

// Widget state subscription for OpenAI host
function subscribeToWidgetState(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener("openai:set_globals", handler as EventListener);
  return () => window.removeEventListener("openai:set_globals", handler as EventListener);
}

/**
 * Hook to persist widget state across re-renders (OpenAI host).
 * Falls back to local React state for MCP Apps host.
 */
export function useWidgetState<T>(init: () => T): [T, (next: T | ((prev: T) => T)) => void] {
  const { hostType } = useAppContext();

  // For OpenAI host, use window.openai.widgetState
  const openAiState = useSyncExternalStore(
    subscribeToWidgetState,
    () => (window as any).openai?.widgetState ?? null
  );

  // Fallback for MCP Apps host (no persistence API)
  const [localState, setLocalState] = useState<T>(init);

  if (hostType === "openai") {
    const state = openAiState ?? init();
    const setState = (next: T | ((prev: T) => T)) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
      (window as any).openai?.setWidgetState?.(value);
    };
    return [state as T, setState];
  }

  return [localState, setLocalState];
}
