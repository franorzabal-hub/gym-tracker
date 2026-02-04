/**
 * Formatting utilities for dates and numbers.
 * Locale-aware formatting based on i18n context.
 */

import { useMemo } from "react";
import { useI18n } from "./index.js";
import type { Locale } from "./types.js";

// ── Locale mappings ──

const DATE_LOCALES: Record<Locale, string> = {
  en: "en-US",
  es: "es-ES",
};

// ── Formatters hook ──

export interface Formatters {
  /** Format date as "Feb 3" or "3 feb" */
  formatShortDate: (dateStr: string) => string;
  /** Format date as "Feb 3, 2024" or "3 feb 2024" */
  formatDate: (dateStr: string) => string;
  /** Format date as "Monday" or "lunes" */
  formatWeekday: (dateStr: string) => string;
  /** Format duration in minutes as "45 min" or "1h 30m" */
  formatDuration: (minutes: number) => string;
  /** Format large numbers as "10k" or "1.2k" */
  formatLargeNumber: (value: number) => string;
  /** Format weight with unit "80kg" */
  formatWeight: (value: number) => string;
}

export function useFormatters(): Formatters {
  const { locale, t } = useI18n();
  const dateLocale = DATE_LOCALES[locale];

  return useMemo(() => ({
    formatShortDate: (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString(dateLocale, {
        month: "short",
        day: "numeric",
      });
    },

    formatDate: (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString(dateLocale, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    },

    formatWeekday: (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString(dateLocale, {
        weekday: "long",
      });
    },

    formatDuration: (minutes: number) => {
      if (minutes <= 0) return `< 1 ${t("common.min")}`;
      if (minutes < 60) return `${minutes} ${t("common.min")}`;
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    },

    formatLargeNumber: (v: number) => {
      if (v >= 10000) return `${(v / 1000).toFixed(0)}k`;
      if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
      return v % 1 === 0 ? v.toString() : v.toFixed(1);
    },

    formatWeight: (value: number) => {
      return `${value}${t("common.kg")}`;
    },
  }), [dateLocale, t]);
}

// ── Standalone formatters (for use outside React) ──

export function formatShortDateStandalone(dateStr: string, locale: Locale = "en"): string {
  return new Date(dateStr).toLocaleDateString(DATE_LOCALES[locale], {
    month: "short",
    day: "numeric",
  });
}

export function formatDateStandalone(dateStr: string, locale: Locale = "en"): string {
  return new Date(dateStr).toLocaleDateString(DATE_LOCALES[locale], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
