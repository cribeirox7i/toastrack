/**
 * URL da bandeira a partir do nome do país em português.
 *
 * A coluna `pais_img` da aba `list_pais` está vazia (o seed do Supabase tinha as URLs, mas não
 * chegaram na planilha do Carlos) - então a bandeira é resolvida aqui, de um mapa estático dos 40
 * países cadastrados pro código flagcdn. Escócia/Inglaterra/País de Gales usam os códigos
 * regionais do flagcdn (`gb-sct` etc.). Se algum país novo for cadastrado sem estar no mapa, cai
 * em "" e a UI mostra um retângulo neutro.
 */

const NOME_PARA_CODIGO: Record<string, string> = {
  alemanha: "de",
  argentina: "ar",
  australia: "au",
  austria: "at",
  belgica: "be",
  bolivia: "bo",
  brasil: "br",
  chile: "cl",
  china: "cn",
  colombia: "co",
  "costa rica": "cr",
  dinamarca: "dk",
  equador: "ec",
  escocia: "gb-sct",
  espanha: "es",
  "estados unidos": "us",
  franca: "fr",
  grecia: "gr",
  holanda: "nl",
  "paises baixos": "nl",
  hungria: "hu",
  inglaterra: "gb-eng",
  irlanda: "ie",
  italia: "it",
  jamaica: "jm",
  letonia: "lv",
  mexico: "mx",
  panama: "pa",
  peru: "pe",
  polonia: "pl",
  portugal: "pt",
  "republica tcheca": "cz",
  tchequia: "cz",
  russia: "ru",
  servia: "rs",
  suecia: "se",
  tailandia: "th",
  uruguai: "uy",
  liechtenstein: "li",
  eslovaquia: "sk",
  suica: "ch",
  suíça: "ch",
  "pais de gales": "gb-wls",
  gales: "gb-wls",
};

function normalizar(nome: string): string {
  return (nome ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** URL SVG da bandeira, ou "" se o país não estiver no mapa. */
export function flagUrl(paisNome: string): string {
  const codigo = NOME_PARA_CODIGO[normalizar(paisNome)];
  return codigo ? `https://flagcdn.com/${codigo}.svg` : "";
}
