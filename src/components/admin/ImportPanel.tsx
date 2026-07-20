"use client";

import { useCallback, useState } from "react";
import {
  buildTemplateWorkbook,
  parseSheet,
  validateRows,
  readImageZip,
  matchImages,
  runImport,
  CONFIG,
  type ImportType,
  type ValidationResult,
  type ZipImages,
  type ImageMatch,
  type ImportProgress,
  type ImportResult,
} from "@/lib/import";
import { logAccess } from "@/lib/auth";

const TYPE_LABEL: Record<ImportType, string> = { beer: "Cervejas", wine: "Vinhos" };

const cardCls = "rounded-2xl border border-border bg-surface p-5 shadow-sm";
const fileCls =
  "block w-full text-[12.5px] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-[12.5px] file:font-bold file:text-accent";
const btnCls =
  "rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-on-accent transition disabled:opacity-50";
const ghostBtnCls =
  "rounded-xl border border-border bg-bg px-4 py-2.5 text-[13px] font-bold text-text transition disabled:opacity-50";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const PHASE_LABEL: Record<ImportProgress["phase"], string> = {
  clearing: "Limpando dados atuais…",
  inserting: "Inserindo registros…",
  uploading: "Enviando fotos…",
  done: "Concluído",
};

function ImportSection({ type, userId }: { type: ImportType; userId: string }) {
  const cfg = CONFIG[type];
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [zip, setZip] = useState<ZipImages | null>(null);
  const [zipName, setZipName] = useState("");
  const [match, setMatch] = useState<ImageMatch | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const reset = () => {
    setResult(null);
    setError("");
    setProgress(null);
  };

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      reset();
      setFileName(file.name);
      setMatch(null);
      setZip(null);
      setZipName("");
      try {
        const rows = await parseSheet(file);
        const v = await validateRows(type, rows);
        setValidation(v);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setValidation(null);
      }
    },
    [type],
  );

  const onZip = useCallback(
    async (file: File | undefined) => {
      if (!file || !validation) return;
      reset();
      setZipName(file.name);
      try {
        const z = await readImageZip(file);
        setZip(z);
        setMatch(matchImages(type, validation.validRows, z));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setZip(null);
        setMatch(null);
      }
    },
    [type, validation],
  );

  const commit = useCallback(async () => {
    if (!validation) return;
    setBusy(true);
    reset();
    try {
      const res = await runImport(
        type,
        validation.validRows,
        zip ?? new Map(),
        userId,
        setProgress,
      );
      setResult(res);
      void logAccess(
        `importou ${res.inserted} ${type} (${res.imagesUploaded} fotos)`,
        cfg.table,
      );
      setConfirmWipe(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [type, validation, zip, userId, cfg.table]);

  const canCommit =
    !!validation && validation.validRows.length > 0 && confirmWipe && !busy;

  return (
    <div className={cardCls}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold">{TYPE_LABEL[type]}</h2>
        {validation && (
          <span className="text-[12px] font-semibold text-muted">
            {validation.validRows.length}/{validation.totalRows} válidas
          </span>
        )}
      </div>

      {/* Step 1 — spreadsheet */}
      <label className="mb-1.5 block text-[12.5px] font-semibold text-muted">
        1. Planilha ({cfg.table}.csv / .xlsx)
      </label>
      <input
        type="file"
        accept=".csv,.xls,.xlsx"
        className={fileCls}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {fileName && <div className="mt-1 text-[11.5px] text-muted">{fileName}</div>}

      {validation && (
        <div className="mt-3 space-y-2">
          {validation.missingHeaders.length > 0 && (
            <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12px] font-semibold text-danger">
              Colunas obrigatórias ausentes: {validation.missingHeaders.join(", ")}
            </div>
          )}
          {validation.issues.length > 0 ? (
            <details className="rounded-lg border border-border bg-bg px-3 py-2">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-danger">
                {validation.issues.length} problema(s) — {validation.totalRows -
                  validation.validRows.length}{" "}
                linha(s) serão ignoradas
              </summary>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[11.5px] text-muted">
                {validation.issues.slice(0, 50).map((iss, i) => (
                  <li key={i}>
                    Linha {iss.row}, <b>{iss.col}</b>
                    {iss.value ? ` = "${iss.value}"` : ""}: {iss.message}
                  </li>
                ))}
                {validation.issues.length > 50 && (
                  <li>… e mais {validation.issues.length - 50}.</li>
                )}
              </ul>
            </details>
          ) : (
            <div className="rounded-lg bg-accent-soft px-3 py-2 text-[12px] font-semibold text-accent">
              Todas as {validation.validRows.length} linhas passaram na validação.
            </div>
          )}
        </div>
      )}

      {/* Step 2 — photos */}
      <label className="mb-1.5 mt-4 block text-[12.5px] font-semibold text-muted">
        2. Fotos (.zip, arquivos nomeados como em {cfg.imgNomeCol})
      </label>
      <input
        type="file"
        accept=".zip"
        disabled={!validation}
        className={fileCls}
        onChange={(e) => onZip(e.target.files?.[0])}
      />
      {zipName && <div className="mt-1 text-[11.5px] text-muted">{zipName}</div>}

      {match && (
        <div className="mt-2 rounded-lg border border-border bg-bg px-3 py-2 text-[11.5px] text-muted">
          <div>
            <b className="text-text">{match.matched}</b> foto(s) casada(s) com linhas.
          </div>
          {match.rowsWithoutImage.length > 0 && (
            <div className="mt-1 text-danger">
              {match.rowsWithoutImage.length} linha(s) apontam para foto ausente no zip
              {match.rowsWithoutImage.length <= 8
                ? `: ${match.rowsWithoutImage.join(", ")}`
                : ` (ex.: ${match.rowsWithoutImage.slice(0, 8).join(", ")}…)`}
            </div>
          )}
          {match.imagesWithoutRow.length > 0 && (
            <div className="mt-1">
              {match.imagesWithoutRow.length} foto(s) no zip sem linha correspondente (serão
              ignoradas).
            </div>
          )}
        </div>
      )}

      {/* Step 3 — commit */}
      <div className="mt-4 border-t border-border pt-4">
        <label className="flex items-start gap-2 text-[12.5px] text-text">
          <input
            type="checkbox"
            checked={confirmWipe}
            onChange={(e) => setConfirmWipe(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            Entendo que isso <b>apaga todos os meus {TYPE_LABEL[type].toLowerCase()} atuais</b> e
            os substitui pelas {validation?.validRows.length ?? 0} linhas válidas acima.
          </span>
        </label>

        <button onClick={commit} disabled={!canCommit} className={`${btnCls} mt-3`}>
          {busy ? "Importando…" : `Limpar e importar ${TYPE_LABEL[type].toLowerCase()}`}
        </button>
      </div>

      {progress && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11.5px] text-muted">
            <span>{PHASE_LABEL[progress.phase]}</span>
            <span>
              {progress.done}
              {progress.total ? `/${progress.total}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-semibold text-danger">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg bg-accent-soft px-3 py-2.5 text-[12.5px] text-accent">
          <div className="font-bold">Importação concluída.</div>
          <div className="mt-0.5 text-text">
            {result.inserted} registro(s) inserido(s) · {result.imagesUploaded} foto(s)
            enviada(s).
          </div>
          {result.imageErrors.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-danger">
                {result.imageErrors.length} erro(s) de upload
              </summary>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-muted">
                {result.imageErrors.slice(0, 30).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImportPanel({ userId }: { userId: string }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-extrabold">Importação de dados</h1>
            <p className="mt-0.5 text-[13px] text-muted">
              Carregue cervejas e vinhos em massa. Substitui os seus itens da categoria.
            </p>
          </div>
          <button
            onClick={() => download(buildTemplateWorkbook(), "toastrack-modelo.xlsx")}
            className={ghostBtnCls}
          >
            Baixar modelo
          </button>
        </div>

        <div className="space-y-5">
          <ImportSection type="beer" userId={userId} />
          <ImportSection type="wine" userId={userId} />
        </div>
      </div>
    </div>
  );
}
