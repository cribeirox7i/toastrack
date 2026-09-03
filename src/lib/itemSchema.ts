import { TYPE_TAB, type ItemType } from "@/lib/catalog";
import { noCacheUrl } from "@/lib/utils";
import {
  applyServerPatch,
  createItemOffline,
  getCachedItem,
  getCachedLookups,
  pullLookups,
  updateItemOffline,
  type ItemTab,
  type RawItemRow,
} from "@/lib/offline/sync";

/** A field in the per-type detail/edit form. `role` drives special layout;
 *  `kind` drives the input/rendering. `col` is the real DB column. */
export type FieldRole = "name" | "producer" | "rating" | "field";
export type FieldKind = "text" | "number" | "date" | "select" | "country" | "bjcp";

export type Field = {
  col: string;
  label: string;
  role: FieldRole;
  kind?: FieldKind;
  options?: readonly string[];
  suffix?: string;
};

export const WINE_COR = ["Tinto", "Branco", "Rosé", "Verde", "Laranja"] as const;
export const WINE_TIPO = ["Seco", "Semi-Seco", "Suave", "Brut"] as const;
export const DEST_TIPO = [
  "Cachaça", "Vodka", "Gin", "Whisky", "Rum", "Tequila",
  "Brandy", "Pisco", "Shochu", "Saque", "Vermute", "Bitter",
] as const;

type TypeSchema = { imgNomeCol: string; fields: Field[] };

export const SCHEMA: Record<ItemType, TypeSchema> = {
  beer: {
    imgNomeCol: "beer_img_nome",
    fields: [
      { col: "beer_nome", label: "Nome", role: "name" },
      { col: "beer_cervejaria", label: "Cervejaria", role: "producer", kind: "text" },
      { col: "beer_nota", label: "Avaliação", role: "rating" },
      { col: "pais_id", label: "País", role: "field", kind: "country" },
      { col: "beer_data", label: "Data de degustação", role: "field", kind: "date" },
      { col: "beer_ibu", label: "IBU", role: "field", kind: "number" },
      { col: "beer_abv", label: "ABV", role: "field", kind: "number", suffix: "%" },
      { col: "beer_estilo_livre", label: "Estilo (livre)", role: "field", kind: "text" },
      { col: "bjcp21_id", label: "Estilo BJCP", role: "field", kind: "bjcp" },
    ],
  },
  wine: {
    imgNomeCol: "wine_img_nome",
    fields: [
      { col: "wine_nome", label: "Nome", role: "name" },
      { col: "wine_produtor", label: "Produtor", role: "producer", kind: "text" },
      { col: "wine_nota", label: "Avaliação", role: "rating" },
      { col: "pais_id", label: "País", role: "field", kind: "country" },
      { col: "wine_data_degustacao", label: "Data de degustação", role: "field", kind: "date" },
      { col: "wine_safra", label: "Safra", role: "field", kind: "number" },
      { col: "wine_cor", label: "Cor", role: "field", kind: "select", options: WINE_COR },
      { col: "wine_tipo", label: "Tipo", role: "field", kind: "select", options: WINE_TIPO },
      { col: "wine_regiao", label: "Região", role: "field", kind: "text" },
      { col: "wine_uva", label: "Uva", role: "field", kind: "text" },
      { col: "wine_abv", label: "ABV", role: "field", kind: "number", suffix: "%" },
    ],
  },
  spirit: {
    imgNomeCol: "dest_img_nome",
    fields: [
      { col: "dest_nome", label: "Nome", role: "name" },
      { col: "dest_produtor", label: "Produtor", role: "producer", kind: "text" },
      { col: "dest_nota", label: "Avaliação", role: "rating" },
      { col: "pais_id", label: "País", role: "field", kind: "country" },
      { col: "dest_data_degustacao", label: "Data de degustação", role: "field", kind: "date" },
      { col: "dest_tipo", label: "Tipo", role: "field", kind: "select", options: DEST_TIPO },
      { col: "dest_safra", label: "Safra / envelhecimento (anos)", role: "field", kind: "number" },
      { col: "dest_regiao", label: "Região", role: "field", kind: "text" },
      { col: "dest_abv", label: "ABV", role: "field", kind: "number", suffix: "%" },
    ],
  },
  drink: {
    imgNomeCol: "drink_img_nome",
    fields: [
      { col: "drink_nome", label: "Nome", role: "name" },
      { col: "drink_produtor", label: "Fabricante", role: "producer", kind: "text" },
      { col: "drink_nota", label: "Avaliação", role: "rating" },
      { col: "pais_id", label: "País", role: "field", kind: "country" },
      { col: "drink_data_degustacao", label: "Data de degustação", role: "field", kind: "date" },
      { col: "drink_regiao", label: "Região", role: "field", kind: "text" },
      { col: "drink_abv", label: "ABV", role: "field", kind: "number", suffix: "%" },
    ],
  },
};

export function fieldByRole(type: ItemType, role: FieldRole): Field | undefined {
  return SCHEMA[type].fields.find((f) => f.role === role);
}

