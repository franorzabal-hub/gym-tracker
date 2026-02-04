# Gym Tracker Tool Evaluation

Evaluacion de las tool definitions de gym-tracker usando Promptfoo.

## Objetivo

Evaluar que los LLMs:
1. **Elijan la tool correcta** dado un prompt en espanol
2. **Generen parametros correctos** segun el contexto
3. **No pidan confirmacion** para acciones de carga

## Estructura

```
evals/
├── promptfooconfig.yaml  # Config principal con tests
├── system-prompt.txt     # System prompt con instrucciones
├── tools.json           # Tool definitions (JSON Schema)
├── results/             # Resultados de evaluaciones
└── README.md
```

## Setup

### 1. Instalar Promptfoo

```bash
npm install -g promptfoo
# o usar npx directamente
```

### 2. Configurar API Keys

```bash
# Para Claude (Anthropic)
export ANTHROPIC_API_KEY=sk-ant-...

# Para OpenAI
export OPENAI_API_KEY=sk-...
```

### 3. (Opcional) Configurar CLIs para MCP

Si quieres evaluar con los CLIs conectados al MCP server real, descomentar los providers CLI en `promptfooconfig.yaml`.

**Claude Code** (`~/.claude.json`):

```json
{
  "mcpServers": {
    "gym-tracker": {
      "command": "node",
      "args": ["/path/to/gym-tracker/dist/server.js"],
      "env": {
        "DATABASE_URL": "...",
        "DEV_USER_ID": "1"
      }
    }
  }
}
```

**Codex CLI** ([docs](https://developers.openai.com/codex/cli/reference/)):

```bash
# Instalar
npm i -g @openai/codex
# o: brew install --cask codex

# Autenticar (OAuth o API key)
codex auth

# Modo no-interactivo para evals (JSON output)
codex exec --json --model gpt-5.2-chat-latest --full-auto "prompt"
```

## Ejecutar Evaluacion

```bash
cd evals

# Correr todos los tests
npx promptfoo eval

# Ver resultados en browser
npx promptfoo view

# Correr subset de tests
npx promptfoo eval --filter-pattern "log_workout"

# Usar provider especifico
npx promptfoo eval --providers exec:claude
```

## Estructura de Tests

### Categorias

| Categoria | Tools | Casos |
|-----------|-------|-------|
| log_workout | log_workout | Cargar ejercicios, dias completos, bulk, backdating |
| manage_program | manage_program | CRUD programas, patch, add/remove exercises |
| edit_workout | edit_workout | Corregir sets, borrar, agregar, validar |
| end_workout | end_workout | Finalizar sesion |
| get_* | get_workouts, get_today_plan | Consultas de historial |
| show_* | show_workout, show_workouts, show_program, show_programs | Display widgets |

### Tipos de Tests

1. **Casos basicos**: Happy path, parametros correctos
2. **Ambiguedades**: Diferenciar entre tools similares
3. **Edge cases**: Bodyweight, cardio, piramides, negativos

## Assertions

Cada test verifica:

```yaml
assert:
  - type: javascript
    value: |
      // Verificar que se llamo la tool correcta
      const tc = JSON.parse(output).tool_calls || [];
      const call = tc.find(c => c.name === 'expected_tool');
      if (!call) return { pass: false, reason: 'Tool not called' };

      // Verificar parametros
      const args = call.arguments || {};
      return { pass: args.param === expected, reason: `Got ${args.param}` };
```

## Resultados

Los resultados se guardan en `results/eval-{timestamp}.json`.

Para ver metricas:
```bash
npx promptfoo view
```

## Agregar Tests

Agregar nuevos tests en `promptfooconfig.yaml`:

```yaml
tests:
  - description: "descripcion del test"
    vars:
      prompt: "El prompt en espanol del usuario"
    assert:
      - type: javascript
        value: |
          // Logica de verificacion
```

## Tips

1. **Ambiguedades comunes:**
   - "agregar ejercicio" puede ser log_workout (sesion) o manage_program (rutina)
   - "mostrar" → show_* tools, no get_*
   - "corregir" → edit_workout, no log_workout

2. **Parametros importantes:**
   - `set_numbers: [-1]` = ultimo set
   - `workout: "yesterday"` = sesion de ayer
   - `program_day` vs `exercise` determinan modo de log_workout

3. **No-confirmation tests:**
   - Verificar que NO aparezcan patrones como "confirmar", "quieres que"
