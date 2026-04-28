"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import {
  isSementeSellerCatalogo as isSemente,
  isGrupoOcultoSellerCatalogo as isGrupoOculto,
  strSellerCatalogo as str,
} from "@/components/seller/SellerCatalogoGrupoUi";
import {
  linhasGrupo,
  estoqueTotalGrupo,
  menorCustoGrupo,
  statusGeralGrupo,
  type LinhaCatalogoV2,
} from "./aggregates";
import { catalogoV2UrlImagem } from "./catalogoV2Imagem";
import { CatalogoV2VariacaoRow } from "./CatalogoV2VariacaoRow";
import { skuProntoParaVender } from "@/lib/sellerSkuReadiness";

type GrupoView = { paiKey: string; pai: SellerCatalogoItem | null; filhos: SellerCatalogoItem[] };

type Props = {
  grupo: GrupoView;
  fornecedorNome: string | null;
  expandido: boolean;
  onToggleExpand: () => void;
  onOpenMedidas: () => void;
  bulkLoading: boolean;
  onBulkEnableValidas: () => void;
  onBulkDisableAll: () => void;
  toggleLoadingId: string | null;
  onToggleOne: (item: SellerCatalogoItem, ativar: boolean) => void;
};

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function resumoDescricao(v: string | null, max = 90): string | null {
  const s = str(v).trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.length <= max) return s;
  return `${s.slice(0, max).trimEnd()}...`;
}

function tecidoFromTexto(nome: string, descricao: string | null): string | null {
  const base = `${nome} ${str(descricao)}`.toLowerCase();
  const mapa: Array<{ rx: RegExp; label: string }> = [
    { rx: /poli[eé]ster/, label: "Poliéster" },
    { rx: /algod[aã]o/, label: "Algodão" },
    { rx: /viscose/, label: "Viscose" },
    { rx: /linho/, label: "Linho" },
    { rx: /elastano/, label: "Elastano" },
    { rx: /malha/, label: "Malha" },
    { rx: /moletom/, label: "Moletom" },
    { rx: /jeans|denim/, label: "Jeans" },
  ];
  for (const it of mapa) {
    if (it.rx.test(base)) return it.label;
  }
  return null;
}

function toLinha(it: SellerCatalogoItem): LinhaCatalogoV2 {
  const ativo = str(it.status).toLowerCase() === "ativo";
  const est = it.estoque_atual;
  const custo = it.custo_total;
  return {
    item: it,
    sku: it.sku,
    imagemUrl: it.imagem_url,
    cor: it.cor,
    tamanho: it.tamanho,
    estoque: typeof est === "number" && Number.isFinite(est) ? est : 0,
    custo: typeof custo === "number" && Number.isFinite(custo) ? custo : 0,
    ativo,
    prontoParaVender: skuProntoParaVender(it),
    habilitado: it.habilitado_venda === true,
  };
}

function primeiraImagemGrupo(pai: SellerCatalogoItem | null, filhos: SellerCatalogoItem[]): string | null {
  const ordem = linhasGrupo(pai, filhos);
  for (const it of ordem) {
    const u = str(it.imagem_url).trim();
    if (u) return u;
  }
  return null;
}

const bd = "border-[#e3e5e8] dark:border-[#2e3240]";
const txt = "text-[#202223] dark:text-[#e3e5e8]";
const muted = "text-[#6d7175] dark:text-[#8c9196]";

