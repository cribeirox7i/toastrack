/**
 * ===========================================================
 *  Toastrack - Codigo.gs
 *  Camada de acesso à planilha, publicada como Web App.
 *  Mesmo padrão do TravelTrack (C:\Claude\TravelTrack\apps-script):
 *  sem service account do Google Cloud, o script roda com a
 *  identidade de quem publicou o Web App (autorização feita uma
 *  vez no editor).
 * ===========================================================
 */

// ---------- CONFIGURAÇÃO ----------
// SPREADSHEET_ID, SHARED_SECRET e DRIVE_ROOT_FOLDERS ficam em Config.gs -
// arquivo separado para você não perder os valores reais toda vez que colar
// uma versão nova deste Codigo.gs (veja README, seção 1).

// Estrutura esperada das abas (criadas/conferidas por ensureStructure). Os
// nomes AQUI têm que bater com os nomes REAIS da planilha do Carlos - o
// Google Sheets casa nome de aba sem diferenciar maiúscula/minúscula, mas
// NÃO faz isso entre "list_pais" e "ListPais" (são palavras diferentes).
// Um nome errado aqui não dá erro - só cria uma aba nova vazia do lado, o
// que já aconteceu uma vez (Users/ListPais/ListBjcp/AccessLog vs as abas
// reais "user"/"list_pais"/"list_bjcp_21"/"log" - ver MIGRACAO_SHEETS.md).
//
// As 4 abas de item usam "id" como chave (renomeado de beer_id/wine_id/
// dest_id/drink_id - é o que permite um único motor genérico de leitura/
// escrita para as 4 categorias). "user" mantém sua chave original
// (user_id) e "log" nem precisa de id literal, porque nenhum dos dois
// passa por updateById/deleteById.
const ESTRUTURA = {
  user: ['user_id', 'user_nome', 'user_mail', 'user_status', 'user_role', 'user_idioma', 'user_paleta', 'user_modo', 'user_url_img', 'senha_hash', 'deve_trocar_senha', 'convite_token', 'convite_expira_em'],
  // "user_owner" é o dono (nome genérico, igual nas 4 abas - não prefixado por
  // tipo como o beer_owner/wine_owner do rascunho anterior). user_access dá só
  // leitura; user_edit dá leitura+edição/exclusão (ver MIGRACAO_SHEETS.md seção 4).
  beer: ['id', 'user_owner', 'user_access', 'user_edit', 'beer_nome', 'beer_cervejaria', 'pais_id', 'beer_ibu', 'beer_abv', 'beer_nota', 'beer_estilo_livre', 'bjcp21_id', 'beer_data', 'beer_img_nome', 'beer_img_url', 'updated_at'],
  wine: ['id', 'user_owner', 'user_access', 'user_edit', 'wine_nome', 'wine_safra', 'wine_cor', 'wine_tipo', 'wine_produtor', 'pais_id', 'wine_regiao', 'wine_uva', 'wine_abv', 'wine_nota', 'wine_data_degustacao', 'wine_img_nome', 'wine_img_url', 'updated_at'],
  dest: ['id', 'user_owner', 'user_access', 'user_edit', 'dest_nome', 'dest_safra', 'dest_cor', 'dest_tipo', 'dest_produtor', 'pais_id', 'dest_regiao', 'dest_abv', 'dest_nota', 'dest_data_degustacao', 'dest_img_nome', 'dest_img_url', 'updated_at'],
  drink: ['id', 'user_owner', 'user_access', 'user_edit', 'drink_nome', 'drink_safra', 'drink_cor', 'drink_tipo', 'drink_produtor', 'pais_id', 'drink_regiao', 'drink_abv', 'drink_nota', 'drink_data_degustacao', 'drink_img_nome', 'drink_img_url', 'updated_at'],
  list_pais: ['pais_id', 'pais_nome', 'pais_img'],
  list_bjcp_21: ['bjcp21_id', 'bjcp21_cod'],
  // Aba real do Carlos, já com dados (log_id/log_data/etc.) - só append+read,
  // por isso não precisa de "id" literal nem de updateById/deleteById.
  log: ['log_id', 'log_data', 'user_id', 'user_mail', 'acao', 'tabela', 'registro_id', 'detalhe'],
  // Nome deliberadamente diferente de "meta" (a aba de anotações pessoais do
  // Carlos, intocável) - "SyncMeta" nasce nova e vazia por ensureStructure.
  // chave = nome real da aba de item (beer/wine/dest/drink), valor = ISO da
  // última escrita nela (ver "pull incremental" no README).
  SyncMeta: ['chave', 'valor']
};

// Abas de item (categorias de bebida) - as únicas que participam do
// user_access/user_edit e do carimbo incremental em SyncMeta. Distinto de
// ESTRUTURA porque user/list_pais/list_bjcp_21/log/SyncMeta seguem outras regras.
const ABAS_ITEM = ['beer', 'wine', 'dest', 'drink'];

// ---------- PONTO DE ENTRADA DO WEB APP ----------
/**
 * Chamado servidor-a-servidor pelas rotas de API do Next.js, nunca direto
 * pelo navegador do usuário final - por isso pode ser um único POST simples,
 * sem se preocupar com CORS. Corpo esperado:
 * {"secret": "...", "action": "...", "payload": {...}}.
 */
