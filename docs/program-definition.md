# Definicion funcional — Programa de entrenamiento

## Que es un programa

Un programa es una rutina semanal de entrenamiento. Define que ejercicios hacer cada dia, con cuantas series, repeticiones y peso. Ejemplos: Push/Pull/Legs, Upper/Lower, Full Body 3x.

El usuario crea o elige un programa hablando con Claude. Claude lo arma con `manage_program` y el usuario lo ve con `show_program`. El widget muestra el programa completo para que el usuario revise y apruebe.

## Estructura

```
Programa
  └─ Version (se crea una nueva al editar, historial preservado)
       └─ Dias (ej: "Push", "Pull", "Legs")
            └─ Secciones opcionales (ej: "Entrada en calor", "Trabajo principal", "Cierre")
                 └─ Ejercicios (ordenados, con sets/reps/peso objetivo)
                      └─ Agrupamientos opcionales (superset, paired, circuit)
```

- **Programa**: nombre, activo/inactivo. Solo uno activo a la vez.
- **Version**: snapshot inmutable. Editar crea version nueva. `history` muestra todas.
- **Dia**: label (ej: "Upper A"), weekdays opcionales (1=Lun..7=Dom).
- **Seccion**: contenedor opcional con label y notas. Colapsable en widget.
- **Ejercicio**: nombre, sets, reps (number o array), peso (number o array), RPE, descanso, notas.

## Secciones (exercise sections)

Las secciones son contenedores **opcionales** que organizan los ejercicios de un dia en bloques logicos.

### Secciones estandar

| Seccion | Proposito | Contenido tipico | Group types recomendados |
|---|---|---|---|
| **Entrada en calor** | Activacion y preparacion para el trabajo pesado | Core, movilidad, activacion muscular. Supersets livianos | `superset` (ejercicios equivalentes). NO usar `paired` (no hay ejercicio pesado principal) |
| **Trabajo principal** | Bloque central del dia. Ejercicios compuestos y accesorios | Paired (compuesto + movilidad), supersets, circuits de accesorios | `paired` (compuesto + movilidad), `superset` (antagonistas), `circuit` (accesorios) |
| **Cierre** | Vuelta a la calma, elongacion, recuperacion | Ejercicios de movilidad sueltos (sin grupos). Foam rolling, respiracion | Ejercicios sueltos preferentemente. Grupos solo si hay logica de rotacion |

El LLM puede usar otros nombres si el contexto lo requiere (ej: "Accesorios", "Finisher"), pero estos 3 cubren el 90% de los casos.

**Regla: la seccion NO implica group_type.** Que un ejercicio este en "Entrada en calor" no significa que sea `paired` ni que necesite grupo. La decision de agrupar depende de la relacion entre ejercicios, no de la seccion.

### Caracteristicas

- **Opcionales**: los ejercicios pueden existir sin seccion (se renderizan directamente en el dia).
- **No anidan**: una seccion contiene ejercicios sueltos y/o grupos, pero no otras secciones.
- **Colapsables**: en el widget, cada seccion se muestra con chevron colapsable, label en bold y notas en italica.
- **Con notas**: cada seccion puede tener un `label` (obligatorio) y `notes` (opcional). Las notas describen el **objetivo o enfoque** de la seccion, no instrucciones de ejecucion (esas van en los ejercicios/grupos).
  - **Buen uso**: "Pirámide ascendente en compuestos", "Foco en profundidad de sentadilla"
  - **Mal uso**: "Hacer 3 series de cada ejercicio" (eso va en cada ejercicio), "Alternar sin descanso" (eso lo define el group_type), "Calentar antes de empezar" (obvio en una seccion llamada "Entrada en calor")
- **Se preservan**: al clonar versiones, logear rutinas, o guardar/iniciar templates, las secciones se copian con remap de IDs.

### Formato de entrada (LLM → server)

Tercer discriminador en el array de `exercises` de cada dia:

