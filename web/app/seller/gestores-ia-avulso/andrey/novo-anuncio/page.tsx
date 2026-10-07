"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../../SellerNav";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_BODY, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { CopiarSugestaoBotao } from "@/components/seller/SellerGestorCopiarBotao";

type Etapa = "nome" | "categoria" | "descricao" | "ideias";

type CategoriaSugerida = { categoryId: string; categoryName: string };

type AnuncioSugerido = {
  titulo_sugerido: string;
  modelo_sugerido: string;
  ocasioes_sugeridas: string;
  estilos_sugeridos: string;
};

type FaqItem = { pergunta: string; resposta: string };

type ResultadoIdeias = {
  anuncios_sugeridos: AnuncioSugerido[];
  descricao_corpo: string;
  faq: FaqItem[];
  observacao: string;
  categoria_sem_atributo: { modelo: boolean; ocasioes: boolean; estilos: boolean };
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

const inputClass =
  "w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]";
const labelClass = "text-xs font-semibold text-[var(--muted)]";

const CHECKLIST_GERAL = [
  "Pelo menos 3 fotos boas, com a foto de capa em fundo neutro e resolução alta.",
  "Preço competitivo — compare com anúncios parecidos antes de publicar.",
  "Configure o frete (Mercado Envios) direto no app do Mercado Livre.",
  "Depois de publicar, volte aqui em 30+ dias — o Andrey passa a monitorar esse anúncio automaticamente.",
];

export default function NovoAnuncioAvulsoPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<"loading" | "liberado" | "negado">("loading");
  const [etapa, setEtapa] = useState<Etapa>("nome");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const [nomeProduto, setNomeProduto] = useState("");
  const [categorias, setCategorias] = useState<CategoriaSugerida[]>([]);
  const [categoriaEscolhida, setCategoriaEscolhida] = useState<CategoriaSugerida | null>(null);
  const [descricaoLivre, setDescricaoLivre] = useState("");
  const [resultado, setResultado] = useState<ResultadoIdeias | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        router.replace("/gestores-ia/login");
        return;
      }
      const res = await fetch(`/api/calculadora/me?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.access === "calc_only" && j.inclui_gestores_ia === true) {
        setAcesso("liberado");
      } else {
        setAcesso("negado");
      }
    })();
  }, [router]);

  async function avancarParaCategoria() {
    setErro(null);
    if (!nomeProduto.trim()) {
      setErro("Digite um nome/ideia de título pro produto.");
      return;
    }
    setCarregando(true);
    const token = await getAccessToken();
    if (!token) {
      setErro("Sessão expirada, faça login de novo.");
      setCarregando(false);
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/andrey/sugerir-categoria", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: nomeProduto }),
    });
    const json = await res.json().catch(() => ({}));
    setCarregando(false);
    if (!res.ok) {
      setErro(json.error ?? "Erro ao sugerir categoria.");
      return;
    }
    setCategorias(json.categorias ?? []);
    setEtapa("categoria");
  }

  const escolherCategoria = useCallback((cat: CategoriaSugerida) => {
    setErro(null);
    setCategoriaEscolhida(cat);
    setEtapa("descricao");
  }, []);

  async function gerarIdeias() {
    setErro(null);
    if (!descricaoLivre.trim()) {
      setErro("Conte um pouco sobre o produto (material, pra quem é, diferenciais).");
      return;
    }
    setCarregando(true);
    const token = await getAccessToken();
    if (!token) {
      setErro("Sessão expirada, faça login de novo.");
      setCarregando(false);
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/andrey/ideias-produto-novo", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoriaEscolhida?.categoryId, descricao: descricaoLivre }),
    });
    const json = await res.json().catch(() => ({}));
    setCarregando(false);
    if (!res.ok) {
      setErro(json.error ?? "Erro ao gerar ideias.");
      return;
    }
    setResultado(json);
    setEtapa("ideias");
  }

  if (acesso === "loading") {
    return (
      <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
        <div className="dropcore-shell-6xl py-10 text-center text-sm text-[var(--muted)]">Carregando…</div>
      </div>
    );
  }
  if (acesso === "negado") {
    return (
      <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
        <div className="dropcore-shell-6xl py-10 text-center text-sm text-[var(--muted)]">
          Não foi possível validar seu acesso.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <Link href="/seller/gestores-ia-avulso/andrey" className="text-xs font-medium text-[var(--muted)] hover:underline">
            ← Andrey
          </Link>
          <div className="mt-1 flex items-center gap-2 sm:gap-3">
            <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
              Ideias pra anúncio novo
            </h1>
            <span
              className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
              aria-hidden
            />
          </div>
          <p className="mt-1 text-sm leading-snug text-[var(--muted)]">
            Conte sobre um produto que você ainda não anunciou — o Andrey sugere título, descrição e ficha técnica
            pra você usar ao publicar pelo app do Mercado Livre. Não publica nada por você.
          </p>
        </header>

        {erro ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
            {erro}
          </div>
        ) : null}

        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
          {etapa === "nome" ? (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nome ou ideia de título do produto</label>
                <input
                  className={cn(inputClass, "mt-1")}
                  value={nomeProduto}
                  onChange={(e) => setNomeProduto(e.target.value)}
                  placeholder="Ex.: Camisa social masculina manga longa"
                />
              </div>
              <button
                type="button"
                onClick={() => void avancarParaCategoria()}
                disabled={carregando}
                className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {carregando ? "Sugerindo categoria…" : "Continuar"}
              </button>
            </div>
          ) : null}

          {etapa === "categoria" ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--foreground)]">Qual categoria representa melhor esse produto?</p>
              {categorias.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  Não achamos sugestão automática — tente um nome mais descritivo e volte.
                </p>
              ) : (
                <div className="space-y-2">
                  {categorias.map((c) => (
                    <button
                      key={c.categoryId}
                      type="button"
                      onClick={() => escolherCategoria(c)}
                      className="block w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-left text-sm text-[var(--foreground)] hover:border-emerald-300 dark:hover:border-emerald-700"
                    >
                      {c.categoryName}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setEtapa("nome")}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
              >
                Voltar
              </button>
            </div>
          ) : null}

          {etapa === "descricao" ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--foreground)]">
                Categoria: <strong>{categoriaEscolhida?.categoryName}</strong>
              </p>
              <div>
                <label className={labelClass}>
                  Conte sobre o produto — material, pra quem é, diferenciais, o que mais souber
                </label>
                <textarea
                  className={cn(inputClass, "mt-1 h-32")}
                  value={descricaoLivre}
                  onChange={(e) => setDescricaoLivre(e.target.value)}
                  placeholder="Ex.: camisa de linho, masculina, gola italiana, caimento slim, ideal pro verão, cor branca e azul marinho..."
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void gerarIdeias()}
                  disabled={carregando}
                  className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  {carregando ? "Gerando ideias…" : "Gerar ideias"}
                </button>
                <button
                  type="button"
                  onClick={() => setEtapa("categoria")}
                  className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : null}

          {etapa === "ideias" && resultado ? (
            <div className="space-y-4">
              <p className="text-xs text-[var(--muted)]">
                O mesmo produto pode virar até 3 anúncios diferentes no Mercado Livre (mais chance de bater com
                buscas diferentes) — cada um abaixo com título, modelo, ocasiões e estilos próprios. A descrição é
                uma só, use a mesma nos 3.
              </p>
              {resultado.categoria_sem_atributo.modelo ||
              resultado.categoria_sem_atributo.ocasioes ||
              resultado.categoria_sem_atributo.estilos ? (
                <div className={cn("rounded-md p-3 text-sm", AMBER_PREMIUM_SURFACE_TRANSPARENT)}>
                  <p className={cn("font-semibold", AMBER_PREMIUM_TEXT_PRIMARY)}>
                    ⚠ Essa categoria do Mercado Livre não tem{" "}
                    {[
                      resultado.categoria_sem_atributo.modelo && "Modelo",
                      resultado.categoria_sem_atributo.ocasioes && "Ocasiões",
                      resultado.categoria_sem_atributo.estilos && "Estilos",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className={cn("mt-1", AMBER_PREMIUM_TEXT_BODY)}>
                    Por isso esse campo não aparece nos anúncios abaixo — não é erro do Andrey, é a ficha técnica
                    real dessa categoria no Mercado Livre (confirmado na API).
                  </p>
                </div>
              ) : null}
              {resultado.anuncios_sugeridos.map((anuncio, i) => (
                <div key={i} className="rounded-md border border-[var(--card-border)] p-3 sm:p-4">
                  <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                    Anúncio {i + 1}
                  </span>
                  <div className="mt-3 divide-y divide-[var(--card-border)]">
                    <div className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={labelClass}>Título sugerido</p>
                        <CopiarSugestaoBotao texto={anuncio.titulo_sugerido} />
                      </div>
                      <p className="mt-1 text-sm text-[var(--foreground)]">{anuncio.titulo_sugerido}</p>
                    </div>
                    {anuncio.modelo_sugerido ? (
                      <div className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className={labelClass}>Modelo sugerido</p>
                          <CopiarSugestaoBotao texto={anuncio.modelo_sugerido} rotulo="Copiar modelo" />
                        </div>
                        <p className="mt-1 text-sm text-[var(--foreground)]">{anuncio.modelo_sugerido}</p>
                      </div>
                    ) : null}
                    {anuncio.ocasioes_sugeridas ? (
                      <div className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className={labelClass}>Ocasiões sugeridas</p>
                          <CopiarSugestaoBotao texto={anuncio.ocasioes_sugeridas} rotulo="Copiar ocasiões" />
                        </div>
                        <p className="mt-1 text-sm text-[var(--foreground)]">{anuncio.ocasioes_sugeridas}</p>
                      </div>
                    ) : null}
                    {anuncio.estilos_sugeridos ? (
                      <div className="pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className={labelClass}>Estilos sugeridos</p>
                          <CopiarSugestaoBotao texto={anuncio.estilos_sugeridos} rotulo="Copiar estilos" />
                        </div>
                        <p className="mt-1 text-sm text-[var(--foreground)]">{anuncio.estilos_sugeridos}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              <div className="rounded-md border border-[var(--card-border)] p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={labelClass}>Descrição sugerida (use nos 3 anúncios)</p>
                  <CopiarSugestaoBotao
                    texto={
                      resultado.descricao_corpo +
                      (resultado.faq.length > 0
                        ? "\n\nPerguntas Frequentes:\n\n" +
                          resultado.faq.map((f) => `${f.pergunta}\n${f.resposta}`).join("\n\n")
                        : "")
                    }
                    rotulo="Copiar descrição + FAQ"
                  />
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--foreground)]">{resultado.descricao_corpo}</p>
                {resultado.faq.length > 0 ? (
                  <div className="mt-3 divide-y divide-[var(--card-border)] border-t border-[var(--card-border)]">
                    <p className="pb-2 pt-3 text-xs font-semibold text-[var(--foreground)]">Perguntas Frequentes</p>
                    {resultado.faq.map((f, i) => (
                      <div key={i} className="py-2 text-sm">
                        <p className="font-medium text-[var(--foreground)]">{f.pergunta}</p>
                        <p className="text-[var(--muted)]">{f.resposta}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {resultado.observacao ? (
                <div className="rounded-md border border-[var(--card-border)] p-3 text-sm text-[var(--foreground)]">
                  {resultado.observacao}
                </div>
              ) : null}
              <div className="rounded-md border border-[var(--card-border)] p-3">
                <p className={labelClass}>Antes de publicar no app do Mercado Livre</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-[var(--muted)]">
                  {CHECKLIST_GERAL.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEtapa("nome");
                  setNomeProduto("");
                  setDescricaoLivre("");
                  setResultado(null);
                }}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
              >
                Gerar ideias pra outro produto
              </button>
            </div>
          ) : null}
        </section>
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