function doPost(e) {
  var resultado;
  try {
    var body = JSON.parse(e.postData.contents);
    if (!segredosIguais(body.secret, SHARED_SECRET)) {
      resultado = erro('Segredo inválido');
    } else {
      resultado = api(body.action, body.payload || {});
    }
  } catch (err) {
    Logger.log('doPost error: ' + (err && err.stack ? err.stack : err));
    resultado = erro('Erro ao processar a requisição');
  }
  return ContentService.createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Compara dois segredos em tempo constante (via digest SHA-256 de tamanho fixo, comparado
 * byte a byte sem short-circuit) para não vazar, por diferença de tempo de resposta, quanto do
 * SHARED_SECRET o chamador acertou - `!==` direto abortaria na primeira diferença de caractere.
 */
function segredosIguais(a, b) {
  var da = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(a == null ? '' : a));
  var db = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(b == null ? '' : b));
  var diff = 0;
  for (var i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

function api(action, payload) {
  try {
    switch (action) {
      case 'ensureStructure': return ok(ensureStructure());
      case 'read':             return ok(lerTabela(abaValida(payload.tab)));
      case 'readSince':        return ok(lerTabelaDesde(abaValida(payload.tab), payload.desde || ''));
      case 'readById':         return ok(lerLinhaPorId(abaValida(payload.tab), payload.id));
      case 'readIndex':        return ok(lerIndice(abaValida(payload.tab)));
      case 'readByIds':        return ok(lerLinhasPorIds(abaValida(payload.tab), payload.ids || []));
      case 'append':           return ok(inserirLinhas(abaValida(payload.tab), payload.rows || []));
      case 'updateById':       return ok(atualizarPorId(abaValida(payload.tab), payload.id, payload.patch || {}));
      case 'updateManyById':   return ok(atualizarVariosPorId(abaValida(payload.tab), payload.updates || []));
      case 'updateByField':    return ok(atualizarPorCampo(abaValida(payload.tab), payload.campo, payload.valor, payload.patch || {}));
      case 'deleteById':       return ok(excluirPorId(abaValida(payload.tab), payload.id));
      case 'deleteByField':    return ok(excluirPorCampo(abaValida(payload.tab), payload.campo, payload.valor));
      // 'resetTab' não entra no dispatcher (mesmo checklist de segurança do TravelTrack): é
      // destrutivo, não é usado por nenhuma rota do app e, com o segredo compartilhado sendo a
      // única credencial aceita aqui, ficaria alcançável por qualquer chamador que o conheça.
      // `resetarAba` continua existindo no arquivo só para uso manual pelo editor.
      case 'metaGet':          return ok(metaGet(payload.chave));
      case 'proximoIdSequencial': return ok(proximoIdSequencial(abaValida(payload.tab)));
      case 'driveUploadFile':  return ok(driveUploadFile(payload));
      case 'driveListFiles':   return ok(driveListFiles(payload));
      case 'driveDeleteFile':  return ok(driveDeleteFile(payload));
      case 'driveDownloadFile': return ok(driveDownloadFile(payload));
      default:                 return erro('Ação desconhecida: ' + action);
    }
  } catch (err) {
    Logger.log('api(' + action + ') error: ' + (err && err.stack ? err.stack : err));
    return erro('Erro ao executar a ação');
  }
}

function ok(data) { return { ok: true, data: data }; }
function erro(msg) { return { ok: false, error: msg }; }

/**
 * Só deixa passar nomes de aba que o app realmente usa (as chaves de ESTRUTURA). Sem isso,
 * `payload.tab` chegava direto ao getSheet, que cria a aba se não existir - então uma chamada
 * podia ler, escrever ou esvaziar qualquer aba da planilha, inclusive uma alheia ao app.
 */
function abaValida(nome) {
  if (!ESTRUTURA[nome]) throw new Error('Aba não permitida: ' + nome);
  return nome;
}

// ---------- ACESSO À PLANILHA ----------
function abrirPlanilha() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(nome) {
  const ss = abrirPlanilha();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    if (ESTRUTURA[nome]) {
      sh.getRange(1, 1, 1, ESTRUTURA[nome].length).setValues([ESTRUTURA[nome]]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

/** Lê uma aba inteira e devolve as linhas como objetos {header: valor}. */
function lerTabela(nome) {
  const sh = getSheet(nome);
  const values = sh.getDataRange().getValues();
  const headers = (values[0] || []).map(String);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const linha = values[r];
    if (linha.join('') === '') continue;
    const obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = sanitizarValor(linha[i]); });
    rows.push(obj);
  }
  return rows;
}

/**
 * Como lerTabela, mas só devolve linhas com updated_at maior que `desde` (comparação de string
 * ISO, que ordena igual à cronológica). `desde` vazio equivale a "tudo" - mesmo resultado de
 * lerTabela. Usado pelo sync incremental (ver README "pull incremental"): o cliente manda o
 * carimbo da última sincronização e recebe só o que mudou depois.
 */
function lerTabelaDesde(nome, desde) {
  const todas = lerTabela(nome);
  if (!desde) return todas;
  return todas.filter(function (row) { return String(row.updated_at || '') > desde; });
}

/** Só o cabeçalho (linha 1) - não lê nenhuma linha de dado. */
function lerCabecalho(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn() || 1).getValues()[0].map(String);
}

