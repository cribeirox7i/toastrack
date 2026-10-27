import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { excedeuLimite, limparLimite } from "@/lib/rateLimit";
import { verifyCredentials } from "@/lib/sheets/users";
import { logAccess } from "@/lib/sheets/log";

/** 10 tentativas por e-mail+IP a cada 10 minutos — folgado pra quem erra a senha, apertado pra
 *  quem varre uma lista de senhas. Estourar devolve a mesma falha genérica de senha errada, pra
 *  não revelar nem que o bloqueio existe nem se o e-mail existe (mesmo padrão do TravelTrack). */
const LOGIN_LIMITE = 10;
const LOGIN_JANELA_MS = 10 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // maxAge de 7 dias (em vez dos 30 do padrão) reduz a janela de exposição de tokens furtados.
  // JWT sem estado: sem Redis/DB rápido, invalidação real cross-device não é viável nesta stack —
  // a mitigação é maxAge curto + senhaVersao no token (atualizado via update() após troca de
  // senha; validação futura pode comparar com o valor no Sheets em rotas sensíveis).
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const senha = credentials?.senha as string | undefined;
        if (!email || !senha) return null;

        const ip = request.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sem-ip";
        const chave = `login:${email.toLowerCase()}:${ip}`;
        if (excedeuLimite(chave, { limite: LOGIN_LIMITE, janelaMs: LOGIN_JANELA_MS })) {
          return null;
        }

        // verifyCredentials já confere status ativo e senha — null cobre e-mail inexistente,
        // conta inativa e senha errada, de propósito sem diferenciar pro chamador.
        const user = await verifyCredentials(email, senha);
        if (!user) return null;

        limparLimite(chave);
        void logAccess({ userId: user.user_id, userMail: user.user_mail, acao: "login" });
        return {
          id: user.user_id,
          name: user.user_nome,
          email: user.user_mail,
          role: (user.user_role || "user") as "admin" | "user",
          deveTrocarSenha: user.deve_trocar_senha === "true",
          senhaVersao: (user.senha_hash ?? "").slice(0, 8),
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: "admin" | "user" }).role;
        token.deveTrocarSenha = (user as { deveTrocarSenha: boolean }).deveTrocarSenha;
        token.senhaVersao = (user as { senhaVersao: string }).senhaVersao;
      }
      if (trigger === "update") {
        if (session?.deveTrocarSenha === false) token.deveTrocarSenha = false;
        if (session?.senhaVersao) token.senhaVersao = session.senhaVersao as string;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "user";
        session.user.deveTrocarSenha = token.deveTrocarSenha as boolean;
        session.user.senhaVersao = token.senhaVersao as string;
      }
      return session;
    },
  },
});
