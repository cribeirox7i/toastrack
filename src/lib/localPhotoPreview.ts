import { syncEvents, type RemapDetail } from "@/lib/offline/sync";

/**
 * Preview local da foto de um item que ainda não terminou de subir - o que a LISTA mostra
 * enquanto o upload está no outbox, em vez de nada.
 *
 * Pedido do Carlos (2026-09-04): "salvo, ele volta pra tela de listagem já mostrando o item na
 * lista, e o upload está no outbox. Correto! Só que o campo de imagem da lista não traz a
 * imagem." O item aparece na hora (é local-primeiro, ver `saveItem`); a foto que foi anexada
 * também já existe como Blob local (`preparePhoto` roda na escolha, não no envio) - só nunca
 * tinha sido oferecida pra lista, que só olha a coluna `*_img_url` da linha (vazia até o Apps
 * Script responder).
 *
 * Fica de fora de tudo que já funciona: não muda `mapRow` além de um fallback, não muda o upload,
 * não muda o cache. É só um Map módulo com o object URL que o `DetailScreen` já tinha criado pro
 * preview de edição, reaproveitado como estado de exibição da lista até a foto real chegar.
 */

type Chave = string; // `${tab}:${id}`

const previews = new Map<Chave, string>();

function chave(tab: string, id: string): Chave {
  return `${tab}:${id}`;
}

function avisarMudanca() {
  // Reaproveita o canal que `useOfflineItems` já escuta (toda escrita otimista dispara isto) -
  // a lista recalcula os Items e pega o preview novo sem precisar de nenhuma assinatura própria.
  syncEvents.dispatchEvent(new Event("change"));
}

/** Registra o preview local de `id` (pode ser o id temporário de um item recém-criado - ver
 *  `waitForRealId`). Chamado uma vez, no Salvar, com o mesmo object URL que a tela de edição já
 *  criou pro preview - a posse dele passa pra cá; quem chamar não deve mais revogá-lo. */
export function setLocalPreview(tab: string, id: string, url: string): void {
  previews.set(chave(tab, id), url);
  avisarMudanca();
}

/** O que a lista usa: preview local se houver, senão `undefined` (cai pro `imgUrl` da planilha). */
export function getLocalPreview(tab: string, id: string): string | undefined {
  return previews.get(chave(tab, id));
}

/** Revoga e remove - chamado quando o upload de verdade termina (sucesso ou falha): dando certo, a
 *  coluna `*_img_url` real já está no cache e a lista pode usar ela; falhando, não faz sentido
 *  segurar um preview de uma foto que não subiu. */
export function clearLocalPreview(tab: string, id: string): void {
  const k = chave(tab, id);
  const url = previews.get(k);
  if (!url) return;
  URL.revokeObjectURL(url);
  previews.delete(k);
  avisarMudanca();
}

// Segue o remap sozinho: um preview registrado no id temporário passa a responder pelo id real
// assim que a criação sincroniza, sem quem chamou `setLocalPreview` precisar saber que isso
// aconteceu (o mesmo evento que `DetailScreen`/`waitForRealId` já escutam, ver offline/sync.ts).
syncEvents.addEventListener("remap", (e) => {
  const { tab, oldId, newId } = (e as CustomEvent<RemapDetail>).detail;
  const oldKey = chave(tab, oldId);
  const url = previews.get(oldKey);
  if (!url) return;
  previews.delete(oldKey);
  previews.set(chave(tab, newId), url);
  avisarMudanca();
});