/**
 * Acha a linha de um id lendo SÓ a coluna "id" (uma célula por linha, não a linha inteira) - é
 * isso que evita ler ~20 colunas × milhares de linhas só pra achar 1 registro. Contra o `beer`
 * real (3591 linhas) essa é a diferença entre ~9-10s e menos de 1s por chamada (achado em
 * 2026-08-30, ver MIGRACAO_SHEETS.md). Devolve o número da linha na planilha (1-based, já
 * contando o cabeçalho) ou -1 se não achar.
 */
function localizarLinhaPorId(sh, headers, id) {
  const idCol = headers.indexOf('id');
  if (idCol === -1) return -1;
  const totalLinhas = sh.getLastRow() - 1;
  if (totalLinhas < 1) return -1;
  const ids = sh.getRange(2, idCol + 1, totalLinhas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // +2: pula o cabeçalho, 1-based
  }
  return -1;
}

/** Lê UMA linha pelo id, sem tocar no resto da aba - usado pelo GET de item por id (abrir
 *  detalhe, checar permissão antes de editar/excluir). null se não encontrar. */
function lerLinhaPorId(nome, id) {
  const sh = getSheet(nome);
  const headers = lerCabecalho(sh);
  const linha = localizarLinhaPorId(sh, headers, id);
  if (linha === -1) return null;
  const valores = sh.getRange(linha, 1, 1, headers.length).getValues()[0];
  const obj = {};
  headers.forEach(function (h, i) { if (h) obj[h] = sanitizarValor(valores[i]); });
  return obj;
}

/**
 * Índice de sincronização de uma aba: uma entrada por linha, só com o `id`, um hash do conteúdo
 * da linha inteira e as 3 colunas de permissão (que o servidor precisa pra filtrar o que cada
 * usuário pode ver).
 *
 * Existe porque `read` da aba `beer` é inviável: 3593 linhas viram 1,84 MB e a chamada levou de
 * 10s a 2min38 nas medições de 2026-09-03, com 1 em 5 respondendo HTTP 500 — o app pulava a aba
 * em silêncio e o usuário via "atualizei e não mudou nada". O índice das mesmas 3593 linhas dá
 * ~55 KB, então o cliente descobre o que mudou barato e baixa só as linhas diferentes (readByIds).
 *
 * O hash é do conteúdo, NÃO do `updated_at`: é isso que faz uma edição feita à mão na planilha
 * (que não mexe em `updated_at`) ser detectada. Um id que sumiu do índice é uma exclusão — o que
 * fecha o caso do item "fantasma" que o delta por `readSince` nunca conseguiu enxergar.
 */
function lerIndice(nome) {
  const sh = getSheet(nome);
  const values = sh.getDataRange().getValues();
  const headers = (values[0] || []).map(String);
  const iId = headers.indexOf('id');
  const iOwner = headers.indexOf('user_owner');
  const iAccess = headers.indexOf('user_access');
  const iEdit = headers.indexOf('user_edit');
  const col = function (linha, i) { return i === -1 ? '' : sanitizarValor(linha[i]); };
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const linha = values[r];
    if (linha.join('') === '') continue;
    out.push({
      id: col(linha, iId),
      h: hashLinha(linha, headers),
      user_owner: col(linha, iOwner),
      user_access: col(linha, iAccess),
      user_edit: col(linha, iEdit)
    });
  }
  return out;
}

/** FNV-1a de 32 bits sobre os valores já sanitizados da linha. Só precisa ser estável entre duas
 *  chamadas (quem compara é o cliente, contra o hash que ele guardou da vez anterior) — não é
 *  hash criptográfico e não precisa ser. O separador entre colunas evita que mover um caractere
 *  de uma coluna pra vizinha passe despercebido. */
function hashLinha(linha, headers) {
  var h = 0x811c9dc5;
  var mistura = function (c) {
    h ^= c;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  };
  for (var i = 0; i < headers.length; i++) {
    if (!headers[i]) continue;
    var s = valorParaHash(linha[i]);
    for (var j = 0; j < s.length; j++) mistura(s.charCodeAt(j));
    mistura(1); // separador de coluna
  }
  return h.toString(36);
}

/**
 * Lê só as linhas cujos ids foram pedidos. É o par de `lerIndice`: o cliente descobre pelo índice
 * quais linhas mudaram e busca só essas, em lotes — nunca a aba inteira de uma vez. Numa carga
 * inicial (cache vazio) são vários lotes, e cada lote que falhar é reprocessado sozinho, em vez
 * de derrubar a sincronização toda como acontecia com uma única resposta de 1,84 MB.
 */
function lerLinhasPorIds(nome, ids) {
  const alvo = {};
  (ids || []).forEach(function (i) { alvo[String(i)] = true; });
  const sh = getSheet(nome);
  const values = sh.getDataRange().getValues();
  const headers = (values[0] || []).map(String);
  const iId = headers.indexOf('id');
  if (iId === -1) return [];
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const linha = values[r];
    if (linha.join('') === '') continue;
    if (!alvo[String(sanitizarValor(linha[iId]))]) continue;
    const obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = sanitizarValor(linha[i]); });
    out.push(obj);
  }
  return out;
}

