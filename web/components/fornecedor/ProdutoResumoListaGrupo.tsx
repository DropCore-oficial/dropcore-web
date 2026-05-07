"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AMBER_PREMIUM_ACCENT_BAR,
  AMBER_PREMIUM_DOT,
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_PRIMARY,
  AMBER_PREMIUM_TEXT_SECONDARY,
} from "@/lib/amberPremium";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import {
  CadastroResumoShell,
  FieldRow,
  GradeBadge,
  KpiCard,
  MiniCard,
  ProgressBar,
  cadastroCampoPreenchido as filled,
} from "@/components/fornecedor/produtoCadastroUiKit";

/** Campos usados no resumo da lista — alinhar com GET /api/fornecedor/produtos */
export type ProdutoResumoLista = {
  sku: string;
  nome_produto: string;
  cor: string | null;
  tamanho: string | null;
  descricao: string | null;
  categoria?: string | null;
  marca?: string | null;
  data_lancamento?: string | null;
  link_fotos: string | null;
  imagem_url: string | null;
  comprimento_cm: number | null;
  largura_cm: number | null;
  altura_cm: number | null;
  peso_kg: number | null;
  dimensoes_pacote?: string | null;
  custo_base?: number | null;
  ncm?: string | null;
  origem?: string | null;
  cest?: string | null;
  cfop?: string | null;
  peso_liquido_kg?: number | null;
  peso_bruto_kg?: number | null;
  expedicao_override_linha?: string | null;
  detalhes_produto_json?: Record<string, unknown> | null;
};

function asObj(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asStrList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
}

function trunc(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function fmtCmDim(p: ProdutoResumoLista): string | null {
  const c = p.comprimento_cm;
  const l = p.largura_cm;
  const a = p.altura_cm;
  if (c != null && l != null && a != null && [c, l, a].every((x) => Number.isFinite(x))) {
    return `${c}×${l}×${a} cm`;
  }
  const d = (p.dimensoes_pacote ?? "").trim();
  return d || null;
}

function fmtKg(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `${n} kg`;
}

function percent(preenchidos: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((preenchidos / total) * 100)));
}

type AcaoPrioritaria = {
  id: string;
  titulo: string;
  impacto: "alto" | "medio";
};

function SummaryShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="isolate border-t border-[var(--card-border)] bg-[var(--card)] px-3 pb-4 pt-4 sm:px-4 sm:pb-5 sm:pt-5"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** Mesmo invólucro interno que `CadastroResumoShell` no kit — lista fornecedor mantém borda superior no pai. */
type Props = {
  grupoKey: string;
  pai: ProdutoResumoLista | null;
  filhosVariantes: ProdutoResumoLista[];
  representante: ProdutoResumoLista;
  linkAlbum: string | null;
  editHref: string;
  /** Seller no catálogo: mesmo layout, sem CTAs de edição do fornecedor; medidas via API do seller. */
  somenteLeitura?: boolean;
};

