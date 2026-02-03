/**
 * Shared components for pending_changes diff display pattern.
 * Used by widgets that show LLM-proposed edits with visual diff + confirm button.
 */

/**
 * Displays a value change: old → new
 * Shows crossed-out old value followed by new value in green.
 */
export function DiffValue({ current, pending, format }: {
  current: any;
  pending: any;
  format?: (v: any) => string;
}) {
  const fmt = format || ((v: any) => String(v ?? "—"));
  const hasOld = current != null && current !== "";
  return (
    <span>
      {hasOld && <span className="diff-old">{fmt(current)}</span>}
      {hasOld && " "}
      <span className="diff-new">{fmt(pending)}</span>
    </span>
  );
}

/**
 * Sticky confirmation bar for pending changes.
 * Shows "Confirm Changes" button or "Updated" flash after confirmation.
 */
export function ConfirmBar({ onConfirm, confirming, confirmed, className }: {
  onConfirm: () => void;
  confirming: boolean;
  confirmed: boolean;
  className?: string;
}) {
  return (
    <div className={className || "confirm-bar-sticky"} role="status" aria-live="polite">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {confirmed ? (
          <span className="profile-confirm-flash">Updated</span>
        ) : (
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={confirming}
            aria-busy={confirming}
          >
            {confirming ? "Saving..." : "Confirm Changes"}
          </button>
        )}
      </div>
    </div>
  );
}
