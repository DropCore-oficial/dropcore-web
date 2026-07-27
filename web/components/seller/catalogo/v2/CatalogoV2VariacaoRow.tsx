"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import { skuContaLimiteHabilitacaoSeller } from "@/lib/sellerSkuHabilitado";
import {
  corGrupoTemEstoqueParaHabilitar,
  MSG_COR_SEM_ESTOQUE_HABILITAR,
  skuReadinessLabelsFalha,
} from "@/lib/sellerSkuReadiness";
import type { LinhaCatalogoV2 } from "./aggregates";
import { catalogoV2UrlImagem } from "./catalogoV2Imagem";
import { AMBER_PREMIUM_SURFACE, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

type Props = {
  linha: LinhaCatalogoV2;
  onToggleOne: (item: SellerCatalogoItem, ativar: boolean) => void;
  busy: boolean;
};

const muted = "text-[#6d7175] dark:text-[#8c9196]";
const imgShell = "border border-[#e3e7eb] bg-white dark:border-[#343a46] dark:bg-[#14171c]";

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 80×80 · rounded-lg · object-contain · padding interno pequeno */
function ThumbModal({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  const img = catalogoV2UrlImagem(url);
  if (img && !failed) {
    return (
      <div
        className={`relative h-[80px] w-[80px] shrink-0 overflow-hidden rounded-lg ${imgShell} p-1.5 shadow-[0_2px_6px_rgba(15,23,42,0.06)]`}
      >
        <img
          src={img}
          alt=""
          className="h-full w-full object-contain object-center"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div
      className={`flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-lg ${imgShell} p-1.5 shadow-[0_2px_6px_rgba(15,23,42,0.06)]`}
      aria-hidden
    >
      <svg className="h-8 w-8 text-[#d3d8dd] dark:text-[#5c6068]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.15">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="1.8" />
        <path d="M3 17l5-5 4 4 4-4 5 5" />
      </svg>
    </div>
  );
}

/** Toggle premium compacto: 42×22 com thumb 18 */
function VendaSwitch({
  habilitado,
  disabled,
  busy,
  onToggle,
  saleTone,
  ariaLabel,
  hintTitle,
}: {
  habilitado: boolean;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
  saleTone: "ok" | "stale" | "off";
  ariaLabel?: string;
  hintTitle?: string;
}) {
  const track = !habilitado
    ? "bg-[#dfe3e8] ring-1 ring-black/[0.05] dark:bg-[#3f4652] dark:ring-white/[0.08]"
    : "bg-emerald-600 ring-1 ring-emerald-500/30 dark:bg-emerald-500 dark:ring-emerald-400/35";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={habilitado}
      aria-busy={busy}
      aria-label={ariaLabel}
      title={
        saleTone === "stale"
          ? "Venda ligada na API, mas o fornecedor ainda precisa completar o cadastro. Toque para desligar."
          : hintTitle
      }
      disabled={disabled || busy}
      onClick={() => {
        if (disabled || busy) return;
        onToggle();
      }}
      className={`relative h-[22px] w-[42px] shrink-0 rounded-full shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.16)] transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#008060]/24 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-45 dark:focus-visible:ring-offset-[#1a1d24] ${track}`}
    >
      <span
        className={`pointer-events-none absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.2)] ring-1 ring-black/[0.03] transition-transform duration-200 ease-in-out dark:shadow-none dark:ring-white/10 ${
          habilitado ? "translate-x-[20px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/** Faixa de aviso — sempre largura total do container pai (posição padronizada no card). */
export function HintSemEstoqueLigarBanner() {
  return (
    <div
      className={cn(AMBER_PREMIUM_SURFACE, AMBER_PREMIUM_TEXT_PRIMARY, "w-full rounded-lg px-2.5 py-2 text-left text-[10px] leading-snug shadow-[0_2px_8px_-4px_rgba(15,23,42,0.18)]")}
      role="status"
      aria-live="polite"
    >
      {MSG_COR_SEM_ESTOQUE_HABILITAR}
    </div>
  );
}

export function useHintSemEstoqueLigar() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, 5500);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { visible, mostrar };
}

/** Um switch por cor no agrupamento — habilita/desabilita todas as numerações da cor de uma vez. */
export function CatalogoV2CorGrupoApiToggle({
  linhas,
  busy,
  onToggleGrupo,
  bloqueioLigarMotivo,
  onSemEstoqueAoLigar,
}: {
  linhas: LinhaCatalogoV2[];
  busy: boolean;
  onToggleGrupo: () => void;
  bloqueioLigarMotivo?: string | null;
  /** Chamado ao tentar ligar sem estoque — o pai exibe {@link HintSemEstoqueLigarBanner} no slot fixo do card. */
  onSemEstoqueAoLigar?: () => void;
}) {
  const elegiveisLigar = linhas.filter((l) => skuContaLimiteHabilitacaoSeller(l.sku) && l.ativo);
  const habilitadosNaCor = elegiveisLigar.filter((l) => l.habilitado);
  const todosHabilitadosNaCor =
    elegiveisLigar.length > 0 && elegiveisLigar.every((l) => l.habilitado);
  const algumHabilitadoNaCor = habilitadosNaCor.length > 0;
  const podeDesligarAlgum = linhas.some((l) => l.habilitado);
  const podeLigarAlgum = elegiveisLigar.some((l) => !l.habilitado);
  const bloqueadoSohLigar = Boolean((bloqueioLigarMotivo ?? "").trim()) && podeLigarAlgum;
  const disabled = busy || (!podeLigarAlgum && !podeDesligarAlgum) || bloqueadoSohLigar;

  const comHabilitado = linhas.filter((l) => l.habilitado);
  const saleTone: "ok" | "stale" | "off" =
    !algumHabilitadoNaCor ? "off" : comHabilitado.some((l) => !l.prontoParaVender) ? "stale" : "ok";

  const motivo = (bloqueioLigarMotivo ?? "").trim();
  const dicaToggle =
    elegiveisLigar.length === 0
      ? "Nenhuma variação ativa nesta cor para ligar na API."
      : "Liga ou desliga todas as numerações desta cor na API DropCore (pendências no cadastro não impedem ligar).";
  const ariaVendaGrupo = busy
    ? "Atualizando venda na API…"
    : bloqueadoSohLigar && motivo
      ? motivo
      : disabled
        ? "Não é possível alterar a venda na API para esta cor no momento."
        : todosHabilitadosNaCor
          ? "Desligar venda na API para todas as numerações desta cor"
          : "Ligar venda na API para todas as numerações desta cor";

  const corComEstoque = corGrupoTemEstoqueParaHabilitar(elegiveisLigar.map((l) => ({ estoque_atual: l.estoque })));

  const handleToggleGrupo = () => {
    if (disabled || busy) return;
    if (podeLigarAlgum && !corComEstoque) {
      onSemEstoqueAoLigar?.();
      return;
    }
    onToggleGrupo();
  };

  return (
    <div className="inline-flex shrink-0 max-w-full items-center gap-1.5 sm:gap-2" title={dicaToggle}>
      <span
        className={`hidden select-none text-[10px] font-medium leading-tight sm:inline sm:text-[11px] ${
          algumHabilitadoNaCor ? "text-emerald-700 dark:text-emerald-400" : "text-[var(--muted)]"
        }`}
      >
        Venda na API
        {algumHabilitadoNaCor && !todosHabilitadosNaCor ? (
          <span className="ml-1 tabular-nums text-[9px] font-semibold opacity-90">
            ({habilitadosNaCor.length}/{elegiveisLigar.length})
          </span>
        ) : null}
      </span>
      <VendaSwitch
        habilitado={algumHabilitadoNaCor}
        disabled={disabled}
        busy={busy}
        saleTone={saleTone}
        onToggle={handleToggleGrupo}
        ariaLabel={ariaVendaGrupo}
        hintTitle={
          algumHabilitadoNaCor && !todosHabilitadosNaCor
            ? `${habilitadosNaCor.length}/${elegiveisLigar.length} numerações ligadas na API. Toque para ${podeLigarAlgum ? "ligar o restante ou desligar todas" : "desligar todas"}.`
            : dicaToggle
        }
      />
    </div>
  );
}

export function CatalogoV2VariacaoApiToggle({
  linha,
  onToggleOne,
  busy,
  bloqueioLigarMotivo,
  onSemEstoqueAoLigar,
}: Props & { bloqueioLigarMotivo?: string | null; onSemEstoqueAoLigar?: () => void }) {
  const { item } = linha;
  const ativo = linha.ativo;
  const pronto = linha.prontoParaVender;
  const habilitado = linha.habilitado;
  const contaLimite = skuContaLimiteHabilitacaoSeller(linha.sku);
  const motivoBloqueio = (bloqueioLigarMotivo ?? "").trim();
  const bloqueadoArmazem = Boolean(motivoBloqueio) && !habilitado;
  const switchDisabled = busy || !ativo || !contaLimite || bloqueadoArmazem;
  const saleTone: "ok" | "stale" | "off" =
    !habilitado ? "off" : habilitado && !pronto ? "stale" : "ok";
  const falhas = ativo && !pronto ? skuReadinessLabelsFalha(item) : [];
  const hintTitle = bloqueadoArmazem
    ? motivoBloqueio
    : !ativo
      ? "Variação inativa no cadastro do fornecedor."
      : !contaLimite
        ? "SKU de sistema — não precisa habilitar na lista."
        : habilitado && falhas.length > 0
          ? `Ligado na API, mas o fornecedor ainda deve completar: ${falhas.join(", ")}.`
          : !habilitado && falhas.length > 0
            ? `Pode ligar na API. Pendências no cadastro (fornecedor): ${falhas.join(", ")}.`
            : "Liga ou desliga a venda deste SKU na API DropCore.";

  const handleToggleOne = () => {
    if (switchDisabled || busy) return;
    const vaiLigar = !habilitado;
    if (vaiLigar && !linha.corTemEstoqueParaHabilitar) {
      onSemEstoqueAoLigar?.();
      return;
    }
    onToggleOne(item, vaiLigar);
  };

  return (
    <VendaSwitch
      habilitado={habilitado}
      busy={busy}
      disabled={switchDisabled}
      saleTone={saleTone}
      onToggle={handleToggleOne}
      hintTitle={hintTitle}
      ariaLabel={hintTitle}
    />
  );
}

export function CatalogoV2VariacaoRow({ linha, onToggleOne, busy }: Props) {
  const { visible: hintSemEstoque, mostrar: mostrarHintSemEstoque } = useHintSemEstoqueLigar();
  const { item } = linha;
  const ativo = linha.ativo;
  const pronto = linha.prontoParaVender;
  const semEstoque = ativo && linha.estoque <= 0;
  const fraco = semEstoque || !ativo;

  const falhasLista = ativo && !pronto ? skuReadinessLabelsFalha(item) : [];
  const pendenciaTexto =
    falhasLista.length <= 2 ? falhasLista.join(" · ") : `${falhasLista.slice(0, 2).join(" · ")} · +${falhasLista.length - 2}`;

  const tituloVariacao = `${linha.cor?.trim() || "—"} · ${linha.tamanho?.trim() || "—"}`;

  return (
    <div
      className={`rounded-lg border border-[#e6eaee] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.035)] transition-all duration-200 ease-in-out hover:-translate-y-[1px] hover:shadow-[0_8px_16px_-12px_rgba(15,23,42,0.22)] dark:border-[#2c313a] dark:bg-[#1e222a] ${fraco ? "opacity-[0.82]" : ""}`}
    >
      <div className="border-b border-[#e6eaee] px-3.5 py-2.5 dark:border-[#2c313a]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-snug text-[#202223] dark:text-[#e8eaed]">{tituloVariacao}</p>
            <p className={`mt-0.5 truncate font-mono text-[10px] tracking-wide ${muted}`}>{linha.sku}</p>
          </div>
          <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
            <CatalogoV2VariacaoApiToggle
              linha={linha}
              onToggleOne={onToggleOne}
              busy={busy}
              onSemEstoqueAoLigar={mostrarHintSemEstoque}
            />
          </div>
        </div>
        {hintSemEstoque ? (
          <div className="mt-2">
            <HintSemEstoqueLigarBanner />
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-3.5 p-3.5 sm:gap-4">
        <ThumbModal url={linha.imagemUrl} />
        <div className="min-w-0 py-0.5">
          <p className={`truncate text-xs tabular-nums leading-tight ${muted}`}>
            Est. <span className="font-medium text-[#202223] dark:text-[#e3e5e8]">{linha.estoque}</span>
            <span className="mx-1 text-[#dcdfe4] dark:text-[#454b54]">·</span>
            {fmtMoney(linha.custo)}
          </p>
          {!ativo ? (
            <p className={`mt-1 line-clamp-2 text-[10px] leading-snug ${muted}`}>Variação inativa no cadastro.</p>
          ) : pronto ? (
            <p className="mt-1 text-[10px] font-medium leading-snug text-[#0f8b66]/78 dark:text-[#63cfa5]">Pronto para habilitar</p>
          ) : (
            <p
              className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#8f7c67] dark:text-[#c8b39f]"
              title={falhasLista.join(" · ")}
            >
              {pendenciaTexto}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
