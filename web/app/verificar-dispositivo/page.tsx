"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  DropcoreAuthShell,
  authAlertErrorClass,
  authAlertSuccessClass,
  authInputClass,
  authLabelClass,
  authMutedLinkClass,
  authPrimaryButtonClass,
} from "@/components/DropcoreAuthShell";

async function authHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export default function VerificarDispositivoPage() {
  return (
    <Suspense fallback={null}>
      <VerificarDispositivoInner />
    </Suspense>
  );
}

function VerificarDispositivoInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [reenviado, setReenviado] = useState(false);
  const solicitado = useRef(false);

  async function solicitarCodigo() {
    setErro(null);
    const headers = await authHeader();
    if (!headers) {
      router.replace("/login");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/solicitar-codigo-dispositivo", { method: "POST", headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data?.error ?? "Não foi possível enviar o código.");
      }
    } catch {
      setErro("Não foi possível enviar o código. Verifique sua conexão.");
    } finally {
      setEnviando(false);
    }
  }

  useEffect(() => {
    if (solicitado.current) return;
    solicitado.current = true;
    solicitarCodigo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!/^\d{6}$/.test(codigo.trim())) {
      setErro("Digite os 6 dígitos do código.");
      return;
    }
    const headers = await authHeader();
    if (!headers) {
      router.replace("/login");
      return;
    }
    setConfirmando(true);
    try {
      const res = await fetch("/api/auth/confirmar-dispositivo", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ code: codigo.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data?.error ?? "Código incorreto.");
        return;
      }
      // Navegação forçada (não router.replace): o cookie de dispositivo acabou de ser
      // setado pela resposta acima, e uma transição client-side do Next pode reaproveitar
      // cache de rota anterior (sem o cookie novo) — só uma requisição de verdade garante
      // que o middleware releia o cookie e libere a rota de primeira.
      const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/";
      window.location.assign(destino);
      return;
    } catch {
      setErro("Não foi possível confirmar. Verifique sua conexão.");
    } finally {
      setConfirmando(false);
    }
  }

  async function reenviar() {
    setReenviado(false);
    await solicitarCodigo();
    setReenviado(true);
  }

  return (
    <DropcoreAuthShell
      eyebrow="Segurança"
      heading="Confirme este dispositivo"
      description="Enviamos um código de 6 dígitos pro seu e-mail — ele confirma que é você entrando de um computador novo."
    >
      <form onSubmit={confirmar} className="space-y-4">
        <div>
          <label htmlFor="dc-codigo" className={authLabelClass}>
            Código de verificação
          </label>
          <input
            id="dc-codigo"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className={`${authInputClass} text-center text-[20px] tracking-[0.5em]`}
          />
        </div>

        {erro ? <div className={authAlertErrorClass}>{erro}</div> : null}
        {reenviado && !erro ? <div className={authAlertSuccessClass}>Código reenviado — confira seu e-mail.</div> : null}

        <button type="submit" disabled={confirmando} className={authPrimaryButtonClass}>
          {confirmando ? "Confirmando..." : "Confirmar"}
        </button>

        <button
          type="button"
          onClick={reenviar}
          disabled={enviando}
          className={`${authMutedLinkClass} w-full`}
        >
          {enviando ? "Enviando..." : "Reenviar código"}
        </button>
      </form>
    </DropcoreAuthShell>
  );
}
