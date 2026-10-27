"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { GestorAvulsoConectarMlEmptyState } from "@/components/seller/GestorAvulsoConectarMlEmptyState";
import { IconLaura } from "@/components/seller/GestorAvulsoIcons";
import { mlItemPermalink } from "@/lib/mercadoLivreApiClient";

type Acesso = "loading" | "liberado" | "negado";

type AnuncioComFoto = {
  chave: string;
  item_id_representante: string;
  familia_nome: string | null;
  foto_diagnostico: { veredito: "boa" | "ruim"; motivo: string; picture_ids: string[] } | null;
};

type GeracaoEstado = { status: "gerando" } | { status: "pronto"; url: string } | { status: "erro"; mensagem: string };

const VEREDITO_BADGE: Record<"boa" | "ruim", string> = {
  boa: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  ruim: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};

const VEREDITO_LABEL: Record<"boa" | "ruim", string> = { boa: "Foto adequada", ruim: "Foto com problema" };

function VeredictoBadge({ veredito }: { veredito: "boa" | "ruim" }) {
  return (
    <span
      className={cn(
        "inline-flex w-36 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        VEREDITO_BADGE[veredito]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {VEREDITO_LABEL[veredito]}
    </span>
  );
}

export default function LauraAvulsoPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [anuncios, setAnuncios] = useState<AnuncioComFoto[]>([]);
  const [geminiConfigurado, setGeminiConfigurado] = useState(false);
  const [geracoes, setGeracoes] = useState<Record<string, GeracaoEstado>>({});

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const [res, resGemini] = await Promise.all([
      fetch("/api/gestores-ia-avulso/design", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      fetch("/api/gestores-ia-avulso/byok-gemini", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
    ]);
    if (res.status === 403) {
      setAcesso("negado");
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAcesso("negado");
      return;
    }
    const jsonGemini = await resGemini.json().catch(() => ({}));
    setGeminiConfigurado(Boolean(jsonGemini.configurado));
    setMlConectado(Boolean(json.ml_conectado));
    setAnuncios(json.anuncios ?? []);
    setAcesso("liberado");
  }, [router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function gerarFoto(chave: string) {
    setGeracoes((prev) => ({ ...prev, [chave]: { status: "gerando" } }));
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/gestores-ia-avulso/design/gerar-foto", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ chave }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.url) {
      setGeracoes((prev) => ({
        ...prev,
        [chave]: { status: "erro", mensagem: json.error ?? "Erro ao gerar a foto." },
      }));
      return;
    }
    setGeracoes((prev) => ({ ...prev, [chave]: { status: "pronto", url: json.url } }));
  }

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <Link href="/seller/gestores-ia-avulso" className="text-xs font-medium text-[var(--muted)] hover:underline">
            ← Gestor de IA
          </Link>
          <div className="mt-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                Design
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Analisa a foto dos anúncios que o Anúncio não conseguiu explicar por nenhuma outra causa (reclamação,
              reputação, promoção, preço, variação, texto) — roda sozinha, você não precisa clicar em nada aqui.
            </p>
          </div>
        </header>

        {acesso === "loading" ? (
          <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-24 w-full" />
          </section>
        ) : acesso === "negado" ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
            Não foi possível validar seu acesso.
          </div>
        ) : !mlConectado ? (
          <GestorAvulsoConectarMlEmptyState
            icon={<IconLaura className="h-6 w-6 shrink-0" />}
            titulo="Conecte sua conta do Mercado Livre primeiro"
            descricao="O Design analisa a foto dos seus anúncios a partir do que o Anúncio encontra — conecte sua conta pra liberar essa rodada."
          />
        ) : anuncios.length === 0 ? (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-4 py-6 text-center text-sm text-[var(--muted)]">
            Nenhuma foto analisada ainda — isso só acontece quando o Anúncio encontra um item com visita e zero venda
            e nenhuma outra causa explica (reclamação, reputação, promoção, preço, variação, texto).
          </div>
        ) : (
          <div className="space-y-2.5">
            {anuncios.map((a) => (
              <article key={a.chave} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium text-[var(--foreground)]">
                    {a.familia_nome ?? a.chave}
                  </p>
                  {a.foto_diagnostico ? <VeredictoBadge veredito={a.foto_diagnostico.veredito} /> : null}
                </div>
                {a.foto_diagnostico ? (
                  <p className="mt-1.5 text-sm text-[var(--foreground)]">{a.foto_diagnostico.motivo}</p>
                ) : null}
                <a
                  href={mlItemPermalink(a.item_id_representante)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Ver anúncio ↗
                </a>

                {a.foto_diagnostico?.veredito === "ruim" ? (
                  <div className="mt-3 border-t border-[var(--card-border)] pt-3">
                    {!geminiConfigurado ? (
                      <p className="text-xs text-[var(--muted)]">
                        Pra gerar uma foto nova, conecte sua chave do Gemini em{" "}
                        <Link href="/seller/gestores-ia-avulso/integracoes" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
                          Integrações
                        </Link>
                        .
                      </p>
                    ) : geracoes[a.chave]?.status === "pronto" ? (
                      <div className="space-y-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={(geracoes[a.chave] as { status: "pronto"; url: string }).url}
                          alt="Foto gerada"
                          className="h-40 w-40 rounded-lg border border-[var(--card-border)] object-cover"
                        />
                        <a
                          href={(geracoes[a.chave] as { status: "pronto"; url: string }).url}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                        >
                          Baixar foto
                        </a>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void gerarFoto(a.chave)}
                          disabled={geracoes[a.chave]?.status === "gerando"}
                          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {geracoes[a.chave]?.status === "gerando" ? "Gerando…" : "Gerar foto nova"}
                        </button>
                        {geracoes[a.chave]?.status === "erro" ? (
                          <p className={cn(DANGER_PREMIUM_TEXT_BODY, "mt-1.5 text-xs")}>
                            {(geracoes[a.chave] as { status: "erro"; mensagem: string }).mensagem}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>

      <SellerNav active="gestores_ia" calcOnly produto="gestores_ia_avulso" />
    </div>
  );
}