/** Lê o valor de uma chave da aba SyncMeta (carimbo de última escrita por aba). '' se não existir. */
function metaGet(chave) {
  const linhas = lerTabela('SyncMeta');
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].chave === chave) return linhas[i].valor;
  }
  return '';
}

/** Grava/atualiza o carimbo de uma chave em SyncMeta - chamado depois de toda escrita
 * bem-sucedida numa aba de item, para que o próximo `metaGet` reflita a mudança. */
function metaSet(chave, valor) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet('SyncMeta');
    const values = sh.getDataRange().getValues();
    for (let r = 1; r < values.length; r++) {
      if (values[r][0] === chave) {
        sh.getRange(r + 1, 2).setValue(valor);
        return;
      }
    }
    sh.appendRow([chave, valor]);
  } finally {
    lock.releaseLock();
  }
}

/** Se `nome` for uma aba de item, atualiza o carimbo dela em SyncMeta com o instante atual. */
function tocarMeta(nome) {
  if (ABAS_ITEM.indexOf(nome) !== -1) metaSet(nome, new Date().toISOString());
}

/**
 * Devolve o próximo id sequencial (inteiro, como texto) de uma aba de item - decisão do Carlos
 * 2026-09-02: "a chave das tabelas (ID) precisa ser sequencial, sempre acréscimo do maior número
 * que está na tabela" - cada aba (beer/wine/dest/drink) com a própria contagem, não uma única
 * global. Guarda o contador em SyncMeta (chave `nextId:{tab}`), tudo sob UM lock (não reaproveita
 * metaGet/metaSet, que teriam seu próprio lock cada - evita depender de o lock do Apps Script ser
 * reentrante), pra duas criações concorrentes (dois usuários ao mesmo tempo) nunca saírem com o
 * mesmo número.
 *
 * Se o contador ainda não existe (primeira chamada depois desta mudança), inicializa varrendo o
 * maior `id` numérico já usado na aba - preserva a continuidade com os ids antigos (que já eram
 * sequenciais antes da migração pra Sheets, ver MIGRACAO_SHEETS.md seção 3) em vez de reiniciar
 * do 1 e colidir com uma linha existente. Esse é o ÚNICO ponto que lê a aba inteira; depois disso
 * o contador fica em SyncMeta e as chamadas seguintes são baratas.
 */
function proximoIdSequencial(tab) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const chave = 'nextId:' + tab;
    const sh = getSheet('SyncMeta');
    const valores = sh.getDataRange().getValues();
    let linha = -1;
    let atual = '';
    for (let r = 1; r < valores.length; r++) {
      if (valores[r][0] === chave) { linha = r; atual = valores[r][1]; break; }
    }
    const proximo = atual ? (Number(atual) + 1) : (maiorIdNumericoAtual(tab) + 1);
    if (linha !== -1) {
      sh.getRange(linha + 1, 2).setValue(String(proximo));
    } else {
      sh.appendRow([chave, String(proximo)]);
    }
    return String(proximo);
  } finally {
    lock.releaseLock();
  }
}

function maiorIdNumericoAtual(tab) {
  const linhas = lerTabela(tab);
  let maior = 0;
  linhas.forEach(function (linha) {
    const n = Number(linha.id);
    if (!isNaN(n) && n > maior) maior = n;
  });
  return maior;
}

/**
 * Converte Date -> string segura para serialização em JSON e para regravação na planilha.
 * Datas "puras" (meia-noite no fuso da planilha) viram "yyyy-MM-dd"; qualquer outro Date
 * (não deveria ocorrer aqui, mas por segurança) cai para ISO completo.
 */
/**
 * Fuso do script, resolvido UMA vez por execução. `Session.getScriptTimeZone()` é uma chamada de
 * ponte pro host do Apps Script (cara, na casa do milissegundo) e `sanitizarValor` roda em CADA
 * célula: na aba `beer` (3599 linhas × 2 colunas de data) isso eram ~7200 chamadas por leitura,
 * uma das razões de `read`/`readIndex` levarem dezenas de segundos.
 */
var _fusoDoScript = null;
function fusoDoScript() {
  if (_fusoDoScript === null) _fusoDoScript = Session.getScriptTimeZone();
  return _fusoDoScript;
}

function sanitizarValor(v) {
  if (v instanceof Date) {
    // Um único formatDate em vez de dois (era um só pra testar se é meia-noite e outro pra
    // formatar) - mesma economia de chamada de ponte descrita acima.
    const s = Utilities.formatDate(v, fusoDoScript(), 'yyyy-MM-dd HH:mm:ss');
    return s.slice(11) === '00:00:00' ? s.slice(0, 10) : v.toISOString();
  }
  return v === null || v === undefined ? '' : String(v);
}

/**
 * Versão do valor usada SÓ pelo hash do índice. Uma data vira o timestamp numérico em vez de
 * passar por `Utilities.formatDate` — o hash só precisa ser estável entre duas leituras, ninguém
 * lê esse texto. É o que tira as chamadas de ponte de dentro do laço que roda em cada célula das
 * 3599 linhas.
 */
function valorParaHash(v) {
  if (v instanceof Date) return String(v.getTime());
  return v === null || v === undefined ? '' : String(v);
}

