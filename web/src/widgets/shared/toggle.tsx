export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

const sizes = {
  sm: { width: 36, height: 20, knob: 16, translate: 16 },
  md: { width: 42, height: 24, knob: 20, translate: 18 },
};

export function Toggle({ checked, onChange, disabled, size = 'md' }: ToggleProps) {
  const s = sizes[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`toggle ${checked ? "toggle-checked" : ""}`}
      onClick={() => onChange(!checked)}
      style={{
        width: s.width,
        height: s.height,
        borderRadius: s.height / 2,
        border: "none",
        padding: 2,
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--primary)" : "var(--border)",
        transition: "background 0.2s",
        display: "flex",
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          width: s.knob,
          height: s.knob,
          borderRadius: "50%",
          background: "white",
          transform: checked ? `translateX(${s.translate}px)` : "translateX(0)",
          transition: "transform 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}
