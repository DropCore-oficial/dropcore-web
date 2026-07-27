"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { resolverDetalhesProdutoJson } from "@/lib/detalhesProdutoJson";
import { enriquecerDetalhesProdutoLegado } from "@/lib/enriquecerDetalhesProdutoLegado";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ncmOrigemFromSkuRow } from "@/lib/fornecedorSkuCatalogExtras";
import { tabelaMedidasFromDetalhesJson, type TabelaMedidasPayload } from "@/lib/fornecedorTabelaMedidas";
import { TabelaMedidasTabela } from "@/components/TabelaMedidasTabela";
import {
  caimentoOptions,
  climaOptions,
  elasticidadeOptions,
  formatAmassaCaracteristica,
  formatOcasioesCaracteristicas,
  labelCaracteristicaValor,
  posicionamentoOptions,
  transparenciaOptions,
} from "@/lib/fornecedorVariantesUi";
import { cn } from "@/lib/utils";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import {
  CadastroResumoShell,
  FieldRow,
  GradeBadge,
  KpiCard,
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
  /** Armazém ligado do seller (query `fornecedor_id` na API de medidas). */
  fornecedorId?: string | null;
};

export function ProdutoResumoListaGrupo({
  grupoKey,
  pai,
  filhosVariantes,
  representante,
  linkAlbum,
  editHref,
  somenteLeitura = false,
  fornecedorId = null,
}: Props) {
  const base = pai ?? representante;
  const detalhesProdutoJson = useMemo(() => {
    const resolvido = resolverDetalhesProdutoJson(
      pai?.detalhes_produto_json,
      representante.detalhes_produto_json,
      ...filhosVariantes.map((f) => f.detalhes_produto_json)
    );
    return enriquecerDetalhesProdutoLegado(resolvido, {
      nome_produto: base.nome_produto,
      descricao: base.descricao,
      categoria: base.categoria,
      marca: base.marca,
      data_lancamento: base.data_lancamento,
      expedicao_override_linha: base.expedicao_override_linha,
    });
  }, [
    pai?.detalhes_produto_json,
    representante.detalhes_produto_json,
    filhosVariantes,
    base.nome_produto,
    base.descricao,
    base.categoria,
    base.marca,
    base.data_lancamento,
    base.expedicao_override_linha,
  ]);
  const [secaoAberta, setSecaoAberta] = useState<string | null>(null);
  const [resumoAberto, setResumoAberto] = useState(false);

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
  const [medidasPayload, setMedidasPayload] = useState<TabelaMedidasPayload | null>(null);
  const [medidasLoading, setMedidasLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setMedidasLoading(true);
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token || cancel) return;
        const tmParams = new URLSearchParams({ grupoKey });
        if (somenteLeitura && fornecedorId?.trim()) {
          tmParams.set("fornecedor_id", fornecedorId.trim());
        }
        const url = somenteLeitura
          ? `/api/seller/catalogo/tabela-medidas?${tmParams.toString()}`
          : `/api/fornecedor/produtos/tabela-medidas?grupoKey=${encodeURIComponent(grupoKey)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!res.ok || cancel) return;
        const data = await res.json();
        let fonte = somenteLeitura ? (data.aprovada ?? null) : (data.pendente ?? data.aprovada ?? null);
        if (!fonte && detalhesProdutoJson) {
          const fromJson = tabelaMedidasFromDetalhesJson(
            detalhesProdutoJson,
            base.nome_produto ?? "",
            base.categoria
          );
          if (fromJson) fonte = fromJson;
        }
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
          setMedidasPayload(fonte ?? null);
        }
      } finally {
        if (!cancel) setMedidasLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [grupoKey, somenteLeitura, fornecedorId, detalhesProdutoJson, base.nome_produto, base.categoria]);

  const detalhes = asObj(detalhesProdutoJson);
  const infoBasica = asObj(detalhes?.infoBasica);
  const caracteristicas = asObj(detalhes?.caracteristicas);
  const qualidade = asObj(detalhes?.qualidade);
  const midiaExtra = asObj(detalhes?.midia);
  const guiado = asObj(detalhes?.guiado);
  const logisticaExtra = asObj(detalhes?.logistica);
  const medidasExtra = asObj(detalhes?.medidas);
  const fiscalCols = ncmOrigemFromSkuRow(base);

  const descricaoAnuncio = asText(base.descricao) || asText(infoBasica?.descricao);
  const descOk = filled(descricaoAnuncio);
  const caimentoLabel = labelCaracteristicaValor(caimentoOptions, caracteristicas?.caimento);
  const elasticidadeLabel = labelCaracteristicaValor(elasticidadeOptions, caracteristicas?.elasticidade);
  const transparenciaLabel = labelCaracteristicaValor(transparenciaOptions, caracteristicas?.transparencia);
  const climaLabel = labelCaracteristicaValor(climaOptions, caracteristicas?.clima);
  const posicionamentoLabel = labelCaracteristicaValor(posicionamentoOptions, caracteristicas?.posicionamento);
  const ocasioesLabel = formatOcasioesCaracteristicas(caracteristicas?.ocasioes);
  const amassaLabel = formatAmassaCaracteristica(caracteristicas?.amassa);
  const albumOk = filled(linkAlbum);
  const videoUrl = asText(midiaExtra?.video);
  const videoOk = filled(videoUrl);
  const fiscalCoreOk = filled(fiscalCols.ncm) && filled(fiscalCols.origem);
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
  const midiaComplementarOk = videoOk;
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
  const medidasTabelaOnly = medidasLoading ? (
    <p className="text-xs text-[var(--muted)]">Carregando…</p>
  ) : medidasPayload && Object.keys(medidasPayload.medidas ?? {}).length > 0 ? (
    <TabelaMedidasTabela data={medidasPayload} tableClassName="w-full min-w-[280px] border-collapse text-sm" />
  ) : (
    <p className="text-xs text-[var(--muted)]">Nenhuma tabela de medidas cadastrada para este grupo.</p>
  );

  const SECOES: Array<{ key: string; title: string; subtitle: string; content: ReactNode }> = [
    {
      key: "identificacao",
      title: "Identificação",
      subtitle: "Conteúdo comercial",
      content: (
        <>
          <FieldRow label="Nome" ok={filled(base.nome_produto)} value={filled(base.nome_produto) ? trunc(base.nome_produto, 90) : "Pendente"} />
          <FieldRow label="Categoria" ok={filled(base.categoria)} value={filled(base.categoria) ? String(base.categoria) : "Pendente"} />
          <FieldRow label="Marca" ok={filled(base.marca)} value={filled(base.marca) ? String(base.marca) : "Opcional"} optional />
          <FieldRow label="Modelo" ok={modeloOk} value={modeloOk ? String(infoBasica?.modelo) : "Pendente"} />
          <FieldRow
            label="Resumo guiado (seller)"
            ok={descOk}
            value={
              descOk
                ? trunc(descricaoAnuncio, 120)
                : "Pendente — preencha Diferencial, Indicação e Observações no cadastro"
            }
          />
          <FieldRow
            label="Data de lançamento"
            ok={filled(base.data_lancamento)}
            value={filled(base.data_lancamento) ? String(base.data_lancamento).slice(0, 10) : "Pendente"}
            optional
          />
        </>
      ),
    },
    {
      key: "midia",
      title: "Mídia e grade",
      subtitle: "Fotos e variantes",
      content: (
        <>
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
          <FieldRow
            label="Link do vídeo"
            ok={videoOk}
            optional={!videoOk}
            value={
              videoOk ? (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-medium text-[var(--primary-blue)] underline decoration-[var(--primary-blue)]/25 underline-offset-2 transition hover:text-[var(--primary-blue-hover)] dark:text-[var(--primary-blue)] dark:decoration-[var(--primary-blue)]/30 dark:hover:text-[var(--primary-blue-hover)]"
                >
                  Abrir vídeo
                </a>
              ) : (
                "Opcional"
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
        </>
      ),
    },
    {
      key: "embalagem",
      title: "Embalagem e despacho",
      subtitle: "Logística de expedição",
      content: (
        <>
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
        </>
      ),
    },
    {
      key: "endereco",
      title: "Endereço de despacho",
      subtitle: "CD de saída estruturado",
      content: (
        <>
          <FieldRow label="Usa despacho do cadastro" ok={logisticaExtra?.cdUsarDespachoCadastro != null} value={logisticaExtra?.cdUsarDespachoCadastro ? "Sim" : "Não"} />
          <FieldRow label="CEP" ok={filled(logisticaExtra?.cdSaidaCep)} value={asText(logisticaExtra?.cdSaidaCep) || "Pendente"} />
          <FieldRow label="Logradouro" ok={filled(logisticaExtra?.cdSaidaLogradouro)} value={asText(logisticaExtra?.cdSaidaLogradouro) || "Pendente"} />
          <FieldRow label="Número" ok={filled(logisticaExtra?.cdSaidaNumero)} value={asText(logisticaExtra?.cdSaidaNumero) || "Pendente"} />
        </>
      ),
    },
    {
      key: "localizacao",
      title: "Localização do CD",
      subtitle: "Complemento do endereço de saída",
      content: (
        <>
          <FieldRow label="Complemento" ok={filled(logisticaExtra?.cdSaidaComplemento)} value={asText(logisticaExtra?.cdSaidaComplemento) || "Opcional"} optional />
          <FieldRow label="Bairro" ok={filled(logisticaExtra?.cdSaidaBairro)} value={asText(logisticaExtra?.cdSaidaBairro) || "Pendente"} />
          <FieldRow label="Cidade" ok={filled(logisticaExtra?.cdSaidaCidade)} value={asText(logisticaExtra?.cdSaidaCidade) || "Pendente"} />
          <FieldRow label="UF" ok={filled(logisticaExtra?.cdSaidaUf)} value={asText(logisticaExtra?.cdSaidaUf) || "Pendente"} />
        </>
      ),
    },
    {
      key: "tecido",
      title: "Tecido e caimento",
      subtitle: "Dados preenchidos no formulário",
      content: (
        <>
          <FieldRow label="Tecido" ok={filled(caracteristicas?.tecido)} value={filled(caracteristicas?.tecido) ? String(caracteristicas?.tecido) : "Pendente"} />
          <FieldRow label="Composição" ok={filled(caracteristicas?.composicao)} value={filled(caracteristicas?.composicao) ? String(caracteristicas?.composicao) : "Pendente"} />
          <FieldRow label="Caimento" ok={filled(caimentoLabel)} value={filled(caimentoLabel) ? caimentoLabel : "Pendente"} />
          <FieldRow label="Elasticidade" ok={filled(elasticidadeLabel)} value={filled(elasticidadeLabel) ? elasticidadeLabel : "Pendente"} />
          <FieldRow label="Transparência" ok={filled(transparenciaLabel)} value={filled(transparenciaLabel) ? transparenciaLabel : "Pendente"} />
        </>
      ),
    },
    {
      key: "qualidade",
      title: "Qualidade e uso",
      subtitle: "Dados preenchidos no formulário",
      content: (
        <>
          <FieldRow label="Clima ideal" ok={filled(climaLabel)} value={filled(climaLabel) ? climaLabel : "Pendente"} />
          <FieldRow label="Posicionamento" ok={filled(posicionamentoLabel)} value={filled(posicionamentoLabel) ? posicionamentoLabel : "Pendente"} />
          <FieldRow label="Amassa fácil" ok={caracteristicas?.amassa != null} value={amassaLabel || "Pendente"} />
          <FieldRow label="Ocasiões de uso" ok={filled(ocasioesLabel)} value={filled(ocasioesLabel) ? ocasioesLabel : "Pendente"} />
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
        </>
      ),
    },
    {
      key: "fiscal",
      title: "Fiscal",
      subtitle: "NF-e e impostos",
      content: (
        <>
          <FieldRow
            label="NCM"
            ok={filled(fiscalCols.ncm)}
            value={filled(fiscalCols.ncm) ? String(fiscalCols.ncm) : "Pendente"}
          />
          <FieldRow
            label="Origem"
            ok={filled(fiscalCols.origem)}
            value={filled(fiscalCols.origem) ? String(fiscalCols.origem) : "Pendente"}
          />
          <FieldRow
            label="CEST"
            ok={filled(base.cest ?? logisticaExtra?.cest)}
            value={filled(base.cest ?? logisticaExtra?.cest) ? String(base.cest ?? logisticaExtra?.cest) : "Opcional"}
            optional
          />
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
        </>
      ),
    },
    {
      key: "guiado",
      title: "Dados guiados e mídia extra",
      subtitle: "Apoio para anúncio do seller",
      content: (
        <>
          <FieldRow label="Diferencial" ok={filled(guiado?.diferencial)} value={filled(guiado?.diferencial) ? String(guiado?.diferencial) : "Pendente"} />
          <FieldRow label="Indicação de uso" ok={filled(guiado?.indicacao)} value={filled(guiado?.indicacao) ? String(guiado?.indicacao) : "Pendente"} />
          <FieldRow
            label="Observações para seller"
            ok={filled(guiado?.observacoesSeller)}
            value={filled(guiado?.observacoesSeller) ? trunc(String(guiado?.observacoesSeller), 120) : "Pendente"}
          />
        </>
      ),
    },
    {
      key: "medidas",
      title: "Medidas (meta)",
      subtitle: "Configuração e valores em cm por tamanho",
      content: (
        <>
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
          <div className="mt-3 border-t border-[var(--card-border)] pt-3">{medidasTabelaOnly}</div>
        </>
      ),
    },
  ];

  const secaoAtual = SECOES.find((s) => s.key === secaoAberta) ?? null;

  return (
    <SummaryShell>
      <CadastroResumoShell>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setResumoAberto((v) => !v)}
              aria-expanded={resumoAberto}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-600/15 dark:bg-emerald-400/10 dark:text-emerald-400 dark:hover:bg-emerald-400/15"
            >
              Resumo do cadastro
              <svg
                className={cn("h-3 w-3 shrink-0 transition-transform duration-150", resumoAberto ? "rotate-90" : "")}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
              </svg>
            </button>
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

        {resumoAberto && (
        <div className="animate-fade-in-up">
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
        <div className="mt-5 border-t border-[var(--card-border)] pt-4">
          <p className="mb-3 text-sm font-medium text-[var(--muted)]">Diagnóstico completo</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {SECOES.map((secao) => (
              <button
                key={secao.key}
                type="button"
                title={secao.title}
                onClick={() => setSecaoAberta(secao.key)}
                className="group flex flex-col items-start gap-0.5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5 text-left transition-all hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700"
              >
                <span className="flex w-full items-center justify-between gap-1">
                  <span className="truncate text-[13px] font-semibold text-[var(--foreground)]">{secao.title}</span>
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                  </svg>
                </span>
                <span className="line-clamp-2 text-[11px] leading-snug text-[var(--muted)]">{secao.subtitle}</span>
              </button>
            ))}
          </div>
        </div>
        </div>
        )}
      </CadastroResumoShell>

      {secaoAtual && (
        <ModalOverlay onBackdropClick={() => setSecaoAberta(null)} panelClassName="max-w-lg md:max-w-4xl">
          <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4">
            <div className="min-w-0">
              <h3 className="font-semibold text-[var(--foreground)]">{secaoAtual.title}</h3>
              <p className="text-xs text-[var(--muted)]">{secaoAtual.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setSecaoAberta(null)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-[var(--muted)] hover:bg-[var(--muted)]/10"
            >
              ×
            </button>
          </div>
          <div className={cn(MODAL_PANEL_BODY_CLASS, "p-4")}>{secaoAtual.content}</div>
        </ModalOverlay>
      )}
    </SummaryShell>
  );
}
