"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Icon from "@/components/Icon";

/**
 * Puxar-pra-baixo pra atualizar, no esquema do Instagram (pedido do Carlos 2026-09-07 - o PWA no
 * Android não tem o gesto nativo, por isso existia só o botão de refresh na barra).
 *
 * O gesto: começa a contar quando o dedo desce E o container já está no topo (`scrollTop <= 0`);
 * arrasta com resistência (`RESIST`); passou de `THRESHOLD`, solta e dispara `onRefresh`. Enquanto
 * atualiza, o indicador fica preso na posição do spinner. Se o usuário rolar pra baixo no meio do
 * gesto, cancela.
 *
 * `touchmove` precisa de `{ passive: false }` pra poder dar `preventDefault` e segurar o
 * overscroll nativo do navegador enquanto o nosso indicador aparece.
 */

const THRESHOLD = 72; // px de arrasto (já com resistência) pra disparar
const MAX_PULL = 104; // trava visual do indicador
const RESIST = 0.55; // arrasta ~2px de dedo pra 1px de indicador

export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
): { pull: number; refreshing: boolean } {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Estado mutável lido dentro dos listeners sem re-anexar o efeito a cada render.
  const s = useRef({ startY: null as number | null, pull: 0, refreshing: false });
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const el: HTMLElement = node;
    const st = s.current;

    function set(v: number) {
      st.pull = v;
      setPull(v);
    }

    function onStart(e: TouchEvent) {
      if (st.refreshing || e.touches.length !== 1) {
        st.startY = null;
        return;
      }
      st.startY = el.scrollTop <= 0 ? e.touches[0].clientY : null;
    }
    function onMove(e: TouchEvent) {
      if (st.startY == null || st.refreshing) return;
      const dy = e.touches[0].clientY - st.startY;
      if (dy <= 0) {
        set(0);
        return;
      }
      if (el.scrollTop > 0) {
        st.startY = null;
        set(0);
        return;
      }
      e.preventDefault();
      set(Math.min(MAX_PULL, dy * RESIST));
    }
    async function onEnd() {
      if (st.startY == null) return;
      const go = st.pull >= THRESHOLD;
      st.startY = null;
      if (!go) {
        set(0);
        return;
      }
      st.refreshing = true;
      setRefreshing(true);
      set(THRESHOLD);
      try {
        await onRefreshRef.current();
      } catch {
        /* onRefresh nunca deve lançar, mas não deixa o indicador preso se lançar */
      } finally {
        st.refreshing = false;
        setRefreshing(false);
        set(0);
      }
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollRef]);

  return { pull, refreshing };
}

/** Indicador do gesto - fica no topo do container (que precisa ser `position: relative`). A
 *  seta gira conforme o arrasto e vira spinner contínuo enquanto atualiza. */
export function PullIndicator({ pull, refreshing }: { pull: number; refreshing: boolean }) {
  if (pull <= 0 && !refreshing) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-end justify-center overflow-hidden"
      style={{ height: pull }}
    >
      <div className="mb-1.5 flex size-8 items-center justify-center rounded-full bg-surface shadow-sm">
        <span
          className="flex"
          style={refreshing ? undefined : { transform: `rotate(${Math.min(pull, THRESHOLD) * 3}deg)` }}
        >
          <Icon
            name="refresh"
            size={16}
            className={refreshing ? "animate-spin text-accent" : "text-muted"}
          />
        </span>
      </div>
    </div>
  );
}

/**
 * Container rolável já com o puxar-pra-baixo embutido - pra telas que não têm um scroller próprio
 * (Home, Stats). A `ListScreen` usa o hook direto no `bodyRef` que ela já tem.
 */
export function PullToRefresh({
  onRefresh,
  className = "",
  children,
}: {
  onRefresh: () => Promise<unknown>;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { pull, refreshing } = usePullToRefresh(ref, onRefresh);
  return (
    <div ref={ref} className={`relative overflow-y-auto overscroll-y-contain ${className}`}>
      <PullIndicator pull={pull} refreshing={refreshing} />
      <div style={pull > 0 ? { transform: `translateY(${pull}px)` } : undefined}>{children}</div>
    </div>
  );
}
