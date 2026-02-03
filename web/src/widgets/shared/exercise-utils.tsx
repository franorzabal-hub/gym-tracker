/**
 * Shared utilities for exercise display across widgets.
 * Used by: program-view.tsx, workout.tsx
 * Note: program-editor.tsx is scheduled for removal - don't update it.
 */

import { font } from "../../tokens.js";

// ── Constants ──

export const REP_UNIT: Record<string, string> = {
  reps: "r",
  seconds: "s",
  meters: "m",
  calories: "cal",
};

export const GROUP_LABELS: Record<string, string> = {
  superset: "Superset",
  paired: "Paired",
  circuit: "Circuit",
};

// ── Helpers ──

export function formatRestSeconds(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}′${s}″` : `${m}′`;
  }
  return `${seconds}″`;
}

/** Format per-set reps as compact string: "12/10/8" */
export function formatPerSetReps(repsPerSet: number[]): string {
  return repsPerSet.join("/");
}

/** Format per-set reps as min-max range: "8-12" (compact, like workout summary) */
export function formatRepsRange(repsPerSet: number[]): string {
  if (repsPerSet.length === 0) return "";
  const min = Math.min(...repsPerSet);
  const max = Math.max(...repsPerSet);
  if (min === max) return String(min);
  return `${min}-${max}`;
}

/** Format per-set weight as compact range: "80→90" or "80/85/90" */
export function formatPerSetWeight(weightPerSet: number[]): string {
  if (weightPerSet.length === 0) return "";
  const first = weightPerSet[0];
  const last = weightPerSet[weightPerSet.length - 1];
  const allSame = weightPerSet.every(w => w === first);
  if (allSame) return String(first);
  const ascending = weightPerSet.every((w, i) => i === 0 || w >= weightPerSet[i - 1]);
  const descending = weightPerSet.every((w, i) => i === 0 || w <= weightPerSet[i - 1]);
  if (ascending || descending) return `${first}→${last}`;
  return weightPerSet.join("/");
}

// ── Components ──

/** Monochromatic SVG icons for group types (superset, paired, circuit) */
export function GroupIcon({ type, size = 14 }: { type: string; size?: number }) {
  const s = { width: size, height: size, display: "block" as const };
  const color = "currentColor";

  if (type === "superset") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={s}>
        <path d="M2 5.5h10m-2.5-2.5L12 5.5 9.5 8" />
        <path d="M14 10.5H4m2.5-2.5L4 10.5 6.5 13" />
      </svg>
    );
  }

  if (type === "paired") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={s}>
        <path d="M6.5 9.5l3-3" />
        <path d="M9 5l1.5-1.5a2.12 2.12 0 0 1 3 3L12 8" />
        <path d="M7 8L5.5 9.5a2.12 2.12 0 0 0 3 3L10 11" />
      </svg>
    );
  }

  // circuit
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={s}>
      <path d="M13.5 8a5.5 5.5 0 0 1-9.17 4.1" />
      <path d="M2.5 8a5.5 5.5 0 0 1 9.17-4.1" />
      <path d="M11 1.5L11.67 3.9 9.27 4.57" />
      <path d="M5 14.5L4.33 12.1 6.73 11.43" />
    </svg>
  );
}
