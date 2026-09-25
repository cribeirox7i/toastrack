import { noCacheUrl } from "@/lib/utils";

export interface LibEntry {
  id: string;
  bebida: string;
  grupo: string;
  titulo: string;
  descricao: string;
  link: string;
}

/** Conteúdo da tela Biblioteca (aba `lib` da planilha). */
export async function fetchLibrary(): Promise<LibEntry[]> {
  const res = await fetch(noCacheUrl("/api/lookups/lib"), { cache: "no-store" });
  if (!res.ok) return [];
  const rows = (await res.json()) as {
    lib_id: string;
    lib_bebida: string;
    lib_grupo: string;
    lib_nom_conteudo: string;
    lib_desc_conteudo: string;
    lib_lnk_conteudo: string;
  }[];
  return rows.map((r) => ({
    id: r.lib_id,
    bebida: r.lib_bebida,
    grupo: r.lib_grupo,
    titulo: r.lib_nom_conteudo,
    descricao: r.lib_desc_conteudo,
    link: r.lib_lnk_conteudo,
  }));
}
