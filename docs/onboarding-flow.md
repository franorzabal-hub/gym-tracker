# Onboarding Flow — Gym Tracker

## Contexto

El usuario acaba de conectar el MCP server por primera vez. No tiene perfil, no tiene programa, no tiene historial. Claude detecta esto y arranca el onboarding.

## Detección

Claude llama `get_context` en el primer mensaje de cada conversación (antes de responder). Si la respuesta trae `required_action = "setup_profile"`, es un usuario nuevo y se inicia el onboarding. Si trae `required_action = "choose_program"`, falta elegir programa.

---

## Paso 0: Bienvenida

**Qué ve el usuario:**
- Qué es Gym Tracker: "Soy tu compañero de gym. Decime qué hiciste y yo lo registro."
- Cómo funciona: hablar natural en español o inglés, Claude interpreta y usa las tools
- Qué puede hacer: trackear entrenamientos, programas, progresión, PRs, medidas corporales

**Acción del usuario:** Entender y continuar.

**Widget:** Pantalla de bienvenida con breve explicación visual. Puede ser parte del wizard o un mensaje de Claude con un widget estático.

---

## Paso 1: Perfil

**Qué le pregunta Claude (conversacional):**
- Nombre
- Peso actual (kg)
- Altura (cm)
- Objetivo principal:
  - Fuerza (levantar más peso)
  - Hipertrofia (ganar músculo)
  - General / fitness
  - Bajar de peso
- Nivel de experiencia:
  - Principiante (< 6 meses)
  - Intermedio (6 meses - 2 años)
  - Avanzado (> 2 años)
- Días disponibles para entrenar por semana (3, 4, 5, 6)

**Tool:** `manage_profile` update con toda la data en JSONB.

**Widget:** Formulario de perfil (puede ser el widget Profile existente adaptado para modo "setup").

**Notas:**
- Todo es opcional excepto nombre. Claude puede inferir o preguntar después.
- El peso se guarda también como primera medida corporal (`manage_body_measurements` log weight_kg).
- Los días disponibles se usan para recomendar programa en el paso 2.

---

## Paso 2: Programa / Rutina

**Lógica de recomendación según perfil:**

| Días/semana | Experiencia | Recomendación |
|---|---|---|
| 3 | Principiante | Full Body 3x |
| 3 | Intermedio+ | Full Body 3x o Upper/Lower/Full |
| 4 | Cualquiera | Upper/Lower 4x |
| 5 | Intermedio+ | Push/Pull/Legs + Upper/Lower |
| 6 | Intermedio+ | Push/Pull/Legs 2x |

**Opciones que ve el usuario:**
1. **Usar plantilla recomendada** → Claude sugiere una basada en días y experiencia
2. **Elegir otra plantilla** → lista de templates disponibles (PPL, Upper/Lower, Full Body, Bro Split)
3. **Crear desde cero** → Claude guía ejercicio por ejercicio
4. **Saltar** → "Después configuro la rutina, quiero empezar a registrar"

### Opción 1-2: Plantilla

Claude crea el programa con ejercicios predefinidos. El usuario puede:
- Aceptar tal cual
- Modificar (cambiar ejercicios, series, reps)
- Ver detalle antes de confirmar

**Plantillas sugeridas:**

#### Full Body 3x (Lunes/Miércoles/Viernes)
- Día A: Squat, Bench Press, Barbell Row, OHP, Deadlift (accesorio)
- Día B: Deadlift, Incline Bench, Pull-ups, Lateral Raise, Leg Curl
- Día C: Front Squat, Dips, Cable Row, Face Pull, Lunges

#### Upper/Lower 4x (Lun/Mar/Jue/Vie)
- Upper A: Bench Press, Barbell Row, OHP, Pull-ups, Tricep Extension, Bicep Curl
- Lower A: Squat, Romanian Deadlift, Leg Press, Leg Curl, Calf Raise
- Upper B: Incline Bench, Cable Row, Dumbbell Press, Lat Pulldown, Face Pull
- Lower B: Deadlift, Bulgarian Split Squat, Leg Extension, Hip Thrust, Calf Raise

