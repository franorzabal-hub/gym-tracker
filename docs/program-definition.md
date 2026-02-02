# Definicion funcional — Programa de entrenamiento

## Que es un programa

Un programa es una rutina semanal de entrenamiento. Define que ejercicios hacer cada dia, con cuantas series, repeticiones y peso. Ejemplos: Push/Pull/Legs, Upper/Lower, Full Body 3x.

El usuario crea o elige un programa hablando con Claude. Claude lo arma con `manage_program` y el usuario lo ve con `show_program`. El widget muestra el programa completo para que el usuario revise y apruebe.

## Estructura

```
Programa
  └─ Version (se crea una nueva al editar, historial preservado)
       └─ Dias (ej: "Push", "Pull", "Legs")
            └─ Secciones opcionales (ej: "Entrada en calor", "Trabajo principal")
                 └─ Ejercicios (ordenados, con sets/reps/peso objetivo)
                      └─ Agrupamientos opcionales (superset, paired, circuit)
```

- **Programa**: nombre, activo/inactivo. Solo uno activo a la vez.
- **Version**: snapshot inmutable. Editar crea version nueva. `history` muestra todas.
- **Dia**: label (ej: "Upper A"), weekdays opcionales (1=Lun..7=Dom).
- **Seccion**: contenedor opcional con label y notas. Colapsable en widget.
- **Ejercicio**: nombre, sets, reps, peso objetivo, RPE, descanso, notas.

## Secciones (exercise sections)

Las secciones son contenedores **opcionales** que organizan los ejercicios de un dia en bloques logicos. Ejemplos: "Entrada en calor", "Trabajo principal", "Accesorios", "Finisher".

### Caracteristicas

- **Opcionales**: los ejercicios pueden existir sin seccion (se renderizan directamente en el dia).
- **No anidan**: una seccion contiene ejercicios sueltos y/o grupos, pero no otras secciones.
- **Colapsables**: en el widget, cada seccion es un contenedor colapsable con chevron.
- **Con notas**: cada seccion puede tener un `label` (obligatorio) y `notes` (opcional).
- **Se preservan**: al clonar versiones, logear rutinas, o guardar/iniciar templates, las secciones se copian con remap de IDs.

### Formato de entrada (LLM → server)

Tercer discriminador en el array de `exercises` de cada dia:

```json
{
  "day_label": "Push",
  "exercises": [
    {
      "section": "Entrada en calor",
      "notes": "Movilidad general",
      "exercises": [
        { "exercise": "Band Pull Apart", "sets": 2, "reps": 15 },
        { "exercise": "Foam Rolling", "sets": 1, "reps": 60 }
      ]
    },
    {
      "section": "Trabajo principal",
      "exercises": [
        { "exercise": "Bench Press", "sets": 4, "reps": 8, "rest_seconds": 180 },
        {
          "group_type": "superset",
          "label": "Pecho + Hombro",
          "rest_seconds": 90,
          "exercises": [
            { "exercise": "Cable Fly", "sets": 3, "reps": 12 },
            { "exercise": "Lateral Raise", "sets": 3, "reps": 15 }
          ]
        }
      ]
    },
    { "exercise": "Stretching", "sets": 1, "reps": 300 }
  ]
}
```

**Discriminador**: `"exercise"` (string) → ejercicio suelto | `"group_type"` + `"exercises"` → grupo | `"section"` (string) + `"exercises"` → seccion.

Las secciones no anidan: `section.exercises` acepta solo ejercicios sueltos y grupos.

### Numeracion

La numeracion de ejercicios es **global por dia** (1-N), cruza secciones. Un ejercicio que esta en la seccion "Trabajo principal" sigue la numeracion del ultimo ejercicio de "Entrada en calor".

### DB schema

3 tablas (mismo patron que groups): `program_sections`, `session_sections`, `template_sections`. Cada una con `label`, `notes`, `sort_order` y FK al padre (day_id, session_id, template_id) con CASCADE. Los ejercicios apuntan a su seccion via `section_id` FK (ON DELETE SET NULL).

