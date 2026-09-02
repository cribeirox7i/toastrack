import "./_loadEnv.mjs";
/**
 * Diagnóstico/verificação: confere se as fotos de uma aba de item estão publicamente acessíveis
 * (compartilhadas como "Qualquer pessoa com o link" no Drive) — um `<img src>` não consegue ler
 * um arquivo que exige login, mesmo com a URL certa. Achado 2026-09-02: fotos de vinho (subidas
 * direto pelo Carlos antes do app existir) redirecionavam pra login (302); as de cerveja já
 * respondiam 200 direto. Não é bug de código (driveImageUrl/Thumb são iguais pros dois) — é
 * permissão faltando no arquivo do Drive em si. Corrigido rodando
 * `corrigirCompartilhamentoDeFotosAntigas` uma vez no editor do Apps Script (ver apps-script/
 * Codigo.gs) — este script serve pra checar o estado antes e confirmar depois.
 *
 *   npx tsx --conditions=react-server scripts/check-photo-sharing.mjs beer|wine|dest|drink
 */
import { callAppsScript } from "../src/lib/sheets/client.ts";
import { driveImageUrl } from "../src/lib/catalog.ts";

const IMG_URL_COL = { beer: "beer_img_url", wine: "wine_img_url", dest: "dest_img_url", drink: "drink_img_url" };

async function main() {
  const tab = process.argv[2];
  if (!IMG_URL_COL[tab]) {
    console.error("uso: check-photo-sharing.mjs beer|wine|dest|drink");
    process.exit(1);
  }
  const col = IMG_URL_COL[tab];
  const rows = await callAppsScript("read", { tab });
  const comFoto = rows.filter((r) => (r[col] ?? "").trim() !== "");
  console.log(`${tab}: ${rows.length} linhas, ${comFoto.length} com foto`);

  let publicas = 0;
  let privadas = 0;
  let erros = 0;
  for (const row of comFoto) {
    const url = driveImageUrl(row[col]);
    if (!url) {
      erros++;
      continue;
    }
    try {
      const res = await fetch(url, { redirect: "manual" });
      // 200 = pública (serve a imagem direto); redirect (3xx) = precisa de login, não pública.
      if (res.status === 200) publicas++;
      else privadas++;
    } catch {
      erros++;
    }
  }
  console.log(`públicas: ${publicas}  privadas (redirecionam pra login): ${privadas}  erro ao checar: ${erros}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
