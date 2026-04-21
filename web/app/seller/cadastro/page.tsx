"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toTitleCase } from "@/lib/formatText";
import { normalizeSellerDocDigits } from "@/lib/sellerDocumento";

function formatarCNPJouCPF(val: string, tipo: "CNPJ" | "CPF"): string {
  const dig = val.replace(/\D/g, "");
  if (tipo === "CNPJ") {
    const limited = dig.slice(0, 14);
    if (limited.length <= 2) return limited;
    if (limited.length <= 5) return `${limited.slice(0, 2)}.${limited.slice(2)}`;
    if (limited.length <= 8) return `${limited.slice(0, 2)}.${limited.slice(2, 5)}.${limited.slice(5)}`;
    if (limited.length <= 12) return `${limited.slice(0, 2)}.${limited.slice(2, 5)}.${limited.slice(5, 8)}/${limited.slice(8)}`;
    return `${limited.slice(0, 2)}.${limited.slice(2, 5)}.${limited.slice(5, 8)}/${limited.slice(8, 12)}-${limited.slice(12)}`;
  }
  const limited = dig.slice(0, 11);
  if (limited.length <= 3) return limited;
  if (limited.length <= 6) return `${limited.slice(0, 3)}.${limited.slice(3)}`;
  if (limited.length <= 9) return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6)}`;
  return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6, 9)}-${limited.slice(9)}`;
}

type Form = {
  nome: string;
  tipo_documento: "CNPJ" | "CPF";
  documento: string;
  plano: "" | "Starter" | "Pro";
  email: string;
  telefone: string;
  cep: string;
  endereco: string;
  nome_responsavel: string;
  cpf_responsavel: string;
  data_nascimento: string;
  nome_banco: string;
  nome_no_banco: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
};

const emptyForm: Form = {
  nome: "",
  tipo_documento: "CNPJ",
  documento: "",
  plano: "",
  email: "",
  telefone: "",
  cep: "",
  endereco: "",
  nome_responsavel: "",
  cpf_responsavel: "",
  data_nascimento: "",
  nome_banco: "",
  nome_no_banco: "",
  agencia: "",
  conta: "",
  tipo_conta: "",
};

