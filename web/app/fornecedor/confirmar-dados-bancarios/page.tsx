"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  DropcoreAuthShell,
  authAlertErrorClass,
  authAlertSuccessClass,
  authMutedLinkClass,
} from "@/components/DropcoreAuthShell";

export default function ConfirmarDadosBancariosPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmarDadosBancariosInner />
    </Suspense>
  );
}

function ConfirmarDadosBancariosInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"carregando" | "ok" | "erro">("carregando");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const chamado = useRef(false);

  useEffect(() => {
    if (chamado.current) return;
    chamado.current = true;

    if (!token) {
      setStatus("erro");
      setMensagem("Link inválido — faltou o token de confirmação.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/fornecedor/dados-bancarios/confirmar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus("erro");
          setMensagem(data?.error ?? "Não foi possível confirmar.");
          return;
        }
        setStatus("ok");
      } catch {
        setStatus("erro");
        setMensagem("Não foi possível confirmar. Verifique sua conexão e tente de novo.");
      }
    })();
  }, [token]);

  return (
    <DropcoreAuthShell eyebrow="Fornecedor" heading="Confirmação de dados bancários">
      {status === "carregando" && (
        <p className="text-center text-[14px] text-[var(--muted)]">Confirmando...</p>
      )}
      {status === "ok" && (
        <div className={authAlertSuccessClass}>
          Seus dados bancários foram atualizados com sucesso.
        </div>
      )}
      {status === "erro" && <div className={authAlertErrorClass}>{mensagem}</div>}

      <p className="mt-5 text-center">
        <Link href="/fornecedor/login" className={authMutedLinkClass}>
          Ir para o login do fornecedor
        </Link>
      </p>
    </DropcoreAuthShell>
  );
}
