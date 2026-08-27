import * as XLSX from "xlsx";
import JSZip from "jszip";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchLookups, type Lookup } from "@/lib/itemSchema";
import { WINE_COR, WINE_TIPO } from "@/lib/itemSchema";
import { buildLookupIndex, parseImportDate, resolveFk } from "@/lib/importParse";

/**
 * Bulk-import engine for the /admin page. Reads a beer or wine spreadsheet
 * (CSV / XLS / XLSX), validates every row against the DB schema + lookup tables,
 * matches a .zip of photos by the *_img_nome column, and — on an explicit
 * commit — wipes the caller's own rows and re-inserts, uploading photos to the
 * public `toastrack` Storage bucket under IMG/<CAT>/<user_id>/.
 *
 * No service-role key: every write is a normal authenticated call, so RLS (and
 * the Storage policies in migration 0004) guarantee you can only ever replace
 * your own data. user_id is stamped from the signed-in user, never from a file.
 */

export type ImportType = "beer" | "wine";

const BUCKET = "toastrack";
const IMPORT_BATCH = 500; // rows per PostgREST insert
const UPLOAD_CONCURRENCY = 6; // parallel image uploads

type Kind = "text" | "int" | "num" | "rating" | "date" | "enum" | "fk";

export type TemplateCol = {
  col: string;
  required?: boolean;
  kind: Kind;
  options?: readonly string[];
  fk?: "pais" | "bjcp";
  example: string;
};

type TypeConfig = {
  table: string;
  storageCat: "BEER" | "WINE";
  imgNomeCol: string;
  imgUrlCol: string;
  cols: TemplateCol[];
};