export default function SellerCadastroPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cadastroPendente, setCadastroPendente] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/cadastro", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          await supabaseBrowser.auth.signOut();
          router.replace("/seller/login");
          return;
        }
        throw new Error(j?.error ?? "Erro ao carregar.");
      }
      setCadastroPendente(!!j.cadastro_pendente);
      const docDigits = normalizeSellerDocDigits(String(j.documento ?? ""));
      const tipoApi = j.tipo_documento === "CPF" ? "CPF" : "CNPJ";
      const tipo: "CNPJ" | "CPF" =
        docDigits.length === 11 ? "CPF" : docDigits.length === 14 ? "CNPJ" : tipoApi;
      const docFmt = docDigits ? formatarCNPJouCPF(docDigits, tipo) : "";
      const planoApi = String(j.plano ?? "").trim().toLowerCase();
      const planoForm: "" | "Starter" | "Pro" =
        planoApi === "pro" ? "Pro" : planoApi === "starter" ? "Starter" : "";
      setForm({
        nome: String(j.nome ?? ""),
        tipo_documento: tipo,
        documento: docFmt,
        plano: planoForm,
        email: String(j.email ?? ""),
        telefone: String(j.telefone ?? ""),
        cep: String(j.cep ?? "")
          .replace(/\D/g, "")
          .slice(0, 8)
          .replace(/(\d{5})(\d{3})/, "$1-$2"),
        endereco: String(j.endereco ?? ""),
        nome_responsavel: String(j.nome_responsavel ?? ""),
        cpf_responsavel: formatarCNPJouCPF(normalizeSellerDocDigits(String(j.cpf_responsavel ?? "")), "CPF"),
        data_nascimento: String(j.data_nascimento ?? "").slice(0, 10),
        nome_banco: String(j.nome_banco ?? ""),
        nome_no_banco: String(j.nome_no_banco ?? ""),
        agencia: String(j.agencia ?? ""),
        conta: String(j.conta ?? ""),
        tipo_conta: String(j.tipo_conta ?? ""),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carregar uma vez na montagem
  }, []);

  useEffect(() => {
    const cepLimpo = form.cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) {
      if (cepLimpo.length === 0) setCepLoading(false);
      return;
    }
    setCepLoading(true);
    const ac = new AbortController();
    fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`, { signal: ac.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.erro) {
          setCepLoading(false);
          return;
        }
        const partes = [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean);
        const enderecoCompleto = partes.join(", ");
        if (enderecoCompleto) {
          setForm((f) => ({ ...f, endereco: toTitleCase(enderecoCompleto) }));
        }
        setCepLoading(false);
      })
      .catch(() => setCepLoading(false));
    return () => ac.abort();
  }, [form.cep]);

  async function salvar() {
    setSaving(true);
    setError(null);
    try {
      if (!form.plano) {
        setError("Escolha o plano Starter ou Pro.");
        setSaving(false);
        return;
      }
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/cadastro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          ...form,
          nome: form.nome.trim(),
          plano: form.plano,
          documento: form.documento,
          email: form.email.trim(),
          telefone: form.telefone.trim(),
          cep: form.cep.replace(/\D/g, ""),
          endereco: form.endereco.trim(),
          nome_responsavel: form.nome_responsavel.trim(),
          cpf_responsavel: form.cpf_responsavel.trim(),
          data_nascimento: form.data_nascimento.trim(),
          nome_banco: form.nome_banco.trim(),
          nome_no_banco: form.nome_no_banco.trim(),
          agencia: form.agencia.trim(),
          conta: form.conta.trim(),
          tipo_conta: form.tipo_conta.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar.");
      setCadastroPendente(!!j.cadastro_pendente);
      if (!j.cadastro_pendente) {
        router.replace("/seller/dashboard");
        return;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-emerald-500 dark:border-neutral-700 dark:border-t-emerald-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="absolute top-3 right-3 md:top-4 md:right-4 z-50">
        <ThemeToggle />
      </div>
      <main className="max-w-xl mx-auto px-4 sm:px-6">
        <SellerPageHeader
          title={cadastroPendente ? "Complete seu cadastro" : "Dados comerciais"}
          subtitle={
            cadastroPendente
              ? "Preencha CNPJ ou CPF, contato, endereço e escolha o plano. O CNPJ deve ser o da sua conta no marketplace."
              : "Revise ou atualize seus dados e plano quando precisar."
          }
        />

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        )}
        <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-700/50 bg-white dark:bg-neutral-900/90 shadow-md p-5 sm:p-6 space-y-4">
          <div>
            <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">Razão social ou nome fantasia *</label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              onBlur={() => setForm((f) => ({ ...f, nome: toTitleCase(f.nome) }))}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">Tipo *</label>
              <select
                value={form.tipo_documento}
                onChange={(e) => {
                  const t = e.target.value === "CPF" ? "CPF" : "CNPJ";
                  setForm((f) => ({ ...f, tipo_documento: t, documento: "" }));
                }}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              >
                <option value="CNPJ">CNPJ</option>
                <option value="CPF">CPF</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">{form.tipo_documento} *</label>
              <input
                type="text"
                value={form.documento}
                onChange={(e) => setForm((f) => ({ ...f, documento: formatarCNPJouCPF(e.target.value, f.tipo_documento) }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm font-mono"
                maxLength={form.tipo_documento === "CPF" ? 14 : 18}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">E-mail comercial *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">Telefone (com DDD) *</label>
            <input
              type="text"
              value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">CEP *</label>
            <input
              type="text"
              value={form.cep}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                setForm((f) => ({ ...f, cep: v.length <= 5 ? v : `${v.slice(0, 5)}-${v.slice(5)}` }));
              }}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              maxLength={9}
            />
            {cepLoading && <p className="text-[11px] text-emerald-600 mt-1">Buscando endereço…</p>}
          </div>

          <div>
            <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">Endereço da loja *</label>
            <input
              type="text"
              value={form.endereco}
              onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
              onBlur={() => setForm((f) => ({ ...f, endereco: toTitleCase(f.endereco) }))}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
            />
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4 space-y-3">
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">Plano *</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              A assinatura do painel segue o plano que você escolher (valores são os da sua organização / contrato).
              <span className="text-neutral-700 dark:text-neutral-200 font-medium"> Starter</span> — melhor para testar o fluxo e volume menor: resumo financeiro e gráfico de pedidos por dia.
              <span className="text-neutral-700 dark:text-neutral-200 font-medium"> Pro</span> — para quem já vende com frequência: mensalidade mais alta e blocos extras de desempenho (analytics) no painel.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-3 text-sm transition-colors ${
                  form.plano === "Starter"
                    ? "border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30 ring-1 ring-emerald-500/40"
                    : "border-neutral-200 dark:border-neutral-600 hover:border-neutral-300 dark:hover:border-neutral-500"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
                  <input
                    type="radio"
                    name="plano_seller"
                    checked={form.plano === "Starter"}
                    onChange={() => setForm((f) => ({ ...f, plano: "Starter" }))}
                    className="accent-emerald-600"
                  />
                  Starter
                </div>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug pl-6">
                  Entrada no ecossistema; acompanhe saldo e pedidos no essencial.
                </span>
              </label>
              <label
                className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-3 text-sm transition-colors ${
                  form.plano === "Pro"
                    ? "border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30 ring-1 ring-emerald-500/40"
                    : "border-neutral-200 dark:border-neutral-600 hover:border-neutral-300 dark:hover:border-neutral-500"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
                  <input
                    type="radio"
                    name="plano_seller"
                    checked={form.plano === "Pro"}
                    onChange={() => setForm((f) => ({ ...f, plano: "Pro" }))}
                    className="accent-emerald-600"
                  />
                  Pro
                </div>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug pl-6">
                  Mais ferramentas de leitura de desempenho para escalar anúncios com segurança.
                </span>
              </label>
            </div>
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4 space-y-3">
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Responsável (opcional)</p>
            <input
              type="text"
              placeholder="Nome do responsável"
              value={form.nome_responsavel}
              onChange={(e) => setForm((f) => ({ ...f, nome_responsavel: e.target.value }))}
              onBlur={() => setForm((f) => ({ ...f, nome_responsavel: toTitleCase(f.nome_responsavel) }))}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
            />
            <input
              type="text"
              placeholder="CPF do responsável"
              value={form.cpf_responsavel}
              onChange={(e) => setForm((f) => ({ ...f, cpf_responsavel: formatarCNPJouCPF(e.target.value, "CPF") }))}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              maxLength={14}
            />
            <input
              type="date"
              value={form.data_nascimento}
              onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
            />
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4 space-y-3">
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Dados bancários (opcional)</p>
            <input
              type="text"
              placeholder="Nome do banco"
              value={form.nome_banco}
              onChange={(e) => setForm((f) => ({ ...f, nome_banco: e.target.value }))}
              onBlur={() => setForm((f) => ({ ...f, nome_banco: toTitleCase(f.nome_banco) }))}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
            />
            <input
              type="text"
              placeholder="Nome no banco"
              value={form.nome_no_banco}
              onChange={(e) => setForm((f) => ({ ...f, nome_no_banco: e.target.value }))}
              onBlur={() => setForm((f) => ({ ...f, nome_no_banco: toTitleCase(f.nome_no_banco) }))}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Agência"
                value={form.agencia}
                onChange={(e) => setForm((f) => ({ ...f, agencia: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              />
              <input
                type="text"
                placeholder="Conta"
                value={form.conta}
                onChange={(e) => setForm((f) => ({ ...f, conta: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              />
            </div>
            <select
              value={form.tipo_conta}
              onChange={(e) => setForm((f) => ({ ...f, tipo_conta: e.target.value }))}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
            >
              <option value="">Tipo de conta</option>
              <option value="Corrente">Corrente</option>
              <option value="Poupança">Poupança</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={saving}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2.5 text-sm disabled:opacity-60"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
            {!cadastroPendente && (
              <button
                type="button"
                onClick={() => router.push("/seller/dashboard")}
                className="rounded-xl border border-neutral-300 dark:border-neutral-600 px-5 py-2.5 text-sm"
              >
                Voltar ao painel
              </button>
            )}
          </div>
        </div>
      </main>
      <SellerNav active="dashboard" />
    </div>
  );
}
