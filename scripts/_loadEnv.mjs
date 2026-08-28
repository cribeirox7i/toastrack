/**
 * Carrega .env.local do mesmo jeito que o Next.js carrega em runtime (via @next/env, o mesmo
 * pacote que `next dev`/`next build` usam por baixo) — importar isto no topo de um script garante
 * que ele vê exatamente os mesmos valores que a aplicação real veria, sem as divergências de outro
 * carregador (ex.: `node --env-file` não entende o escape "\$" que o dotenv-expand do Next exige
 * pra "$" literal num valor não virar tentativa de substituição de variável — achado real, ver
 * MIGRACAO_SHEETS.md, gotcha sobre APPS_SCRIPT_SHARED_SECRET).
 */
// @next/env só expõe CJS de fato (o named export ESM falha em runtime puro do Node, mesmo com
// "exports" no package.json apontando pra um arquivo ESM) — import default + destructure é o
// jeito que funciona fora do bundler do Next.
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd(), true);
