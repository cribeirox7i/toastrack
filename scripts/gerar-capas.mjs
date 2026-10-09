/**
 * Gera as "capas" da Biblioteca: baixa a miniatura de cada arquivo do Drive listado na aba `lib`
 * (via ação `libThumbnails` do Apps Script, que funciona com o arquivo privado) e grava em
 * `public/capas/{fileId}.webp`, mais o índice `src/lib/capas.json` (lista dos ids que têm capa).
 *
 * As capas viram arquivo ESTÁTICO do app (servido pela CDN da Vercel, sem função serverless e sem
 * Apps Script a cada abertura) - de propósito, por causa do consumo de Fluid Provisioned Memory.
 * O custo é rodar isto de novo quando entrar conteúdo novo na aba `lib`:
 *
 *   node scripts/gerar-capas.mjs           (só o que ainda não tem capa)
 *   node scripts/gerar-capas.mjs --refazer (todas de novo)
 *
 * Idempotente. Precisa que o Codigo.gs com `libThumbnails` esteja implantado.
 */
import "./_loadEnv.mjs";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const url = process.env.APPS_SCRIPT_URL;
const secret = process.env.APPS_SCRIPT_SHARED_SECRET;
const refazer = process.argv.includes("--refazer");
const LOTE = 6;
const LARGURA = 240; // a capa aparece com ~60-100px de largura; 240 cobre tela 2-3x

const dirCapas = join(process.cwd(), "public", "capas");
mkdirSync(dirCapas, { recursive: true });

async function chamar(action, payload, tentativas = 5) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, action, payload }),
        signal: AbortSignal.timeout(90_000),
      });
      const j = JSON.parse(await res.text());
      if (j.ok) return j.data;
      throw new Error(j.error);
    } catch (err) {
      if (i === tentativas) throw err;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

const linhas = await chamar("read", { tab: "lib" });
const ids = [
  ...new Set(
    linhas
      .map((l) => /drive\.google\.com\/file\/d\/([\w-]+)/.exec(l.lib_lnk_conteudo || "")?.[1])
      .filter(Boolean),
  ),
];
const jaTem = new Set(readdirSync(dirCapas).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)));
const pendentes = refazer ? ids : ids.filter((id) => !jaTem.has(id));
console.log(`${ids.length} arquivos do Drive na Biblioteca, ${pendentes.length} para gerar.`);

let feitas = 0;
const semMiniatura = [];
for (let i = 0; i < pendentes.length; i += LOTE) {
  const lote = pendentes.slice(i, i + LOTE);
  const dados = await chamar("libThumbnails", { fileIds: lote });
  for (const id of lote) {
    const t = dados[id];
    if (!t) {
      semMiniatura.push(id);
      continue;
    }
    const webp = await sharp(Buffer.from(t.base64Data, "base64"))
      .resize({ width: LARGURA, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    writeFileSync(join(dirCapas, `${id}.webp`), webp);
    feitas++;
  }
  console.log(`  ${Math.min(i + LOTE, pendentes.length)}/${pendentes.length}`);
}

const comCapa = readdirSync(dirCapas)
  .filter((f) => f.endsWith(".webp"))
  .map((f) => f.slice(0, -5))
  .sort();
writeFileSync(join(process.cwd(), "src", "lib", "capas.json"), JSON.stringify(comCapa) + "\n");
console.log(`Geradas agora: ${feitas}. Sem miniatura no Drive: ${semMiniatura.length}. Total com capa: ${comCapa.length}.`);
if (semMiniatura.length) console.log("Sem miniatura:", semMiniatura.join(", "));
