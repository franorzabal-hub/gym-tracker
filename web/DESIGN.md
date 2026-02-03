# Gym Tracker - Design System

Guía de diseño para mantener consistencia visual en todos los widgets.

## Tokens

Los tokens de diseño están definidos en `src/tokens.ts`:

```typescript
// Spacing (px)
sp: { 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16 }

// Font sizes (px)
font: { "2xs": 10, xs: 11, sm: 12, base: 13, md: 14, lg: 15, xl: 16, "2xl": 20, "3xl": 24, "4xl": 28 }

// Font weights
weight: { normal: 400, medium: 500, semibold: 600, bold: 700 }

// Opacity
opacity: { muted: 0.4, medium: 0.6, subtle: 0.7, high: 0.8 }

// Border radius (px)
radius: { xs: 3, sm: 4, md: 8, lg: 12, xl: 16, full: "50%" }
```

**Regla:** Siempre usar tokens en lugar de valores hardcodeados.

---

## Badges

### Colores por Semántica

| Color | Clase | Uso | Ejemplos |
|-------|-------|-----|----------|
| **Verde** | `badge-success` | Estados positivos, completado, activo | "Completed", "Active", PR logrado |
| **Amarillo** | `badge-warning` | Atención, logros, destacados | "PR", "New Record", pausado |
| **Rojo** | `badge-danger` | Errores, eliminación, fallo | "Failed", "Skipped", advertencias |
| **Azul** | `badge-primary` | Selección, acción principal | Día seleccionado, filtro activo |
| **Gris** | `badge-muted` | Neutral, metadata, informativo | Grupos musculares, tags, "Inactive" |

### Contexto de Uso

| Ubicación | Tipo de Badge | Color típico |
|-----------|---------------|--------------|
| Junto al título | Estado del objeto | success/muted (Active/Inactive/Completed) |
| Línea de metadata | Categorías, tags | muted (neutral, no distrae) |
| En listas/cards | Indicadores de estado | success/warning/danger según estado |
| Inline en texto | Logros, destacados | warning (PR), success (récord) |

### Tamaño

Todos los badges usan la clase `.badge` base:
- Font size: 12px
- Padding: 2px 8px
- Border radius: 12px
- Font weight: 500

**Regla:** Tamaño único. El color comunica la jerarquía, no el tamaño.

### Reglas de Uso

1. **Máximo 2 badges por línea** - evitar ruido visual
2. **Estado siempre junto al título** - contexto inmediato
3. **Metadata en línea secundaria** - no compite con título
4. **Colores semánticos** - verde=bueno, rojo=malo, amarillo=atención, gris=neutral

---

## Chips (Interactivos)

Para elementos seleccionables usar `.chip`:

```css
.chip { padding: 4px 12px; border-radius: 16px; font-size: 13px; }
.chip-active { /* estilo seleccionado */ }
```

Usar chips cuando el usuario puede interactuar (filtros, selección múltiple).
Usar badges para información de solo lectura.

---

## Layout de Widgets

### Estructura de Header

```
┌─────────────────────────────────────────┐
│ Título [Badge Estado]        Fecha/Info │  ← Línea 1
│ [Chip] [Chip]              Stats texto  │  ← Línea 2 (metadata)
├─────────────────────────────────────────┤
│                                         │
│ Contenido                               │  ← Contenido principal
│                                         │
└─────────────────────────────────────────┘
```

### Espaciado Consistente

| Elemento | Spacing | Token |
|----------|---------|-------|
| Header → Contenido | 16px | `sp[8]` |
| Entre items de lista | 6-8px | `sp[3]` o `sp[4]` |
| Padding de contenedor | 16px | `sp[8]` (via `.profile-card`) |

### Contenedores

- `.profile-card`: Contenedor principal con `padding: 0 16px`
- Body tiene `padding: 16px`
- Total desde borde de pantalla: 32px

---

## Tipografía

### Jerarquía

| Nivel | Clase/Token | Uso |
|-------|-------------|-----|
| Título | `.title` (20px, 600) | Nombre del widget |
| Subtítulo | `font.md` (14px) + `--text-secondary` | Fecha, stats |
| Body | `font.base` (13px) | Nombres de ejercicios |
| Caption | `font.sm`/`font.xs` (12px/11px) + muted | Metadata, números |

### Colores de Texto

- `var(--text)`: Texto principal
- `var(--text-secondary)`: Texto secundario, metadata
- `opacity.muted` (0.4): Texto muy sutil (números de ejercicio)

---

## Listas de Ejercicios

### Estructura de Fila

```
┌─────────────────────────────────────────┐
│ 1  Nombre del Ejercicio      3×8-12r · 60kg │
└─────────────────────────────────────────┘
  ↑                              ↑
  Número (sutil,                 Métricas (secundario,
  position absolute,             font.sm, text-secondary)
  left: -sp[6])
```

### Números de Ejercicio

- Posición: `position: absolute; left: -sp[6]` (dentro del padding)
- Estilo: `font.xs`, `opacity.muted`
- Propósito: Decorativo, no compite con el nombre

### Métricas

- Formato compacto: `3×8-12r · 60kg` (rango min-max)
- Color: `--text-secondary`
- Peso: `weight.semibold`

### Separadores

- Entre ejercicios: `1px solid` con `color-mix(var(--border) 20%, transparent)`
- Sutiles, ayudan al escaneo sin agregar ruido

---

## Dark Mode

Todos los colores usan `light-dark()` o CSS variables que se adaptan automáticamente:

- `var(--bg)`, `var(--bg-secondary)`
- `var(--text)`, `var(--text-secondary)`
- `var(--border)`
- `var(--primary)`, `var(--success)`, `var(--warning)`, `var(--danger)`

**Regla:** Nunca usar colores hardcodeados. Siempre usar variables CSS.
