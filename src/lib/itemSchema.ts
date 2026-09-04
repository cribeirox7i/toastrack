import { TYPE_TAB, type ItemType } from "@/lib/catalog";
import { noCacheUrl } from "@/lib/utils";
import {
  createItemOffline,
  getCachedItem,
  getCachedLookups,
  pullLookups,
  updateItemOffline,
  type ItemTab,
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

/**
 * Agrupa os campos "field" da tela de edição em linhas de 1 ou 2, pra layout de duas colunas
 * (pedido do Carlos 2026-09-04): Data e País lado a lado, e IBU e ABV lado a lado (quando ambos
 * existem - só a cerveja tem IBU; wine/dest/drink têm só ABV, que fica sozinho). O resto segue
 * cada um na sua própria linha, ocupando a largura toda.
 *
 * Genérico por design (não hardcoded por tipo): casa por `kind` (date+country) e por sufixo de
 * coluna (`_ibu`/`_abv`), então continua funcionando se os schemas de tipo mudarem sem precisar
 * mexer aqui. A ordem de emissão segue a ordem original de `fields` - só a posição do PAR muda pra
 * onde o primeiro membro dele aparecia.
 */
export function buildFieldRows(fields: Field[]): Field[][] {
  const usado = new Set<string>();
  const rows: Field[][] = [];

  function achar(pred: (f: Field) => boolean): Field | undefined {
    return fields.find((f) => !usado.has(f.col) && pred(f));
  }

  for (const f of fields) {
    if (usado.has(f.col)) continue;

    if (f.kind === "date" || f.kind === "country") {
      const dataF = f.kind === "date" ? f : achar((x) => x.kind === "date");
      const paisF = f.kind === "country" ? f : achar((x) => x.kind === "country");
      if (dataF && paisF) {
        rows.push([dataF, paisF]);
        usado.add(dataF.col);
        usado.add(paisF.col);
        continue;
      }
    }

    if (f.col.endsWith("_ibu") || f.col.endsWith("_abv")) {
      const ibuF = f.col.endsWith("_ibu") ? f : achar((x) => x.col.endsWith("_ibu"));
      const abvF = f.col.endsWith("_abv") ? f : achar((x) => x.col.endsWith("_abv"));
      if (ibuF && abvF) {
        rows.push([ibuF, abvF]);
        usado.add(ibuF.col);
        usado.add(abvF.col);
        continue;
      }
    }

    rows.push([f]);
    usado.add(f.col);
  }

  return rows;
}

export type Lookup = {
  pais: { pais_id: number; pais_nome: string }[];
  bjcp: { bjcp21_id: number; bjcp21_cod: string; bjcp21_subestilo: string }[];
};

/** Cache-first (IndexedDB, etapa 6): países/BJCP quase não mudam, então servir do que já está
 *  salvo e disparar um refresh em segundo plano evita esperar rede toda vez que a tela de
 *  detalhe/edição abre. Sem cache ainda (primeiro uso do aparelho) cai pro fetch direto. */
export async function fetchLookups(): Promise<Lookup> {
  const cached = await getCachedLookups();
  const data = cached ?? (await fetchLookupsNetwork());
  void pullLookups(); // sempre atualiza em segundo plano, tendo cache ou não
  return {
    pais: data.paises.map((p) => ({ pais_id: Number(p.pais_id), pais_nome: p.pais_nome })),
    bjcp: data.bjcp.map((b) => ({
      bjcp21_id: Number(b.bjcp21_id),
      bjcp21_cod: b.bjcp21_cod,
      bjcp21_subestilo: b.bjcp21_subestilo ?? "",
    })),
  };
}

async function fetchLookupsNetwork(): Promise<{
  paises: { pais_id: string; pais_nome: string }[];
  bjcp: { bjcp21_id: string; bjcp21_cod: string; bjcp21_subestilo?: string }[];
}> {
  const res = await fetch(noCacheUrl("/api/lookups"), { cache: "no-store" });
  if (!res.ok) return { paises: [], bjcp: [] };
  return (await res.json()) as {
    paises: { pais_id: string; pais_nome: string }[];
    bjcp: { bjcp21_id: string; bjcp21_cod: string; bjcp21_subestilo?: string }[];
  };
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
/**
 * Salvar é SEMPRE local-primeiro: grava no IndexedDB e enfileira no outbox (`createItemOffline`/
 * `updateItemOffline`), nunca espera a rede. Devolve na hora, tipicamente em menos de um
 * milissegundo - é o que permite `DetailScreen.save()` fechar a tela imediatamente.
 *
 * Redesenho de 2026-09-04 (pedido do Carlos: "o desejado era que a tela de inclusão fechasse ao
 * clicar em salvar, e a subida fosse para um outbox" - o app estava fazendo o oposto: esperando a
 * rede, com o botão preso em "…" quando o Apps Script demorava). Até aqui, criar um item tentava
 * o servidor primeiro e só caía pro caminho otimista se isso falhasse; a versão em rede podia
 * demorar de 3s a bem mais (o Apps Script oscila, ver seção 8.1 do MIGRACAO_SHEETS.md), e
 * qualquer exceção nesse caminho deixava `saving` preso em `true` pra sempre, sem mensagem
 * nenhuma - foi o que o Carlos viu.
 *
 * O motivo de existir aquele caminho direto - dar ao item um id ESTÁVEL na hora, pra já poder
 * anexar foto - não vale mais desde a 8.2: a foto só sobe no Salvar, nunca antes, então o id
 * local (temporário, uuid) que `createItemOffline` devolve na hora já está disponível a tempo. O
 * upload de foto de um item recém-criado espera o id real via `waitForRealId` (ver
 * offline/sync.ts) em vez de precisar dele de antemão.
 */
export async function saveItem(
  type: ItemType,
  id: string | null,
  values: Record<string, string>,
  ownerId: string,
): Promise<string> {
  const payload: Record<string, string> = {};
  for (const f of SCHEMA[type].fields) payload[f.col] = coerce(f, values[f.col] ?? "");

  const tab = TYPE_TAB[type] as ItemTab;
  if (id == null) return createItemOffline(tab, payload, ownerId);
  await updateItemOffline(tab, id, payload);
  return id;
}
