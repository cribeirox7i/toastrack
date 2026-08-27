/**
 * Pure helpers for the /admin bulk import — no Supabase, no DOM, no React, so
 * they can be exercised by a plain Node script (see scripts/test-import-parse).
 *
 * They exist because a 3.600-row spreadsheet fails as a whole or not at all:
 * one column read the wrong way rejects every line, so the forgiving-but-never-
 * guessing rules live in one place that is cheap to test.
 */

/** Lowercase, strip accents, collapse whitespace — for forgiving text matching. */
export function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type LookupRow = { id: number; label: string };
export type LookupIndex = { byId: Set<number>; byLabel: Map<string, number> };

/** Index a lookup table both by its numeric id and by its normalized label. */
export function buildLookupIndex(rows: LookupRow[]): LookupIndex {
  const byId = new Set<number>();
  const byLabel = new Map<string, number>();
  for (const r of rows) {
    byId.add(r.id);
    const key = normalizeKey(r.label ?? "");
    // First row wins: labels are unique in both lookup tables, and if one ever
    // repeats, silently remapping to the later id would be worse than ignoring it.
    if (key && !byLabel.has(key)) byLabel.set(key, r.id);
  }
  return { byId, byLabel };
}

export type FkResult = { id: number } | { error: string };

/**
 * Resolve a cell to a lookup id. The numeric id is the expected format (that is
 * what the spreadsheet carries); a full text label — "Brasil", "10A - Weissbier"
 * — is accepted as a fallback so a handful of hand-typed cells don't block the
 * import. Anything else is an error: never guess a country or a style.
 */
export function resolveFk(raw: string, index: LookupIndex, table: string): FkResult {
  const v = (raw ?? "").trim();
  if (/^\d+$/.test(v)) {
    const id = Number(v);
    return index.byId.has(id) ? { id } : { error: `ID ${v} não existe em ${table}` };
  }
  const hit = index.byLabel.get(normalizeKey(v));
  if (hit != null) return { id: hit };
  return { error: `não é um ID de ${table} nem um nome exato da lista` };
}

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const BR_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Accept AAAA-MM-DD (canonical) or DD/MM/AAAA (what a pt-BR sheet exports) and
 * return the ISO form. A two-digit year is refused on purpose: "03/04/26" could
 * be read three ways, and a wrong tasting date is worse than a flagged row.
 */
export function parseImportDate(raw: string): string | null {
  const v = (raw ?? "").trim();
  let y: number, m: number, d: number;
  const iso = ISO_RE.exec(v);
  const br = BR_RE.exec(v);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (br) {
    [d, m, y] = [Number(br[1]), Number(br[2]), Number(br[3])];
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Round-trip check rejects 31/02 and friends, which Date would roll over.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}
