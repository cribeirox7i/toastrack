"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Icon from "@/components/Icon";

type Categoria = "imagem" | "pdf" | "docx" | "xlsx" | "nao-suportado";

/** Decide o tipo pelo mimeType (principal) com fallback na extensão do nome — só os 6 aceitos
 *  pela Biblioteca (pedido do Carlos 2026-09-25); qualquer outro é recusado antes de baixar bytes. */
function categorizar(mimeType: string, nome: string): Categoria {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.startsWith("image/")) {
    if (["image/png", "image/jpeg", "image/bmp"].includes(mimeType)) return "imagem";
    return "nao-suportado";
  }
  if (["png", "jpg", "jpeg", "bmp"].includes(ext)) return "imagem";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx")
    return "docx";
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || ext === "xlsx")
    return "xlsx";
  return "nao-suportado";
}

/**
 * Visualizador de conteúdo da Biblioteca (PDF ou imagem) aberto DENTRO do app — mesmo motivo e
 * mesma mecânica do `AnexoViewer` do TravelTrack (abrir numa aba nova cai numa Custom Tab que, no
 * PWA instalado, fecha o app inteiro no botão voltar). Primeiro pede só nome+mimeType
 * (`/info`, sem bytes) pra decidir se o tipo é aceito ANTES de baixar o arquivo inteiro; só busca
 * os bytes (`/file/{id}`) se for um dos 6 tipos aceitos.
 */
