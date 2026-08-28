/** Perfil secundário (dono de itens compartilhados) — visível no switcher de listagem. */
export type SecondaryProfile = {
  id: string;
  name: string;
  img: string | null;
};

/**
 * Não existe mais "seguir um perfil inteiro" (a aba `relac` foi abandonada — ver
 * MIGRACAO_SHEETS.md seção 3). Permissão agora é por item (`user_access`/`user_edit`), então não
 * há uma lista fixa de "perfis seguidos" pra oferecer aqui — o switcher de ListScreen simplesmente
 * não aparece (a UI já trata lista vazia como "sem perfil secundário").
 */
export async function fetchFollowedProfiles(): Promise<SecondaryProfile[]> {
  return [];
}
