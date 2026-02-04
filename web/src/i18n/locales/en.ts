/**
 * English translations for gym-tracker widgets.
 */

import type { Translations } from "../types.js";

export const en: Translations = {
  // Common
  common: {
    loading: "Loading...",
    error: "Error",
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    remove: "Remove",
    close: "Close",
    back: "Back",
    next: "Next",
    previous: "Previous",
    yes: "Yes",
    no: "No",
    or: "or",
    and: "and",
    none: "None",
    all: "All",
    active: "Active",
    inactive: "Inactive",
    pending: "Pending",
    completed: "Completed",
    validated: "Validated",
    exercises: "exercises",
    exercise: "exercise",
    sets: "sets",
    set: "set",
    reps: "reps",
    weight: "Weight",
    minutes: "minutes",
    min: "min",
    hours: "hours",
    days: "days",
    weeks: "weeks",
    week: "week",
    sessions: "sessions",
    session: "session",
    kg: "kg",
    noData: "No data",
  },

  // Time periods
  periods: {
    today: "Today",
    yesterday: "Yesterday",
    thisWeek: "This week",
    thisMonth: "This month",
    thisYear: "This year",
    last3Months: "Last 3 months",
    last6Months: "Last 6 months",
    lastNDays: "Last {count} days",
    latest: "Latest",
  },

  // Profile widget
  profile: {
    title: "Profile",
    loadingProfile: "Loading profile",
    age: "AGE",
    sex: "SEX",
    male: "Male",
    female: "Female",
    weightLabel: "WEIGHT",
    heightLabel: "HEIGHT",
    trainingDays: "TRAINING DAYS",
    goals: "GOALS",
    supplements: "SUPPLEMENTS",
    injuries: "INJURIES",
    preferences: "PREFERENCES",
    requireValidation: "Require validation",
    requireValidationDesc: "New workouts and programs need manual validation before affecting stats",
    language: {
      title: "LANGUAGE",
      en: "English",
      es: "Español",
    },
    perWeek: "{count}x/week",
    failedToSave: "Failed to save changes. Please try again.",
  },

  // Dashboard widget
  dashboard: {
    title: "Dashboard",
    loadingDashboard: "Loading dashboard",
    noTrainingData: "No training data yet",
    startLogging: "Start logging workouts to see your dashboard!",
    streak: "Streak",
    volume: "Volume",
    frequency: "Frequency",
    prs: "PRs",
    muscleGroups: "Muscles",
    bodyWeight: "Weight",
    topExercises: "Top",
    weeksStreak: "1 week | {count} weeks",
    sessionsThisWeek: "1 session this week | {count} sessions this week",
    noSessionsYet: "No sessions this week yet",
    bestStreak: "Best: {count} weeks",
    weeklyVolume: "Weekly Volume",
    noVolumeData: "No volume data yet",
    sessionsPerWeek: "sessions / week",
    noSessionsData: "No sessions yet",
    totalSessions: "{count} total sessions",
    recentPRs: "Recent PRs",
    noPRsYet: "No PRs yet",
    noMuscleData: "No data yet",
    noTopExercises: "No data yet",
    prTypes: {
      max_weight: "Weight",
      max_reps_at_weight: "Reps",
      estimated_1rm: "e1RM",
    },
  },

  // Programs
  programs: {
    title: "Programs",
    myPrograms: "My Programs",
    availablePrograms: "Available Programs",
    loadingPrograms: "Loading programs",
    noPrograms: "No programs yet",
    noAvailablePrograms: "No available programs found.",
    noProgramsHint: "Describe your ideal routine in the chat, or ask me to show available programs.",
    active: "Active",
    inactive: "Inactive",
    recommended: "Recommended",
    alreadyAdded: "Already added",
    pendingValidation: "Pending validation",
    useThisProgram: "Use this program",
    programCreated: "Program created!",
    readyToStart: "is ready. Start training by telling me what you want to do.",
    daysPerWeek: "{count} days",
    exercisesCount: "{count} exercises",
    validate: "Validate",
    validating: "Validating...",
    noProgramFound: "No program found",
  },

  // Program view
  programView: {
    exercises: "{count} exercises",
    estimatedTime: "~{minutes} min",
    exercisesLabel: "exercises",
  },

  // Workouts
  workouts: {
    title: "Workouts",
    loadingWorkouts: "Loading workouts",
    noWorkouts: "No workouts found for {period}. Start a session to begin tracking!",
    startTracking: "Start a session to begin tracking!",
    workout: "Workout",
    activeWorkout: "Active Workout",
    completed: "Completed",
    pending: "Pending",
    validate: "Validate",
    validating: "Validating...",
    exerciseCount: "{count} ex",
    duration: "{duration}",
  },

  // Session view
  session: {
    muscleGroups: "Muscle groups",
    set: "Set",
    prev: "prev",
    pr: "PR",
    weightPR: "Weight PR",
    rmPR: "1RM PR",
    warmup: "warmup",
    drop: "drop",
    failure: "failure",
  },

  // Stats
  stats: {
    title: "Stats",
    exerciseStats: "Exercise Stats",
    personalRecords: "Personal Records",
    progression: "Progression",
    workoutHistory: "Workout History",
    perWeek: "{count}x per week",
    total: "{count} total",
  },

  // Today plan
  todayPlan: {
    restDay: "Rest Day",
    noWorkoutScheduled: "No workout scheduled for today",
    lastSession: "Last session",
    startSession: "Start Session",
    starting: "Starting...",
  },

  // Groups
  groups: {
    superset: "Superset",
    paired: "Paired",
    circuit: "Circuit",
    exerciseCount: "{count} ex.",
  },

  // Diff/Confirm
  diff: {
    confirmChanges: "Confirm Changes",
    saving: "Saving...",
    updated: "Updated",
  },

  // Weekdays
  weekdays: {
    short: ["M", "T", "W", "T", "F", "S", "S"],
    long: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  },
};
