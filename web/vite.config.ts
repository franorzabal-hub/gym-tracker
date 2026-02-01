import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";
import { readdirSync } from "fs";

// Discover all HTML entry points in the project root
const htmlFiles = readdirSync(__dirname).filter((f) => f.endsWith(".html"));

// Build a single widget at a time via WIDGET env var, or default to first.
// The build script loops over all widgets.
const widget = process.env.WIDGET;

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Only inline assets for production builds — viteSingleFile breaks Vite HMR
    ...(command === "build" ? [viteSingleFile()] : []),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: widget
        ? resolve(__dirname, widget)
        : resolve(__dirname, htmlFiles[0]),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/mcp": "http://localhost:3001",
    },
  },
}));
