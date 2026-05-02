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

  const referencia = useMemo(() => etiqueta?.pedido?.referencia_externa ?? etiqueta?.pedido?.id ?? "—", [etiqueta]);

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
    if (!etiqueta) return;
    // Dispara a impressão automaticamente apenas quando não houver etiqueta oficial.
    // Se houver etiqueta oficial (PDF), o fornecedor pode abrir e imprimir direto.
    if (etiqueta.pedido.etiqueta_pdf_url || etiqueta.pedido.etiqueta_pdf_base64) return;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [etiqueta]);

  const shouldRender = !loading && !error && etiqueta;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-0 md:pt-14 pb-8">
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
                Etiqueta de separação · Pedido <span className="font-semibold text-neutral-900 dark:text-neutral-100">{referencia}</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ThemeToggle className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-1.5 shrink-0" />
                    {(etiqueta.pedido.etiqueta_pdf_url || etiqueta.pedido.etiqueta_pdf_base64) && (
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
                    )}
                <button
                  onClick={() => window.print()}
                  className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  type="button"
                >
                  Imprimir
                </button>
                <button
                  onClick={() => router.back()}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  type="button"
                >
                  Voltar
                </button>
              </div>
            </div>

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

