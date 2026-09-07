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

// Pools sem caracteres ambíguos (0/O, 1/l/I). Os símbolos são os "seguros" - nada que quebre em
// e-mail, terminal ou ao ser ditado em voz alta.
const POOL_MAIUSC = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const POOL_MINUSC = "abcdefghijkmnopqrstuvwxyz";
const POOL_DIGITO = "23456789";
const POOL_SIMBOLO = "!@#$%&*?+-";

function escolher(pool: string): string {
  return pool[crypto.randomInt(pool.length)];
}

/**
 * Senha provisória legível, mostrada uma única vez pro admin (criação ou reset) e nunca
 * reexibida. Garante a política mínima do produto (ver `senhaSchema.ts`): pelo menos 8
 * caracteres e ao menos um de cada classe - maiúscula, minúscula, número e símbolo. Sem isto uma
 * senha gerada podia sair sem símbolo nenhum e falhar a validação se o usuário tentasse
 * reaproveitá-la como senha definitiva.
 */
export function generateProvisionalPassword(length = 12): string {
  const n = Math.max(8, length);
  const todos = POOL_MAIUSC + POOL_MINUSC + POOL_DIGITO + POOL_SIMBOLO;
  const chars = [
    escolher(POOL_MAIUSC),
    escolher(POOL_MINUSC),
    escolher(POOL_DIGITO),
    escolher(POOL_SIMBOLO),
  ];
  while (chars.length < n) chars.push(escolher(todos));
  // Fisher-Yates com aleatoriedade criptográfica: sem isto as 4 garantidas ficariam sempre nas
  // 4 primeiras posições, um padrão previsível.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
