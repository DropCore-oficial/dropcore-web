"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { normalizarFornecedoresSellerApi, type FornecedorSellerListaRow } from "@/lib/mapFornecedorSellerPublico";

export default function SellerCatalogoHubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lista, setLista] = useState<FornecedorSellerListaRow[]>([]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/seller/login");
          return;
        }
        const res = await fetch("/api/seller/fornecedores", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (c) return;
        if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao carregar armazéns");
        setLista(normalizarFornecedoresSellerApi(json.fornecedores));
      } catch (e: unknown) {
        if (!c) setErr(e instanceof Error ? e.message : "Erro");
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="w-full max-w-3xl mx-auto dropcore-px-wide py-6 lg:py-10 space-y-6">
        <SellerPageHeader
          title="Catálogos"
          subtitle="Explore as vitrines dos armazéns da sua organização (fotos e preços). Quando quiser vender pela API, vincule o armazém e escolha os SKUs em Produtos."
        />

        <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/25 px-4 py-3.5 text-sm text-emerald-950 dark:text-emerald-100">
          <strong className="font-semibold">Próximo passo:</strong>{" "}
          <Link href="/seller/produtos" className="font-semibold underline-offset-2 hover:underline">
            Abrir Produtos
          </Link>{" "}
          para ligar o seu seller a um armazém e habilitar até 15 SKUs no plano Starter.
        </div>

        {loading && <p className="text-sm text-neutral-500">A carregar armazéns...</p>}
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
        {!loading && !err && lista.length === 0 && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Ainda não há fornecedores na organização.</p>
        )}

        <ul className="space-y-3">
          {!loading &&
            lista.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/seller/catalogo/fornecedor/${encodeURIComponent(f.id)}?n=${encodeURIComponent(f.nome_publico)}`}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-neutral-200/90 dark:border-neutral-700/60 bg-white dark:bg-neutral-900/80 px-4 py-4 shadow-sm hover:border-emerald-300/80 dark:hover:border-emerald-700/50 hover:shadow-md transition"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">{f.nome_publico}</p>
                    {f.local_resumido && <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{f.local_resumido}</p>}
                  </div>
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">Ver vitrine →</span>
                </Link>
              </li>
            ))}
        </ul>
      </div>
      <SellerNav active="catalogo" />
    </div>
  );
}
