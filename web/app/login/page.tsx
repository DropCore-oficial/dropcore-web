"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  AuthEmailInput,
  AuthPasswordInput,
  DropcoreAuthShell,
  authAlertErrorClass,
  authPrimaryButtonClass,
} from "@/components/DropcoreAuthShell";
import { Button } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);

    try {
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (error) throw error;
      if (!data.session) throw new Error("Sessão não veio do Supabase.");

      const { data: s } = await supabaseBrowser.auth.getSession();
      if (!s.session) throw new Error("Sessão não ficou ativa. Tente recarregar.");

      router.replace("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro ao logar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropcoreAuthShell
      eyebrow="Acesso"
      heading="DropCore"
      headingClassName="text-[1.45rem] sm:text-[1.6rem]"
    >
      <form onSubmit={entrar} className="space-y-3.5">
        <AuthEmailInput value={email} onChange={setEmail} id="org-login-email" />
        <AuthPasswordInput value={senha} onChange={setSenha} id="org-login-senha" />

        {erro ? <div className={authAlertErrorClass}>{erro}</div> : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={loading}
          className={authPrimaryButtonClass}
        >
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </DropcoreAuthShell>
  );
}
