// Shared exercise icon components and muscle group colors
// Extracted from program-editor for reuse across widgets

// ── Muscle group colors ──

export const MUSCLE_COLOR: Record<string, string> = {
  chest: "#e74c3c",
  back: "#3498db",
  shoulders: "#e67e22",
  biceps: "#9b59b6",
  triceps: "#8e44ad",
  quads: "#27ae60",
  quadriceps: "#27ae60",
  hamstrings: "#2ecc71",
  glutes: "#e91e63",
  calves: "#16a085",
  abs: "#f39c12",
  core: "#f39c12",
  traps: "#d35400",
  "rear delts": "#e67e22",
  cardio: "#e74c3c",
  mobility: "#95a5a6",
};

// ── Exercise movement SVG icons (stick-figure silhouettes) ──

type SvgPathData = { d: string }[];

export const EXERCISE_SVGS: Record<string, SvgPathData> = {
  bench: [{ d: "M3 14h14M6 14v-2M14 14v-2M7 12h6M10 12V8M7 8h6M6 6l1 2M14 6l-1 2M10 8V6" }],
  press: [{ d: "M10 18v-6M8 18h4M10 12V8M10 6a2 2 0 100-4 2 2 0 000 4M6 8h8M5 4h2M13 4h2M6 8l-1-4M14 8l1-4" }],
  squat: [{ d: "M10 4a2 2 0 100-4 2 2 0 000 4M10 4v4M7 8l-2 5h2l1-2M13 8l2 5h-2l-1-2M8 13v5M12 13v5M6 6h8" }],
  deadlift: [{ d: "M10 4a2 2 0 100-4 2 2 0 000 4M10 4l-1 5M9 9l-2 4v5M9 9l4 0M13 9l-1 4v5M5 17h10M7 17v1M13 17v1" }],
  row: [{ d: "M10 3a2 2 0 100-4 2 2 0 000 4M10 3l-2 6M8 9v6M8 9l5 1M13 10v5M5 15h10M6 9l-2 2M14 10l2-1" }],
  pullup: [{ d: "M4 2h12M10 5a2 2 0 100-4 2 2 0 000 4M10 5v5M7 2l3 3M13 2l-3 3M8 10l-1 4v4M12 10l1 4v4" }],
  curl: [{ d: "M8 16v-4l2-3 2-1v-3M12 5a1.5 1.5 0 10-3 0M8 16h4M6 16h8" }],
  extension: [{ d: "M10 18v-6M8 18h4M10 12V7M10 5a2 2 0 100-4 2 2 0 000 4M7 7l3-2 3 2M13 7l1-4M14 3h2" }],
  lateral: [{ d: "M10 6a2 2 0 100-4 2 2 0 000 4M10 6v6M8 18h4M10 12l-2 6M10 12l2 6M10 8l-6 0M10 8l6 0M4 7v2M16 7v2" }],
  plank: [{ d: "M3 12h2l2-2h6l2 2h2M7 10l-1-4M10 10V5M10 5a2 2 0 100-4 2 2 0 000 4M5 12v2M15 12v2" }],
  lunge: [{ d: "M10 4a2 2 0 100-4 2 2 0 000 4M10 4v5M10 9l-4 5v4M10 9l3 3v6M6 14l-2 1M6 18h2M13 18h2" }],
  calfraise: [{ d: "M10 6a2 2 0 100-4 2 2 0 000 4M10 6v7M8 13l-1 3M12 13l1 3M7 16l1 2M13 16l-1 2M8 18h4" }],
  fly: [{ d: "M10 6a2 2 0 100-4 2 2 0 000 4M10 6v6M10 12l-2 6M10 12l2 6M8 18h4M10 8l-5-1M10 8l5-1M5 7a1 1 0 110-2M15 7a1 1 0 100-2" }],
  shrug: [{ d: "M10 6a2 2 0 100-4 2 2 0 000 4M10 6v6M10 12l-2 6M10 12l2 6M8 18h4M7 7l-2 0v5M13 7l2 0v5M5 12h2M13 12h2" }],
  dip: [{ d: "M10 5a2 2 0 100-4 2 2 0 000 4M10 5v5M4 8h4M12 8h4M10 10l-2 4v4M10 10l2 4v4M8 18h4" }],
  generic: [{ d: "M10 6a2 2 0 100-4 2 2 0 000 4M10 6v6M10 12l-3 6M10 12l3 6M7 18h2M11 18h2M7 9h6" }],
};

export const EXERCISE_ICON_MAP: Record<string, string> = {
  "bench press": "bench", "press banca": "bench", "press plano": "bench",
  "incline bench press": "bench", "press inclinado": "bench",
  "dumbbell bench press": "bench", "close-grip bench press": "bench",
  "push pecho": "bench",
  "cable fly": "fly", "dumbbell fly": "fly",
  "overhead press": "press", "press militar": "press", "ohp": "press",
  "dumbbell overhead press": "press",
  "squat": "squat", "front squat": "squat", "sentadilla": "squat",
  "leg press": "squat", "prensa": "squat",
  "deadlift": "deadlift", "sumo deadlift": "deadlift",
  "romanian deadlift": "deadlift", "peso muerto": "deadlift", "rdl": "deadlift",
  "hip thrust": "deadlift",
  "barbell row": "row", "dumbbell row": "row", "seated cable row": "row",
  "t-bar row": "row", "remo": "row", "remo maquina": "row",
  "remo en polea": "row", "remo sentado": "row", "remo t-bar": "row",
  "remo con mancuerna": "row",
  "pull-up": "pullup", "chin-up": "pullup", "dominadas": "pullup",
  "lat pulldown": "pullup", "dorsalera": "pullup",
  "jalón al pecho": "pullup", "jalón polea": "pullup",
  "barbell curl": "curl", "hammer curl": "curl", "preacher curl": "curl",
  "incline dumbbell curl": "curl", "concentration curl": "curl",
  "cable curl": "curl", "curl": "curl",
  "tricep pushdown": "extension", "skull crusher": "extension",
  "overhead tricep extension": "extension",
  "dumbbell lateral raise": "lateral", "elevaciones laterales": "lateral",
  "lateral raise": "lateral", "laterales": "lateral",
  "face pull": "lateral", "rear delt fly": "lateral",
  "dip": "dip", "fondos": "dip",
  "barbell lunge": "lunge", "lunge": "lunge", "zancada": "lunge",
  "leg extension": "lunge", "leg curl": "lunge",
  "calf raise": "calfraise", "seated calf raise": "calfraise",
  "plancha lateral": "plank", "plancha": "plank", "plank": "plank",
  "cable crunch": "plank", "bicho muerto": "plank", "dead bug": "plank",
  "barbell shrug": "shrug", "shrug": "shrug",
};

export function ExerciseIcon({ name, color, size = 18 }: { name: string; color?: string; size?: number }) {
  const key = EXERCISE_ICON_MAP[name.toLowerCase()] || null;
  const paths = key ? EXERCISE_SVGS[key] : EXERCISE_SVGS.generic;
  if (!name.trim()) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      style={{ color: color || "var(--text-secondary)", flexShrink: 0, opacity: 0.7 }}
    >
      {paths.map((p, i) => (
        <path key={i} d={p.d} stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      ))}
    </svg>
  );
}
