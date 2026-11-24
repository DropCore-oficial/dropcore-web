"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const POLL_MS = 60_000;

/** Banner insistente, sem botão de fechar — aparece quando a conexão do seller com o
 * Mercado Livre está com falha recorrente (≥5 falhas pendentes/esgotadas nas últimas 48h).
 * Não bloqueia o resto do painel (decisão 2026-11-24, Sr Stark: extremo mas não trava tudo),
 * só insiste até reconectar. `sticky` (não `fixed`) de propósito — achado real 2026-11-24:
 * `fixed` tirava o banner do fluxo normal e ele cobria o menu/header em cima, mobile e
 * desktop. `sticky` ocupa espaço de verdade (empurra tudo pra baixo) e ainda gruda no topo
 * ao rolar a página. */
export function MlSyncFalhaBanner() {
  const [falhaAtiva, setFalhaAtiva] = useState(false);
  const [ultimoErro, setUltimoErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checar() {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch("/api/seller/ml-sync-status", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setFalhaAtiva(Boolean(json.falha_ativa));
        setUltimoErro(typeof json.ultimo_erro === "string" ? json.ultimo_erro : null);
      } catch {
        // mantém último estado conhecido em falha de rede
      }
    }

    void checar();
    const id = setInterval(() => void checar(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!falhaAtiva) return null;

  return (
    <div
      className="sticky top-0 z-[200] border-b border-red-900 bg-[var(--danger)] px-3 py-2.5 text-center text-sm text-white shadow-sm sm:px-4 dark:bg-red-600"
      role="alert"
      aria-live="assertive"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
        <p className="leading-snug">
          <strong>Sua conexão com o Mercado Livre está com problema</strong> — o estoque dos seus anúncios pode não
          estar sendo atualizado{ultimoErro ? ` (${ultimoErro})` : ""}. Isso pode fazer você vender produto sem
          estoque.
        </p>
        <a
          href="/seller/integracoes-marketplace"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white px-3.5 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-50 sm:text-sm"
        >
          Reconectar agora →
        </a>
      </div>
    </div>
  );
}
