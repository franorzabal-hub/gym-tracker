export interface TemplateExercise {
  exercise: string;
  sets: number;
  reps: number;
  rest_seconds?: number;
}

export interface TemplateDay {
  day_label: string;
  weekdays?: number[];
  exercises: TemplateExercise[];
}

export interface ProgramTemplate {
  name: string;
  description: string;
  days_per_week: number;
  target_experience: string;
  days: TemplateDay[];
}

export const PROGRAM_TEMPLATES: Record<string, ProgramTemplate> = {
  full_body_3x: {
    name: "Full Body 3x",
    description: "3 days/week full body routine. Great for beginners or those with limited time.",
    days_per_week: 3,
    target_experience: "beginner",
    days: [
      {
        day_label: "Full Body A",
        weekdays: [1], // Monday
        exercises: [
          { exercise: "Squat", sets: 3, reps: 8, rest_seconds: 120 },
          { exercise: "Bench Press", sets: 3, reps: 8, rest_seconds: 90 },
          { exercise: "Barbell Row", sets: 3, reps: 8, rest_seconds: 90 },
          { exercise: "Overhead Press", sets: 3, reps: 10, rest_seconds: 60 },
          { exercise: "Barbell Curl", sets: 2, reps: 12, rest_seconds: 60 },
        ],
      },
      {
        day_label: "Full Body B",
        weekdays: [3], // Wednesday
        exercises: [
          { exercise: "Deadlift", sets: 3, reps: 5, rest_seconds: 180 },
          { exercise: "Incline Bench Press", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Pull-Up", sets: 3, reps: 8, rest_seconds: 90 },
          { exercise: "Dumbbell Lateral Raise", sets: 3, reps: 12, rest_seconds: 60 },
          { exercise: "Leg Curl", sets: 3, reps: 12, rest_seconds: 60 },
        ],
      },
      {
        day_label: "Full Body C",
        weekdays: [5], // Friday
        exercises: [
          { exercise: "Leg Press", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Bench Press", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Barbell Row", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Face Pull", sets: 3, reps: 15, rest_seconds: 60 },
          { exercise: "Tricep Pushdown", sets: 2, reps: 12, rest_seconds: 60 },
        ],
      },
    ],
  },

  upper_lower_4x: {
    name: "Upper/Lower 4x",
    description: "4 days/week upper/lower split. Good balance of volume and recovery for intermediate lifters.",
    days_per_week: 4,
    target_experience: "intermediate",
    days: [
      {
        day_label: "Upper A",
        weekdays: [1], // Monday
        exercises: [
          { exercise: "Bench Press", sets: 4, reps: 6, rest_seconds: 120 },
          { exercise: "Barbell Row", sets: 4, reps: 8, rest_seconds: 90 },
          { exercise: "Overhead Press", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Cable Fly", sets: 3, reps: 12, rest_seconds: 60 },
          { exercise: "Barbell Curl", sets: 3, reps: 10, rest_seconds: 60 },
          { exercise: "Tricep Pushdown", sets: 3, reps: 12, rest_seconds: 60 },
        ],
      },
      {
        day_label: "Lower A",
        weekdays: [2], // Tuesday
        exercises: [
          { exercise: "Squat", sets: 4, reps: 6, rest_seconds: 180 },
          { exercise: "Romanian Deadlift", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Leg Press", sets: 3, reps: 12, rest_seconds: 90 },
          { exercise: "Leg Curl", sets: 3, reps: 12, rest_seconds: 60 },
          { exercise: "Calf Raise", sets: 4, reps: 15, rest_seconds: 60 },
        ],
      },
      {
        day_label: "Upper B",
        weekdays: [4], // Thursday
        exercises: [
          { exercise: "Overhead Press", sets: 4, reps: 6, rest_seconds: 120 },
          { exercise: "Pull-Up", sets: 4, reps: 8, rest_seconds: 90 },
          { exercise: "Incline Bench Press", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Face Pull", sets: 3, reps: 15, rest_seconds: 60 },
          { exercise: "Hammer Curl", sets: 3, reps: 12, rest_seconds: 60 },
          { exercise: "Dumbbell Lateral Raise", sets: 3, reps: 15, rest_seconds: 60 },
        ],
      },
      {
        day_label: "Lower B",
        weekdays: [5], // Friday
        exercises: [
          { exercise: "Deadlift", sets: 3, reps: 5, rest_seconds: 180 },
          { exercise: "Squat", sets: 3, reps: 10, rest_seconds: 120 },
          { exercise: "Leg Press", sets: 3, reps: 15, rest_seconds: 90 },
          { exercise: "Leg Curl", sets: 3, reps: 12, rest_seconds: 60 },
          { exercise: "Calf Raise", sets: 4, reps: 15, rest_seconds: 60 },
        ],
      },
    ],
  },

  ppl_6x: {
    name: "Push Pull Legs 6x",
    description: "6 days/week PPL split. High volume for experienced lifters with each muscle group trained twice.",
    days_per_week: 6,
    target_experience: "advanced",
    days: [
      {
        day_label: "Push A",
        weekdays: [1], // Monday
        exercises: [
          { exercise: "Bench Press", sets: 4, reps: 6, rest_seconds: 120 },
          { exercise: "Overhead Press", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Incline Bench Press", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Cable Fly", sets: 3, reps: 12, rest_seconds: 60 },
          { exercise: "Dumbbell Lateral Raise", sets: 3, reps: 15, rest_seconds: 60 },
          { exercise: "Tricep Pushdown", sets: 3, reps: 12, rest_seconds: 60 },
        ],
      },
      {
        day_label: "Pull A",
        weekdays: [2], // Tuesday
        exercises: [
          { exercise: "Barbell Row", sets: 4, reps: 6, rest_seconds: 120 },
          { exercise: "Pull-Up", sets: 3, reps: 8, rest_seconds: 90 },
          { exercise: "Face Pull", sets: 3, reps: 15, rest_seconds: 60 },
          { exercise: "Barbell Curl", sets: 3, reps: 10, rest_seconds: 60 },
          { exercise: "Hammer Curl", sets: 3, reps: 12, rest_seconds: 60 },
        ],
      },
      {
        day_label: "Legs A",
        weekdays: [3], // Wednesday
        exercises: [
          { exercise: "Squat", sets: 4, reps: 6, rest_seconds: 180 },
          { exercise: "Romanian Deadlift", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Leg Press", sets: 3, reps: 12, rest_seconds: 90 },
          { exercise: "Leg Curl", sets: 3, reps: 12, rest_seconds: 60 },
          { exercise: "Calf Raise", sets: 4, reps: 15, rest_seconds: 60 },
        ],
      },
      {
        day_label: "Push B",
        weekdays: [4], // Thursday
        exercises: [
          { exercise: "Overhead Press", sets: 4, reps: 6, rest_seconds: 120 },
          { exercise: "Bench Press", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Cable Fly", sets: 3, reps: 12, rest_seconds: 60 },
          { exercise: "Incline Bench Press", sets: 3, reps: 12, rest_seconds: 90 },
          { exercise: "Dumbbell Lateral Raise", sets: 3, reps: 15, rest_seconds: 60 },
          { exercise: "Tricep Pushdown", sets: 3, reps: 15, rest_seconds: 60 },
        ],
      },
      {
        day_label: "Pull B",
        weekdays: [5], // Friday
        exercises: [
          { exercise: "Deadlift", sets: 3, reps: 5, rest_seconds: 180 },
          { exercise: "Barbell Row", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Pull-Up", sets: 3, reps: 10, rest_seconds: 90 },
          { exercise: "Face Pull", sets: 3, reps: 15, rest_seconds: 60 },
          { exercise: "Barbell Curl", sets: 3, reps: 12, rest_seconds: 60 },
        ],
      },
      {
        day_label: "Legs B",
        weekdays: [6], // Saturday
        exercises: [
          { exercise: "Deadlift", sets: 3, reps: 8, rest_seconds: 180 },
          { exercise: "Squat", sets: 3, reps: 10, rest_seconds: 120 },
          { exercise: "Leg Press", sets: 3, reps: 15, rest_seconds: 90 },
          { exercise: "Leg Curl", sets: 3, reps: 15, rest_seconds: 60 },
          { exercise: "Calf Raise", sets: 4, reps: 15, rest_seconds: 60 },
        ],
      },
    ],
  },
};

export function getRecommendedTemplate(availableDays: number, experience: string): string {
  if (availableDays <= 3) return "full_body_3x";
  if (availableDays <= 5) return "upper_lower_4x";
  return "ppl_6x";
}

export function listTemplates(): { id: string; name: string; days_per_week: number; description: string; target_experience: string }[] {
  return Object.entries(PROGRAM_TEMPLATES).map(([id, t]) => ({
    id,
    name: t.name,
    days_per_week: t.days_per_week,
    description: t.description,
    target_experience: t.target_experience,
  }));
}
