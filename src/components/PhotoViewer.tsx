"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Visualizador de foto em tela cheia (pedido do Carlos 2026-09-02: clicar na foto do Detalhe
 * abre em pop-up ocupando a tela toda, com zoom manual). Sem biblioteca externa - a implementação
 * é toda na mão porque o app roda com `userScalable: false`/`maximumScale: 1` no viewport
 * (layout.tsx, pra evitar zoom acidental nas telas normais), então o pinça-pra-ampliar nativo do
 * navegador está desligado no app inteiro e não dava pra reaproveitar aqui.
 *
 * Gestos suportados: pinça de dois dedos (zoom), arrastar com um dedo/mouse quando ampliado
 * (pan), duplo toque/clique (alterna 1x <-> 2.5x), roda do mouse (zoom, desktop). Sempre volta a
 * 1x/centralizado ao trocar de foto ou fechar.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

function touchDistance(a: React.Touch, b: React.Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export default function PhotoViewer({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // Espelha scale/pos em ref pra ler o valor atual dentro dos handlers de toque sem precisar
  // recriar os listeners a cada render (evita "stale closure" no meio de um gesto em andamento).
  const live = useRef({ scale: 1, pos: { x: 0, y: 0 } });
  useEffect(() => {
    live.current = { scale, pos };
  }, [scale, pos]);

  const dragRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const [gesturing, setGesturing] = useState(false);

  // Não precisa resetar zoom/posição num efeito ligado a `src`: quem chama isto (DetailScreen)
  // desmonta o PhotoViewer ao fechar (`{photoViewerOpen && <PhotoViewer .../>}`), então trocar de
  // foto sempre é um mount novo - os useState já nascem em 1x/centralizado.

  // Trava o scroll da página por trás enquanto o pop-up está aberto.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function resetZoom() {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }

  function toggleZoom() {
    if (live.current.scale > 1) resetZoom();
    else setScale(DOUBLE_TAP_SCALE);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      setGesturing(true);
      pinchRef.current = { startDist: touchDistance(e.touches[0], e.touches[1]), startScale: live.current.scale };
      dragRef.current = null;
    } else if (e.touches.length === 1) {
      setGesturing(true);
      dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPos: live.current.pos };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const d = touchDistance(e.touches[0], e.touches[1]);
      setScale(clampScale(pinchRef.current.startScale * (d / pinchRef.current.startDist)));
    } else if (e.touches.length === 1 && dragRef.current && live.current.scale > 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - dragRef.current.startX;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      setPos({ x: dragRef.current.startPos.x + dx, y: dragRef.current.startPos.y + dy });
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) {
      dragRef.current = null;
      setGesturing(false);
      if (live.current.scale < MIN_SCALE + 0.05) resetZoom();
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    if (live.current.scale <= 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPos: live.current.pos };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.startPos.x + (e.clientX - dragRef.current.startX),
      y: dragRef.current.startPos.y + (e.clientY - dragRef.current.startY),
    });
  }
  function onMouseUp() {
    dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setScale((s) => clampScale(s - e.deltaY * 0.01));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={(e) => {
        if (e.target === e.currentTarget && live.current.scale <= 1) onClose();
      }}
    >
      <button
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/15 text-[18px] font-bold text-white"
      >
        ✕
      </button>

      <div
        className="h-full w-full touch-none select-none overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={toggleZoom}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- foto do Drive, mesma justificativa de Thumb em ui.tsx */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="pointer-events-none h-full w-full object-contain"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: gesturing ? "none" : "transform 0.15s ease-out",
          }}
        />
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11.5px] text-white/60">
        Pinça ou duplo toque pra ampliar
      </div>
    </div>
  );
}
