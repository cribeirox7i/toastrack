/** Small shared UI primitives used across screens. */

/** Read-only 5-star row supporting halves (0–5, 0.5 steps) via a clipped overlay. */
export function Stars({ value, className = "text-[13px]" }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span
      className={`relative inline-block leading-none ${className}`}
      aria-label={`${value} de 5 estrelas`}
    >
      <span className="text-border">★★★★★</span>
      <span
        className="absolute left-0 top-0 overflow-hidden text-accent"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      >
        ★★★★★
      </span>
    </span>
  );
}

/** Striped 45° placeholder box with a monospace caption, per the design token.
 *  Marks every spot that still needs a real photo. */
export function Thumb({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden p-1 text-center font-mono text-[8px] leading-tight text-muted ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, var(--accent-soft) 0 10px, var(--border) 10px 20px)",
      }}
    >
      <span className="line-clamp-3">Foto: {label}</span>
    </div>
  );
}

/** "2026-06-01" -> "01/06/2026". Returns "" for empty/invalid. */
export function formatDate(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