/**
 * Acrescenta uma ou mais linhas, respeitando a ordem dos cabeçalhos da aba.
 * Ignora silenciosamente linhas cujo "id" já exista na aba: o Web App do
 * Apps Script às vezes executa a ação com sucesso mas devolve uma resposta
 * corrompida (erro do lado do Google, não do script) - o cliente reage a
 * isso reenviando a mesma chamada, e essa checagem evita duplicar a linha
 * nesse reenvio.
 */
function inserirLinhas(nome, rows) {
  if (!rows.length) return null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn() || ESTRUTURA[nome].length).getValues()[0];
    const idCol = headers.indexOf('id');
    const qtdLinhasDados = sh.getLastRow() - 1;
    const idsExistentes = (idCol === -1 || qtdLinhasDados < 1)
      ? []
      : sh.getRange(2, idCol + 1, qtdLinhasDados).getValues().map(function (r) { return String(r[0]); });

    const novasLinhas = rows.filter(function (obj) {
      return idCol === -1 || idsExistentes.indexOf(String(obj.id)) === -1;
    });
    if (!novasLinhas.length) return null;

    const valores = novasLinhas.map(function (obj) {
      return headers.map(function (h) { return (h in obj) ? obj[h] : ''; });
    });
    // Formato texto ('@') evita que o Sheets auto-converta strings de data
    // (ex.: "2026-09-10") em células do tipo Date, o que faria a leitura
    // posterior devolver um timestamp completo em vez do texto original.
    sh.getRange(sh.getLastRow() + 1, 1, valores.length, headers.length)
      .setNumberFormat('@')
      .setValues(valores);
  } finally {
    lock.releaseLock();
  }
  tocarMeta(nome);
  return null;
}

/**
 * Localiza a linha pelo id (via localizarLinhaPorId - só a coluna id, não a aba inteira) e
 * sobrescreve com o patch informado (mescla com os valores atuais DAQUELA linha só).
 */
function atualizarPorId(nome, id, patch) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const headers = lerCabecalho(sh);
    if (headers.indexOf('id') === -1) throw new Error('Aba "' + nome + '" não tem coluna "id"');

    const linha = localizarLinhaPorId(sh, headers, id);
    if (linha === -1) throw new Error('Linha com id "' + id + '" não encontrada na aba ' + nome);

    const atual = sh.getRange(linha, 1, 1, headers.length).getValues()[0];
    const nova = headers.map(function (h, i) {
      return (h in patch) ? patch[h] : sanitizarValor(atual[i]);
    });
    sh.getRange(linha, 1, 1, headers.length).setNumberFormat('@').setValues([nova]);
  } finally {
    lock.releaseLock();
  }
  tocarMeta(nome);
  return null;
}

/**
 * Como atualizarPorId, mas localiza a linha por um valor de coluna qualquer em vez de "id" -
 * usado por "user" (chave natural = user_mail em alguns fluxos) e por correções pontuais.
 * Atualiza só a PRIMEIRA linha encontrada com esse valor.
 */
function atualizarPorCampo(nome, campo, valor, patch) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const values = sh.getDataRange().getValues();
    const headers = (values[0] || []).map(String);
    const col = headers.indexOf(campo);
    if (col === -1) throw new Error('Aba "' + nome + '" não tem coluna "' + campo + '"');

    let rowIndex = -1;
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][col]) === String(valor)) { rowIndex = r; break; }
    }
    if (rowIndex === -1) throw new Error('Linha com ' + campo + '="' + valor + '" não encontrada na aba ' + nome);

    const atual = values[rowIndex];
    const nova = headers.map(function (h, i) {
      return (h in patch) ? patch[h] : sanitizarValor(atual[i]);
    });
    sh.getRange(rowIndex + 1, 1, 1, headers.length).setNumberFormat('@').setValues([nova]);
  } finally {
    lock.releaseLock();
  }
  tocarMeta(nome);
  return null;
}

/**
 * Igual a atualizarPorId, mas para vários ids em uma única chamada: lê a aba uma vez, aplica
 * todos os patches em memória e grava tudo com uma única chamada a setValues, em vez de um
 * round-trip por linha. Útil para a importação em lote do /admin.
 *
 * Importante: todo valor regravado (inclusive os campos que NÃO fazem parte de nenhum patch, só
 * "carregados" de volta) passa por sanitizarValor. Sem isso, uma célula que o Sheets já tenha
 * convertido para o tipo Date seria regravada como objeto Date de novo em vez de texto, mesmo com
 * setNumberFormat('@') - o formato de exibição muda, mas o valor gravado continua sendo
 * reinterpretado como data.
 */
function atualizarVariosPorId(nome, updates) {
  if (!updates.length) return null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const values = sh.getDataRange().getValues();
    const headers = (values[0] || []).map(String);
    const idCol = headers.indexOf('id');
    if (idCol === -1) throw new Error('Aba "' + nome + '" não tem coluna "id"');

    const patchPorId = {};
    updates.forEach(function (u) { patchPorId[String(u.id)] = u.patch || {}; });

    for (let r = 1; r < values.length; r++) {
      const patch = patchPorId[String(values[r][idCol])];
      if (!patch) continue;
      headers.forEach(function (h, c) { if (h in patch) values[r][c] = patch[h]; });
    }

    if (values.length > 1) {
      const linhasSanitizadas = values.slice(1).map(function (linha) {
        return linha.map(sanitizarValor);
      });
      sh.getRange(2, 1, values.length - 1, headers.length)
        .setNumberFormat('@')
        .setValues(linhasSanitizadas);
    }
  } finally {
    lock.releaseLock();
  }
  tocarMeta(nome);
  return null;
}

