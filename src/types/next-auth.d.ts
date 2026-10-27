import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "user";
      deveTrocarSenha: boolean;
      /** Prefixo do senha_hash atual — atualizado via update() após troca de senha.
       *  Permite detectar, no futuro, tokens de sessões que não refletem a troca. */
      senhaVersao: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: "admin" | "user";
    deveTrocarSenha: boolean;
    senhaVersao: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "admin" | "user";
    deveTrocarSenha: boolean;
    senhaVersao: string;
  }
}
