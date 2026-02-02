import type { Day } from "./program-view.js";
import { WEEKDAY_LABELS } from "./program-view.js";
import { sp } from "../../tokens.js";

interface WeekdayPillsProps {
  days?: Day[];
  activeDays?: number[];
  highlightedDays?: number[];
  /** @deprecated Use highlightedDays */
  viewingWeekdays?: number[];
  onDayClick?: (dayIdx: number) => void;
  /** @deprecated Use onDayClick */
  onWeekdayClick?: (dayIdx: number) => void;
  size?: "sm" | "md";
  /** Days added in a pending diff (shown with dashed green) */
  addedDays?: number[];
  /** Days removed in a pending diff (shown with strikethrough red) */
  removedDays?: number[];
}

export function WeekdayPills({ days, activeDays, highlightedDays, viewingWeekdays, onDayClick, onWeekdayClick, size = "sm", addedDays, removedDays }: WeekdayPillsProps) {
  // Map each weekday number → first day index that uses it
  const weekdayToDayIdx = new Map<number, number>();
  days?.forEach((d, idx) => d.weekdays?.forEach(w => {
    if (!weekdayToDayIdx.has(w)) weekdayToDayIdx.set(w, idx);
  }));

  // activeDays prop overrides; if not provided, derive from days data
  const activeSet = activeDays
    ? new Set(activeDays)
    : new Set(weekdayToDayIdx.keys());
  const highlighted = highlightedDays || viewingWeekdays || [];
  const highlightedSet = new Set(highlighted);
  const addedSet = new Set(addedDays || []);
  const removedSet = new Set(removedDays || []);
  const clickHandler = onDayClick || onWeekdayClick;

  return (
    <div style={{ display: "flex", gap: sp[3] }}>
      {WEEKDAY_LABELS.map((label, i) => {
        const dayNum = i + 1;
        const active = activeSet.has(dayNum);
        const isHighlighted = highlightedSet.has(dayNum);
        const isAdded = addedSet.has(dayNum);
        const isRemoved = removedSet.has(dayNum);
        const clickable = active && clickHandler;
        const classes = [
          "weekday-pill",
          `weekday-pill-${size}`,
          isAdded ? "diff-added" : isRemoved ? "diff-removed" : active ? "active" : "",
          isHighlighted ? "highlighted" : "",
        ].filter(Boolean).join(" ");

        return (
          <div
            key={i}
            className={classes}
            onClick={clickable ? () => clickHandler(weekdayToDayIdx.get(dayNum)!) : undefined}
            style={{ cursor: clickable ? "pointer" : "default" }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}