/**
 * Localiza a linha pelo id e remove a linha inteira da planilha. Se o id já não existir (ex.:
 * reenvio automático de uma chamada cuja resposta anterior se perdeu, mas que já tinha
 * executado), trata como sucesso silenciosamente em vez de dar erro - excluir algo que já foi
 * excluído dá no mesmo.
 */
function excluirPorId(nome, id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const headers = lerCabecalho(sh);
    if (headers.indexOf('id') === -1) throw new Error('Aba "' + nome + '" não tem coluna "id"');

    const linha = localizarLinhaPorId(sh, headers, id);
    if (linha === -1) return null;

    sh.deleteRow(linha);
  } finally {
    lock.releaseLock();
  }
  tocarMeta(nome);
  return null;
}

/**
 * Remove, numa única passada, todas as linhas cujo valor na coluna `campo` seja igual a `valor` -
 * mais rápido que excluirPorId repetido linha a linha, e evita que os índices de linha mudem no
 * meio do processo. Usado pelo import do /admin para "limpar minhas linhas antes de recarregar".
 */
function excluirPorCampo(nome, campo, valor) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const values = sh.getDataRange().getValues();
    const headers = (values[0] || []).map(String);
    const col = headers.indexOf(campo);
    if (col === -1) throw new Error('Aba "' + nome + '" não tem coluna "' + campo + '"');

    const mantidas = values.slice(1).filter(function (linha) { return String(linha[col]) !== String(valor); });
    const removidas = (values.length - 1) - mantidas.length;
    if (removidas === 0) return { removidas: 0 };

    sh.getRange(2, 1, Math.max(values.length - 1, 1), headers.length).clearContent();
    if (mantidas.length) {
      const sanitizadas = mantidas.map(function (linha) { return linha.map(sanitizarValor); });
      sh.getRange(2, 1, sanitizadas.length, headers.length).setNumberFormat('@').setValues(sanitizadas);
    }
    return { removidas: removidas };
  } finally {
    lock.releaseLock();
  }
  tocarMeta(nome);
}

/**
 * DESTRUTIVO - apaga todo o conteúdo da aba (inclusive linhas de dados) e recria só o cabeçalho
 * esperado por ESTRUTURA. Não é usado por nenhuma rota do app; existe só para correção manual
 * pontual. Rode manualmente pelo editor - nunca automatize.
 */
function resetarAba(nome) {
  if (!ESTRUTURA[nome]) throw new Error('Aba desconhecida: ' + nome);
  const sh = getSheet(nome);
  sh.clear();
  sh.getRange(1, 1, 1, ESTRUTURA[nome].length).setValues([ESTRUTURA[nome]]);
  sh.setFrozenRows(1);
  return null;
}

/** Garante que todas as abas esperadas existam, com cabeçalho. Não apaga dados nem colunas. */
function ensureStructure() {
  const criadas = [];
  const colunasAdicionadas = {};
  Object.keys(ESTRUTURA).forEach(function (nome) {
    const ss = abrirPlanilha();
    const existiaAntes = !!ss.getSheetByName(nome);
    const sh = getSheet(nome);
    if (!existiaAntes) criadas.push(nome);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, ESTRUTURA[nome].length).setValues([ESTRUTURA[nome]]);
    } else {
      const novas = adicionarColunasFaltantes(sh, ESTRUTURA[nome]);
      if (novas.length) colunasAdicionadas[nome] = novas;
    }
    sh.setFrozenRows(1);
  });
  return { abasCriadas: criadas, colunasAdicionadas: colunasAdicionadas };
}

/**
 * Acrescenta ao final do cabeçalho as colunas de `colunasEsperadas` que ainda não existem na
 * aba - não mexe em colunas/linhas já existentes, só estende a estrutura pra campos novos.
 * Linhas já existentes ficam com a célula vazia nas colunas novas. NÃO renomeia colunas: o
 * rename de beer_id/wine_id/dest_id/drink_id para "id" é manual (ver README) porque um rename
 * automático arriscaria adivinhar errado qual coluna é a chave numa aba já com dados.
 */
function adicionarColunasFaltantes(sh, colunasEsperadas) {
  const headerAtual = sh.getRange(1, 1, 1, sh.getLastColumn() || 1).getValues()[0].map(String);
  const faltando = colunasEsperadas.filter(function (c) { return headerAtual.indexOf(c) === -1; });
  if (faltando.length) {
    sh.getRange(1, headerAtual.length + 1, 1, faltando.length).setValues([faltando]);
  }
  return faltando;
}

// ---------- FOTOS (GOOGLE DRIVE) ----------
// Mesmo padrão do TravelTrack: sem service account, usa DriveApp com a identidade de quem
// publicou o Web App. Cada categoria de bebida tem sua PRÓPRIA pasta raiz no Drive
// (DRIVE_ROOT_FOLDERS em Config.gs - podem viver em lugares diferentes do Drive), e dentro dela
// uma subpasta por usuário: {raiz da categoria}/{user_id}/arquivo. A pasta de usuário só é
// criada na hora do primeiro upload dele naquela categoria.

