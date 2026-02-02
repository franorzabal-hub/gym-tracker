import {
  createContext,
  useContext,
  useState,
  useEffect,
  useSyncExternalStore,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import {
  useApp,
  useHostStyles,
  useDocumentTheme,
  type App,
} from "@modelcontextprotocol/ext-apps/react";
import type {} from "./types/openai.js";

// ---------------------------------------------------------------------------
// Shared context shape
// ---------------------------------------------------------------------------

export type HostType = "mcp-apps" | "openai";

export interface AppContextValue {
  app: App | null;
  isConnected: boolean;
  error: Error | null;
  toolOutput: any;
  hostType: HostType;
  callTool: (name: string, args: Record<string, any>) => Promise<any>;
  theme: "light" | "dark";
}

const AppContext = createContext<AppContextValue>({
  app: null,
  isConnected: false,
  error: null,
  toolOutput: null,
  hostType: "mcp-apps",
  callTool: async () => null,
  theme: "light",
});

// ---------------------------------------------------------------------------
// Host detection
// ---------------------------------------------------------------------------

function detectHost(): HostType {
  if (typeof window !== "undefined" && window.openai != null) {
    return "openai";
  }
  return "mcp-apps";
}

// ---------------------------------------------------------------------------
// Parse tool content (shared)
// ---------------------------------------------------------------------------

function parseToolContent(result: any): any {
  if (result?.structuredContent) {
    return result.structuredContent;
  }
  const textContent = result?.content?.find((c: any) => c.type === "text");
  if (textContent?.text) {
    try {
      return JSON.parse(textContent.text);
    } catch {
      return textContent.text;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// MCP Apps Provider (existing behavior, extracted)
// ---------------------------------------------------------------------------

function McpAppsProvider({ children }: { children: ReactNode }) {
  const [toolOutput, setToolOutput] = useState<any>(null);

  const { app, isConnected, error } = useApp({
    appInfo: { name: "Gym Tracker", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = (params) => setToolOutput(parseToolContent(params));
    },
  });

  useHostStyles(app, isConnected ? app?.getHostContext() : null);
  const theme = useDocumentTheme();

  const callTool = useCallback(
    async (name: string, args: Record<string, any> = {}) => {
      if (!app) return null;
      const result = await app.callServerTool({ name, arguments: args });
      return parseToolContent(result);
    },
    [app],
  );

  return (
    <AppContext.Provider
      value={{ app, isConnected, error, toolOutput, hostType: "mcp-apps", callTool, theme }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// OpenAI Provider
// ---------------------------------------------------------------------------

function subscribeToOpenAi(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener("openai:set_globals", handler as EventListener);
  return () => window.removeEventListener("openai:set_globals", handler as EventListener);
}

function getOpenAiToolOutput() {
  return window.openai?.toolOutput ?? null;
}

function getOpenAiTheme(): "light" | "dark" {
  return window.openai?.theme ?? "light";
}

function OpenAiProvider({ children }: { children: ReactNode }) {
  const toolOutput = useSyncExternalStore(subscribeToOpenAi, getOpenAiToolOutput);
  const theme = useSyncExternalStore(subscribeToOpenAi, getOpenAiTheme);

  // Apply color-scheme to document
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Auto-resize via ResizeObserver → notifyIntrinsicHeight
  const observerRef = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (!window.openai?.notifyIntrinsicHeight) return;

    const notify = window.openai.notifyIntrinsicHeight.bind(window.openai);
    observerRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        notify(Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.scrollHeight));
      }
    });
    observerRef.current.observe(document.body);
    return () => observerRef.current?.disconnect();
  }, []);

  const callTool = useCallback(
    async (name: string, args: Record<string, any> = {}) => {
      if (!window.openai?.callTool) return null;
      const result = await window.openai.callTool(name, args);
      return parseToolContent(result);
    },
    [],
  );

  return (
    <AppContext.Provider
      value={{
        app: null,
        isConnected: true,
        error: null,
        toolOutput,
        hostType: "openai",
        callTool,
        theme,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Public AppProvider — delegates to the right provider
// ---------------------------------------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const hostType = detectHost();
  if (hostType === "openai") {
    return <OpenAiProvider>{children}</OpenAiProvider>;
  }
  return <McpAppsProvider>{children}</McpAppsProvider>;
}

export function useAppContext() {
  return useContext(AppContext);
}
