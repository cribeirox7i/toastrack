/**
 * ===========================================================
 *  Toastrack - Config.gs
 *  Valores específicos desta implantação (planilha, segredo,
 *  pasta do Drive). Criado UMA VEZ com os valores reais e
 *  deixado intocado dali em diante - as atualizações de código
 *  mexem só em Codigo.gs, nunca neste arquivo.
 * ===========================================================
 */

// Se o script estiver vinculado (bound) à planilha, deixe SPREADSHEET_ID vazio
// e ele usará SpreadsheetApp.getActiveSpreadsheet(). Se for um script avulso,
// preencha com o ID da planilha (trecho entre /d/ e /edit na URL).
const SPREADSHEET_ID = '';

// Segredo compartilhado: gere uma string aleatória longa e cole aqui E também
// na variável de ambiente APPS_SCRIPT_SHARED_SECRET do Next.js/Vercel. Sem
// isso, qualquer pessoa que descobrir a URL /exec conseguiria ler/escrever
// na planilha (o Web App é publicado como "Qualquer pessoa", pois o Google
// não permite autenticação de servidor-a-servidor de outra forma aqui).
const SHARED_SECRET = 'TROQUE-ESTE-VALOR-POR-UM-SEGREDO-ALEATORIO';

// Uma pasta raiz por categoria de bebida (cada uma pode viver em lugar
// diferente do Drive - por isso 4 ids em vez de 1 pasta raiz com subpastas).
// Dentro de cada uma, o script cria uma subpasta por usuário: {raiz}/{user_id}/.
// Preencha com o trecho entre /folders/ e o fim na URL de cada pasta
// (ex.: .../folders/AAAA1234BBBB -> 'AAAA1234BBBB').
const DRIVE_ROOT_FOLDERS = {
  BEER: '',
  WINE: '',
  DEST: '',
  DRINK: ''
};