/** Acha ou cria (com lock, para não duplicar em uploads simultâneos) uma subpasta pelo nome. */
function getOrCreateSubfolder(pai, nome) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const existentes = pai.getFoldersByName(nome);
    if (existentes.hasNext()) return existentes.next();
    return pai.createFolder(nome);
  } finally {
    lock.releaseLock();
  }
}

/** categoria esperada: BEER | WINE | DEST | DRINK (maiúsculo - chaves de DRIVE_ROOT_FOLDERS). */
function getCategoriaRootId(categoria) {
  const id = DRIVE_ROOT_FOLDERS[categoria];
  if (!id) throw new Error('Pasta do Drive não configurada em Config.gs para categoria: ' + categoria);
  return id;
}

function getUserFolder(categoria, userId) {
  const raiz = DriveApp.getFolderById(getCategoriaRootId(categoria));
  return getOrCreateSubfolder(raiz, userId);
}

/**
 * Igual a getUserFolder, mas NUNCA cria nada - devolve null se a pasta ainda não existir (ou a
 * categoria não tiver pasta configurada). Usado pela listagem/download/exclusão: uma leitura não
 * deve criar pasta vazia no Drive (mesmo problema documentado no README do TravelTrack para
 * "You do not have permission to call DriveApp.Folder.createFolder").
 */
function findUserFolder(categoria, userId) {
  const id = DRIVE_ROOT_FOLDERS[categoria];
  if (!id) return null;
  const raiz = DriveApp.getFolderById(id);
  const userFolders = raiz.getFoldersByName(userId);
  return userFolders.hasNext() ? userFolders.next() : null;
}

/** Recebe o arquivo em base64, salva na pasta IMG/{categoria}/{userId}/. */
function driveUploadFile(payload) {
  const folder = getUserFolder(payload.categoria, payload.userId);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(payload.base64Data),
    payload.mimeType || 'application/octet-stream',
    payload.filename || 'foto'
  );
  const file = folder.createFile(blob);
  // Link direto de imagem (funciona em <img src>, diferente do link "view" padrão do Drive) -
  // exige que o arquivo seja compartilhável por link, ver README passo de compartilhamento.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    fileId: file.getId(),
    name: file.getName(),
    url: 'https://lh3.googleusercontent.com/d/' + file.getId(),
    size: file.getSize(),
    mimeType: file.getMimeType(),
    criadoEm: file.getDateCreated().toISOString()
  };
}

/** Lista as fotos de um usuário numa categoria. */
function driveListFiles(payload) {
  const folder = findUserFolder(payload.categoria, payload.userId);
  if (!folder) return [];
  const resultado = [];
  const arquivos = folder.getFiles();
  while (arquivos.hasNext()) {
    const file = arquivos.next();
    resultado.push({
      fileId: file.getId(),
      name: file.getName(),
      url: 'https://lh3.googleusercontent.com/d/' + file.getId(),
      size: file.getSize(),
      mimeType: file.getMimeType(),
      criadoEm: file.getDateCreated().toISOString()
    });
  }
  return resultado;
}

/**
 * Confirma que o arquivo pedido está de fato dentro da pasta IMG/{categoria}/{userId}/ informada,
 * e devolve o File. Sem essa checagem, `fileId` seria aceito solto: quem tivesse o id de UMA
 * foto sua conseguiria baixar ou excluir qualquer arquivo do Drive da conta que publicou o Web
 * App - mesmo risco documentado no arquivoDaViagem do TravelTrack, adaptado aqui para pasta de
 * usuário em vez de pasta de viagem.
 */
function arquivoDoUsuario(fileId, categoria, userId) {
  if (!categoria || !userId) throw new Error('categoria/userId obrigatórios');
  const folder = findUserFolder(categoria, userId);
  if (!folder) throw new Error('Foto não encontrada para este usuário');

  const file = DriveApp.getFileById(fileId);
  const pais = file.getParents();
  while (pais.hasNext()) {
    if (pais.next().getId() === folder.getId()) return file;
  }
  throw new Error('Foto não encontrada para este usuário');
}

/** Move para a lixeira do Drive (reversível) em vez de apagar de vez. */
function driveDeleteFile(payload) {
  arquivoDoUsuario(payload.fileId, payload.categoria, payload.userId).setTrashed(true);
  return null;
}

/** Devolve os bytes (base64) de uma foto já enviada - usado para cache local (ver seção 5 do
 * plano de migração: guardar só as últimas fotos vistas, nunca as ~3600 de uma vez). */
function driveDownloadFile(payload) {
  const file = arquivoDoUsuario(payload.fileId, payload.categoria, payload.userId);
  const blob = file.getBlob();
  return {
    name: file.getName(),
    mimeType: file.getMimeType(),
    base64Data: Utilities.base64Encode(blob.getBytes())
  };
}

// ---------- MANUTENÇÃO (executar manualmente pelo editor - não passa por doPost/api) ----------