export function ProdutoResumoListaGrupo({
  grupoKey,
  pai,
  filhosVariantes,
  representante,
  linkAlbum,
  editHref,
  somenteLeitura = false,
}: Props) {
  const base = pai ?? representante;
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);

  const statsVar = useMemo(() => {
    const total = filhosVariantes.length;
    const comFoto = filhosVariantes.filter((f) => filled(f.imagem_url)).length;
    const comCusto = filhosVariantes.filter((f) => f.custo_base != null && Number.isFinite(f.custo_base) && f.custo_base > 0).length;
    return { total, comFoto, comCusto };
  }, [filhosVariantes]);

  const [medidasSnap, setMedidasSnap] = useState<{
    tipo: string;
    preenchidas: number;
    total: number;
  } | null>(null);
  const [medidasLoading, setMedidasLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setMedidasLoading(true);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token || cancel) return;
        const url = somenteLeitura
          ? `/api/seller/catalogo/tabela-medidas?grupoKey=${encodeURIComponent(grupoKey)}`
          : `/api/fornecedor/produtos/tabela-medidas?grupoKey=${encodeURIComponent(grupoKey)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!res.ok || cancel) return;
        const data = await res.json();
        const fonte = somenteLeitura ? (data.aprovada ?? null) : (data.pendente ?? data.aprovada ?? null);
        const medidas = fonte?.medidas ?? {};
        let preenchidas = 0;
        let total = 0;
        for (const row of Object.values(medidas) as Record<string, Record<string, number>>[]) {
          for (const k of Object.keys(row)) {
            total += 1;
            const v = row[k];
            if (v != null && Number.isFinite(v)) preenchidas += 1;
          }
        }
        if (!cancel) {
          setMedidasSnap({
            tipo: fonte?.tipo_produto ?? "",
            preenchidas,
            total,
          });
        }
      } finally {
        if (!cancel) setMedidasLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [grupoKey, somenteLeitura]);

  const detalhes = asObj(base.detalhes_produto_json);
  const infoBasica = asObj(detalhes?.infoBasica);
  const caracteristicas = asObj(detalhes?.caracteristicas);
  const qualidade = asObj(detalhes?.qualidade);
  const midiaExtra = asObj(detalhes?.midia);
  const guiado = asObj(detalhes?.guiado);
  const logisticaExtra = asObj(detalhes?.logistica);
  const medidasExtra = asObj(detalhes?.medidas);

  const descOk = filled(base.descricao);
  const albumOk = filled(linkAlbum);
  const fiscalCoreOk = filled(base.ncm) && filled(base.origem);
  const dimsOk = Boolean(fmtCmDim(base));
  const pesoOk = filled(base.peso_kg);
  const custoCompleto = statsVar.total > 0 && statsVar.comCusto === statsVar.total;
  const fotoCompleta = statsVar.total > 0 && statsVar.comFoto === statsVar.total;
  const medidasOk = Boolean(medidasSnap && medidasSnap.total > 0 && medidasSnap.preenchidas > 0);
  const modeloOk = filled(infoBasica?.modelo);
  const caracteristicasOk = [
    filled(caracteristicas?.tecido),
    filled(caracteristicas?.composicao),
    filled(caracteristicas?.caimento),
    filled(caracteristicas?.elasticidade),
    filled(caracteristicas?.transparencia),
    caracteristicas?.amassa != null,
    filled(caracteristicas?.clima),
    Array.isArray(caracteristicas?.ocasioes) && caracteristicas.ocasioes.length > 0,
    filled(caracteristicas?.posicionamento),
  ].some(Boolean);
  const qualidadeOk = [
    qualidade?.naoDesbota != null,
    qualidade?.encolhe != null,
    qualidade?.costuraReforcada != null,
    filled(qualidade?.observacoes),
  ].some(Boolean);
  const guiadoOk = [filled(guiado?.diferencial), filled(guiado?.indicacao), filled(guiado?.observacoesSeller)].some(Boolean);
  const midiaComplementarOk = [filled(midiaExtra?.video), filled(midiaExtra?.frente), filled(midiaExtra?.costas), filled(midiaExtra?.detalhe), filled(midiaExtra?.lifestyle)].some(Boolean);
  const checks = [
    filled(base.nome_produto),
    filled(base.categoria),
    modeloOk,
    caracteristicasOk,
    descOk,
    albumOk,
    fiscalCoreOk,
    dimsOk,
    pesoOk,
    custoCompleto,
    fotoCompleta,
    medidasOk,
    qualidadeOk,
    guiadoOk,
    midiaComplementarOk,
  ];
  const preenchidos = checks.filter(Boolean).length;
  const score = percent(preenchidos, checks.length);
  const acoesPrioritarias = useMemo((): AcaoPrioritaria[] => {
    const out: AcaoPrioritaria[] = [];
    if (!albumOk) out.push({ id: "album", titulo: "Adicionar link principal de fotos", impacto: "alto" });
    if (!fiscalCoreOk) out.push({ id: "fiscal", titulo: "Completar NCM e origem", impacto: "alto" });
    if (!medidasOk) out.push({ id: "medidas", titulo: "Enviar tabela de medidas", impacto: "alto" });
    if (!modeloOk) out.push({ id: "modelo", titulo: "Preencher modelo do produto", impacto: "medio" });
    if (!caracteristicasOk) out.push({ id: "caracteristicas", titulo: "Completar características comerciais", impacto: "medio" });
    if (!qualidadeOk) out.push({ id: "qualidade", titulo: "Completar checklist de qualidade", impacto: "medio" });
    if (!guiadoOk) out.push({ id: "guiado", titulo: "Preencher dados guiados para seller", impacto: "medio" });
    if (!midiaComplementarOk) out.push({ id: "midia", titulo: "Adicionar mídias complementares", impacto: "medio" });
    return out.slice(0, 3);
  }, [albumOk, fiscalCoreOk, medidasOk, modeloOk, caracteristicasOk, qualidadeOk, guiadoOk, midiaComplementarOk]);

  return (
    <SummaryShell>
      <CadastroResumoShell>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Resumo do cadastro</p>
            <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-[var(--foreground)]">
              Qualidade dos dados do produto
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
              <strong className="font-medium text-[var(--foreground)]">Foto</strong> é por SKU; abra o link na coluna de álbum para
              ver o catálogo completo.
            </p>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2.5">
            <GradeBadge value={score} />
            {!somenteLeitura ? (
              <Link
                href={editHref}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 text-[13px] font-semibold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-[var(--card)]"
              >
                Completar dados
              </Link>
            ) : null}
          </div>
        </div>
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center justify-between text-sm text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">Completude geral</span>
            <span className="tabular-nums text-sm font-semibold text-[var(--foreground)]">{score}%</span>
          </div>
          <ProgressBar value={score} />
        </div>

        <div className="mt-5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 sm:p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="text-[13px] font-semibold tracking-tight text-[var(--foreground)]">Próximas ações prioritárias</p>
            {!somenteLeitura ? (
              <Link
                href={editHref}
                className="inline-flex h-8 shrink-0 items-center justify-center self-start rounded-lg bg-[var(--primary-blue)] px-3 text-[12px] font-medium text-white shadow-none ring-1 ring-[var(--primary-blue)]/20 transition hover:bg-[var(--primary-blue-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)] focus:ring-offset-2 focus:ring-offset-[var(--card)] sm:self-auto"
              >
                Resolver agora
              </Link>
            ) : null}
          </div>
          {acoesPrioritarias.length > 0 ? (
            <div className="mt-2.5 flex min-w-0 flex-col gap-1.5 lg:mt-2 lg:flex-row lg:flex-nowrap lg:gap-2">
              {acoesPrioritarias.map((acao) => {
                const prefix = acao.impacto === "alto" ? "Alta prioridade" : "Melhoria";
                return (
                  <span
                    key={acao.id}
                    title={`${prefix} · ${acao.titulo}`}
                    className={cn(
                      "flex w-full min-w-0 flex-col gap-0.5 rounded-lg border border-[var(--card-border)] px-2.5 py-2 text-[11px] leading-relaxed shadow-none lg:flex-1 lg:basis-0 lg:flex-row lg:items-baseline lg:gap-x-2 lg:overflow-hidden lg:px-3 lg:py-2",
                      acao.impacto === "alto"
                        ? cn(AMBER_PREMIUM_ACCENT_BAR, "bg-transparent pl-[9px]")
                        : "border-l-[3px] border-l-emerald-700 bg-transparent pl-[9px] dark:border-l-emerald-400"
                    )}
                  >
                    <span
                      className={
                        acao.impacto === "alto"
                          ? cn("shrink-0 text-[11px] font-medium tracking-tight", AMBER_PREMIUM_TEXT_PRIMARY)
                          : "shrink-0 text-[11px] font-semibold tracking-tight text-emerald-900 dark:text-emerald-400"
                      }
                    >
                      {prefix}
                    </span>
                    <span
                      className={cn(
                        "hidden shrink-0 text-[11px] font-normal lg:inline",
                        acao.impacto === "alto" ? AMBER_PREMIUM_DOT : "text-emerald-700/55 dark:text-emerald-400/90"
                      )}
                      aria-hidden
                    >
                      ·
                    </span>
                    <span
                      className={cn(
                        "min-w-0 break-words text-[12px] font-normal leading-snug lg:flex-1 lg:truncate",
                        acao.impacto === "alto"
                          ? AMBER_PREMIUM_TEXT_PRIMARY
                          : "text-emerald-900 dark:text-emerald-300"
                      )}
                    >
                      {acao.titulo}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              Produto bem preenchido. Faça apenas ajustes finos antes de publicar.
            </p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Miniaturas SKU"
            value={statsVar.total === 0 ? "—" : `${statsVar.comFoto}/${statsVar.total}`}
            status={statsVar.total > 0 ? (fotoCompleta ? "Todas com foto" : "Faltam miniaturas") : "Sem variantes"}
            tone={fotoCompleta ? "success" : "warning"}
          />
          <KpiCard
            label="Álbum / link principal"
            value={albumOk ? "Sim" : "Não"}
            status={albumOk ? "Pronto para seller" : "Adicionar link"}
            tone={albumOk ? "success" : "warning"}
          />
          <KpiCard
            label="Fiscal essencial"
            value={fiscalCoreOk ? "Completo" : "Pendente"}
            status={fiscalCoreOk ? "NCM + origem preenchidos" : "Complete NCM e origem"}
            tone={fiscalCoreOk ? "success" : "warning"}
          />
          <KpiCard
            label="Tabela de medidas"
            value={medidasLoading ? "…" : medidasSnap && medidasSnap.total > 0 ? `${medidasSnap.preenchidas}/${medidasSnap.total}` : "—"}
            status={medidasSnap?.tipo ? `Tipo ${medidasSnap.tipo}` : "Sem tabela enviada"}
            tone={medidasOk ? "success" : "warning"}
          />
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-[var(--card-border)] pt-4">
          <p className="text-sm font-medium text-[var(--muted)]">Diagnóstico completo</p>
          <button
            type="button"
            onClick={() => setMostrarDetalhes((v) => !v)}
            className="inline-flex h-9 items-center rounded-lg border border-[var(--card-border)] bg-transparent px-4 text-[13px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--muted)] focus:ring-offset-2 focus:ring-offset-[var(--surface-subtle)]"
          >
            {mostrarDetalhes ? "Ocultar detalhes" : "Ver detalhes"}
          </button>
        </div>
      </CadastroResumoShell>

      {mostrarDetalhes && (
        <>
          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <MiniCard title="Identificação" subtitle="Conteúdo comercial">
              <FieldRow label="Nome" ok={filled(base.nome_produto)} value={filled(base.nome_produto) ? trunc(base.nome_produto, 90) : "Pendente"} />
              <FieldRow label="Categoria" ok={filled(base.categoria)} value={filled(base.categoria) ? String(base.categoria) : "Pendente"} />
              <FieldRow label="Marca" ok={filled(base.marca)} value={filled(base.marca) ? String(base.marca) : "Opcional"} optional />
              <FieldRow label="Modelo" ok={modeloOk} value={modeloOk ? String(infoBasica?.modelo) : "Pendente"} />
              <FieldRow label="Descrição / anúncio" ok={descOk} value={descOk ? trunc(String(base.descricao), 120) : "Pendente"} />
              <FieldRow
                label="Data de lançamento"
                ok={filled(base.data_lancamento)}
                value={filled(base.data_lancamento) ? String(base.data_lancamento).slice(0, 10) : "Pendente"}
                optional
              />
            </MiniCard>

            <MiniCard title="Mídia e grade" subtitle="Fotos e variantes">
              <FieldRow
                label="Link principal (coluna Ver)"
                ok={albumOk}
                value={
                  albumOk ? (
                    <a
                      href={linkAlbum!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all font-medium text-[var(--primary-blue)] underline decoration-[var(--primary-blue)]/25 underline-offset-2 transition hover:text-[var(--primary-blue-hover)] dark:text-[var(--primary-blue)] dark:decoration-[var(--primary-blue)]/30 dark:hover:text-[var(--primary-blue-hover)]"
                    >
                      Abrir link
                    </a>
                  ) : (
                    "Pendente"
                  )
                }
              />
              <FieldRow label="Miniatura pai (SKU)" ok={filled(pai?.imagem_url)} value={filled(pai?.imagem_url) ? "Definida" : "Usa variante/álbum"} optional />
              <FieldRow
                label="Fotos nas variantes"
                ok={fotoCompleta}
                value={statsVar.total === 0 ? "—" : `${statsVar.comFoto}/${statsVar.total} com miniatura`}
              />
              <FieldRow
                label="Custo nas variantes"
                ok={custoCompleto}
                value={statsVar.total === 0 ? "—" : `${statsVar.comCusto}/${statsVar.total} com preço`}
              />
            </MiniCard>

            <MiniCard title="Embalagem e despacho" subtitle="Logística de expedição">
              <FieldRow label="Peso (kg)" ok={pesoOk} value={fmtKg(base.peso_kg) ?? "Pendente"} />
              <FieldRow label="Dimensões" ok={dimsOk} value={fmtCmDim(base) ?? "Pendente"} />
              <FieldRow
                label="Despacho (override)"
                ok={filled(base.expedicao_override_linha)}
                value={filled(base.expedicao_override_linha) ? trunc(String(base.expedicao_override_linha), 84) : "Padrão do cadastro"}
                optional
              />
              <FieldRow
                label="SLA / unidade"
                ok={filled(logisticaExtra?.slaEnvio) || filled(logisticaExtra?.unidadeComercial)}
                value={
                  [String(logisticaExtra?.slaEnvio ?? "").trim(), String(logisticaExtra?.unidadeComercial ?? "").trim()]
                    .filter(Boolean)
                    .join(" · ") || "Pendente"
                }
                optional
              />
            </MiniCard>

            <MiniCard title="Fiscal" subtitle="NF-e e impostos">
              <FieldRow label="NCM" ok={filled(base.ncm)} value={filled(base.ncm) ? String(base.ncm) : "Pendente"} />
              <FieldRow label="Origem" ok={filled(base.origem)} value={filled(base.origem) ? String(base.origem) : "Pendente"} />
              <FieldRow label="CEST" ok={filled(base.cest)} value={filled(base.cest) ? String(base.cest) : "Opcional"} optional />
              <FieldRow label="CFOP" ok={filled(base.cfop)} value={filled(base.cfop) ? String(base.cfop) : "Opcional"} optional />
              <FieldRow
                label="Tabela de medidas"
                ok={medidasOk}
                value={
                  medidasLoading
                    ? "Carregando…"
                    : medidasSnap && medidasSnap.total > 0
                      ? `${medidasSnap.preenchidas}/${medidasSnap.total} células${medidasSnap.tipo ? ` · ${medidasSnap.tipo}` : ""}`
                      : "Não enviada"
                }
              />
            </MiniCard>

            <MiniCard title="Características e qualidade" subtitle="Dados preenchidos no formulário">
              <FieldRow label="Tecido" ok={filled(caracteristicas?.tecido)} value={filled(caracteristicas?.tecido) ? String(caracteristicas?.tecido) : "Pendente"} />
              <FieldRow label="Composição" ok={filled(caracteristicas?.composicao)} value={filled(caracteristicas?.composicao) ? String(caracteristicas?.composicao) : "Pendente"} />
              <FieldRow
                label="Caimento / elasticidade / transparência"
                ok={filled(caracteristicas?.caimento) || filled(caracteristicas?.elasticidade) || filled(caracteristicas?.transparencia)}
                value={
                  [String(caracteristicas?.caimento ?? "").trim(), String(caracteristicas?.elasticidade ?? "").trim(), String(caracteristicas?.transparencia ?? "").trim()]
                    .filter(Boolean)
                    .join(" · ") || "Pendente"
                }
              />
              <FieldRow
                label="Clima / ocasiões / posicionamento"
                ok={filled(caracteristicas?.clima) || (Array.isArray(caracteristicas?.ocasioes) && caracteristicas.ocasioes.length > 0) || filled(caracteristicas?.posicionamento)}
                value={
                  [
                    String(caracteristicas?.clima ?? "").trim(),
                    Array.isArray(caracteristicas?.ocasioes) ? caracteristicas.ocasioes.join(", ").trim() : "",
                    String(caracteristicas?.posicionamento ?? "").trim(),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Pendente"
                }
              />
              <FieldRow
                label="Qualidade"
                ok={qualidadeOk}
                value={
                  [
                    qualidade?.naoDesbota != null ? `Não desbota: ${qualidade.naoDesbota ? "sim" : "não"}` : "",
                    qualidade?.encolhe != null ? `Encolhe: ${qualidade.encolhe ? "sim" : "não"}` : "",
                    qualidade?.costuraReforcada != null ? `Costura reforçada: ${qualidade.costuraReforcada ? "sim" : "não"}` : "",
                    String(qualidade?.observacoes ?? "").trim(),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Pendente"
                }
              />
            </MiniCard>

            <MiniCard title="Dados guiados e mídia extra" subtitle="Apoio para anúncio do seller">
              <FieldRow label="Diferencial" ok={filled(guiado?.diferencial)} value={filled(guiado?.diferencial) ? String(guiado?.diferencial) : "Pendente"} />
              <FieldRow label="Indicação de uso" ok={filled(guiado?.indicacao)} value={filled(guiado?.indicacao) ? String(guiado?.indicacao) : "Pendente"} />
              <FieldRow
                label="Observações para seller"
                ok={filled(guiado?.observacoesSeller)}
                value={filled(guiado?.observacoesSeller) ? trunc(String(guiado?.observacoesSeller), 120) : "Pendente"}
              />
              <FieldRow
                label="Mídias complementares"
                ok={midiaComplementarOk}
                value={
                  [String(midiaExtra?.video ?? "").trim(), String(midiaExtra?.frente ?? "").trim(), String(midiaExtra?.costas ?? "").trim(), String(midiaExtra?.detalhe ?? "").trim(), String(midiaExtra?.lifestyle ?? "").trim()]
                    .filter(Boolean)
                    .length > 0
                    ? "Preenchidas"
                    : "Pendente"
                }
                optional
              />
              <FieldRow
                label="Link de fotos principal"
                ok={filled(midiaExtra?.linkFotos) || albumOk}
                value={asText(midiaExtra?.linkFotos) || (albumOk ? "Preenchido" : "Pendente")}
                optional
              />
            </MiniCard>

            <MiniCard title="Endereço de despacho" subtitle="CD de saída estruturado">
              <FieldRow label="Usa despacho do cadastro" ok={logisticaExtra?.cdUsarDespachoCadastro != null} value={logisticaExtra?.cdUsarDespachoCadastro ? "Sim" : "Não"} />
              <FieldRow label="CEP" ok={filled(logisticaExtra?.cdSaidaCep)} value={asText(logisticaExtra?.cdSaidaCep) || "Pendente"} />
              <FieldRow label="Logradouro" ok={filled(logisticaExtra?.cdSaidaLogradouro)} value={asText(logisticaExtra?.cdSaidaLogradouro) || "Pendente"} />
              <FieldRow label="Número" ok={filled(logisticaExtra?.cdSaidaNumero)} value={asText(logisticaExtra?.cdSaidaNumero) || "Pendente"} />
              <FieldRow label="Complemento" ok={filled(logisticaExtra?.cdSaidaComplemento)} value={asText(logisticaExtra?.cdSaidaComplemento) || "Opcional"} optional />
              <FieldRow label="Bairro" ok={filled(logisticaExtra?.cdSaidaBairro)} value={asText(logisticaExtra?.cdSaidaBairro) || "Pendente"} />
              <FieldRow label="Cidade" ok={filled(logisticaExtra?.cdSaidaCidade)} value={asText(logisticaExtra?.cdSaidaCidade) || "Pendente"} />
              <FieldRow label="UF" ok={filled(logisticaExtra?.cdSaidaUf)} value={asText(logisticaExtra?.cdSaidaUf) || "Pendente"} />
            </MiniCard>

            <MiniCard title="Medidas (meta)" subtitle="Configuração usada no formulário">
              <FieldRow
                label="Tópicos selecionados"
                ok={asStrList(medidasExtra?.topicosSelecionados).length > 0}
                value={asStrList(medidasExtra?.topicosSelecionados).join(", ") || "Pendente"}
              />
              <FieldRow
                label="Tópicos customizados"
                ok={filled(medidasExtra?.topicosCustom)}
                value={asText(medidasExtra?.topicosCustom) || "Opcional"}
                optional
              />
            </MiniCard>
          </div>
        </>
      )}
    </SummaryShell>
  );
}