/** Card: 92×92 · rounded-xl · fundo branco · padding leve · shadow-sm */
function CardImagem({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = catalogoV2UrlImagem(url);
  if (src && !failed) {
    return (
      <div
        className={`relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-xl border ${bd} bg-white p-1.5 shadow-[0_2px_8px_rgba(15,23,42,0.08)] dark:bg-[#14171c]`}
      >
        <img
          src={src}
          alt=""
          className="h-full w-full rounded-lg object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div
      className={`flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-xl border ${bd} border-dashed bg-white p-1.5 shadow-[0_2px_8px_rgba(15,23,42,0.08)] dark:bg-[#14171c]`}
      aria-hidden
    >
      <svg className="h-9 w-9 text-[#c4c7cc] dark:text-[#5c5f62]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="1.8" />
        <path d="M3 17l5-5 4 4 4-4 5 5" />
      </svg>
    </div>
  );
}

export function CatalogoV2ProdutoCard({
  grupo,
  fornecedorNome,
  expandido,
  onToggleExpand,
  onOpenMedidas,
  bulkLoading,
  onBulkEnableValidas,
  onBulkDisableAll,
  toggleLoadingId,
  onToggleOne,
}: Props) {
  const bulkRef = useRef<HTMLDetailsElement>(null);
  const [modalDetalhes, setModalDetalhes] = useState(false);
  const fecharBulk = () => {
    if (bulkRef.current) bulkRef.current.open = false;
  };

  useEffect(() => {
    if (!expandido) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expandido]);

  const nome =
    str(grupo.pai?.nome_produto).trim() ||
    str(grupo.filhos[0]?.nome_produto).trim() ||
    grupo.paiKey;
  const itemBase = grupo.pai ?? grupo.filhos[0] ?? null;
  const skuPai = grupo.paiKey;
  const fornecedorLabel = fornecedorNome?.trim() || "—";
  const capaUrl = primeiraImagemGrupo(grupo.pai, grupo.filhos);
  const descricaoCurta = resumoDescricao(itemBase?.descricao ?? null, 84);
  const tecidoLabel = tecidoFromTexto(nome, itemBase?.descricao ?? null);
  const tecidoExibicao = tecidoLabel ?? "Não informado";
  const descricaoExibicao = descricaoCurta ?? "Descrição curta indisponível no cadastro do fornecedor.";
  const descricaoCompleta = str(itemBase?.descricao).trim() || "Fornecedor ainda não cadastrou descrição deste produto.";
  const categoriaExibicao = str(itemBase?.categoria).trim() || "Não informada";
  const dimensoesExibicao = str(itemBase?.dimensoes_pacote).trim() || "Não informado";
  const ncmExibicao = str(itemBase?.ncm).trim() || "Não informado";

  const linhasItens = linhasGrupo(grupo.pai, grupo.filhos).filter((it) => !isSemente(it) && !isGrupoOculto(it.sku));
  const linhas = linhasItens.map(toLinha);

  const estoqueTotal = estoqueTotalGrupo(grupo.pai, grupo.filhos);
  const menorCusto = menorCustoGrupo(grupo.pai, grupo.filhos) ?? 0;
  const variacoes = linhasItens.filter((it) => str(it.status).toLowerCase() === "ativo").length;

  const sg = statusGeralGrupo(grupo.pai, grupo.filhos);

  const badge = useMemo(() => {
    if (sg === "pendencias") {
      return (
        <span className="inline-flex max-w-full rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/35 dark:text-amber-100 dark:ring-amber-800/50">
          Com pendência
        </span>
      );
    }
    if (sg === "sem_estoque") {
      return (
        <span className={`inline-flex rounded-full bg-[#f6f6f7] px-2 py-0.5 text-[11px] font-medium ring-1 ring-[#e3e5e8] ${muted} dark:bg-[#252a32] dark:ring-[#3d4450]`}>
          Sem estoque
        </span>
      );
    }
    if (sg === "pausado") {
      return (
        <span className={`inline-flex rounded-full bg-[#f6f6f7] px-2 py-0.5 text-[11px] font-medium ring-1 ring-[#e3e5e8] ${muted} dark:bg-[#252a32] dark:ring-[#3d4450]`}>
          Pausado
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-full bg-[#e8f5ef] px-2 py-0.5 text-[11px] font-medium text-[#0c3d2a] ring-1 ring-[#008060]/20 dark:bg-[#008060]/15 dark:text-[#a3e5c1] dark:ring-[#008060]/35">
        Pronto
      </span>
    );
  }, [sg]);

  const btnPrincipal =
    "inline-flex min-h-[40px] w-full items-center justify-center rounded-xl bg-[#008060] px-4 text-sm font-semibold text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)] transition hover:bg-[#006e52] active:bg-[#005e46] sm:min-h-9 sm:w-auto sm:px-5";
  const btnSecundario =
    `inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border ${bd} bg-white px-4 text-sm font-medium ${txt} transition hover:bg-[#f6f6f7] dark:bg-[#1a1d24] dark:hover:bg-[#252a32] sm:min-h-9 sm:w-auto`;

  return (
    <article className={`relative overflow-visible rounded-xl border ${bd} bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)] ring-1 ring-black/[0.02] transition-shadow duration-200 ease-in-out hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.2)] dark:bg-[#1a1d24] dark:ring-white/[0.05]`}>
      <div className="p-4">
        {/* grid-template-columns: 92px 1fr; gap: 12px */}
        <div className="grid grid-cols-[92px_minmax(0,1fr)] items-start gap-3">
          <CardImagem url={capaUrl} />
          <div className="min-w-0 space-y-2.5">
            <h2 className={`line-clamp-2 text-sm font-semibold leading-snug ${txt}`}>{nome}</h2>
            <p className={`text-xs leading-snug ${muted}`}>
              <span className="font-mono text-[#5c5f62] dark:text-[#a0a5aa]">{skuPai}</span>
              <span className="text-[#d3d6d9] dark:text-[#4a4e55]"> · </span>
              {fornecedorLabel}
            </p>
            <div className="rounded-md border border-[#eceef1] bg-[#fafbfc] px-2 py-1.5 dark:border-[#2f3540] dark:bg-[#20252d]">
              <p className={`text-[11px] leading-snug ${muted}`}>
                <span className="font-medium text-[#4f545a] dark:text-[#9ea3a9]">Tecido:</span> {tecidoExibicao}
              </p>
              <p className={`mt-0.5 line-clamp-1 text-[11px] leading-snug ${muted}`}>{descricaoExibicao}</p>
            </div>
            <div className="flex flex-wrap gap-1">{badge}</div>
          </div>
        </div>

        <div className={`mt-4 grid grid-cols-3 gap-2.5 border-t ${bd} pt-4 text-center dark:border-[#2e3240]`}>
          <div>
            <p className={`text-[10px] font-medium uppercase tracking-wide ${muted}`}>Estoque</p>
            <p className={`mt-0.5 text-sm font-semibold tabular-nums ${txt}`}>{estoqueTotal}</p>
          </div>
          <div>
            <p className={`text-[10px] font-medium uppercase tracking-wide ${muted}`}>Custo</p>
            <p className={`mt-0.5 text-sm font-semibold tabular-nums ${txt}`}>{fmtMoney(menorCusto)}</p>
          </div>
          <div>
            <p className={`text-[10px] font-medium uppercase tracking-wide ${muted}`}>Variações</p>
            <p className={`mt-0.5 text-sm font-semibold tabular-nums ${txt}`}>{variacoes}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button type="button" onClick={onToggleExpand} className={btnPrincipal}>
            Configurar disponibilidade
          </button>
          <button type="button" onClick={onOpenMedidas} className={btnSecundario}>
            Tabela de medidas
          </button>
          <button type="button" onClick={() => setModalDetalhes(true)} className={btnSecundario}>
            Detalhes do produto
          </button>
        </div>
      </div>

      {expandido && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 backdrop-blur-[2px] sm:p-6">
          <button
            type="button"
            aria-label="Fechar gestão de venda"
            className="absolute inset-0 bg-[#111418]/40 dark:bg-black/54"
            onClick={onToggleExpand}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gestao-venda-titulo"
            className={`relative z-10 flex max-h-[min(90dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[#dfe3e8] bg-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.3)] dark:border-white/[0.08] dark:bg-[#181b21]/95 dark:shadow-[0_24px_54px_-30px_rgba(0,0,0,0.62)] sm:max-w-lg`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex shrink-0 flex-wrap items-start justify-between gap-3 px-5 py-4 dark:border-[#ffffff0a]`}>
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#008060]/90 dark:text-[#5dc49a]/95">Disponibilidade de venda</p>
                <h3 id="gestao-venda-titulo" className={`mt-1 line-clamp-2 text-[1.05rem] font-semibold leading-snug tracking-tight ${txt}`}>
                  {nome}
                </h3>
                <div className="mt-1.5 rounded-md border border-[#eceef1] bg-[#f8f9fa] px-2.5 py-1.5 dark:border-[#2f3540] dark:bg-[#21262e]">
                  <p className="text-[11px] leading-snug text-[#6d7175] dark:text-[#9aa0a8]">
                    <span className="font-medium text-[#4f545a] dark:text-[#c7cdd4]">Tecido:</span> {tecidoExibicao}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[#6d7175] dark:text-[#9aa0a8]">
                    {descricaoExibicao}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleExpand}
                className="shrink-0 rounded-[10px] border border-[#e8eaed] bg-[#fafbfc] px-3 py-2 text-[13px] font-medium text-[#3d4349] transition hover:bg-[#f0f2f4] dark:border-[#343a46] dark:bg-[#252a32] dark:text-[#dce0e5] dark:hover:bg-[#2e353e]"
              >
                Fechar
              </button>
            </div>

            <div className="mx-5 h-px bg-gradient-to-r from-transparent via-[#e8eaed] to-transparent dark:via-[#343a46]" aria-hidden />

            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  onOpenMedidas();
                }}
                className="text-[12px] font-medium text-[#008060] underline-offset-4 transition hover:text-[#006e52] hover:underline dark:text-[#6fd4b0] dark:hover:text-[#8fe4c8]"
              >
                Tabela de medidas
              </button>
              <span className="text-[#dce0e5] dark:text-[#454b54]" aria-hidden>
                ·
              </span>
              <details ref={bulkRef} className="relative">
                <summary className="cursor-pointer list-none text-[12px] font-medium text-[#6d7175] marker:content-none dark:text-[#9aa0a8] [&::-webkit-details-marker]:hidden">
                  Ações em lote
                </summary>
                <div className="absolute left-0 top-full z-20 mt-2 min-w-[11rem] overflow-hidden rounded-xl border border-[#eaecef] bg-white py-1 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.15)] dark:border-[#343a46] dark:bg-[#22262e]">
                  <button
                    type="button"
                    disabled={bulkLoading}
                    onClick={() => {
                      onBulkEnableValidas();
                      fecharBulk();
                    }}
                    className="flex w-full px-3 py-2.5 text-left text-[13px] text-[#202223] transition hover:bg-[#f6f8f9] disabled:opacity-50 dark:text-[#e8eaed] dark:hover:bg-[#2c323b]"
                  >
                    Habilitar válidas
                  </button>
                  <button
                    type="button"
                    disabled={bulkLoading}
                    onClick={() => {
                      onBulkDisableAll();
                      fecharBulk();
                    }}
                    className="flex w-full px-3 py-2.5 text-left text-[13px] text-[#202223] transition hover:bg-[#f6f8f9] disabled:opacity-50 dark:text-[#e8eaed] dark:hover:bg-[#2c323b]"
                  >
                    Desabilitar todas
                  </button>
                </div>
              </details>
            </div>

            <div className="mx-5 rounded-lg bg-[#f6f8fa] px-3.5 py-2.5 text-[11px] leading-relaxed text-[#5c6269] dark:bg-[#141916]/70 dark:text-[#a8aeb6]">
              <span className="font-medium text-[#2d3339] dark:text-[#dce0e5]">Dica:</span> prontidão vem do fornecedor. Toggle mais claro = venda ligada com pendência — pode desligar quando quiser.
              <details className="mt-1">
                <summary className="cursor-pointer font-medium text-[#008060] dark:text-[#6fd4b0]">Mais detalhes</summary>
                <p className="mt-1.5 text-[11px] leading-snug text-[#6d7175] dark:text-[#9aa0a8]">
                  Os dados vêm do armazém vinculado. O seller não edita NCM ou fotos aqui.
                </p>
              </details>
            </div>

            <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-[#f8f9fa] px-4 py-4 dark:bg-[#12151a]/88 sm:px-5">
              {linhas.map((l) => (
                <li key={l.sku}>
                  <CatalogoV2VariacaoRow linha={l} onToggleOne={onToggleOne} busy={toggleLoadingId === l.item.id} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {modalDetalhes && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 backdrop-blur-[2px] sm:p-6">
          <button
            type="button"
            aria-label="Fechar detalhes do produto"
            className="absolute inset-0 bg-[#111418]/42 dark:bg-black/58"
            onClick={() => setModalDetalhes(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="detalhes-produto-titulo"
            className={`relative z-10 w-full max-w-lg overflow-hidden rounded-xl border ${bd} bg-white shadow-[0_24px_56px_-30px_rgba(15,23,42,0.45)] dark:bg-[#1a1d24]`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-start justify-between gap-3 border-b ${bd} px-4 py-3`}>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#008060]/90 dark:text-[#5dc49a]/95">Detalhes do produto</p>
                <h4 id="detalhes-produto-titulo" className={`mt-1 text-sm font-semibold ${txt}`}>
                  {nome}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setModalDetalhes(false)}
                className={`shrink-0 rounded-[10px] border ${bd} bg-[#fafbfc] px-3 py-1.5 text-[13px] font-medium text-[#3d4349] transition hover:bg-[#f0f2f4] dark:bg-[#252a32] dark:text-[#dce0e5] dark:hover:bg-[#2e353e]`}
              >
                Fechar
              </button>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="rounded-lg border border-[#eceef1] bg-[#f8f9fa] px-3 py-2.5 dark:border-[#2f3540] dark:bg-[#20252d]">
                <p className={`text-[11px] ${muted}`}>
                  <span className="font-medium">Tecido:</span> {tecidoExibicao}
                </p>
                <p className={`mt-1 text-[11px] ${muted}`}>
                  <span className="font-medium">Categoria:</span> {categoriaExibicao}
                </p>
                <p className={`mt-1 text-[11px] ${muted}`}>
                  <span className="font-medium">Dimensões pacote:</span> {dimensoesExibicao}
                </p>
                <p className={`mt-1 text-[11px] ${muted}`}>
                  <span className="font-medium">NCM:</span> {ncmExibicao}
                </p>
              </div>
              <div className="rounded-lg border border-[#eceef1] bg-white px-3 py-2.5 dark:border-[#2f3540] dark:bg-[#1b2028]">
                <p className={`text-[11px] font-medium ${muted}`}>Descrição</p>
                <p className={`mt-1 text-[12px] leading-relaxed ${txt}`}>{descricaoCompleta}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