export function LibraryViewer({
  fileId,
  titulo,
  onClose,
}: {
  fileId: string;
  titulo: string;
  onClose: () => void;
}) {
  const [estado, setEstado] = useState<
    | { fase: "carregando" }
    | { fase: "recusado"; nome: string }
    | { fase: "erro"; msg: string }
    | { fase: "pronto"; url: string; blob: Blob; nome: string; categoria: Categoria }
  >({ fase: "carregando" });

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const fechar = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.libViewer) {
      window.history.back();
    } else {
      onCloseRef.current();
    }
  }, []);

  useEffect(() => {
    const jaTinha = window.history.state?.libViewer;
    if (!jaTinha) window.history.pushState({ ...window.history.state, libViewer: true }, "");
    const onPop = () => onCloseRef.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowAntes;
      if (window.history.state?.libViewer) window.history.back();
    };
  }, [fechar]);

  useEffect(() => {
    let cancelado = false;
    let urlCriada: string | null = null;

    (async () => {
      try {
        const infoRes = await fetch(`/api/lookups/lib/file/${fileId}/info`);
        if (!infoRes.ok) {
          const j = await infoRes.json().catch(() => null);
          throw new Error(j?.error ?? "Não foi possível abrir este conteúdo");
        }
        const info = (await infoRes.json()) as { name: string; mimeType: string };
        const categoria = categorizar(info.mimeType, info.name);
        if (cancelado) return;

        if (categoria === "nao-suportado") {
          setEstado({ fase: "recusado", nome: info.name });
          return;
        }

        const fileRes = await fetch(`/api/lookups/lib/file/${fileId}`);
        if (!fileRes.ok) throw new Error("Não foi possível baixar o arquivo");
        const blob = await fileRes.blob();
        if (cancelado) return;

        urlCriada = URL.createObjectURL(blob);
        setEstado({ fase: "pronto", url: urlCriada, blob, nome: info.name, categoria });
      } catch (err) {
        if (!cancelado) {
          setEstado({
            fase: "erro",
            msg: err instanceof Error ? err.message : "Não foi possível abrir este conteúdo",
          });
        }
      }
    })();

    return () => {
      cancelado = true;
      if (urlCriada) URL.revokeObjectURL(urlCriada);
    };
  }, [fileId]);

  // Zoom (igual AnexoViewer do TravelTrack): botão, duplo toque ou pinça de dois dedos.
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 4;
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  const [zoom, setZoom] = useState(1);
  const [pinchAtivo, setPinchAtivo] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const ponteirosRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distIni: number; zoomIni: number } | null>(null);
  const ancoraRef = useRef<{ cx: number; cy: number; mx: number; my: number } | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = ancoraRef.current;
    if (!el || !a) return;
    el.scrollLeft = a.cx * zoom - a.mx;
    el.scrollTop = a.cy * zoom - a.my;
    ancoraRef.current = null;
  }, [zoom]);

  const zoomAncorado = useCallback((proximo: number, clienteX: number, clienteY: number) => {
    const el = scrollRef.current;
    setZoom((atual) => {
      const alvo = clampZoom(proximo);
      if (alvo === atual) {
        ancoraRef.current = null;
        return atual;
      }
      if (el) {
        const rect = el.getBoundingClientRect();
        const mx = clienteX - rect.left;
        const my = clienteY - rect.top;
        ancoraRef.current = { cx: (el.scrollLeft + mx) / atual, cy: (el.scrollTop + my) / atual, mx, my };
      }
      return alvo;
    });
  }, []);

  const zoomNoCentro = useCallback(
    (proximo: number) => {
      const el = scrollRef.current;
      if (!el) return setZoom(clampZoom(proximo));
      const rect = el.getBoundingClientRect();
      zoomAncorado(proximo, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    [zoomAncorado],
  );

  const maisZoom = () => zoomNoCentro(zoom + 0.5);
  const menosZoom = () => zoomNoCentro(zoom - 0.5);
  const alternarZoom = () => zoomNoCentro(zoom > ZOOM_MIN ? ZOOM_MIN : 2);

  const distanciaPonteiros = () => {
    const [a, b] = [...ponteirosRef.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const meioPonteiros = () => {
    const [a, b] = [...ponteirosRef.current.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") return;
    ponteirosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteirosRef.current.size === 2) {
      pinchRef.current = { distIni: distanciaPonteiros(), zoomIni: zoom };
      setPinchAtivo(true);
    }
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!ponteirosRef.current.has(e.pointerId)) return;
    ponteirosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = pinchRef.current;
    if (pinch && ponteirosRef.current.size === 2) {
      const dist = distanciaPonteiros();
      if (pinch.distIni > 0) {
        const meio = meioPonteiros();
        zoomAncorado((pinch.zoomIni * dist) / pinch.distIni, meio.x, meio.y);
      }
    }
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (!ponteirosRef.current.delete(e.pointerId)) return;
    if (ponteirosRef.current.size < 2) {
      pinchRef.current = null;
      setPinchAtivo(false);
    }
  };

  const podeZoom = estado.fase === "pronto" && (estado.categoria === "imagem" || estado.categoria === "pdf");

  const compartilhar = useCallback(async () => {
    if (estado.fase !== "pronto") return;
    const arquivo = new File([estado.blob], estado.nome, {
      type: estado.blob.type || "application/octet-stream",
    });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: estado.nome });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = estado.url;
    a.download = estado.nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [estado]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95">
      <div className="flex items-center gap-1 px-2 py-2 text-white">
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
        >
          <Icon name="x" size={20} />
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{titulo}</span>

        {podeZoom && (
          <>
            <button
              type="button"
              onClick={menosZoom}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Diminuir zoom"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35"
            >
              <Icon name="minus" size={16} />
            </button>
            <span className="w-11 shrink-0 text-center text-xs tabular-nums text-white/80">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={maisZoom}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Aumentar zoom"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35"
            >
              <Icon name="plus" size={16} />
            </button>
          </>
        )}

        {estado.fase === "pronto" && (
          <button
            type="button"
            onClick={() => void compartilhar()}
            aria-label="Compartilhar ou baixar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
          >
            <Icon name="share" size={18} />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onPointerDown={podeZoom ? onPointerDown : undefined}
        onPointerMove={podeZoom ? onPointerMove : undefined}
        onPointerUp={podeZoom ? onPointerUp : undefined}
        onPointerCancel={podeZoom ? onPointerUp : undefined}
        onDoubleClick={podeZoom ? alternarZoom : undefined}
        style={{ touchAction: pinchAtivo ? "none" : "pan-x pan-y" }}
        className="flex-1 overflow-auto overscroll-contain bg-neutral-900"
      >
        {estado.fase === "carregando" && (
          <p className="p-6 text-center text-sm text-white/70">Carregando…</p>
        )}

        {estado.fase === "erro" && <p className="p-6 text-center text-sm text-white/80">{estado.msg}</p>}

        {estado.fase === "recusado" && (
          <p className="p-6 text-center text-sm text-white/80">
            Tipo de arquivo não suportado pela Biblioteca — só abrem PDF, DOCX, XLSX, PNG, JPG ou
            BMP.
          </p>
        )}

        {estado.fase === "pronto" && estado.categoria === "imagem" && (
          <div className="w-full p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob local, sem otimização de next/image */}
            <img
              src={estado.url}
              alt={titulo}
              draggable={false}
              style={{
                width: zoom === 1 ? "auto" : `${zoom * 100}%`,
                maxWidth: zoom === 1 ? "100%" : "none",
              }}
              className="mx-auto block h-auto select-none"
            />
          </div>
        )}

        {estado.fase === "pronto" && estado.categoria === "pdf" && (
          <PdfCanvas blob={estado.blob} url={estado.url} zoom={zoom} />
        )}

        {estado.fase === "pronto" && (estado.categoria === "docx" || estado.categoria === "xlsx") && (
          <div className="flex flex-col items-center gap-3 p-6 text-center text-sm text-white/80">
            <p>
              {estado.categoria === "docx" ? "Documento do Word" : "Planilha do Excel"} — não abre
              aqui, mas pode baixar ou compartilhar.
            </p>
            <button
              type="button"
              onClick={() => void compartilhar()}
              className="rounded-lg bg-white/15 px-4 py-2 font-medium text-white hover:bg-white/25"
            >
              Baixar / compartilhar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Renderiza todas as páginas do PDF em `<canvas>` empilhados — mesma técnica do `AnexoViewer` do
 *  TravelTrack (pdf.js por `import()` dinâmico, raster único com folga de resolução e zoom só por
 *  CSS na largura do container). */
function PdfCanvas({ blob, url, zoom }: { blob: Blob; url: string; zoom: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tipos do pdf.js não somam bem aqui
    let doc: any = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const buffer = await blob.arrayBuffer();
        if (cancelado) return;

        doc = await pdfjs.getDocument({ data: buffer }).promise;
        if (cancelado || !doc) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        const larguraBase = Math.min(container.clientWidth || 360, 900);
        const fator = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
        const larguraRender = Math.min(larguraBase * fator, 2600);

        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelado) return;
          const base = page.getViewport({ scale: 1 });
          const escala = larguraRender / base.width;
          const viewport = page.getViewport({ scale: escala });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-2 block h-auto w-full bg-white";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          container.appendChild(canvas);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
        if (!cancelado) setCarregando(false);
      } catch (err) {
        if (!cancelado) {
          setErro(err instanceof Error ? err.message : "Não foi possível renderizar o PDF");
          setCarregando(false);
        }
      }
    })();

    return () => {
      cancelado = true;
      try {
        doc?.destroy();
      } catch {
        // ignore
      }
    };
  }, [blob]);

  return (
    <div className="p-2">
      {carregando && !erro && <p className="p-6 text-center text-sm text-white/70">Renderizando PDF…</p>}
      {erro && (
        <div className="flex flex-col items-center gap-3 p-6 text-center text-sm text-white/80">
          <p>{erro}</p>
          <a href={url} download className="rounded-lg bg-white/15 px-4 py-2 font-medium text-white hover:bg-white/25">
            Baixar PDF
          </a>
        </div>
      )}
      <div
        ref={containerRef}
        className="mx-auto"
        style={{
          width: zoom === 1 ? undefined : `${zoom * 100}%`,
          maxWidth: zoom === 1 ? "900px" : "none",
        }}
      />
    </div>
  );
}
