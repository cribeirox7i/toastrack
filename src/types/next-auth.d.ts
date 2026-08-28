import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "user";
      /** Espelha user.deve_trocar_senha da aba `user` no momento do login — ver TODO em
       *  src/auth.ts sobre atualizar isso no meio da sessão. */
      deveTrocarSenha: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: "admin" | "user";
    deveTrocarSenha: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "admin" | "user";
    deveTrocarSenha: boolean;
  }
}
