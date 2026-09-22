"use client";
import { fmtDecimalBR } from "@/lib/numberBR";

/**
 * Widget de nota. `max` é o teto real da nota (5 pra cerveja, 100 pra vinho); `starCount` é quantas
 * estrelas desenhar (5 ou 10) - cada estrela vale `max/starCount` pontos; `step` é o menor
 * incremento escolhível, na mesma unidade de `max`.
 *
 * Duas zonas por estrela (o `step: 0.5` de sempre - cerveja/destilado/drink, meia estrela) usam
 * clique discreto, como sempre foi: dois alvos lado a lado, ⌐meio/direita¬. Mais que isso por
 * estrela (vinho, pedido do Carlos 2026-09-22: "estrela vale 10 pontos, 1/10 de estrela" = 10
 * zonas por estrela) não dá pra clicar com precisão em alvos de ~3px - por isso vira um
 * `&lt;input type="range"&gt;` nativo sobreposto ao desenho das estrelas: o navegador cuida do
 * arraste/toque/teclado, a estrela é só o visual por baixo.
 */
export default function RatingInput({
  value,
  onChange,
  max = 5,
  starCount = max,
  step = 0.5,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  starCount?: number;
  step?: number;
}) {
  const pointsPerStar = max / starCount;
  const zonesPerStar = pointsPerStar / step;
  const casas = step >= 1 ? 0 : 1;
  const fillPct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {zonesPerStar > 2 ? (
        <div className="relative h-8" style={{ width: starCount * 32 }}>
          <div className="pointer-events-none absolute inset-0 flex items-center text-[28px] leading-none text-border">
            {"★".repeat(starCount)}
          </div>
          <div
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden text-[28px] leading-none text-accent"
            style={{ width: `${fillPct}%` }}
          >
            {"★".repeat(starCount)}
          </div>
          <input
            type="range"
            min={0}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      ) : (
        <div className="flex">
          {Array.from({ length: starCount }, (_, i) => {
            const base = i * pointsPerStar;
            const fill = Math.max(0, Math.min(1, (value - base) / pointsPerStar));
            return (
              <div key={i} className="relative h-8 w-8">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[28px] leading-none text-border">
                  ★
                </div>
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden text-[28px] leading-none text-accent"
                  style={{ width: `${fill * 100}%` }}
                >
                  ★
                </div>
                <button
                  type="button"
                  aria-label={`${base + pointsPerStar / 2}`}
                  onClick={() => onChange(base + pointsPerStar / 2)}
                  className="absolute left-0 top-0 h-full w-1/2"
                />
                <button
                  type="button"
                  aria-label={`${base + pointsPerStar}`}
                  onClick={() => onChange(base + pointsPerStar)}
                  className="absolute right-0 top-0 h-full w-1/2"
                />
              </div>
            );
          })}
        </div>
      )}
      <span className="text-[14px] font-bold text-muted">
        {value ? fmtDecimalBR(value, casas) : "—"}
      </span>
    </div>
  );
}
