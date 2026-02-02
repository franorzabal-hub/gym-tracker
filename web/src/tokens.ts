// Design tokens — JS constants for inline styles with TS autocomplete.
// CSS variables handle light/dark theming; these are theme-independent values.

/** Spacing scale (px) */
export const sp = {
  0: 0, 0.5: 1, 1: 2, 1.5: 3, 2: 4, 3: 6, 4: 8, 5: 10, 6: 12, 8: 16, 10: 20, 12: 24, 16: 32,
} as const;

/** Border radius (px) */
export const radius = {
  xs: 3, sm: 4, md: 8, lg: 12, xl: 16, full: "50%",
} as const;

/** Font size (px) */
export const font = {
  "2xs": 9, xs: 10, sm: 11, base: 12, md: 13, lg: 14, xl: 15, "2xl": 18, "3xl": 22, "4xl": 24,
} as const;

/** Font weight */
export const weight = {
  normal: 400, medium: 500, semibold: 600, bold: 700,
} as const;

/** Opacity levels */
export const opacity = {
  muted: 0.4, medium: 0.6, subtle: 0.7, high: 0.8,
} as const;

/** Widget max width */
export const maxWidth = { widget: 600 } as const;
