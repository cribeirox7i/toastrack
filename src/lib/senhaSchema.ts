import { z } from "zod";

/** Mesma política que a tela de auth já anunciava (mín. 8, maiúscula, minúscula, número,
 *  símbolo) — validada aqui no servidor pra troca de senha, já que não há mais tela de cadastro
 *  público fazendo essa checagem no cliente. */
export const senhaSchema = z
  .string()
  .min(8, "mínimo de 8 caracteres")
  .regex(/[a-z]/, "precisa de letra minúscula")
  .regex(/[A-Z]/, "precisa de letra maiúscula")
  .regex(/[0-9]/, "precisa de número")
  .regex(/[^A-Za-z0-9]/, "precisa de símbolo");
