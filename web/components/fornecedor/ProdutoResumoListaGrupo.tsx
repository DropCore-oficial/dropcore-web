"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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

function filled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

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

type StatusVariant = "aprovado" | "pendente" | "erro" | "opcional" | "analise";

function StatusBadge({ text, variant }: { text: string; variant: StatusVariant }) {
  const cls =
    variant === "aprovado"
      ? "bg-green-100 text-green-700 border-green-200"
      : variant === "pendente"
        ? "bg-yellow-100 text-yellow-700 border-yellow-200"
        : variant === "erro"
          ? "bg-red-100 text-red-600 border-red-200"
          : variant === "analise"
            ? "bg-blue-100 text-blue-800 border-blue-200"
            : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium border ${cls}`}>
      {text}
    </span>
  );
}

function FieldRow({
  label,
  value,
  ok,
  optional = false,
}: {
  label: string;
  value: ReactNode;
  ok: boolean;
  optional?: boolean;
}) {
  const statusText = optional ? "Opcional" : ok ? "Completo" : "Pendente";
  const icon = optional ? "➖" : ok ? "✔️" : "⚠️";
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-500 dark:text-neutral-400">{label}</p>
        <div className="mt-0.5 break-words text-sm font-medium leading-snug text-gray-800 dark:text-neutral-100">{value}</div>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          {icon} {statusText}
        </p>
      </div>
    </div>
  );
}

function MiniCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900">
      <h4 className="text-base font-semibold text-gray-900 dark:text-neutral-100">{title}</h4>
      {subtitle ? <p className="mt-0.5 text-sm text-gray-500 dark:text-neutral-400">{subtitle}</p> : null}
      <div className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  status,
  tone = "neutral",
}: {
  label: string;
  value: string;
  status?: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-green-700 dark:text-green-300"
      : tone === "warning"
        ? "text-yellow-700 dark:text-yellow-300"
        : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all duration-200 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900">
      <p className="text-sm text-gray-500 dark:text-neutral-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {status ? <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">{status}</p> : null}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-800">
      <div
        className="h-full rounded-full bg-blue-500 transition-all duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function GradeBadge({ value }: { value: number }) {
  const variant: StatusVariant = value >= 85 ? "aprovado" : value >= 70 ? "analise" : "pendente";
  return <StatusBadge text={`${value}% concluído`} variant={variant} />;
}

type AcaoPrioritaria = {
  id: string;
  titulo: string;
  impacto: "alto" | "medio";
};

function SummaryShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="border-t border-neutral-200 bg-white px-3 py-4 dark:border-neutral-800 dark:bg-neutral-900 sm:px-4"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

type Props = {
  grupoKey: string;
  pai: ProdutoResumoLista | null;
  filhosVariantes: ProdutoResumoLista[];
  representante: ProdutoResumoLista;
  linkAlbum: string | null;
  editHref: string;
};

export function ProdutoResumoListaGrupo({
  grupoKey,
  pai,
  filhosVariantes,
  representante,
  linkAlbum,
  editHref,
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
        const res = await fetch(
          `/api/fornecedor/produtos/tabela-medidas?grupoKey=${encodeURIComponent(grupoKey)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }
        );
        if (!res.ok || cancel) return;
        const data = await res.json();
        const fonte = data.pendente ?? data.aprovada ?? null;
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
  }, [grupoKey]);

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
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-gray-500 dark:text-neutral-400">Resumo do cadastro</p>
            <h3 className="mt-1 text-base font-semibold text-gray-900 dark:text-neutral-100">
              Qualidade dos dados do produto · Premium v2
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-neutral-300">
              Visual premium para revisão rápida. <strong>Foto</strong> é por SKU; <strong>Ver</strong> abre o álbum/link principal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <GradeBadge value={score} />
            <Link
              href={editHref}
              className="inline-flex h-8 items-center justify-center rounded-md bg-blue-600 px-3.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              Completar dados
            </Link>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-neutral-300">
            <span>Completude geral</span>
            <span className="tabular-nums font-semibold">{score}%</span>
          </div>
          <ProgressBar value={score} />
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Próximas ações prioritárias</p>
            <Link
              href={editHref}
              className="inline-flex h-7 items-center justify-center rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition hover:bg-blue-700"
            >
              Resolver agora
            </Link>
          </div>
          {acoesPrioritarias.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {acoesPrioritarias.map((acao) => (
                <span
                  key={acao.id}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                    acao.impacto === "alto"
                      ? "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-neutral-900 dark:text-slate-200"
                  }`}
                >
                  {acao.impacto === "alto" ? "Alta prioridade" : "Melhoria"} · {acao.titulo}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-blue-800 dark:text-blue-300">Produto bem preenchido. Faça apenas ajustes finos antes de publicar.</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
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
        <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3 dark:border-neutral-700">
          <p className="text-sm text-gray-500 dark:text-neutral-400">Diagnóstico completo</p>
          <button
            type="button"
            onClick={() => setMostrarDetalhes((v) => !v)}
            className="inline-flex h-8 items-center rounded-xl border border-gray-300 bg-white px-4 text-[13px] font-medium text-gray-700 shadow-sm transition hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {mostrarDetalhes ? "Ocultar detalhes" : "Ver detalhes"}
          </button>
        </div>
      </div>

      {mostrarDetalhes && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
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
                    <a href={linkAlbum!} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 underline underline-offset-2 dark:text-blue-400">
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
