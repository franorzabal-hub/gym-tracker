/**
 * Type declarations for the OpenAI Apps SDK runtime (`window.openai`).
 * Available when a widget is rendered inside ChatGPT's sandboxed iframe.
 */

interface OpenAiCallToolResult {
  structuredContent?: unknown;
  content?: Array<{ type: string; text: string }>;
  _meta?: Record<string, unknown>;
}

interface OpenAiSendFollowUpOptions {
  message: string;
  hidden?: boolean;
}

interface OpenAiDisplayModeOptions {
  mode: "inline" | "pip" | "fullscreen";
}

interface OpenAiSafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface OpenAiGlobals {
  // Data properties
  toolOutput: unknown;
  toolInput: Record<string, unknown>;
  toolResponseMetadata: Record<string, unknown> | null;
  widgetState: unknown;

  // Context signals
  theme: "light" | "dark";
  locale: string;
  displayMode: "inline" | "pip" | "fullscreen";
  maxHeight: number;
  safeArea: OpenAiSafeArea;
  userAgent: string;
  view: string;

  // Actions
  callTool(name: string, args: Record<string, unknown>): Promise<OpenAiCallToolResult>;
  sendFollowUpMessage(options: OpenAiSendFollowUpOptions): Promise<void>;
  notifyIntrinsicHeight(height: number): void;
  setWidgetState(state: unknown): void;
  requestDisplayMode(options: OpenAiDisplayModeOptions): void;
  openExternal(url: string, options?: { openInSameTab?: boolean; shouldRequestRedirectUrl?: boolean }): void;
  uploadFile(file: File): Promise<{ fileId: string }>;
  getFileDownloadUrl(fileId: string): Promise<string>;
}

interface OpenAiSetGlobalsEvent extends CustomEvent {
  detail: { globals: Partial<OpenAiGlobals> };
}

declare global {
  interface Window {
    openai?: OpenAiGlobals;
  }
  interface WindowEventMap {
    "openai:set_globals": OpenAiSetGlobalsEvent;
  }
}

export {};
