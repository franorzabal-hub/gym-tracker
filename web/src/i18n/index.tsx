/**
 * Internationalization (i18n) system for gym-tracker widgets.
 * Lightweight implementation without external dependencies.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Locale, Translations, TFunction, I18nContextValue, InterpolationValues } from "./types.js";
import { en } from "./locales/en.js";
import { es } from "./locales/es.js";

// ── Locales registry ──

const locales: Record<Locale, Translations> = { en, es };

// ── Translation function factory ──

/**
 * Get a nested value from an object using dot notation.
 * Example: getNestedValue(obj, "profile.title") → obj.profile.title
 */
function getNestedValue(obj: any, path: string): string | undefined {
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Interpolate values into a translation string.
 * Supports: {name}, {count} (for pluralization)
 * Pluralization format: "1 item | {count} items" (pipe-separated)
 */
function interpolate(text: string, values?: InterpolationValues): string {
  if (!values) return text;

  // Handle pluralization: "singular | plural" format
  if (text.includes(" | ") && "count" in values) {
    const count = Number(values.count);
    const [singular, plural] = text.split(" | ");
    text = count === 1 ? singular : plural;
  }

  // Replace {key} with values
  return text.replace(/\{(\w+)\}/g, (_, key) => {
    return values[key] != null ? String(values[key]) : `{${key}}`;
  });
}

/**
 * Create a translation function for a specific locale.
 */
export function createT(locale: Locale): TFunction {
  const translations = locales[locale] || locales.en;

  return (key: string, values?: InterpolationValues): string => {
    const text = getNestedValue(translations, key);
    if (text == null) {
      // Fallback to English, then to key itself
      const fallback = getNestedValue(locales.en, key);
      if (fallback != null) return interpolate(fallback, values);
      console.warn(`[i18n] Missing translation: ${key}`);
      return key;
    }
    return interpolate(text, values);
  };
}

// ── React Context ──

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  t: createT("en"),
  setLocale: () => {},
});

// ── Provider ──

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale = "en" }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Sync locale when initialLocale prop changes (e.g., from server response)
  useEffect(() => {
    setLocaleState(initialLocale);
  }, [initialLocale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
  }, []);

  const t = useCallback(
    (key: string, values?: InterpolationValues) => createT(locale)(key, values),
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

// ── Hook ──

/**
 * Hook to access i18n context.
 * Returns { locale, t, setLocale }
 */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

// ── Exports ──

export type { Locale, Translations, TFunction, I18nContextValue };
