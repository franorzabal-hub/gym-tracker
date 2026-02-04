/**
 * TypeScript types for i18n translations.
 * Provides type safety for translation keys and interpolation.
 */

export type Locale = "en" | "es";

/** Nested translation object structure */
export interface Translations {
  // Common
  common: {
    loading: string;
    error: string;
    save: string;
    cancel: string;
    confirm: string;
    delete: string;
    edit: string;
    add: string;
    remove: string;
    close: string;
    back: string;
    next: string;
    previous: string;
    yes: string;
    no: string;
    or: string;
    and: string;
    none: string;
    all: string;
    active: string;
    inactive: string;
    pending: string;
    completed: string;
    validated: string;
    exercises: string;
    exercise: string;
    sets: string;
    set: string;
    reps: string;
    weight: string;
    minutes: string;
    min: string;
    hours: string;
    days: string;
    weeks: string;
    week: string;
    sessions: string;
    session: string;
    kg: string;
    noData: string;
  };

  // Time periods
  periods: {
    today: string;
    yesterday: string;
    thisWeek: string;
    thisMonth: string;
    thisYear: string;
    lastNDays: string;
    latest: string;
  };

  // Profile widget
  profile: {
    title: string;
    loadingProfile: string;
    age: string;
    sex: string;
    male: string;
    female: string;
    weightLabel: string;
    heightLabel: string;
    trainingDays: string;
    goals: string;
    supplements: string;
    injuries: string;
    preferences: string;
    requireValidation: string;
    requireValidationDesc: string;
    language: {
      title: string;
      en: string;
      es: string;
    };
    perWeek: string;
    failedToSave: string;
  };

  // Dashboard widget
  dashboard: {
    title: string;
    loadingDashboard: string;
    noTrainingData: string;
    startLogging: string;
    streak: string;
    volume: string;
    frequency: string;
    prs: string;
    muscleGroups: string;
    bodyWeight: string;
    topExercises: string;
    weeksStreak: string;
    sessionsThisWeek: string;
    noSessionsYet: string;
    bestStreak: string;
    weeklyVolume: string;
    noVolumeData: string;
    sessionsPerWeek: string;
    noSessionsData: string;
    totalSessions: string;
    recentPRs: string;
    noPRsYet: string;
    noMuscleData: string;
    noTopExercises: string;
    prTypes: {
      max_weight: string;
      max_reps_at_weight: string;
      estimated_1rm: string;
    };
  };

  // Programs
  programs: {
    title: string;
    myPrograms: string;
    availablePrograms: string;
    loadingPrograms: string;
    noPrograms: string;
    noAvailablePrograms: string;
    noProgramsHint: string;
    active: string;
    inactive: string;
    recommended: string;
    alreadyAdded: string;
    pendingValidation: string;
    useThisProgram: string;
    programCreated: string;
    readyToStart: string;
    daysPerWeek: string;
    exercisesCount: string;
    validate: string;
    validating: string;
    noProgramFound: string;
  };

  // Program view
  programView: {
    exercises: string;
    estimatedTime: string;
    exercisesLabel: string;
  };

  // Workouts
  workouts: {
    title: string;
    loadingWorkouts: string;
    noWorkouts: string;
    startTracking: string;
    workout: string;
    activeWorkout: string;
    completed: string;
    pending: string;
    validate: string;
    validating: string;
    exerciseCount: string;
    duration: string;
  };

  // Session view
  session: {
    muscleGroups: string;
    set: string;
    prev: string;
    pr: string;
    weightPR: string;
    rmPR: string;
    warmup: string;
    drop: string;
    failure: string;
  };

  // Stats
  stats: {
    title: string;
    exerciseStats: string;
    personalRecords: string;
    progression: string;
    workoutHistory: string;
    perWeek: string;
    total: string;
  };

  // Today plan
  todayPlan: {
    restDay: string;
    noWorkoutScheduled: string;
    lastSession: string;
    startSession: string;
    starting: string;
  };

  // Groups
  groups: {
    superset: string;
    paired: string;
    circuit: string;
    exerciseCount: string;
  };

  // Diff/Confirm
  diff: {
    confirmChanges: string;
    saving: string;
    updated: string;
  };

  // Weekdays
  weekdays: {
    short: string[];
    long: string[];
  };
}

/** Flattened key type for dot notation access */
export type TranslationKey = FlattenKeys<Translations>;

/** Helper type to flatten nested object keys with dot notation */
type FlattenKeys<T, Prefix extends string = ""> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? T[K] extends any[]
            ? `${Prefix}${K}`
            : FlattenKeys<T[K], `${Prefix}${K}.`>
          : `${Prefix}${K}`
        : never;
    }[keyof T]
  : never;

/** Interpolation values for translation strings */
export type InterpolationValues = Record<string, string | number>;

/** Translation function type */
export type TFunction = (key: string, values?: InterpolationValues) => string;

/** i18n context value */
export interface I18nContextValue {
  locale: Locale;
  t: TFunction;
  setLocale: (locale: Locale) => void;
}