```json
{
  "day_label": "Día 1 — Peso Muerto + Push Pecho",
  "exercises": [
    {
      "section": "Entrada en calor",
      "notes": "Activación de core y estabilidad",
      "exercises": [
        {
          "group_type": "superset",
          "label": "Core + Estabilidad",
          "rest_seconds": 60,
          "exercises": [
            { "exercise": "Bicho muerto", "sets": 3, "reps": 10, "weight": 35 },
            { "exercise": "Plancha lateral", "sets": 3, "reps": 30 }
          ]
        }
      ]
    },
    {
      "section": "Trabajo principal",
      "notes": "Pirámide ascendente en compuestos",
      "exercises": [
        {
          "group_type": "paired",
          "label": "Peso muerto + Movilidad",
          "rest_seconds": 180,
          "exercises": [
            { "exercise": "Peso muerto", "sets": 3, "reps": [12, 10, 8], "weight": [100, 110, 115] },
            { "exercise": "Movilidad con bastón", "sets": 3, "reps": 30 }
          ]
        },
        {
          "group_type": "circuit",
          "label": "Espalda",
          "rest_seconds": 90,
          "exercises": [
            { "exercise": "Dorsalera", "sets": 3, "reps": 10, "weight": 60 },
            { "exercise": "Remo máquina", "sets": 3, "reps": 10, "weight": 60 }
          ]
        }
      ]
    },
    {
      "section": "Cierre",
      "notes": "Elongación y vuelta a la calma",
      "exercises": [
        { "exercise": "Elongación de isquiotibiales", "sets": 2, "reps": 30 },
        { "exercise": "Respiración diafragmática", "sets": 1, "reps": 60, "notes": "Inhalar 4s, exhalar 6s" }
      ]
    }
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

Ejercicios hechos uno tras otro **sin descanso** entre ellos. Se descansa al completar la ronda. Todos los ejercicios tienen igual importancia.

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
- Entrada en calor: dos ejercicios que se alternan con igual importancia (ej: core + estabilidad)
- 2 ejercicios (a veces 3)

**Cuando NO usarlo:**
- Si un ejercicio es claramente principal y el otro se hace durante su descanso → usar `paired`

**Descanso:** `rest_seconds` del grupo = descanso entre rondas completas.

**Widget:** Header con label + "Superset", colapsable si tiene hermanos.

### paired

Un ejercicio **principal** + un ejercicio **secundario** que se hace durante el descanso del principal (descanso activo). El secundario no debe fatigar al principal.

**Patron de ejecucion:**
```
Ejercicio A (1 serie) → Ejercicio B durante descanso de A → descanso restante → repetir
```

**Ejemplo:** Deadlift 4x5 + Hip Mobility Drill
```
Deadlift x5 → Hip Mobility (durante descanso) → descanso restante → Deadlift x5 → Hip Mobility → ...
```

**Cuando usarlo:**
- Ejercicio compuesto pesado + movilidad/activacion entre series
- Ejercicio principal + trabajo correctivo liviano
- El ejercicio secundario NO debe fatigar al principal
- Siempre 2 ejercicios: el primero es el principal, el segundo es el secundario

**Regla de orden:** El array `exercises` es **semantico**. El primer ejercicio es el principal (pesado, con carga). El segundo es el secundario (movilidad, activacion, correctivo). Invertir el orden rompe la semantica de paired: el widget asume que el primero es el que define el descanso y el segundo se hace durante ese descanso.

**Cuando NO usarlo:**
- Si ambos ejercicios tienen igual importancia → usar `superset`
- En entrada en calor donde ambos ejercicios son livianos y equivalentes → usar `superset`
- Si no hay un ejercicio claramente "principal" con descanso largo → no es paired

**Descanso:** `rest_seconds` del grupo = descanso total del principal (incluye el tiempo del secundario). El secundario se hace *dentro* de ese tiempo.

**Widget:** Header con label + "Paired", colapsable si tiene hermanos.

### circuit

Rotar por 2+ ejercicios en secuencia. Se descansa solo al completar toda la ronda.

**Patron de ejecucion:**
```
Ejercicio A (1 serie) → Ejercicio B (1 serie) → [Ejercicio C ...] → DESCANSO → repetir
```

**Ejemplo:** Circuito de espalda: Dorsalera 3x10 + Remo máquina 3x10
```
Dorsalera x10 → Remo máquina x10 → descanso 90s → repetir
```

**Cuando usarlo:**
- 2 o mas ejercicios que se ejecutan en ronda
- Bloques de accesorios/aislamiento (ej: biceps + triceps)
- Trabajo de conditioning o finishers
- Cuando el objetivo es densidad + algo de cardio

**Cuando NO usarlo:**
- Si uno de los ejercicios es claramente principal y el otro es descanso activo → usar `paired`

**Descanso:** `rest_seconds` del grupo = descanso entre rondas completas. No hay descanso entre ejercicios dentro del circuito (solo el cambio de estacion).

**Widget:** Header con label + "Circuit", colapsable si tiene hermanos.

### Resumen de diferencias

| | superset | paired | circuit |
|---|---|---|---|
| **Ejercicios** | 2 (a veces 3) | 2 (siempre) | 2+ |
| **Relacion** | Igual importancia | Principal + secundario | Igual importancia en ronda |
| **Descanso entre ejercicios** | Ninguno | El secundario se hace *durante* el descanso del principal | Ninguno (solo cambio de estacion) |
| **Descanso entre rondas** | `rest_seconds` del grupo | `rest_seconds` del grupo (incluye tiempo del secundario) | `rest_seconds` del grupo |
| **Objetivo** | Eficiencia / densidad | No perder tiempo en descanso puro | Densidad / volumen / conditioning |
| **Uso tipico** | Antagonistas, warmup pareado | Compuesto + movilidad | Accesorios, finishers |

### Como se asigna el descanso

- **Ejercicio agrupado**: `rest_seconds` vive en el **grupo** (descanso entre rondas). Los ejercicios individuales dentro del grupo NO llevan `rest_seconds`.
- **Ejercicio solo** (sin grupo): `rest_seconds` vive en el ejercicio (descanso entre series).
- En un **superset** o **circuit**: el `rest_seconds` del grupo es el descanso entre rondas completas. No hay descanso entre ejercicios dentro del grupo.
- En un **paired**: el `rest_seconds` del grupo es el descanso total del principal. El ejercicio secundario se hace dentro de ese tiempo.

**Enforcement:** El server **descarta** `rest_seconds` de ejercicios que pertenecen a un grupo (lo guarda como NULL). Si el LLM lo pasa, no causa error pero se pierde. Solo el `rest_seconds` del grupo tiene efecto.

### Notas de grupo

El campo `notes` del grupo debe aportar informacion **que no se pueda expresar con los campos estructurados**. Reglas:

- **NO redundar** con `rest_seconds`: si el grupo tiene `rest_seconds: 90`, no poner `notes: "90 segundos de descanso"`.
- **NO contradecir** `rest_seconds`: si el grupo tiene `rest_seconds: 60`, no poner `notes: "Sin descanso entre ejercicios"` (eso ya esta implicito por el `group_type`).
- **NO restatar la definicion del group_type**: "Alternar sin descanso" es la definicion de superset, "Movilidad durante el descanso" es la definicion de paired, "Circuito sin descanso entre ejercicios" es la definicion de circuit. Esas notas no aportan nada.
- **SI usar para**: instrucciones de ejecucion especificas, variantes, observaciones del entrenador.
- **Ejemplos validos**: "Mantener ritmo constante", "Aumentar peso cada ronda si es posible", "Usar misma barra para ambos ejercicios".
- **Ejemplos invalidos**: "Sin descanso entre ejercicios" (= superset), "Movilidad durante el descanso del peso muerto" (= paired), "Alternar sin descanso" (= superset), "Circuito sin descanso entre ejercicios. Descanso al final de la vuelta" (= circuit). Todas estas repiten lo que el group_type ya dice.

## Tipos de ejercicio (exercise_type)

El `exercise_type` describe la **naturaleza del ejercicio**, no su ubicacion en el workout. Se define en la tabla `exercises` y se hereda automaticamente al resolver el ejercicio.

| Tipo | Descripcion | PRs | Widget |
|---|---|---|---|
| `strength` | Ejercicios con carga, compuestos o aislamiento | Si | Sin tag (default) |
| `mobility` | Movilidad, elongacion, foam rolling, respiracion | No | Tag "Movilidad" en gris |
| `cardio` | Trabajo cardiovascular | No | Tag "Cardio" en gris |
| `warmup` | Ejercicios de calentamiento (jumping jacks, activacion dinamica) | No | Tag "Warmup" en gris |

### Regla clave: exercise_type ≠ ubicacion en el workout

Un ejercicio de movilidad es `mobility` **siempre**, este en "Entrada en calor", "Trabajo principal", o "Cierre". La seccion define *cuando* se hace; el `exercise_type` define *que es*.

**Mal uso:**
```json
{ "exercise": "Plancha lateral", "exercise_type": "warmup" }
```
Plancha lateral es `strength` (o `mobility`), no "warmup". El `exercise_type: "warmup"` es para ejercicios inherentemente de calentamiento como jumping jacks o saltos de activación.

**Buen uso:**
```json
{ "exercise": "Plancha lateral", "sets": 3, "reps": 30 }
```
El `exercise_type` se resuelve automaticamente del ejercicio existente en la DB. No hace falta pasarlo al crear el programa salvo que sea un ejercicio nuevo y se quiera especificar.

### Regla: exercise_type "warmup" vs sección "Entrada en calor"

El `exercise_type: "warmup"` existe y es válido para ejercicios específicos de calentamiento (jumping jacks, saltos, activación). Sin embargo, **la sección define cuándo se hace, no el tipo de ejercicio**:

- Un ejercicio de movilidad en "Entrada en calor" sigue siendo `mobility`
- Un ejercicio de fuerza liviano en "Entrada en calor" sigue siendo `strength`
- Solo usar `warmup` para ejercicios que son inherentemente de calentamiento (cardio dinámico, activación general)

### exercise_type NO es un campo del programa

El LLM **no pasa** `exercise_type` ni `rep_type` al crear un programa. Estos campos viven en la tabla `exercises` y se resuelven automaticamente por el exercise resolver. Si el ejercicio no existe en la DB, el resolver lo crea con los defaults (`strength` / `reps`).

Si el LLM necesita crear un ejercicio con un tipo especifico, debe usar `manage_exercises` action "add" antes de crear el programa, o confiar en que el resolver asigne el tipo correcto basado en el nombre.

**Enforcement:** El Zod schema de `manage_program` no acepta `exercise_type` ni `rep_type` en los ejercicios. Si se pasan, Zod los ignora (strict mode no esta activado, pero los campos no se usan).

## Grupo muscular (muscle_group)

El `muscle_group` vive en la tabla `exercises` y se resuelve automaticamente. El widget muestra chips de grupos musculares en el header de cada dia (ej: "Core", "Back", "Quads").

El LLM no pasa `muscle_group` al crear un programa. Si un ejercicio se crea automaticamente por el resolver y no tiene muscle_group, el chip queda vacio. Para completar muscle_groups de ejercicios existentes, usar `manage_exercises` action "update".

## Tipos de repeticion (rep_type)

El `rep_type` define la **unidad** de las repeticiones. Se define en la tabla `exercises`.

| Tipo | Unidad | Widget | Ejemplo |
|---|---|---|---|
| `reps` | Repeticiones | "r" | 3×10 r |
| `seconds` | Segundos | "s" | 3×30 s |
| `meters` | Metros | "m" | 3×400 m |
| `calories` | Calorias | "cal" | 3×20 cal |

Default es `reps`. El `rep_type` se hereda del ejercicio resuelto en la DB.

## Esquema de repeticiones y peso (per-set targets)

Los campos `reps` y `weight` aceptan **numero** o **array de numeros**:

### Uniforme (sin variacion por serie)

```json
{ "exercise": "Bench Press", "sets": 3, "reps": 10, "weight": 80 }
```
Widget: **3×10** r · **80** kg

### Reps variables (piramide)

```json
{ "exercise": "Bench Press", "sets": 3, "reps": [12, 10, 8], "weight": 80 }
```
Widget: **3×(12/10/8)** r · **80** kg — colapsable con detalle por serie.

### Peso variable

```json
{ "exercise": "Bench Press", "sets": 3, "reps": 10, "weight": [80, 85, 90] }
```
Widget: **3×10** r · **80→90** kg — colapsable con detalle por serie.

### Ambos variables

```json
{ "exercise": "Bench Press", "sets": 3, "reps": [12, 10, 8], "weight": [80, 85, 90] }
```
Widget: **3×(12/10/8)** r · **80→90** kg — colapsable con detalle por serie:
```
Serie 1   12 reps · 80 kg
Serie 2   10 reps · 85 kg
Serie 3    8 reps · 90 kg
```

### Reglas

- Cuando `reps` o `weight` es array, su **length debe ser igual a `sets`**.
- No poner info de reps/peso en `notes` si se puede expresar con arrays. Las notas son para info que no tiene campo estructurado.
- En la DB: `target_reps` y `target_weight` guardan el valor escalar (primer elemento si es array). `target_reps_per_set` y `target_weight_per_set` guardan el array completo (NULL si es uniforme).

## Notas de ejercicio

El campo `notes` del ejercicio aporta informacion que **no se puede expresar con campos estructurados**. Se muestra como tooltip ⓘ en el widget.

### Buen uso de notas

- Indicaciones de forma: "Agarre mixto en serie pesada", "Codos fijos"
- Variantes: "12kg c/lado", "Barra EZ"
- Rangos de reps: "6 a 10 reps según capacidad" (cuando no es un esquema fijo)
- Instrucciones del entrenador: "Pausa arriba 1s"

### Mal uso de notas

- **Redundar con campos**: "3 series de 10" (ya esta en sets/reps), "Descanso 90s" (ya esta en rest_seconds)
- **Redundar con seccion**: "Esto es entrada en calor" (la seccion ya lo dice)
- **Redundar con group_type**: "Hacer en superserie" (ya esta en group_type)
- **Esquemas de reps**: "reps: 12/10/8" → usar `reps: [12, 10, 8]` en su lugar

## Weekdays (dias de la semana)

Cada dia puede tener `weekdays` opcional: array de enteros ISO (1=Lunes, 7=Domingo).

- Si se asignan, el LLM puede usar `get_today_plan` para saber que toca hoy.
- Si no se asignan, el programa es flexible (el usuario elige que dia hacer).
- Ejemplo: Upper/Lower 4x con weekdays `[1], [2], [4], [5]` = Lun/Mar/Jue/Vie.

## Versionado

Cada edicion estructural (cambios en `days`/ejercicios) crea una **nueva version**. Esto aplica tanto a:
- `manage_program` action `"update"` cuando se pasa `days`
- `manage_program` action `"patch"` cuando se pasa `days` (usado por el widget editor)

La version anterior queda inmutable en el historial. Esto permite:

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
