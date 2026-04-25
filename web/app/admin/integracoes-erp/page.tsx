"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function IntegracoesErpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/org/erp-api-key", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar.");
      setHasKey(json.has_key ?? false);
      setPrefix(json.prefix ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  async function gerarChave() {
    setGenerating(true);
    setError(null);
    setNewKey(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/org/erp-api-key", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao gerar chave.");
      setNewKey(json.api_key ?? null);
      setPrefix(json.prefix ?? null);
      setHasKey(true);
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
    <div style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          style={{
            background: "none",
            border: "1px solid #404040",
            borderRadius: 8,
            padding: "6px 12px",
            color: "#a3a3a3",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ← Voltar
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Integração ERP</h1>
      </div>

      <p style={{ color: "#737373", marginBottom: 24, fontSize: 14, lineHeight: 1.5 }}>
        Conecte seu ERP (Tiny, Bling, Olist ou outro) ao DropCore para receber pedidos automaticamente.
        O ERP envia o pedido via API e o DropCore debita estoque e bloqueia o saldo do seller.
      </p>

      {loading ? (
        <div style={{ color: "#737373", fontSize: 14 }}>Carregando...</div>
      ) : error ? (
        <div style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid #7f1d1d",
          background: "rgba(127,29,29,0.15)",
          color: "#fca5a5",
          marginBottom: 24,
        }}>
          {error}
        </div>
      ) : (
        <>
          {newKey ? (
            <div style={{
              padding: 20,
              borderRadius: 12,
              border: "1px solid #166534",
              background: "rgba(22,101,52,0.15)",
              marginBottom: 24,
            }}>
              <p style={{ color: "#86efac", fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                Chave gerada com sucesso
              </p>
              <p style={{ color: "#a7f3d0", fontSize: 13, marginBottom: 12 }}>
                Guarde em local seguro. Ela não será exibida novamente.
              </p>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                background: "rgba(0,0,0,0.3)",
                borderRadius: 8,
                fontFamily: "monospace",
                fontSize: 12,
                wordBreak: "break-all",
              }}>
                <code style={{ flex: 1 }}>{newKey}</code>
                <button
                  type="button"
                  onClick={copiarChave}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #166534",
                    background: "rgba(22,101,52,0.4)",
                    color: "#86efac",
                    fontSize: 12,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              padding: 20,
              borderRadius: 12,
              border: "1px solid #404040",
              background: "rgba(0,0,0,0.2)",
              marginBottom: 24,
            }}>
              <p style={{ color: "#a3a3a3", fontSize: 14, marginBottom: 12 }}>
                {hasKey
                  ? `Chave configurada (termina em ...${prefix ?? ""})`
                  : "Nenhuma chave configurada"}
              </p>
              <button
                type="button"
                onClick={gerarChave}
                disabled={generating}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "1px solid #404040",
                  background: "#262626",
                  color: "white",
                  fontSize: 14,
                  cursor: generating ? "not-allowed" : "pointer",
                  opacity: generating ? 0.6 : 1,
                }}
              >
                {generating ? "Gerando..." : hasKey ? "Gerar nova chave" : "Gerar chave API"}
              </button>
              {hasKey && !newKey && (
                <p style={{ color: "#737373", fontSize: 12, marginTop: 12 }}>
                  Gerar uma nova chave invalida a anterior.
                </p>
              )}
            </div>
          )}

          <div style={{
            padding: 20,
            borderRadius: 12,
            border: "1px solid #404040",
            background: "rgba(0,0,0,0.2)",
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Como usar</h2>
            <ol style={{ margin: 0, paddingLeft: 20, color: "#a3a3a3", fontSize: 13, lineHeight: 1.8 }}>
              <li>Configure a chave API no seu ERP (Tiny, Bling, etc.)</li>
              <li>O ERP deve enviar requisições <strong>POST</strong> para:<br />
                <code style={{ background: "#171717", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                  {typeof window !== "undefined" ? `${window.location.origin}/api/erp/pedidos` : "https://seu-dominio.com/api/erp/pedidos"}
                </code>
              </li>
              <li>Header obrigatório: <code style={{ background: "#171717", padding: "2px 4px", borderRadius: 4 }}>X-API-Key: sua_chave</code></li>
              <li>Body exemplo:
                <pre style={{
                  marginTop: 8,
                  padding: 12,
                  background: "#171717",
                  borderRadius: 8,
                  fontSize: 11,
                  overflow: "auto",
                }}>
{`{
  "referencia_externa": "ML-12345",
  "items": [
    { "sku": "DJU044", "quantidade": 1 }
  ],
  "etiqueta_pdf_url": "https://.../label.pdf",
  "tracking_codigo": "BR123456789",
  "metodo_envio": "Correios/PAC"
}`}
                </pre>
              </li>
              <li>Para atualização automática de postagem, o ERP deve enviar <strong>PATCH</strong> no mesmo endpoint com <code style={{ background: "#171717", padding: "2px 4px", borderRadius: 4 }}>X-Event-Id</code> único:
                <pre style={{
                  marginTop: 8,
                  padding: 12,
                  background: "#171717",
                  borderRadius: 8,
                  fontSize: 11,
                  overflow: "auto",
                }}>
{`{
  "event_id": "evt_20260325_0001",
  "referencia_externa": "ML-12345",
  "status": "postado",
  "tracking_codigo": "BR123456789",
  "metodo_envio": "Correios/PAC"
}`}
                </pre>
              </li>
              <li>Use o mesmo SKU do fornecedor no ERP (conforme catálogo importado do DropCore)</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
