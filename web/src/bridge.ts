import { App } from "@modelcontextprotocol/ext-apps";

export interface HostBridge {
  /** Get the tool output data from the host */
  getToolOutput(): any;
  /** Call a tool on the MCP server */
  callTool(name: string, args: Record<string, any>): Promise<any>;
  /** Get the current theme */
  getTheme(): "light" | "dark";
  /** Register a callback for when tool results arrive */
  onToolResult(cb: (data: any) => void): void;
  /** Get the user's locale */
  getLocale(): string;
  /** Which host runtime we're in */
  host: "openai" | "mcp-apps" | "unknown";
}

declare global {
  interface Window {
    openai?: {
      toolOutput?: any;
      toolInput?: any;
      toolResponseMetadata?: any;
      theme?: "light" | "dark";
      locale?: string;
      callTool(name: string, args: Record<string, any>): Promise<any>;
      sendFollowUpMessage(opts: { message: string; hidden?: boolean }): Promise<void>;
      requestDisplayMode(opts: { mode: string }): void;
      notifyIntrinsicHeight(height: number): void;
      setWidgetState(state: any): void;
      widgetState?: any;
    };
  }
}

function createOpenAiBridge(): HostBridge {
  const openai = window.openai!;
  return {
    host: "openai",
    getToolOutput: () => openai.toolOutput,
    callTool: (name, args) => openai.callTool(name, args),
    getTheme: () => openai.theme ?? "light",
    getLocale: () => openai.locale ?? "en",
    onToolResult: (cb) => {
      // OpenAI pushes toolOutput reactively - call immediately if available
      if (openai.toolOutput) cb(openai.toolOutput);
      // Listen for updates
      window.addEventListener("openai:set_globals", ((event: CustomEvent) => {
        if (event.detail?.globals?.toolOutput !== undefined) {
          cb(event.detail.globals.toolOutput);
        }
      }) as EventListener);
    },
  };
}

function createMcpAppsBridge(): HostBridge {
  const app = new App({ name: "Gym Tracker", version: "1.0.0" });
  let latestResult: any = null;
  const listeners: Array<(data: any) => void> = [];

  app.ontoolresult = (result: any) => {
    // Extract text content and parse JSON
    const textContent = result.content?.find((c: any) => c.type === "text");
    const data = textContent?.text ? JSON.parse(textContent.text) : result.structuredContent ?? result;
    latestResult = data;
    listeners.forEach((cb) => cb(data));
  };

  app.connect();

  return {
    host: "mcp-apps",
    getToolOutput: () => latestResult,
    callTool: async (name, args) => {
      const result = await app.callServerTool({ name, arguments: args });
      const textContent = (result as any).content?.find((c: any) => c.type === "text");
      return textContent?.text ? JSON.parse(textContent.text) : result;
    },
    getTheme: () => "light", // MCP Apps theme detection handled differently
    getLocale: () => navigator.language || "en",
    onToolResult: (cb) => {
      listeners.push(cb);
      if (latestResult) cb(latestResult);
    },
  };
}

function createFallbackBridge(): HostBridge {
  return {
    host: "unknown",
    getToolOutput: () => null,
    callTool: async () => ({ error: "No host detected" }),
    getTheme: () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    getLocale: () => navigator.language || "en",
    onToolResult: () => {},
  };
}

/** Detect host and create the appropriate bridge */
export function createBridge(): HostBridge {
  // OpenAI (ChatGPT) - window.openai is injected by the host
  if (typeof window !== "undefined" && window.openai) {
    return createOpenAiBridge();
  }

  // MCP Apps (Claude, VS Code) - no window.openai, use App class
  // We check that we're in an iframe (MCP Apps renders in iframe)
  if (typeof window !== "undefined" && window.parent !== window) {
    return createMcpAppsBridge();
  }

  // Fallback for development/testing
  return createFallbackBridge();
}

/** Singleton bridge instance */
export const bridge = createBridge();
