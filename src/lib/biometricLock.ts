/**
 * Bloqueio de tela por biometria (Face ID / Touch ID / digital) via WebAuthn — puramente local,
 * por aparelho. Não é login: a sessão (NextAuth/JWT) continua sendo a fonte de verdade de "quem
 * é" o usuário; isto só tranca a TELA enquanto ela já está autenticada, pra alguém que pegar o
 * celular destravado não ver o catálogo sem confirmar a digital/rosto de novo. Por isso não tem
 * round-trip de servidor: registra uma credencial de plataforma no aparelho (`create`) e depois só
 * confere que uma nova assinatura (`get`) sai com sucesso - o desafio é descartável, gerado na
 * hora, nunca verificado em lugar nenhum (não estamos protegendo um recurso do servidor, só
 * decidindo se mostra a tela).
 *
 * Guardado em localStorage (por aparelho, como tema/paleta - ver theme.ts):
 * - `tt.bioLock`: "1" quando ativado.
 * - `tt.bioCredId`: id da credencial (base64url), pra pedir a MESMA na hora de desbloquear.
 */

const ENABLED_KEY = "tt.bioLock";
const CRED_ID_KEY = "tt.bioCredId";
const RP_NAME = "Toastrack";

function rpId(): string {
  return window.location.hostname;
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function randomBytes(n: number): BufferSource {
  const arr = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(arr);
  return arr;
}

/** false em SSR/build (sem `window`) e em navegador sem WebAuthn - a tela de Perfil esconde o
 *  toggle nesse caso, em vez de oferecer algo que vai falhar. */
export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isBiometricLockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === "1" && !!localStorage.getItem(CRED_ID_KEY);
  } catch {
    return false;
  }
}

/** Dispara o prompt biométrico do sistema pra registrar a credencial de plataforma. `label`
 *  (nome/e-mail) é só cosmético - aparece no seletor do sistema em aparelhos com mais de uma
 *  passkey, não é validado em lugar nenhum. */
export async function enableBiometricLock(label: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: RP_NAME, id: rpId() },
        user: { id: randomBytes(16), name: label || "Toastrack", displayName: label || "Toastrack" },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, error: "Cancelado." };

    localStorage.setItem(CRED_ID_KEY, toBase64Url(cred.rawId));
    localStorage.setItem(ENABLED_KEY, "1");
    return { ok: true };
  } catch (e) {
    // NotAllowedError = usuário cancelou o prompt do sistema; o resto é aparelho sem sensor
    // configurado ou navegador sem suporte - mesma mensagem genérica pro usuário nos dois casos.
    return { ok: false, error: e instanceof Error && e.name === "NotAllowedError" ? "Cancelado." : "Não foi possível ativar." };
  }
}

export function disableBiometricLock(): void {
  try {
    localStorage.removeItem(ENABLED_KEY);
    localStorage.removeItem(CRED_ID_KEY);
  } catch {}
}

/** Pede a confirmação biométrica pra credencial já registrada. `true` só quando o sensor confirma
 *  com sucesso - qualquer cancelamento/erro/timeout devolve `false` e a tela continua trancada. */
export async function verifyBiometric(): Promise<boolean> {
  try {
    const credIdRaw = localStorage.getItem(CRED_ID_KEY);
    if (!credIdRaw) return false;
    const assertion = await navigator.credentials.get({
      publicKey: {
        rpId: rpId(),
        challenge: randomBytes(32),
        allowCredentials: [{ id: fromBase64Url(credIdRaw), type: "public-key", transports: ["internal"] }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
