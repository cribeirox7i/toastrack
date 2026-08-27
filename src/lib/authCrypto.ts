import crypto from "node:crypto";

/**
 * Hash de senha por scrypt nativo do Node — sem dependência externa (evita módulo nativo
 * que precisa compilar, mesmo padrão do WebCRM: ver `C:\Claude\WebCRM\backend\src\authCrypto.ts`).
 * Roda em rota de API do Next.js (servidor), nunca no navegador.
 */

const SCRYPT_KEYLEN = 64;

/** "salt:hash" em hex — nunca texto puro. */
export function hashPassword(senha: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(senha, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(senha: string, armazenado: string | null | undefined): boolean {
  if (!armazenado) return false;
  const [salt, hash] = armazenado.split(":");
  if (!salt || !hash) return false;
  const hashTentativa = crypto.scryptSync(senha, salt, SCRYPT_KEYLEN);
  const hashArmazenado = Buffer.from(hash, "hex");
  if (hashTentativa.length !== hashArmazenado.length) return false;
  return crypto.timingSafeEqual(hashTentativa, hashArmazenado);
}

const SENHA_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Senha provisória legível (sem caracteres ambíguos tipo 0/O, 1/l/I) — mostrada uma única vez
 *  pro admin que criou o usuário, nunca reexibida depois de gerada. */
export function generateProvisionalPassword(length = 12): string {
  return Array.from(crypto.randomFillSync(new Uint8Array(length)))
    .map((b) => SENHA_CHARSET[b % SENHA_CHARSET.length])
    .join("");
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