/**
 * Corrige fotos pré-existentes (subidas antes do app existir, direto pelo Carlos) que não estão
 * compartilhadas como "Qualquer pessoa com o link" - o Carlos reportou 2026-09-02 que as fotos
 * de vinho não apareciam; `curl` confirmou que os links de foto do `wine` redirecionam pra login
 * do Google (302), enquanto os de `beer` respondem 200 direto - ou seja, não é bug de código
 * (driveImageUrl/Thumb funcionam iguais pros dois), é permissão de compartilhamento faltando no
 * arquivo do Drive em si. Fotos enviadas PELO app (`driveUploadFile`) já nascem com
 * `setSharing(ANYONE_WITH_LINK, VIEW)` - isto é só para o acervo antigo.
 *
 * De propósito NÃO exposta via `api()`/doPost: tornar um arquivo público a partir só de um
 * fileId vindo da rede (sem a checagem de pasta de `arquivoDoUsuario`) seria uma superfície de
 * ataque desnecessária no Web App publicado como "Qualquer pessoa". Rodar direto no editor
 * (selecionar a função no dropdown de cima e clicar em Executar), com os logs em Ver > Logs.
 * Idempotente: rodar de novo não mexe nos arquivos já corrigidos.
 */
var COLUNA_IMG_URL_POR_ABA = { beer: 'beer_img_url', wine: 'wine_img_url', dest: 'dest_img_url', drink: 'drink_img_url' };

/**
 * Roda `corrigirCompartilhamentoDeUmaAba` só nas abas que precisam - NÃO inclui `beer` por padrão. `beer` tem 3591 fotos; cada uma
 * exige uma chamada ao Drive só pra checar o compartilhamento (getSharingAccess), e já foi
 * confirmado por curl (2026-09-02) que as fotos de cerveja já respondem 200 direto (públicas) -
 * reprocessar todas de novo aqui só gastaria minutos à toa e, pior, o Apps Script mata a execução
 * depois de 6 minutos: como `beer` vinha primeiro na ordem antiga, a função MORRIA no meio dele e
 * nunca chegava a logar nada, nem a tentar `wine` (o problema real relatado pelo Carlos em
 * 2026-09-02) - parecia travada porque não tinha log nenhum pra mostrar. Se um dia precisar
 * reconferir `beer` mesmo assim, chame `corrigirCompartilhamentoDeUmaAba('beer')` direto.
 */
function corrigirCompartilhamentoDeFotosAntigas() {
  ['wine', 'dest', 'drink'].forEach(corrigirCompartilhamentoDeUmaAba);
}

/** Processa uma aba só - loga o progresso a cada 10 fotos (não só no final) pra dar pra
 *  acompanhar no Ver > Logs mesmo enquanto ainda está rodando. */
function corrigirCompartilhamentoDeUmaAba(aba) {
  var coluna = COLUNA_IMG_URL_POR_ABA[aba];
  if (!coluna) throw new Error('Aba sem coluna de imagem configurada: ' + aba);
  var linhas = lerTabela(aba);
  var corrigidas = 0, jaEstavamOk = 0, semFoto = 0, falharam = 0, processadas = 0;
  linhas.forEach(function (linha) {
    var raw = linha[coluna];
    var m = raw && /\/d\/([\w-]+)/.exec(String(raw));
    if (!m) { semFoto++; return; }
    var fileId = m[1];
    try {
      var file = DriveApp.getFileById(fileId);
      var acessoAtual = file.getSharingAccess();
      if (acessoAtual === DriveApp.Access.ANYONE_WITH_LINK || acessoAtual === DriveApp.Access.ANYONE) {
        jaEstavamOk++;
      } else {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        corrigidas++;
      }
    } catch (err) {
      falharam++;
      Logger.log(aba + ' id=' + linha.id + ' fileId=' + fileId + ': erro - ' + err);
    }
    processadas++;
    if (processadas % 10 === 0) Logger.log(aba + ': ' + processadas + '/' + linhas.length + ' processadas...');
  });
  Logger.log(aba + ': ' + corrigidas + ' corrigidas, ' + jaEstavamOk + ' já estavam ok, ' +
    semFoto + ' sem foto, ' + falharam + ' falharam');
}

// ---------- TESTE DE AUTORIZAÇÃO (executar no editor para conceder os escopos) ----------
function testeAutorizacao() {
  Logger.log('Planilha: ' + abrirPlanilha().getName());

  // Exercita ESCRITA de verdade em cada pasta configurada, não só leitura (ver aviso análogo no
  // README do TravelTrack: ler a pasta só prova o escopo de leitura; criar pasta/arquivo precisa
  // de escopo maior, e é isso que precisa estourar aqui se o escopo estiver errado - não só um
  // "Autorização OK!" que passa e o upload real quebra depois).
  Object.keys(DRIVE_ROOT_FOLDERS).forEach(function (categoria) {
    const id = DRIVE_ROOT_FOLDERS[categoria];
    if (!id) {
      Logger.log(categoria + ': pasta não configurada em Config.gs, pulando.');
      return;
    }
    const raiz = DriveApp.getFolderById(id);
    Logger.log(categoria + ': pasta "' + raiz.getName() + '"');
    const temp = raiz.createFolder('__teste_permissao__');
    temp.setTrashed(true);
    Logger.log(categoria + ': escrita OK (createFolder testado e desfeito)');
  });
  Logger.log('Autorização OK!');
}
