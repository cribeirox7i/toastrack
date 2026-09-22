"use client";
import { fmtDecimalBR } from "@/lib/numberBR";

/**
 * Widget de nota, tocável. `step: 0.5` (padrão - cerveja/destilado/drink) desenha `max` estrelas
 * com duas hit-areas cada (metade esquerda = x.5, direita = x.0), igual sempre foi. `step: 1`
 * (vinho, pedido do Carlos 2026-09-22: escala 1-10 inteira) desenha `max` estrelas com UMA hit-area
 * cada, sempre valor inteiro - sem meia estrela.
 */
export default function RatingInput({
  value,
  onChange,
  max = 5,
  step = 0.5,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  step?: 0.5 | 1;
}) {
  const casas = step === 1 ? 0 : 1;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex">
        {Array.from({ length: max }, (_, i) => {
          const fill = Math.max(0, Math.min(1, value - i));
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
              {step === 1 ? (
                <button
                  type="button"
                  aria-label={`${i + 1} estrelas`}
                  onClick={() => onChange(i + 1)}
                  className="absolute inset-0 h-full w-full"
                />
              ) : (
                <>
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
                </>
              )}
            </div>
          );
        })}
      </div>
      <span className="text-[14px] font-bold text-muted">
        {value ? fmtDecimalBR(value, casas) : "—"}
      </span>
    </div>
  );
}
