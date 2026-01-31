import { createContext, useContext, useState, type ReactNode } from "react";
import {
  useApp,
  useHostStyles,
  type App,
} from "@modelcontextprotocol/ext-apps/react";

interface AppContextValue {
  app: App | null;
  isConnected: boolean;
  error: Error | null;
  toolOutput: any;
}

const AppContext = createContext<AppContextValue>({
  app: null,
  isConnected: false,
  error: null,
  toolOutput: null,
});

function parseToolContent(result: any): any {
  const textContent = result?.content?.find((c: any) => c.type === "text");
  if (textContent?.text) {
    try {
      return JSON.parse(textContent.text);
    } catch {
      return textContent.text;
    }
  }
  return result?.structuredContent ?? result;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [toolOutput, setToolOutput] = useState<any>(null);

  const { app, isConnected, error } = useApp({
    appInfo: { name: "Gym Tracker", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = (params) => setToolOutput(parseToolContent(params));
    },
  });

  useHostStyles(app, isConnected ? app?.getHostContext() : null);

  return (
    <AppContext.Provider value={{ app, isConnected, error, toolOutput }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
