"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { ThemeToggle } from "@/components/ThemeToggle";

type EtiquetaItem = {
  sku_id: string | null;
  sku: string | null;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  categoria: string | null;
  quantidade: number;
  valor_total: number;
};

type EtiquetaResponse = {
  pedido: {
    id: string;
    status: string;
    criado_em: string;
    valor_fornecedor: number;
    referencia_externa: string | null;
    seller_nome: string;
    etiqueta_pdf_url: string | null;
    etiqueta_pdf_base64: string | null;
    tracking_codigo: string | null;
    metodo_envio: string | null;
    etiqueta_tentativas: number;
  };
  itens: EtiquetaItem[];
  eventos?: Array<{
    id: string;
    tipo: string;
    origem: string;
    descricao: string | null;
    criado_em: string;
    metadata?: Record<string, unknown> | null;
  }>;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDateTime(s: string | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function FornecedorPedidoEtiquetaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pedidoId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [etiqueta, setEtiqueta] = useState<EtiquetaResponse | null>(null);
  const [lembrando, setLembrando] = useState(false);
  const [lembrarMsg, setLembrarMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const referencia = useMemo(() => etiqueta?.pedido?.referencia_externa ?? etiqueta?.pedido?.id ?? "—", [etiqueta]);
  const temEtiqueta = Boolean(etiqueta?.pedido?.etiqueta_pdf_url || etiqueta?.pedido?.etiqueta_pdf_base64);

  async function load() {
    if (!pedidoId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }

      const res = await fetch(`/api/fornecedor/pedidos/${pedidoId}/etiqueta`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar etiqueta.");

      setEtiqueta(json as EtiquetaResponse);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [pedidoId]);

  useEffect(() => {
    if (!etiqueta || !temEtiqueta) return;
    // Só dispara impressão automática quando existe etiqueta oficial de verdade — sem
    // etiqueta não tem o que imprimir.
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [etiqueta, temEtiqueta]);

  const [reportando, setReportando] = useState(false);

  async function reportarEtiquetaErrada() {
    if (!pedidoId) return;
    if (!window.confirm("Confirma que essa etiqueta está errada pra esse pedido? Isso remove a etiqueta e avisa o seller de novo.")) {
      return;
    }
    setReportando(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const res = await fetch(`/api/fornecedor/pedidos/${pedidoId}/reportar-etiqueta-errada`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao reportar etiqueta.");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao reportar etiqueta.");
    } finally {
      setReportando(false);
    }
  }

  async function lembrarSeller() {
    if (!pedidoId) return;
    setLembrando(true);
    setLembrarMsg(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const res = await fetch(`/api/fornecedor/pedidos/${pedidoId}/lembrar-etiqueta`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao avisar o seller.");
      setLembrarMsg({ tipo: "ok", texto: "Seller avisado agora." });
    } catch (e: unknown) {
      setLembrarMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro inesperado." });
    } finally {
      setLembrando(false);
    }
  }

  const shouldRender = !loading && !error && etiqueta;

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-0 md:pt-14 pb-8">
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="dropcore-shell-4xl py-5">
        {!shouldRender && (
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm p-5 text-center">
            {loading ? "Carregando etiqueta..." : error ?? "Erro."}
          </div>
        )}

        {shouldRender && etiqueta && (
          <div>
            <div className="no-print flex items-center justify-between gap-3 mb-4">
              <div className="text-sm text-neutral-600 dark:text-neutral-400">
                Pedido <span className="font-semibold text-neutral-900 dark:text-neutral-100">{referencia}</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ThemeToggle className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-1.5 shrink-0" />
                {temEtiqueta && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const url = etiqueta.pedido.etiqueta_pdf_url;
                        const b64 = etiqueta.pedido.etiqueta_pdf_base64;
                        const finalUrl = url ?? (b64 ? `data:application/pdf;base64,${b64}` : "");
                        if (!finalUrl) return;
                        window.open(finalUrl, "_blank", "noopener,noreferrer");
                      }}
                      className="rounded-lg border border-sky-200 dark:border-sky-900/60 bg-sky-100 dark:bg-sky-950/20 px-3 py-1.5 text-sm font-semibold text-sky-800 dark:text-sky-300 hover:bg-sky-100/70 dark:hover:bg-sky-950/35"
                      title="Abrir etiqueta oficial do marketplace/transportadora"
                    >
                      Abrir etiqueta oficial
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      type="button"
                    >
                      Imprimir
                    </button>
                    <button
                      type="button"
                      onClick={() => void reportarEtiquetaErrada()}
                      disabled={reportando}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--danger)] underline decoration-dotted underline-offset-2 hover:opacity-80"
                      title="A etiqueta não é do pedido certo (endereço/produto não bate)"
                    >
                      {reportando ? "Reportando..." : "Etiqueta errada?"}
                    </button>
                  </>
                )}
                <button
                  onClick={() => router.back()}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  type="button"
                >
                  Voltar
                </button>
              </div>
            </div>

            {!temEtiqueta ? (
              <div className="no-print">
                <div
                  role="status"
                  className="relative overflow-hidden rounded-xl border border-[var(--danger)]/55 bg-transparent shadow-sm shadow-red-500/10 dark:border-red-400/55 dark:bg-transparent dark:shadow-none"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-[var(--danger)] to-red-600 opacity-95 dark:from-red-400 dark:to-red-500 dark:opacity-100"
                  />
                  <div className="pl-4 pr-3 py-3 sm:pl-5 sm:pr-4 sm:py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 dark:border-red-400/55 dark:bg-transparent">
                          <svg
                            className="h-5 w-5 text-[var(--danger)] dark:text-red-300"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        </span>
                        <div className="min-w-0">
                          <p className="text-base font-bold leading-snug tracking-tight text-[var(--danger)] dark:text-red-300">
                            Sem etiqueta
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                            A Olist ainda não gerou a etiqueta real de envio desse pedido — isso
                            depende do seller (só ele tem acesso à Olist). Não é um problema seu:
                            use o botão ao lado pra lembrar o seller de ir buscar o link.
                          </p>
                        </div>
                      </div>
                      <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
                        <button
                          type="button"
                          onClick={lembrarSeller}
                          disabled={lembrando}
                          className="w-full shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors bg-[var(--danger)] hover:opacity-90 dark:bg-red-500 dark:hover:bg-red-400 dark:hover:opacity-100 dark:shadow-sm dark:shadow-red-950/50 dark:ring-1 dark:ring-inset dark:ring-white/20 sm:w-auto"
                        >
                          {lembrando ? "Avisando..." : "Lembrar seller"}
                        </button>
                        {lembrarMsg && (
                          <span
                            className={
                              lembrarMsg.tipo === "ok"
                                ? "text-[11px] text-emerald-600 dark:text-emerald-400"
                                : "text-[11px] text-[var(--danger)]"
                            }
                          >
                            {lembrarMsg.texto}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {etiqueta.itens.length > 0 && (
                  <div className="mt-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                      Itens do pedido (pra separar enquanto espera)
                    </h3>
                    <ul className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                      {etiqueta.itens.map((it, idx) => (
                        <li key={`${it.sku_id ?? "none"}-${idx}`}>
                          {it.nome_produto ?? "—"}
                          {it.cor ? ` · Cor: ${it.cor}` : ""}
                          {it.tamanho ? ` · Tamanho: ${it.tamanho}` : ""}
                          {" · Qtd: "}
                          {it.quantidade}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Layout “compacto” pensado para impressora térmica */}
                <div className="bg-white dark:bg-white text-black dark:text-black">
                  <div style={{ width: "80mm", margin: "0 auto", padding: "6px 8px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                      ETIQUETA DE SEPARAÇAO
                    </div>

                    <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                      <div><b>Pedido:</b> {referencia}</div>
                      <div><b>Seller:</b> {etiqueta.pedido.seller_nome}</div>
                      <div><b>Data:</b> {formatDateTime(etiqueta.pedido.criado_em)}</div>
                      <div><b>Valor (fornecedor):</b> {BRL.format(etiqueta.pedido.valor_fornecedor ?? 0)}</div>
                      {etiqueta.pedido.tracking_codigo && (
                        <div><b>Rastreio:</b> {etiqueta.pedido.tracking_codigo}</div>
                      )}
                      {etiqueta.pedido.metodo_envio && (
                        <div><b>Método envio:</b> {etiqueta.pedido.metodo_envio}</div>
                      )}
                    </div>

                    <div style={{ height: 8 }} />
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      ITENS
                    </div>

                    <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                      {etiqueta.itens.map((it, idx) => (
                        <div key={`${it.sku_id ?? "none"}-${idx}`} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: idx === etiqueta.itens.length - 1 ? "none" : "1px dashed #ccc" }}>
                          <div><b>Produto:</b> {it.nome_produto ?? "—"}</div>
                          <div>{it.cor ? `Cor: ${it.cor}` : "Cor: —"} · {it.tamanho ? `Tamanho: ${it.tamanho}` : "Tamanho: —"}</div>
                          <div>{it.categoria ? `Categoria: ${it.categoria}` : "Categoria: —"}</div>
                          <div><b>Qtd:</b> {it.quantidade}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ height: 10 }} />
                    <div style={{ fontSize: 10.5, color: "#222" }}>
                      Observação: o sistema hoje não possui endereço/CEP/ticket de frete do cliente; esta etiqueta é para separação de embalagem.
                    </div>
                  </div>
                </div>
              </>
            )}

            {(etiqueta.eventos?.length ?? 0) > 0 && (
              <div className="no-print mt-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-[var(--card)] p-4">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Histórico do pedido</h3>
                <div className="space-y-2">
                  {etiqueta.eventos!.map((ev) => (
                    <div key={ev.id} className="text-xs text-neutral-700 dark:text-neutral-300">
                      <span className="font-medium">{formatDateTime(ev.criado_em)}</span>
                      {" · "}
                      <span className="uppercase text-[10px] tracking-wide">{ev.origem}</span>
                      {" · "}
                      <span>{ev.descricao ?? ev.tipo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
