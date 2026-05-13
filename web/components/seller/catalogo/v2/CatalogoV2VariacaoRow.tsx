"use client";

import { useState } from "react";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import { skuContaLimiteHabilitacaoSeller } from "@/lib/sellerSkuHabilitado";
import { skuReadinessLabelsFalha } from "@/lib/sellerSkuReadiness";
import type { LinhaCatalogoV2 } from "./aggregates";
import { catalogoV2UrlImagem } from "./catalogoV2Imagem";

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
  /** Rótulo para leitores de tela (ex.: ação do switch por cor na API). */
  ariaLabel?: string;
  /** Dica nativa do botão (quando não está no estado “cadastro incompleto”). */
  hintTitle?: string;
}) {
  const track =
    saleTone === "stale"
      ? "bg-[#c7c9c2] ring-1 ring-[#b8baae]/45 dark:bg-[#666a63] dark:ring-[#7b8077]/40"
      : habilitado
        ? "bg-[#0f8b66] ring-1 ring-[#0f8b66]/25 dark:bg-[#16956f] dark:ring-[#16956f]/30"
        : "bg-[#dfe3e8] ring-1 ring-black/[0.05] dark:bg-[#3f4652] dark:ring-white/[0.08]";
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

/** Um switch por cor no agrupamento — habilita/desabilita todas as numerações da cor de uma vez. */
export function CatalogoV2CorGrupoApiToggle({
  linhas,
  busy,
  onToggleGrupo,
  bloqueioLigarMotivo,
}: {
  linhas: LinhaCatalogoV2[];
  busy: boolean;
  onToggleGrupo: () => void;
  /** Impede ligar na API (ex.: sem armazém gravado); desligar continua permitido quando todas as elegíveis já estão on. */
  bloqueioLigarMotivo?: string | null;
}) {
  const elegiveisLigar = linhas.filter(
    (l) => skuContaLimiteHabilitacaoSeller(l.sku) && l.ativo && l.prontoParaVender,
  );
  const todosHabilitadosNaCor =
    elegiveisLigar.length > 0 && elegiveisLigar.every((l) => l.habilitado);
  const podeDesligarAlgum = linhas.some((l) => l.habilitado);
  const podeLigarAlgum = elegiveisLigar.some((l) => !l.habilitado);
  const bloqueadoSohLigar = Boolean((bloqueioLigarMotivo ?? "").trim()) && podeLigarAlgum;
  const disabled = busy || (!podeLigarAlgum && !podeDesligarAlgum) || bloqueadoSohLigar;

  const comHabilitado = linhas.filter((l) => l.habilitado);
  const saleTone: "ok" | "stale" | "off" =
    comHabilitado.length === 0 ? "off" : comHabilitado.some((l) => !l.prontoParaVender) ? "stale" : "ok";

  const dicaToggle =
    "Liga ou desliga todas as numerações desta cor no catálogo da DropCore (venda na API).";
  const motivo = (bloqueioLigarMotivo ?? "").trim();
  const ariaVendaGrupo = busy
    ? "Atualizando venda na API…"
    : bloqueadoSohLigar && motivo
      ? motivo
      : disabled
        ? "Não é possível alterar a venda na API para esta cor no momento."
        : todosHabilitadosNaCor
          ? "Desligar venda na API para todas as numerações desta cor"
          : "Ligar venda na API para todas as numerações desta cor";

  const titleWrapper = bloqueadoSohLigar && motivo ? motivo : dicaToggle;
  const hintSwitch = bloqueadoSohLigar && motivo ? motivo : dicaToggle;

  return (
    <div className="inline-flex shrink-0 max-w-full items-center gap-1.5 sm:gap-2" title={titleWrapper}>
      <span className="select-none text-[10px] font-medium leading-tight text-[var(--muted)] sm:text-[11px]">
        Venda na API
      </span>
      <VendaSwitch
        habilitado={todosHabilitadosNaCor}
        disabled={disabled}
        busy={busy}
        saleTone={saleTone}
        onToggle={onToggleGrupo}
        ariaLabel={ariaVendaGrupo}
        hintTitle={hintSwitch}
      />
    </div>
  );
}

/** Mesma regra do card completo — use onde o switch da API ERP fica fora do `CatalogoV2VariacaoRow`. */
export function CatalogoV2VariacaoApiToggle({ linha, onToggleOne, busy }: Props) {
  const { item } = linha;
  const ativo = linha.ativo;
  const pronto = linha.prontoParaVender;
  const habilitado = linha.habilitado;
  const contaLimite = skuContaLimiteHabilitacaoSeller(linha.sku);
  const podeLigar = Boolean(contaLimite && ativo && pronto);
  const switchDisabled = busy || !ativo || (!habilitado && !podeLigar);
  const saleTone: "ok" | "stale" | "off" =
    !habilitado ? "off" : habilitado && !pronto ? "stale" : "ok";
  return (
    <VendaSwitch
      habilitado={habilitado}
      busy={busy}
      disabled={switchDisabled}
      saleTone={saleTone}
      onToggle={() => onToggleOne(item, !habilitado)}
    />
  );
}

export function CatalogoV2VariacaoRow({ linha, onToggleOne, busy }: Props) {
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
      <div className="flex items-start justify-between gap-3 border-b border-[#e6eaee] px-3.5 py-2.5 dark:border-[#2c313a]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug text-[#202223] dark:text-[#e8eaed]">{tituloVariacao}</p>
          <p className={`mt-0.5 truncate font-mono text-[10px] tracking-wide ${muted}`}>{linha.sku}</p>
        </div>
        <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
          <CatalogoV2VariacaoApiToggle linha={linha} onToggleOne={onToggleOne} busy={busy} />
        </div>
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