export type Lookup = { pais: { pais_id: number; pais_nome: string }[]; bjcp: { bjcp21_id: number; bjcp21_cod: string }[] };

/** Cache-first (IndexedDB, etapa 6): países/BJCP quase não mudam, então servir do que já está
 *  salvo e disparar um refresh em segundo plano evita esperar rede toda vez que a tela de
 *  detalhe/edição abre. Sem cache ainda (primeiro uso do aparelho) cai pro fetch direto. */
export async function fetchLookups(): Promise<Lookup> {
  const cached = await getCachedLookups();
  const data = cached ?? (await fetchLookupsNetwork());
  void pullLookups(); // sempre atualiza em segundo plano, tendo cache ou não
  return {
    pais: data.paises.map((p) => ({ pais_id: Number(p.pais_id), pais_nome: p.pais_nome })),
    bjcp: data.bjcp.map((b) => ({ bjcp21_id: Number(b.bjcp21_id), bjcp21_cod: b.bjcp21_cod })),
  };
}

async function fetchLookupsNetwork(): Promise<{
  paises: { pais_id: string; pais_nome: string }[];
  bjcp: { bjcp21_id: string; bjcp21_cod: string }[];
}> {
  const res = await fetch(noCacheUrl("/api/lookups"), { cache: "no-store" });
  if (!res.ok) return { paises: [], bjcp: [] };
  return (await res.json()) as { paises: { pais_id: string; pais_nome: string }[]; bjcp: { bjcp21_id: string; bjcp21_cod: string }[] };
}

/** Linha crua de um item (todas as colunas), incluindo user_owner/user_access/user_edit — usado
 *  pra checagem de permissão de edição na tela. `id` é string (UUID pros itens novos; itens
 *  antigos mantêm o número original como string). Cache-first (etapa 6): o item normalmente já
 *  está no IndexedDB (veio da lista); só cai pra rede se este aparelho ainda não o sincronizou
 *  (ex.: link direto pra um item novo). */
export async function fetchFullItem(
  type: ItemType,
  id: string,
): Promise<Record<string, string> | null> {
  const tab = TYPE_TAB[type] as ItemTab;
  const cached = await getCachedItem(tab, id);
  if (cached) return cached as Record<string, string>;
  const res = await fetch(noCacheUrl(`/api/items/${tab}/${id}`), { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, string>;
}

/** Convert a raw DB value to a form string. */
export function toFormString(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Coerce a form string pro formato de texto que a planilha espera (tudo vira string ali —
 *  campo vazio vira "" mesmo, não null: o Apps Script não tem um "sem valor" separado de "vazio"). */
function coerce(field: Field, raw: string): string {
  return (raw ?? "").trim();
}

/**
 * Cria (id null) ou atualiza um item a partir dos valores do formulário. Atualização é otimista
 * (etapa 6, ver src/lib/offline/sync.ts): grava no IndexedDB e devolve na hora, sincroniza em
 * segundo plano. `ownerId` só serve pra a linha local nascer com o dono certo antes de qualquer
 * resposta do servidor (que recalcula os mesmos valores por conta própria — nunca confia no que o
 * cliente manda, ver src/lib/sheets/items.ts); não é usado na atualização (o dono não muda por
 * edição).
 */
export async function saveItem(
  type: ItemType,
  id: string | null,
  values: Record<string, string>,
  ownerId: string,
): Promise<string | null> {
  const payload: Record<string, string> = {};
  for (const f of SCHEMA[type].fields) payload[f.col] = coerce(f, values[f.col] ?? "");

  const tab = TYPE_TAB[type] as ItemTab;
  if (id == null) return createNewItem(tab, payload, ownerId);
  await updateItemOffline(tab, id, payload);
  return id;
}

/**
 * Criação de item: tenta direto no servidor primeiro. O id agora é sempre sequencial, atribuído
 * pelo servidor (pedido do Carlos 2026-09-02: "a chave das tabelas precisa ser sequencial") — o
 * servidor ignora qualquer id que o cliente mande. Criar direto (em vez de sempre otimista)
 * evita depender do remapeamento de id no caso comum (com internet): o item já nasce com o id
 * final, sem id temporário nenhum — importante porque quem chama isto com id null é justamente o
 * rascunho criado ao abrir "novo item" (DetailScreen), que precisa de um id ESTÁVEL na hora pra
 * já poder anexar foto (ver "a jornada de cadastro começa pela imagem", mesma data). Só cai pro
 * caminho otimista/offline (`createItemOffline`, id temporário + fila, remapeado depois em
 * sync.ts) quando de fato não há conexão ou a chamada falha por rede.
 */
async function createNewItem(tab: ItemTab, payload: Record<string, string>, ownerId: string): Promise<string> {
  if (navigator.onLine) {
    try {
      const res = await fetch(`/api/items/${tab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const row = (await res.json()) as RawItemRow;
        await applyServerPatch(tab, row.id, row as Record<string, string>);
        return row.id;
      }
    } catch {
      // sem rede de verdade apesar do navigator.onLine, ou erro transitório - cai pro offline.
    }
  }
  return createItemOffline(tab, payload, ownerId);
}
