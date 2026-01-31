import { useState, useEffect, useCallback } from "react";
import { bridge } from "./bridge.js";

/** Hook to get the current tool output data, updates when new data arrives */
export function useToolOutput<T = any>(): T | null {
  const [data, setData] = useState<T | null>(() => bridge.getToolOutput());

  useEffect(() => {
    bridge.onToolResult((newData) => setData(newData));
  }, []);

  return data;
}

/** Hook to call a tool and get the result */
export function useCallTool() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callTool = useCallback(async (name: string, args: Record<string, any> = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await bridge.callTool(name, args);
      if (result?.error) setError(result.error);
      return result;
    } catch (err: any) {
      setError(err.message || "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { callTool, loading, error };
}

/** Hook to get the current theme */
export function useTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(bridge.getTheme());

  useEffect(() => {
    if (bridge.host === "openai") {
      const handler = ((event: CustomEvent) => {
        if (event.detail?.globals?.theme) {
          setTheme(event.detail.globals.theme);
        }
      }) as EventListener;
      window.addEventListener("openai:set_globals", handler);
      return () => window.removeEventListener("openai:set_globals", handler);
    }
  }, []);

  return theme;
}
