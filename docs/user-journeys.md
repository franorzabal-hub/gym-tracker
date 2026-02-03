# User Journeys — Gym Tracker

## 1. Onboarding (primera vez)

**Trigger:** Usuario nuevo, no tiene perfil ni programa.
**Frecuencia:** Una sola vez.

1. Bienvenida → explica qué hace la app
2. Configurar perfil → nombre, peso, altura, objetivo
3. Elegir programa → plantilla o desde cero
4. Confirmación → resumen, "estás listo"

**Tools:** `manage_profile` update, `manage_program` create, `manage_exercises` add (si crea ejercicios custom)
**Widget:** Onboarding wizard (stepper de 3-4 pasos)

> Detalle completo en `docs/onboarding-flow.md`

---

## 2. Día de entrenamiento (flujo principal)

**Trigger:** Usuario abre la app un día que le toca entrenar.
**Frecuencia:** 3-6 veces por semana. Es el 80% del uso.

### 2a. Ver qué toca hoy
- Claude muestra el plan del día según el programa activo
- Ejercicios con series/reps objetivo y último peso usado como referencia

**Tools:** `get_today_plan`
**Widget:** Today Plan

### 2b. Entrenar (sesión activa)
- Iniciar sesión (manual o al loguear primer ejercicio)
- Ir registrando ejercicios y sets
- Ver progreso en tiempo real (sets completados vs pendientes)
- Opción de loguear toda la rutina de golpe con overrides

**Tools:** `log_workout` (unificado: inicia sesión automáticamente, logea ejercicios individuales o rutina completa)
**Widget:** Active Session

### 2c. Terminar sesión
- Cerrar sesión → ver resumen
- PRs nuevos destacados
- Comparación vs última vez que hizo ese día/rutina
- Volumen total, duración

**Tools:** `end_workout`
**Widget:** Session Summary

---

## 3. Consulta fuera del gym

**Trigger:** Día de descanso, curiosidad, planificación.
**Frecuencia:** 1-3 veces por semana.

### 3a. Ver historial
- Últimas sesiones (semana, mes)
- Detalle de una sesión específica
- Filtrar por ejercicio, programa, tags

**Tools:** `get_workouts`
**Widget:** History

### 3b. Ver estadísticas y progresión
- Progresión de un ejercicio (peso a lo largo del tiempo)
- PRs actuales
- Volumen semanal/mensual
- Frecuencia de entrenamiento
- Comparar varios ejercicios

**Tools:** `get_stats`
**Widget:** Stats

### 3c. Ver PRs
- Records personales actuales por ejercicio
- Historial de cuándo se alcanzó cada PR

**Tools:** `get_stats` (incluye PRs)
**Widget:** Stats (sección de PRs)

---

## 4. Cambiar programa / rutina

**Trigger:** Estancamiento, aburrimiento, cambio de objetivo. Cada 4-8 semanas.
**Frecuencia:** Mensual.

1. Ver programas existentes
2. Crear nuevo programa o duplicar/editar uno existente
3. Definir días y ejercicios por día
4. Activar el nuevo programa
5. (Opcional) Desactivar/archivar el anterior

**Tools:** `manage_program` (list, get, create, update, activate, delete, history)
**Widget:** Programs

---

## 5. Gestión de ejercicios

**Trigger:** Quiere agregar un ejercicio que no existe, buscar uno, o corregir datos.
**Frecuencia:** Ocasional.

1. Buscar ejercicio por nombre o grupo muscular
2. Agregar ejercicio custom (nombre, grupo muscular, equipamiento, tipo)
3. Editar ejercicio existente (corregir nombre, grupo muscular)
4. Eliminar ejercicio que ya no usa

**Tools:** `manage_exercises` (list, search, add, update, delete)
**Widget:** Exercises

---

## 6. Editar sesión pasada

**Trigger:** Se equivocó en un peso/reps, olvidó registrar un set, quiere borrar una sesión basura.
**Frecuencia:** Ocasional.

1. Buscar sesión en historial
2. Editar sets (cambiar peso, reps, eliminar set)
3. Agregar set olvidado
4. Eliminar sesión completa o restaurar sesión borrada

**Tools:** `edit_workout` (update, delete sets, delete_workout, restore_workout, delete_workouts[])
**Widget:** History (con capacidad de edición) o modal de edición

---

## 7. Tracking corporal

**Trigger:** Pesarse, medirse (mañana en ayunas típicamente).
**Frecuencia:** Semanal o quincenal.

1. Registrar medida (peso, grasa corporal, pecho, cintura, etc.)
2. Ver tendencia en el tiempo
3. Ver última medida registrada

**Tools:** `manage_body_measurements` (log, history, latest)
**Widget:** Measurements

---

## 8. Gestión de perfil

**Trigger:** Cambiar objetivo, actualizar peso base, corregir datos.
**Frecuencia:** Rara (cada pocos meses).

1. Ver perfil actual
2. Actualizar datos (nombre, peso, altura, objetivo, experiencia)

**Tools:** `manage_profile` (get, update)
**Widget:** Profile

---

## 9. Exportar datos

**Trigger:** Quiere backup, migrar a otra app, analizar en Excel.
**Frecuencia:** Muy rara.

1. Elegir formato (JSON o CSV)
2. Elegir scope (todo, solo sesiones, solo ejercicios, etc.)
3. Elegir periodo (opcional)
4. Descargar

**Tools:** `export_data`
**Widget:** Export (raw JSON está bien, no necesita UI elaborada)

---

## Mapa de prioridades

| Prioridad | Flujo | Por qué |
|---|---|---|
| **P0** | Día de entrenamiento (2a-2c) | Es el core, uso diario |
| **P0** | Onboarding (1) | Sin esto no hay retención |
| **P1** | Consulta: historial + stats (3) | Motivación y tracking |
| **P1** | Cambiar programa (4) | Necesario cada mes |
| **P2** | Editar sesión (6) | Corrección de errores |
| **P2** | Tracking corporal (7) | Complemento útil |
| **P3** | Gestión ejercicios (5) | Mayormente automático |
| **P3** | Perfil (8) | Se usa muy poco |
| **P3** | Export (9) | Muy raro |