export const CONFIG: Record<ImportType, TypeConfig> = {
  beer: {
    table: "beer",
    storageCat: "BEER",
    imgNomeCol: "beer_img_nome",
    imgUrlCol: "beer_img_url",
    cols: [
      { col: "beer_nome", required: true, kind: "text", example: "IPA da Casa" },
      { col: "beer_produtor", kind: "text", example: "Cervejaria Exemplo" },
      { col: "pais_id", kind: "fk", fk: "pais", example: "7" },
      { col: "beer_ibu", kind: "num", example: "45" },
      { col: "beer_abv", kind: "num", example: "6.2" },
      { col: "beer_nota", kind: "rating", example: "4.5" },
      { col: "beer_estilo_livre", kind: "text", example: "IPA tropical" },
      { col: "bjcp21_id", kind: "fk", fk: "bjcp", example: "63" },
      { col: "beer_data", kind: "date", example: "2026-05-01" },
      { col: "beer_img_nome", kind: "text", example: "0001.jpg" },
    ],
  },
  wine: {
    table: "wine",
    storageCat: "WINE",
    imgNomeCol: "wine_img_nome",
    imgUrlCol: "wine_img_url",
    cols: [
      { col: "wine_nome", required: true, kind: "text", example: "Malbec Reserva" },
      { col: "wine_safra", kind: "int", example: "2019" },
      { col: "wine_cor", kind: "enum", options: WINE_COR, example: "Tinto" },
      { col: "wine_tipo", kind: "enum", options: WINE_TIPO, example: "Seco" },
      { col: "wine_produtor", kind: "text", example: "Bodega Exemplo" },
      { col: "pais_id", kind: "fk", fk: "pais", example: "3" },
      { col: "wine_regiao", kind: "text", example: "Mendoza" },
      { col: "wine_uva", kind: "text", example: "Malbec" },
      { col: "wine_abv", kind: "num", example: "13.5" },
      { col: "wine_nota", kind: "rating", example: "4.0" },
      { col: "wine_data_degustacao", kind: "date", example: "2026-04-10" },
      { col: "wine_img_nome", kind: "text", example: "0001.jpg" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Template download
// ---------------------------------------------------------------------------

/** Build an .xlsx with one sheet per type (header row + one example row). */
export function buildTemplateWorkbook(): Blob {
  const wb = XLSX.utils.book_new();
  (Object.keys(CONFIG) as ImportType[]).forEach((type) => {
    const cfg = CONFIG[type];
    const header = cfg.cols.map((c) => c.col);
    const example = cfg.cols.map((c) => c.example);
    const ws = XLSX.utils.aoa_to_sheet([header, example]);
    XLSX.utils.book_append_sheet(wb, ws, type);
  });
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ---------------------------------------------------------------------------
// Spreadsheet parsing
// ---------------------------------------------------------------------------

export type RawRow = Record<string, string>;

/** Parse the first sheet of a CSV/XLS/XLSX file into string-keyed rows. */
export async function parseSheet(file: File): Promise<RawRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  // raw:false => every cell comes back as a trimmed-ish string, so validation
  // and coercion have a single, predictable input type.
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "", raw: false });
  return rows.map((r) => {
    const out: RawRow = {};
    for (const k of Object.keys(r)) out[k.trim()] = String(r[k] ?? "").trim();
    return out;
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type RowIssue = { row: number; col: string; value: string; message: string };

export type ValidationResult = {
  type: ImportType;
  totalRows: number;
  /** Rows with no blocking issue, in file order, with dates normalized to ISO
   *  and FK columns resolved to their numeric id — ready for insert. */
  validRows: RawRow[];
  issues: RowIssue[];
  missingHeaders: string[];
};

/**
 * Validate parsed rows against the schema + lookup tables, returning normalized
 * copies of the rows that passed. `lookups` can be injected in tests; in the app
 * it is fetched from the DB.
 */
export async function validateRows(
  type: ImportType,
  rows: RawRow[],
  lookups?: Lookup,
): Promise<ValidationResult> {
  const cfg = CONFIG[type];
  const resolved = lookups ?? (await fetchLookups());
  const index = {
    pais: buildLookupIndex(resolved.pais.map((p) => ({ id: p.pais_id, label: p.pais_nome }))),
    bjcp: buildLookupIndex(resolved.bjcp.map((b) => ({ id: b.bjcp21_id, label: b.bjcp21_cod }))),
  };
  const FK_TABLE = { pais: "list_pais", bjcp: "list_bjcp_21" } as const;

  const headers = new Set(rows.length ? Object.keys(rows[0]) : []);
  const missingHeaders = cfg.cols
    .filter((c) => c.required && !headers.has(c.col))
    .map((c) => c.col);

  const issues: RowIssue[] = [];
  const validRows: RawRow[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // +1 header, +1 to 1-index for humans
    const normalized: RawRow = { ...row };
    let blocking = false;
    const flag = (col: string, value: string, message: string) => {
      issues.push({ row: rowNum, col, value, message });
      blocking = true;
    };

    for (const c of cfg.cols) {
      const v = (row[c.col] ?? "").trim();
      if (v === "") {
        if (c.required) flag(c.col, v, "obrigatório, está vazio");
        continue;
      }
      switch (c.kind) {
        case "int":
          if (!/^-?\d+$/.test(v)) flag(c.col, v, "deve ser um número inteiro");
          break;
        case "num":
          if (!Number.isFinite(Number(v))) flag(c.col, v, "deve ser numérico");
          break;
        case "rating": {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0 || n > 5)
            flag(c.col, v, "avaliação deve estar entre 0 e 5");
          break;
        }
        case "date": {
          const iso = parseImportDate(v);
          if (!iso) flag(c.col, v, "data deve ser AAAA-MM-DD ou DD/MM/AAAA");
          else normalized[c.col] = iso;
          break;
        }
        case "enum":
          if (!c.options!.includes(v))
            flag(c.col, v, `valor inválido (use: ${c.options!.join(", ")})`);
          break;
        case "fk": {
          const r = resolveFk(v, index[c.fk!], FK_TABLE[c.fk!]);
          if ("error" in r) flag(c.col, v, r.error);
          else normalized[c.col] = String(r.id);
          break;
        }
        default:
          break;
      }
    }
    if (!blocking) validRows.push(normalized);
  });

  return { type, totalRows: rows.length, validRows, issues, missingHeaders };
}

// ---------------------------------------------------------------------------
// Photo zip
// ---------------------------------------------------------------------------

export type ZipImages = Map<string, JSZip.JSZipObject>; // filename -> entry

/** Read a .zip and index its image entries by bare filename (case-insensitive). */
export async function readImageZip(file: File): Promise<ZipImages> {
  const zip = await JSZip.loadAsync(file);
  const map: ZipImages = new Map();
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const name = path.split("/").pop() ?? path;
    if (!/\.(jpe?g|png|webp|gif)$/i.test(name)) return;
    map.set(name.toLowerCase(), entry);
  });
  return map;
}

export type ImageMatch = {
  matched: number; // rows whose img_nome has a file
  rowsWithoutImage: string[]; // img_nome values referenced but absent from zip
  imagesWithoutRow: string[]; // files in zip referenced by no row
};

/** Cross-check the valid rows' *_img_nome against the zip contents. */
export function matchImages(
  type: ImportType,
  validRows: RawRow[],
  zip: ZipImages,
): ImageMatch {
  const cfg = CONFIG[type];
  const referenced = new Set<string>();
  const rowsWithoutImage: string[] = [];
  let matched = 0;

  for (const row of validRows) {
    const nome = (row[cfg.imgNomeCol] ?? "").trim();
    if (!nome) continue;
    referenced.add(nome.toLowerCase());
    if (zip.has(nome.toLowerCase())) matched += 1;
    else rowsWithoutImage.push(nome);
  }
  const imagesWithoutRow: string[] = [];
  for (const key of zip.keys()) if (!referenced.has(key)) imagesWithoutRow.push(key);

  return { matched, rowsWithoutImage, imagesWithoutRow };
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function coerce(col: TemplateCol, raw: string): unknown {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  switch (col.kind) {
    case "int":
    case "num":
    case "rating":
    case "fk":
      return Number(v);
    default:
      return v; // text / date / enum
  }
}

export type ImportProgress = {
  phase: "clearing" | "inserting" | "uploading" | "done";
  done: number;
  total: number;
};

export type ImportResult = {
  inserted: number;
  imagesUploaded: number;
  imageErrors: string[];
};

/**
 * Wipe the caller's own rows for this type, insert the valid rows (with the
 * photo URL pre-computed from the deterministic public path), then upload the
 * matched photos. Ordering is safe: the public URL doesn't depend on the upload
 * having happened yet, so a mid-upload failure still leaves consistent rows.
 */
export async function runImport(
  type: ImportType,
  validRows: RawRow[],
  zip: ZipImages,
  userId: string,
  onProgress: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const cfg = CONFIG[type];
  const supabase = getSupabaseClient();
  const storage = supabase.storage.from(BUCKET);
  const folder = `IMG/${cfg.storageCat}/${userId}`;

  const publicUrl = (filename: string) =>
    storage.getPublicUrl(`${folder}/${filename}`).data.publicUrl;

  // 1. Clear own rows (RLS also restricts this to user_id = auth.uid()).
  onProgress({ phase: "clearing", done: 0, total: validRows.length });
  const del = await supabase.from(cfg.table).delete().eq("user_id", userId);
  if (del.error) throw new Error(`Falha ao limpar ${cfg.table}: ${del.error.message}`);

  // 2. Build payloads + insert in batches.
  const payloads = validRows.map((row) => {
    const payload: Record<string, unknown> = { user_id: userId };
    for (const c of cfg.cols) payload[c.col] = coerce(c, row[c.col] ?? "");
    const nome = (row[cfg.imgNomeCol] ?? "").trim();
    payload[cfg.imgUrlCol] = nome ? publicUrl(nome) : null;
    return payload;
  });

  let inserted = 0;
  for (let i = 0; i < payloads.length; i += IMPORT_BATCH) {
    const batch = payloads.slice(i, i + IMPORT_BATCH);
    const { error } = await supabase.from(cfg.table).insert(batch);
    if (error) throw new Error(`Falha ao inserir em ${cfg.table}: ${error.message}`);
    inserted += batch.length;
    onProgress({ phase: "inserting", done: inserted, total: payloads.length });
  }

  // 3. Upload matched photos (bounded concurrency, upsert so re-runs replace).
  const uploads = validRows
    .map((row) => (row[cfg.imgNomeCol] ?? "").trim())
    .filter((nome) => nome && zip.has(nome.toLowerCase()));

  const imageErrors: string[] = [];
  let uploaded = 0;
  onProgress({ phase: "uploading", done: 0, total: uploads.length });

  let cursor = 0;
  async function worker() {
    while (cursor < uploads.length) {
      const idx = cursor++;
      const nome = uploads[idx];
      const entry = zip.get(nome.toLowerCase())!;
      const ext = (nome.split(".").pop() ?? "").toLowerCase();
      try {
        const blob = await entry.async("blob");
        const { error } = await storage.upload(`${folder}/${nome}`, blob, {
          contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
          upsert: true,
        });
        if (error) imageErrors.push(`${nome}: ${error.message}`);
      } catch (e) {
        imageErrors.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
      }
      uploaded += 1;
      onProgress({ phase: "uploading", done: uploaded, total: uploads.length });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, uploads.length) }, worker),
  );

  onProgress({ phase: "done", done: inserted, total: inserted });
  return { inserted, imagesUploaded: uploaded - imageErrors.length, imageErrors };
}
