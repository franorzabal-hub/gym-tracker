/**
 * Spanish translations for gym-tracker widgets.
 */

import type { Translations } from "../types.js";

export const es: Translations = {
  // Common
  common: {
    loading: "Cargando...",
    error: "Error",
    save: "Guardar",
    cancel: "Cancelar",
    confirm: "Confirmar",
    delete: "Eliminar",
    edit: "Editar",
    add: "Agregar",
    remove: "Quitar",
    close: "Cerrar",
    back: "Atrás",
    next: "Siguiente",
    previous: "Anterior",
    yes: "Sí",
    no: "No",
    or: "o",
    and: "y",
    none: "Ninguno",
    all: "Todo",
    active: "Activo",
    inactive: "Inactivo",
    pending: "Pendiente",
    completed: "Completado",
    validated: "Validado",
    exercises: "ejercicios",
    exercise: "ejercicio",
    sets: "series",
    set: "serie",
    reps: "reps",
    weight: "Peso",
    minutes: "minutos",
    min: "min",
    hours: "horas",
    days: "días",
    weeks: "semanas",
    week: "semana",
    sessions: "sesiones",
    session: "sesión",
    kg: "kg",
    noData: "Sin datos",
  },

  // Time periods
  periods: {
    today: "Hoy",
    yesterday: "Ayer",
    thisWeek: "Esta semana",
    thisMonth: "Este mes",
    thisYear: "Este año",
    last3Months: "Últimos 3 meses",
    last6Months: "Últimos 6 meses",
    lastNDays: "Últimos {count} días",
    latest: "Más reciente",
  },

  // Profile widget
  profile: {
    title: "Perfil",
    loadingProfile: "Cargando perfil",
    age: "EDAD",
    sex: "SEXO",
    male: "Masculino",
    female: "Femenino",
    weightLabel: "PESO",
    heightLabel: "ALTURA",
    trainingDays: "DÍAS DE ENTRENAMIENTO",
    goals: "OBJETIVOS",
    supplements: "SUPLEMENTOS",
    injuries: "LESIONES",
    preferences: "PREFERENCIAS",
    requireValidation: "Requiere validación",
    requireValidationDesc: "Nuevos entrenamientos y programas necesitan validación manual antes de afectar las estadísticas",
    language: {
      title: "IDIOMA",
      en: "English",
      es: "Español",
    },
    perWeek: "{count}x/semana",
    failedToSave: "Error al guardar cambios. Intenta de nuevo.",
  },

  // Dashboard widget
  dashboard: {
    title: "Panel de Control",
    loadingDashboard: "Cargando panel de control",
    noTrainingData: "Aún no hay datos de entrenamiento",
    startLogging: "¡Empieza a registrar entrenamientos para ver tu dashboard!",
    streak: "Racha",
    volume: "Volumen",
    frequency: "Frecuencia",
    prs: "PRs",
    muscleGroups: "Músculos",
    bodyWeight: "Peso",
    topExercises: "Top",
    weeksStreak: "1 semana | {count} semanas",
    sessionsThisWeek: "1 sesión esta semana | {count} sesiones esta semana",
    noSessionsYet: "Sin sesiones esta semana",
    bestStreak: "Mejor: {count} semanas",
    weeklyVolume: "Volumen Semanal",
    noVolumeData: "Sin datos de volumen",
    sessionsPerWeek: "sesiones / semana",
    noSessionsData: "Sin sesiones aún",
    totalSessions: "{count} sesiones totales",
    recentPRs: "PRs Recientes",
    noPRsYet: "Sin PRs aún",
    noMuscleData: "Sin datos aún",
    noTopExercises: "Sin datos aún",
    prTypes: {
      max_weight: "Peso",
      max_reps_at_weight: "Reps",
      estimated_1rm: "e1RM",
    },
  },

  // Programs
  programs: {
    title: "Programas",
    myPrograms: "Mis Programas",
    availablePrograms: "Programas Disponibles",
    loadingPrograms: "Cargando programas",
    noPrograms: "Aún no tienes programas",
    noAvailablePrograms: "No se encontraron programas disponibles.",
    noProgramsHint: "Describe tu rutina ideal en el chat, o pídeme que te muestre los programas disponibles.",
    active: "Activo",
    inactive: "Inactivo",
    recommended: "Recomendado",
    alreadyAdded: "Ya agregado",
    pendingValidation: "Pendiente de validación",
    useThisProgram: "Usar este programa",
    programCreated: "¡Programa creado!",
    readyToStart: "está listo. Empieza a entrenar diciéndome qué quieres hacer.",
    daysPerWeek: "{count} días",
    exercisesCount: "{count} ejercicios",
    validate: "Validar",
    validating: "Validando...",
    noProgramFound: "No se encontró el programa",
  },

  // Program view
  programView: {
    exercises: "{count} ejercicios",
    estimatedTime: "~{minutes} min",
    exercisesLabel: "ejercicios",
  },

  // Workouts
  workouts: {
    title: "Entrenamientos",
    loadingWorkouts: "Cargando entrenamientos",
    noWorkouts: "No se encontraron entrenamientos para {period}. ¡Empieza una sesión para comenzar!",
    startTracking: "¡Empieza una sesión para comenzar!",
    workout: "Entrenamiento",
    activeWorkout: "Entrenamiento Activo",
    completed: "Completado",
    pending: "Pendiente",
    validate: "Validar",
    validating: "Validando...",
    exerciseCount: "{count} ej",
    duration: "{duration}",
  },

  // Session view
  session: {
    muscleGroups: "Grupos musculares",
    set: "Serie",
    prev: "prev",
    pr: "PR",
    weightPR: "PR Peso",
    rmPR: "PR 1RM",
    warmup: "calentamiento",
    drop: "drop",
    failure: "fallo",
  },

  // Stats
  stats: {
    title: "Estadísticas",
    exerciseStats: "Estadísticas de Ejercicios",
    personalRecords: "Récords Personales",
    progression: "Progresión",
    workoutHistory: "Historial de Entrenamientos",
    perWeek: "{count}x por semana",
    total: "{count} total",
  },

  // Today plan
  todayPlan: {
    restDay: "Día de Descanso",
    noWorkoutScheduled: "No hay entrenamiento programado para hoy",
    lastSession: "Última sesión",
    startSession: "Iniciar Sesión",
    starting: "Iniciando...",
  },

  // Groups
  groups: {
    superset: "Superserie",
    paired: "Pareado",
    circuit: "Circuito",
    exerciseCount: "{count} ej.",
  },

  // Diff/Confirm
  diff: {
    confirmChanges: "Confirmar Cambios",
    saving: "Guardando...",
    updated: "Actualizado",
  },

  // Weekdays
  weekdays: {
    short: ["L", "M", "X", "J", "V", "S", "D"],
    long: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
  },
};
