"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";

type CatalogoItem = {
  chave: string;
  item_id_representante: string;
  nome_produto: string;
  preco: number;
  membros: { itemId: string; titulo: string }[];
  custo: number | null;
};

type Acesso = "loading" | "liberado" | "negado";

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

function LinhaCusto({ item, onSalvo }: { item: CatalogoItem; onSalvo: (chave: string, custo: number) => void }) {
  const [valor, setValor] = useState(item.custo != null ? String(item.custo) : "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  async function salvar() {
    const num = Number(valor);
    if (!Number.isFinite(num) || num < 0) {
      setErro("Custo inválido.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const token = await getAccessToken();
    if (!token) {
      setErro("Sessão expirada.");
      setSalvando(false);
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/ulisses/custos", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ chave: item.chave, custo: num }),
    });
    const json = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) {
      setErro(json.error ?? "Erro ao salvar.");
      return;
    }
    setSalvo(true);
    onSalvo(item.chave, num);
    setTimeout(() => setSalvo(false), 2000);
  }

  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--foreground)]">{item.nome_produto}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Preço R$ {item.preco.toFixed(2)} · {item.membros.length} variação(ões)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">R$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            className="h-8 w-24 rounded-md border border-[var(--card-border)] bg-[var(--surface-subtle)] px-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
          />
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando || !valor.trim()}
            className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {salvando ? "Salvando…" : salvo ? "Salvo ✓" : "Salvar"}
          </button>
        </div>
      </div>
      {erro ? <p className={cn("mt-2 text-xs", DANGER_PREMIUM_TEXT_PRIMARY)}>{erro}</p> : null}
    </article>
  );
}

export default function UlissesCustosPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/ulisses/custos", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 403) {
      setAcesso("negado");
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErroCarregar(json.error ?? "Erro ao carregar catálogo.");
      setAcesso("liberado");
      return;
    }
    setCatalogo(json.catalogo ?? []);
    setAcesso("liberado");
  }, [router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function marcarSalvo(chave: string, custo: number) {
    setCatalogo((atual) => atual.map((c) => (c.chave === chave ? { ...c, custo } : c)));
  }

  const semCusto = catalogo.filter((c) => c.custo === null);
  const comCusto = catalogo.filter((c) => c.custo !== null);

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <Link href="/seller/gestores-ia-avulso/ulisses" className="text-xs font-medium text-[var(--muted)] hover:underline">
            ← Ulisses
          </Link>
          <div className="mt-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                Custos dos anúncios
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Digite o custo de cada produto (o que você paga pra ter ele, sem taxa/frete) — o Ulisses usa isso pra
              calcular a margem real de cada anúncio.
            </p>
          </div>
        </header>

        {acesso === "loading" ? (
          <section className="space-y-3">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </section>
        ) : acesso === "negado" ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
            Não foi possível validar seu acesso.
          </div>
        ) : erroCarregar ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
            {erroCarregar}
          </div>
        ) : catalogo.length === 0 ? (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center shadow-sm">
            <p className="text-sm text-[var(--muted)]">Nenhum anúncio ativo encontrado na sua conta do Mercado Livre.</p>
          </section>
        ) : (
          <div className="space-y-5">
            {semCusto.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Sem custo cadastrado ({semCusto.length})
                </p>
                <div className="space-y-2.5">
                  {semCusto.map((item) => (
                    <LinhaCusto key={item.chave} item={item} onSalvo={marcarSalvo} />
                  ))}
                </div>
              </div>
            ) : null}
            {comCusto.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Já cadastrados ({comCusto.length})
                </p>
                <div className="space-y-2.5">
                  {comCusto.map((item) => (
                    <LinhaCusto key={item.chave} item={item} onSalvo={marcarSalvo} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
