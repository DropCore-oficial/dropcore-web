"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";

export default function SellerIntegracoesErpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [blingCompanyId, setBlingCompanyId] = useState("");
  const [blingWebhookUrl, setBlingWebhookUrl] = useState("");
  const [blingEvents, setBlingEvents] = useState<
    Array<{ id: string; event_type: string | null; bling_event_id: string | null; criado_em: string }>
  >([]);
  const [blingUnavailable, setBlingUnavailable] = useState(false);
  const [blingSaving, setBlingSaving] = useState(false);
  const [blingCopied, setBlingCopied] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diag, setDiag] = useState<{
    has_key: boolean;
    key_prefix: string | null;
    fornecedor_vinculado: boolean;
    integracao_pronta: boolean;
    endpoint: string;
    mode: string;
    suggested_sync_interval_minutes: number;
    rate_limit_usage?: {
      post_api_key_count: number;
      patch_api_key_count: number;
      post_api_key_limit: number;
      patch_api_key_limit: number;
    };
    rate_limit_unavailable?: boolean;
    eventos: Array<{
      id: string;
      tipo_evento: string;
      status_processamento: string;
      erro: string | null;
      referencia_externa: string | null;
      criado_em: string;
      processado_em: string | null;
    }>;
    eventos_unavailable?: boolean;
  } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/erp-api-key", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar.");
      setHasKey(json.has_key ?? false);
      setPrefix(json.prefix ?? null);
      await loadDiagnostics(session.access_token);
      await loadBling(session.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDiagnostics(token?: string) {
    setDiagLoading(true);
    try {
      let accessToken = token;
      if (!accessToken) {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        accessToken = session?.access_token;
      }
      if (!accessToken) return;

      const res = await fetch("/api/seller/erp-diagnostics", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao consultar diagnóstico.");
      setDiag(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao consultar diagnóstico.");
    } finally {
      setDiagLoading(false);
    }
  }

  async function loadBling(token?: string) {
    try {
      let accessToken = token;
      if (!accessToken) {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        accessToken = session?.access_token;
      }
      if (!accessToken) return;
      const res = await fetch("/api/seller/bling", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar Bling.");
      setBlingUnavailable(Boolean(json.bling_unavailable));
      setBlingWebhookUrl(typeof json.webhook_url === "string" ? json.webhook_url : "");
      setBlingCompanyId(typeof json.bling_company_id === "string" ? json.bling_company_id : "");
      setBlingEvents(Array.isArray(json.bling_events) ? json.bling_events : []);
    } catch {
      /* não bloquear página inteira */
    }
  }

  async function salvarBling() {
    setBlingSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/bling", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bling_company_id: blingCompanyId.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao salvar.");
      setBlingCompanyId(json.bling_company_id ?? blingCompanyId.trim());
      await loadBling(session.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar Bling.");
    } finally {
      setBlingSaving(false);
    }
  }

  function copiarWebhookBling() {
    if (blingWebhookUrl) {
      navigator.clipboard.writeText(blingWebhookUrl);
      setBlingCopied(true);
      setTimeout(() => setBlingCopied(false), 2000);
    }
  }

  async function gerarChave() {
    setGenerating(true);
    setError(null);
    setNewKey(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/erp-api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao gerar chave.");
      setNewKey(json.api_key ?? null);
      setPrefix(json.prefix ?? null);
      setHasKey(true);
      await loadDiagnostics(session.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao gerar chave.");
    } finally {
      setGenerating(false);
    }
  }

  function copiarChave() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <SellerNav active="integracoes" />
      <div className="w-full max-w-2xl mx-auto dropcore-px-wide py-6 lg:py-8">
        <SellerPageHeader
          title="Integração ERP"
          subtitle={
            <>
              Conecte seu ERP ao DropCore para enviar pedidos automaticamente (fluxo <strong>marketplace → ERP → DropCore</strong>).
              <span className="block mt-1.5 text-neutral-600 dark:text-neutral-300">
                Cada linha de pedido na API deve referenciar o <strong>mesmo SKU</strong> exibido em <strong>Catálogo</strong> no painel do seller — sem esse alinhamento, estoque e saldo não batem.
              </span>
            </>
          }
        />

        {loading ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm p-12 text-center">
            <span className="inline-block w-8 h-8 border-2 border-neutral-200 dark:border-neutral-700 border-t-emerald-500 rounded-full animate-spin mb-3" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">Carregando…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-5 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        ) : (
          <>
            {newKey ? (
              <div className="rounded-2xl border border-emerald-200/90 dark:border-emerald-800/60 bg-emerald-50/90 dark:bg-emerald-950/40 shadow-md p-6 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                  </div>
                  <p className="text-emerald-700 dark:text-emerald-300 font-semibold text-sm">Chave gerada com sucesso</p>
                </div>
                <p className="text-emerald-600 dark:text-emerald-400 text-xs mb-4">Guarde em local seguro. Ela não será exibida novamente.</p>
                <div className="flex items-center gap-2 p-4 bg-white dark:bg-neutral-900/60 rounded-xl border border-emerald-200/60 dark:border-emerald-800/50 font-mono text-xs break-all">
                  <code className="flex-1 text-neutral-900 dark:text-neutral-100">{newKey}</code>
                  <button
                    type="button"
                    onClick={copiarChave}
                    className="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-medium text-white transition-colors"
                  >
                    {copied ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-700/50 bg-white dark:bg-neutral-900/80 shadow-md hover:shadow-lg transition-shadow p-6 mb-6">
                <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-4">
                  {hasKey ? `Chave configurada (termina em …${prefix ?? ""})` : "Nenhuma chave configurada"}
                </p>
                <button
                  type="button"
                  onClick={gerarChave}
                  disabled={generating}
                  className="rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-5 py-2.5 text-sm font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {generating ? "Gerando…" : hasKey ? "Gerar nova chave" : "Gerar chave API"}
                </button>
                {hasKey && !newKey && (
                  <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-3">Gerar uma nova chave invalida a anterior.</p>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-800/50 bg-white dark:bg-neutral-900/80 shadow-md p-6 mb-6">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Bling</h2>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-4">
                Conecte sua conta: use o app DropCore no Bling Developers, cole a URL do webhook abaixo e informe aqui o{" "}
                <strong>companyId</strong> da sua empresa (vem no payload e nos dados da empresa na API).
              </p>
              {blingUnavailable ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Tabelas Bling não encontradas. Execute o script <code className="text-xs">add-seller-bling.sql</code> no Supabase.
                </p>
              ) : (
                <>
                  <label className="block text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">URL do webhook (no Bling)</label>
                  <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <code className="flex-1 text-xs break-all rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2 text-neutral-900 dark:text-neutral-100">
                      {blingWebhookUrl || (typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/bling` : "/api/webhooks/bling")}
                    </code>
                    <button
                      type="button"
                      onClick={copiarWebhookBling}
                      className="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-medium text-white"
                    >
                      {blingCopied ? "Copiado!" : "Copiar URL"}
                    </button>
                  </div>
                  <label className="block text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">ID da empresa no Bling (companyId)</label>
                  <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <input
                      type="text"
                      value={blingCompanyId}
                      onChange={(e) => setBlingCompanyId(e.target.value)}
                      placeholder="ex.: d4475854366a36c86a37e792f9634a51"
                      className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      onClick={salvarBling}
                      disabled={blingSaving}
                      className="shrink-0 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-5 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      {blingSaving ? "Salvando…" : "Salvar"}
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-3">
                    No servidor de produção, configure <code className="text-xs">BLING_CLIENT_SECRET</code> com o client secret do aplicativo DropCore. Em desenvolvimento local use{" "}
                    <code className="text-xs">BLING_WEBHOOK_SKIP_VERIFY=true</code> no <code className="text-xs">.env.local</code> para testar sem assinatura.
                  </p>
                  <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2">Últimos eventos recebidos (Bling)</h3>
                  {blingEvents.length === 0 ? (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">Nenhum webhook ainda. Após autorizar o app e salvar o companyId, os eventos aparecem aqui.</p>
                  ) : (
                    <ul className="space-y-2">
                      {blingEvents.map((ev) => (
                        <li key={ev.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs">
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">{ev.event_type ?? "—"}</span>
                          <span className="text-neutral-500 dark:text-neutral-400"> · {new Date(ev.criado_em).toLocaleString("pt-BR")}</span>
                          {ev.bling_event_id && (
                            <p className="text-[10px] text-neutral-500 mt-0.5 font-mono break-all">eventId: {ev.bling_event_id}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-700/50 bg-white dark:bg-neutral-900/80 shadow-md hover:shadow-lg transition-shadow p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Status da integração</h2>
                <button
                  type="button"
                  onClick={() => { void loadDiagnostics(); void loadBling(); }}
                  className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  {diagLoading ? "Atualizando..." : "Atualizar status"}
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-5">
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Chave API</p>
                  <p className={`mt-1 text-sm font-medium ${diag?.has_key ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                    {diag?.has_key ? `Configurada (..${diag?.key_prefix ?? prefix ?? ""})` : "Pendente"}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Vínculo com fornecedor</p>
                  <p className={`mt-1 text-sm font-medium ${diag?.fornecedor_vinculado ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                    {diag?.fornecedor_vinculado ? "OK" : "Pendente"}
                  </p>
                </div>
              </div>

              <div className={`rounded-xl border px-4 py-3 mb-6 ${diag?.integracao_pronta ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20" : "border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20"}`}>
                <p className={`text-sm font-medium ${diag?.integracao_pronta ? "text-emerald-800 dark:text-emerald-200" : "text-amber-800 dark:text-amber-200"}`}>
                  {diag?.integracao_pronta ? "Integração pronta para uso" : "Integração incompleta"}
                </p>
                <p className="text-xs mt-1 text-neutral-600 dark:text-neutral-300">
                  Modo atual: sem webhook (sync por API). Intervalo recomendado: 1 a 2 minutos.
                </p>
              </div>

              <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 px-4 py-3 mb-6">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Proteção anti-abuso (rate limit)</p>
                {diag?.rate_limit_unavailable ? (
                  <p className="text-xs mt-1 text-amber-700 dark:text-amber-300">
                    Controle de rate limit indisponível. Execute o script `add-api-rate-limits.sql`.
                  </p>
                ) : (
                  <>
                    <p className="text-xs mt-1 text-neutral-600 dark:text-neutral-300">
                      Limites por minuto: POST {diag?.rate_limit_usage?.post_api_key_limit ?? 30} req / PATCH {diag?.rate_limit_usage?.patch_api_key_limit ?? 30} req.
                    </p>
                    <p className="text-xs mt-1 text-neutral-600 dark:text-neutral-300">
                      Uso no minuto atual: POST {diag?.rate_limit_usage?.post_api_key_count ?? 0} / PATCH {diag?.rate_limit_usage?.patch_api_key_count ?? 0}.
                    </p>
                    <p className="text-[11px] mt-2 text-neutral-500 dark:text-neutral-400">
                      Se o ERP receber HTTP 429, aguarde alguns segundos e tente novamente.
                    </p>
                  </>
                )}
              </div>

              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Como usar</h2>
              <ol className="list-decimal list-inside space-y-3 text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">
                <li>Configure a chave API no seu ERP (Tiny, Bling, etc.)</li>
                <li>O ERP deve enviar <strong>POST</strong> para:
                  <code className="block mt-2 p-3 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl text-xs break-all text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700">
                    {typeof window !== "undefined" ? `${window.location.origin}/api/erp/pedidos` : "/api/erp/pedidos"}
                  </code>
                </li>
                <li>Header: <code className="bg-neutral-100 dark:bg-neutral-800/60 px-1.5 py-0.5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700">X-API-Key: sua_chave</code></li>
                <li>Body exemplo:
                  <pre className="mt-2 p-3 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl text-[11px] overflow-x-auto text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700">
{`{
  "referencia_externa": "ML-12345",
  "items": [{ "sku": "DJU044", "quantidade": 1 }],
  "etiqueta_pdf_url": "https://.../label.pdf",
  "tracking_codigo": "BR123456789",
  "metodo_envio": "Correios/PAC"
}`}
                  </pre>
                </li>
                <li>Quando o marketplace confirmar postagem, envie <strong>PATCH</strong> para o mesmo endpoint com <code className="bg-neutral-100 dark:bg-neutral-800/60 px-1.5 py-0.5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700">X-Event-Id</code> único:
                  <pre className="mt-2 p-3 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl text-[11px] overflow-x-auto text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700">
{`{
  "event_id": "evt_20260325_0001",
  "referencia_externa": "ML-12345",
  "status": "postado",
  "tracking_codigo": "BR123456789",
  "metodo_envio": "Correios/PAC"
}`}
                  </pre>
                </li>
                <li>Use o mesmo SKU do catálogo do DropCore no seu ERP</li>
                <li>Se receber <strong>HTTP 429</strong>, aguarde o próximo minuto e reenvie a chamada.</li>
              </ol>
            </div>

            <div className="mt-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-700/50 bg-white dark:bg-neutral-900/80 shadow-md p-6">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Últimos eventos ERP</h2>
              {diag?.eventos_unavailable ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Log de eventos indisponível. Execute o script `add-erp-events-and-pedido-timeline.sql` no Supabase.
                </p>
              ) : (diag?.eventos?.length ?? 0) === 0 ? (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Nenhum evento recebido ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {diag?.eventos.map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">{ev.tipo_evento}</span>
                        <span className={`rounded px-2 py-0.5 ${ev.status_processamento === "processado" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : ev.status_processamento === "erro" ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"}`}>
                          {ev.status_processamento}
                        </span>
                      </div>
                      <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                        {ev.referencia_externa ? `Ref: ${ev.referencia_externa}` : "Sem referência externa"} · {new Date(ev.criado_em).toLocaleString("pt-BR")}
                      </p>
                      {ev.erro && <p className="mt-1 text-red-600 dark:text-red-300">{ev.erro}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