## Agrupamiento de ejercicios (exercise groups)

Dos o mas ejercicios dentro de un dia pueden agruparse en un **exercise group**. Cada grupo es una entidad propia con `group_type`, `label`, `notes`, y `rest_seconds`. Los ejercicios del grupo apuntan al grupo via `group_id` FK. El `group_type` define **como** se ejecuta ese grupo.

### Formato de entrada (LLM → server)

Los ejercicios de un dia se envian como array mixto de **ejercicios sueltos** y **grupos**:

```json
{
  "day_label": "Push",
  "exercises": [
    { "exercise": "Bench Press", "sets": 4, "reps": 8, "rest_seconds": 180 },
    {
      "group_type": "superset",
      "label": "Pecho + Hombro",
      "rest_seconds": 90,
      "exercises": [
        { "exercise": "Cable Fly", "sets": 3, "reps": 12 },
        { "exercise": "Lateral Raise", "sets": 3, "reps": 15 }
      ]
    },
    { "exercise": "Tricep Pushdown", "sets": 3, "reps": 12, "rest_seconds": 60 }
  ]
}
```

**Discriminador**: si el item tiene `"exercise"` (string) es un ejercicio suelto. Si tiene `"group_type"` + `"exercises"` (array) es un grupo. Si tiene `"section"` (string) + `"exercises"` (array) es una seccion (ver arriba).

### superset

Ejercicios hechos uno tras otro **sin descanso** entre ellos. Se descansa al completar la ronda.

**Patron de ejecucion:**
```
Ejercicio A (1 serie) → Ejercicio B (1 serie) → DESCANSO → repetir
```

**Ejemplo:** Cable Fly 3x12 + Lateral Raise 3x15
```
Cable Fly x12 → Lateral Raise x15 → descanso 90s → Cable Fly x12 → Lateral Raise x15 → descanso 90s → ...
```

**Cuando usarlo:**
- Musculos antagonistas (pecho + espalda, bicep + tricep)
- Musculos no relacionados para ahorrar tiempo (pecho + hombro lateral)
- Tipicamente 2 ejercicios, a veces 3

**Descanso:** Se aplica al ultimo ejercicio del grupo. Es el descanso entre rondas completas.

**Widget:** Borde solido de color, icono ⚡, label "Superset".

### paired

Ejercicios relacionados hechos juntos con **descanso activo**. Mientras descansas de uno, haces el otro.

**Patron de ejecucion:**
```
Ejercicio A (1 serie) → descanso parcial haciendo Ejercicio B → descanso completo → repetir
```

**Ejemplo:** Deadlift 4x5 + Hip Mobility Drill
```
Deadlift x5 → Hip Mobility (durante descanso) → descanso restante → Deadlift x5 → Hip Mobility → ...
```

**Cuando usarlo:**
- Ejercicio principal + movilidad/activacion entre series
- Ejercicio pesado + trabajo correctivo liviano
- El ejercicio secundario NO debe fatigar al principal
- Tipicamente 2 ejercicios

**Descanso:** El ejercicio principal tiene su descanso normal. El ejercicio secundario se hace *dentro* de ese descanso (descanso activo), no agrega tiempo extra.

**Widget:** Borde punteado, icono 🔗, label "Paired".

### circuit

Rotar por 3+ ejercicios en secuencia. Se descansa solo al completar toda la ronda.

**Patron de ejecucion:**
```
Ejercicio A (1 serie) → Ejercicio B (1 serie) → Ejercicio C (1 serie) → DESCANSO → repetir
```

**Ejemplo:** Circuito de espalda: Lat Pulldown 3x12 + Cable Row 3x12 + Face Pull 3x15
```
Lat Pulldown x12 → Cable Row x12 → Face Pull x15 → descanso 120s → repetir
```

