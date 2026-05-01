"use client";

import { useEffect, useState, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Notif = {
  id: string;
  titulo: string;
  mensagem: string;
  tipo?: string;
  lido: boolean;
  criado_em: string;
  metadata?: {
    deposito_id?: string;
    mensalidade_id?: string;
    pedido_id?: string;
    repasse_id?: string;
    alteracao_id?: string;
  };
};

const TIPOS_POR_CONTEXTO: Record<string, string[]> = {
  /** Resumo de inadimplência da org — só faz sentido no painel admin */
  admin: [
    "deposito_entrou",
    "mensalidade_inadimplentes_org",
    "mensalidade_vencendo",
    "mensalidade_paga_admin",
    "alteracao_produto_pendente",
  ],
  seller: ["deposito_aprovado", "estoque_baixo", "mensalidade_vencida", "mensalidade_vencendo", "saldo_baixo"],
  /** Sem tipo de admin: fornecedor em trial não vê alerta de «X fornecedores inadimplentes» */
  fornecedor: [
    "mensalidade_paga",
    "mensalidade_vencida",
    "mensalidade_vencendo",
    "estoque_baixo",
    "pedido_para_postar",
    "repasse_recebido",
    "alteracao_aprovada",
    "alteracao_rejeitada",
  ],
};

export function NotificationBell({ className = "", context = "admin" }: { className?: string; context?: "admin" | "seller" | "fornecedor" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const tiposPermitidos = TIPOS_POR_CONTEXTO[context] ?? [];
  const itemsFiltrados = context
    ? items.filter((n) => {
        if (n.tipo && !tiposPermitidos.includes(n.tipo)) return false;
        // Legado: resumo da org ia como mensalidade_vencida — não mostrar em seller/fornecedor
        if (
          (context === "seller" || context === "fornecedor") &&
          n.tipo === "mensalidade_vencida" &&
          n.titulo === "Mensalidades vencidas"
        ) {
          return false;
        }
        return true;
      })
    : items;
  const unreadCount = itemsFiltrados.filter((n) => !n.lido).length;

  const fetchNotifs = async (markRead = false) => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications${markRead ? "?mark_read=1" : ""}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setItems((json.items ?? []).slice(0, 20).map((it: Notif) => ({
        ...it,
        metadata: it.metadata ?? {},
      })));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
    const t = setInterval(() => fetchNotifs(), 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (open) fetchNotifs(true);
        }}
        className={`group relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200 ${
          open
            ? "border-emerald-400 dark:border-emerald-600 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shadow-sm"
            : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900 hover:text-emerald-600 dark:hover:text-emerald-400"
        }`}
        title="Notificações"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-neutral-900 shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fechar notificações"
            className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[1px] md:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed left-3 right-3 top-[max(5.5rem,env(safe-area-inset-top)+4rem)] z-[100] max-h-[min(70vh,calc(100dvh-7rem))] w-auto overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl shadow-neutral-900/10 dark:shadow-black/20 animate-in fade-in-0 zoom-in-95 duration-200 md:absolute md:inset-x-auto md:left-auto md:right-0 md:top-full md:mt-2 md:max-h-72 md:w-80 md:translate-x-0"
          >
          <div className="border-b border-neutral-100 dark:border-neutral-800 bg-emerald-100 dark:bg-emerald-950 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                </span>
                Notificações
              </span>
              {itemsFiltrados.length > 0 && unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => fetchNotifs(true)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
                >
                  Marcar todas
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading && itemsFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-500 dark:border-emerald-800 dark:border-t-emerald-400" />
                <p className="text-xs text-neutral-500">Carregando...</p>
              </div>
            ) : itemsFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 px-4">
                <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-neutral-400">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Nenhuma notificação</p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500 text-center">Você receberá alertas de depósitos e outras atividades aqui</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {itemsFiltrados.map((n) => {
                  const isExpanded = expandedId === n.id;
                  const isDeposito = n.tipo === "deposito_aprovado" || n.tipo === "deposito_entrou";
                  const isMensalidadePagaAdmin = n.tipo === "mensalidade_paga_admin";
                  const isAlteracaoProduto = n.tipo === "alteracao_produto_pendente";
                  const isFornecedor = ["mensalidade_paga", "mensalidade_vencida", "mensalidade_vencendo", "estoque_baixo", "pedido_para_postar", "repasse_recebido", "saldo_baixo"].includes(n.tipo ?? "");
                  return (
                    <div
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedId(isExpanded ? null : n.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : n.id);
                        }
                      }}
                      className={`flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 active:bg-neutral-100 dark:active:bg-neutral-800 ${
                        !n.lido ? "bg-emerald-100 dark:bg-emerald-950" : ""
                      }`}
                    >
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        !n.lido
                          ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400"
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-500"
                      }`}>
                        {isDeposito ? (
                          <span className="text-sm">💰</span>
                        ) : isMensalidadePagaAdmin ? (
                          <span className="text-sm">✅</span>
                        ) : isAlteracaoProduto ? (
                          <span className="text-sm">📦</span>
                        ) : isFornecedor ? (
                          <span className="text-sm">📋</span>
                        ) : (
                          <span className="text-sm">📌</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{n.titulo}</p>
                        {n.mensagem && (
                          <p className={`mt-0.5 text-xs text-neutral-600 dark:text-neutral-400 ${isExpanded ? "" : "line-clamp-2"}`}>
                            {n.mensagem}
                          </p>
                        )}
                        <p className="mt-1.5 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
                          {new Date(n.criado_em).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {isExpanded && (
                          <>
                            {n.tipo === "deposito_entrou" && (
                              <a
                                href={n.metadata?.deposito_id ? `/admin/depositos-pix?destaque=${n.metadata.deposito_id}` : "/admin/depositos-pix"}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                Ver este depósito →
                              </a>
                            )}
                            {n.tipo === "deposito_aprovado" && (
                              <a
                                href={n.metadata?.deposito_id ? `/seller/dashboard?tab=depositos&destaque=${n.metadata.deposito_id}` : "/seller/dashboard"}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                Ver este depósito →
                              </a>
                            )}
                            {n.tipo === "mensalidade_paga" && (
                              <a
                                href="/fornecedor/dashboard"
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                Ir ao dashboard →
                              </a>
                            )}
                            {n.tipo === "mensalidade_paga_admin" && (
                              <a
                                href={n.metadata?.mensalidade_id ? `/admin/mensalidades?destaque=${n.metadata.mensalidade_id}` : "/admin/mensalidades"}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                Ver esta mensalidade →
                              </a>
                            )}
                            {n.tipo === "alteracao_produto_pendente" && (
                              <a
                                href={
                                  n.metadata?.alteracao_id
                                    ? `/admin/alteracoes-produtos?destaque=${n.metadata.alteracao_id}`
                                    : "/admin/alteracoes-produtos"
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                Abrir alterações de produtos →
                              </a>
                            )}
                            {n.tipo === "mensalidade_inadimplentes_org" && (
                              <a
                                href="/admin/mensalidades"
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                              >
                                Ver mensalidades →
                              </a>
                            )}
                            {(n.tipo === "mensalidade_vencida" || n.tipo === "mensalidade_vencendo") && (
                              <a
                                href={context === "fornecedor" ? "/fornecedor/dashboard?pagar=1" : context === "seller" ? "/seller/dashboard?pagar=1" : "/admin/mensalidades"}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                              >
                                {context === "admin" ? "Ver mensalidades →" : "Pagar agora →"}
                              </a>
                            )}
                            {n.tipo === "saldo_baixo" && (
                              <a
                                href="/seller/dashboard"
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                              >
                                Depositar PIX →
                              </a>
                            )}
                            {n.tipo === "estoque_baixo" && (
                              <a
                                href={context === "seller" ? "/seller/produtos" : "/fornecedor/produtos?estoqueBaixo=1"}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                              >
                                {context === "seller" ? "Ver catálogo →" : "Ver produtos →"}
                              </a>
                            )}
                            {n.tipo === "pedido_para_postar" && (
                              <a
                                href="/fornecedor/pedidos?status=enviado"
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
                              >
                                Ver pedidos →
                              </a>
                            )}
                            {n.tipo === "repasse_recebido" && (
                              <a
                                href="/fornecedor/dashboard"
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                Ver repasses →
                              </a>
                            )}
                          </>
                        )}
                      </div>
                      {!n.lido && <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 mt-2" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </>
      )}
    </div>
  );
}
