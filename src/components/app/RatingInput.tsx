"use client";

/** Tap-to-set half-star rating widget (0–5 in 0.5 steps). Each star has two
 *  half-width hit areas; the left sets x.5, the right sets x.0. */
export default function RatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex">
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, value - i)); // 0, .5 or 1
          return (
            <div key={i} className="relative h-8 w-8">
              {/* outline + fill */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[28px] leading-none text-border">
                ★
              </div>
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden text-[28px] leading-none text-accent"
                style={{ width: `${fill * 100}%` }}
              >
                ★
              </div>
              {/* hit areas */}
              <button
                type="button"
                aria-label={`${i + 0.5} estrelas`}
                onClick={() => onChange(i + 0.5)}
                className="absolute left-0 top-0 h-full w-1/2"
              />
              <button
                type="button"
                aria-label={`${i + 1} estrelas`}
                onClick={() => onChange(i + 1)}
                className="absolute right-0 top-0 h-full w-1/2"
              />
            </div>
          );
        })}
      </div>
      <span className="text-[14px] font-bold text-muted">{value ? value.toFixed(1) : "—"}</span>
    </div>
  );
}