**Cuando usarlo:**
- 3 o mas ejercicios (la diferencia clave vs superset)
- Bloques de accesorios/aislamiento
- Trabajo de conditioning o finishers
- Cuando el objetivo es densidad + algo de cardio

**Descanso:** Se aplica al ultimo ejercicio del circuito. Es el descanso entre rondas completas. Los ejercicios intermedios no tienen descanso (o minimo, solo el cambio de estacion).

**Widget:** Borde doble, icono 🔄, label "Circuit".

### Resumen de diferencias

| | superset | paired | circuit |
|---|---|---|---|
| **Ejercicios** | 2 (a veces 3) | 2 | 3+ |
| **Descanso entre ejercicios** | Ninguno | El secundario se hace *durante* el descanso del principal | Ninguno (solo cambio de estacion) |
| **Descanso entre rondas** | Si, al final | Si, el del ejercicio principal | Si, al final |
| **Objetivo** | Eficiencia / densidad | No perder tiempo en descanso puro | Conditioning / densidad / volumen |
| **Borde en widget** | Solido color | Punteado | Doble |

### Como se asigna el descanso

- **Ejercicio agrupado**: `rest_seconds` vive en la **tabla de grupo** (descanso entre rondas). El `rest_seconds` del ejercicio individual queda NULL.
- **Ejercicio solo** (sin grupo): `rest_seconds` queda en la fila del ejercicio (descanso entre series).
- En un **superset** o **circuit**: el `rest_seconds` del grupo es el descanso entre rondas completas. No hay descanso entre ejercicios dentro del grupo.
- En un **paired**: el `rest_seconds` del grupo es el descanso total. El ejercicio secundario se hace dentro de ese tiempo (descanso activo).

## Esquema de repeticiones

El campo `reps` es un entero (las reps de la primera serie). Si el esquema varia por serie:

- **Reps fijas** (3x10): `sets: 3, reps: 10` → widget muestra "3×10"
- **Reps variables** (piramide 12/10/8): `sets: 3, reps: 12, notes: "reps: 12/10/8"` → widget muestra "3×(12/10/8)"
- **Con progresion**: `notes: "reps: 12/10/8 con progresion"` → el LLM explica en conversacion

No poner info de reps redundante. O se usa `reps` flat, o se pone el esquema en `notes`, nunca ambos.

## Weekdays (dias de la semana)

Cada dia puede tener `weekdays` opcional: array de enteros ISO (1=Lunes, 7=Domingo).

- Si se asignan, el LLM puede usar `get_today_plan` para saber que toca hoy.
- Si no se asignan, el programa es flexible (el usuario elige que dia hacer).
- Ejemplo: Upper/Lower 4x con weekdays `[1], [2], [4], [5]` = Lun/Mar/Jue/Vie.

## Versionado

Cada edicion con `update` (que incluya `days`) crea una **nueva version**. La version anterior queda inmutable en el historial. Esto permite:

- Ver que cambio y cuando (`history`)
- No perder configuraciones anteriores
- El usuario puede pedir "volveme al programa de hace 2 semanas" (no implementado aun, pero la data esta)

Ediciones de metadata (nombre, descripcion) sin `days` no crean version nueva.

## Programas globales vs de usuario

- **Globales** (`user_id = NULL`): templates predefinidos. Visibles para todos. No se pueden editar, solo clonar.
- **De usuario** (`user_id` set): creados o clonados por el usuario. Editables.
- `show_programs` muestra ambos. `clone` copia un global como programa propio.

## Flujo tipico

1. Usuario describe su rutina hablando con Claude
2. Claude crea el programa con `manage_program` action "create"
3. Claude llama `show_program` para que el usuario vea el resultado
4. Usuario revisa y pide cambios si hace falta
5. Claude edita con `manage_program` action "update" + `show_program` de nuevo
6. Usuario aprueba → programa queda activo

El widget es **read-only**. Toda edicion pasa por la conversacion con Claude.