#### PPL 6x (Lun-Sáb)
- Push: Bench Press, OHP, Incline Dumbbell, Lateral Raise, Tricep Pushdown, Overhead Extension
- Pull: Deadlift, Pull-ups, Barbell Row, Face Pull, Bicep Curl, Hammer Curl
- Legs: Squat, Romanian Deadlift, Leg Press, Leg Curl, Calf Raise, Lunges

### Opción 3: Desde cero

Claude guía:
1. "¿Cuántos días por semana?"
2. "¿Cómo querés dividirlo?" (por grupo muscular, upper/lower, full body)
3. Por cada día: "¿Qué ejercicios querés incluir?"
4. Claude sugiere series/reps según objetivo del perfil

### Opción 4: Saltar

Claude guarda que el onboarding está incompleto. Puede recordar después:
"Vi que todavía no tenés un programa armado. ¿Querés que te ayude a armar uno?"

**Tool:** `manage_program` create + activate
**Widget:** Programs (vista de creación/selección de plantilla)

---

## Paso 3: Confirmación

**Qué ve el usuario:**
- Resumen del perfil configurado
- Programa seleccionado con días y ejercicios
- "Estás listo. La próxima vez que quieras entrenar decime 'qué me toca hoy' o 'empezar entrenamiento'."

**Qué puede hacer:**
- Editar algo (vuelve al paso correspondiente)
- Confirmar y empezar

**Widget:** Resumen visual del setup completo (perfil + programa).

---

## Edge Cases

### Usuario que ya entrenaba en otra app
- "Ya tengo mi rutina, solo quiero registrar"
- → Opción 4 (saltar programa) o crear programa custom rápido

### Usuario que no sabe nada de gym
- Experiencia = principiante, no sabe qué ejercicios elegir
- → Claude recomienda Full Body 3x con explicación de cada ejercicio
- → Puede agregar descripciones/tips para cada ejercicio

### Usuario que vuelve después de un tiempo
- Tiene perfil pero programa desactualizado
- → No es onboarding, pero Claude puede sugerir revisar/actualizar programa

### Onboarding parcial
- Usuario completó perfil pero no programa (o viceversa)
- → Claude detecta qué falta y retoma desde ahí
- → Guardar estado de onboarding en `user_profile` JSONB: `{ onboarding: { completed: false, step: "program" } }`

---

## Estado de Onboarding en Perfil

Guardar en `user_profile.data` JSONB:

```json
{
  "name": "Franco",
  "weight_kg": 80,
  "height_cm": 178,
  "goal": "hypertrophy",
  "experience": "intermediate",
  "available_days": 4,
  "onboarding": {
    "completed": true,
    "completed_at": "2025-01-15T10:00:00Z",
    "skipped_program": false
  }
}
```

Esto permite que Claude sepa si necesita retomar el onboarding o no.

---

## Flujo conversacional de ejemplo

```
Claude: ¡Hola! Soy tu compañero de gym. Hablame natural y yo me encargo
        de registrar todo. Para arrancar, contame un poco de vos.
        ¿Cómo te llamás?

User:   Franco

Claude: Franco, ¿cuánto pesás y medís? (aproximado está bien)

User:   80kg, 1.78

Claude: ¿Cuál es tu objetivo principal?
        - Ganar fuerza
        - Ganar músculo (hipertrofia)
        - Fitness general
        - Bajar de peso

User:   Hipertrofia

Claude: ¿Cuánto tiempo llevás entrenando?

User:   Como un año y medio

Claude: Y por último, ¿cuántos días por semana podés ir al gym?

User:   4

Claude: Perfecto. Con 4 días y tu experiencia, te recomiendo un
        programa Upper/Lower. Es ideal para hipertrofia:

        Lunes    → Upper A (Bench, Row, OHP, Pull-ups, Tris, Bis)
        Martes   → Lower A (Squat, RDL, Leg Press, Leg Curl, Calves)
        Jueves   → Upper B (Incline, Cable Row, DB Press, Lat Pull, Face Pull)
        Viernes  → Lower B (Deadlift, BSS, Leg Ext, Hip Thrust, Calves)

        ¿Te parece bien o querés cambiar algo?

User:   Me gusta pero sacá hip thrust y poné más squat

Claude: Listo, cambié Hip Thrust por Front Squat en Lower B.
        Todo configurado:

        [Widget: resumen de perfil + programa]

        La próxima vez que quieras entrenar, decime "qué me toca"
        o "vamos a entrenar". ¡Éxitos!
```
