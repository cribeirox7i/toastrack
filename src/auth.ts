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
  session: { strategy: "jwt" },
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
        };
      },
    }),
  ],
  callbacks: {
    // TODO(etapa 4): quando a rota de troca de senha existir, ela precisa chamar
    // `update()` do lado do cliente (useSession) pra este callback rodar de novo com
    // `trigger === "update"` e zerar `deveTrocarSenha` no token — sessão JWT não
    // reflete sozinha uma mudança feita no Sheets no meio da sessão; sem isso a tela
    // de "troca obrigatória" continuaria bloqueando até a pessoa deslogar e logar de novo.
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: "admin" | "user" }).role;
        token.deveTrocarSenha = (user as { deveTrocarSenha: boolean }).deveTrocarSenha;
      }
      if (trigger === "update" && session?.deveTrocarSenha === false) {
        token.deveTrocarSenha = false;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "user";
        session.user.deveTrocarSenha = token.deveTrocarSenha as boolean;
      }
      return session;
    },
  },
});
