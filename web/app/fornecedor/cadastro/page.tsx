"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";
import { toTitleCase } from "@/lib/formatText";
import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { BANCOS_BRASIL } from "@/lib/bancosBrasil";

function formatCnpjDisplay(digits: string): string {
  const d = digits.slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

type FormState = {
  nome: string;
  cnpj: string;
  telefone: string;
  email_comercial: string;
  endereco_cep: string;
  endereco_logradouro: string;
  endereco_numero: string;
  endereco_complemento: string;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_uf: string;
  chave_pix: string;
  nome_banco: string;
  nome_no_banco: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
};

export default function FornecedorCadastroPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [overwriteFromCnpj, setOverwriteFromCnpj] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    nome: "",
    cnpj: "",
    telefone: "",
    email_comercial: "",
    endereco_cep: "",
    endereco_logradouro: "",
    endereco_numero: "",
    endereco_complemento: "",
    endereco_bairro: "",
    endereco_cidade: "",
    endereco_uf: "",
    chave_pix: "",
    nome_banco: "",
    nome_no_banco: "",
    agencia: "",
    conta: "",
    tipo_conta: "",
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const res = await fetch("/api/fornecedor/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          await supabaseBrowser.auth.signOut();
          router.replace("/fornecedor/login");
          return;
        }
        const j = await res.json();
        throw new Error(j?.error ?? "Erro ao carregar dados.");
      }
      const json = await res.json();
      const f = json.fornecedor ?? {};
      const cnpjDigits = normalizeCnpjInput(f.cnpj ?? "");
      setForm({
        nome: f.nome ?? "",
        cnpj: formatCnpjDisplay(cnpjDigits),
        telefone: f.telefone ?? "",
        email_comercial: f.email_comercial ?? "",
        endereco_cep: f.endereco_cep ?? "",
        endereco_logradouro: f.endereco_logradouro ?? "",
        endereco_numero: f.endereco_numero ?? "",
        endereco_complemento: f.endereco_complemento ?? "",
        endereco_bairro: f.endereco_bairro ?? "",
        endereco_cidade: f.endereco_cidade ?? "",
        endereco_uf: f.endereco_uf ?? "",
        chave_pix: f.chave_pix ?? "",
        nome_banco: f.nome_banco ?? "",
        nome_no_banco: f.nome_no_banco ?? "",
        agencia: f.agencia ?? "",
        conta: f.conta ?? "",
        tipo_conta: f.tipo_conta ?? "",
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const cnpjDigits = normalizeCnpjInput(form.cnpj);
      if (cnpjDigits.length > 0 && !isValidCnpjDigits(cnpjDigits)) {
        setError("CNPJ inválido. Confira os dígitos e os verificadores.");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/fornecedor/cadastro", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          nome: form.nome.trim(),
          cnpj: cnpjDigits.length > 0 ? cnpjDigits : null,
          telefone: form.telefone.trim() || null,
          email_comercial: form.email_comercial.trim() || null,
          endereco_cep: form.endereco_cep.replace(/\D/g, "") || null,
          endereco_logradouro: form.endereco_logradouro.trim() || null,
          endereco_numero: form.endereco_numero.trim() || null,
          endereco_complemento: form.endereco_complemento.trim() || null,
          endereco_bairro: form.endereco_bairro.trim() || null,
          endereco_cidade: form.endereco_cidade.trim() || null,
          endereco_uf: form.endereco_uf.trim().toUpperCase() || null,
          chave_pix: form.chave_pix.trim() || null,
          nome_banco: form.nome_banco.trim() || null,
          nome_no_banco: form.nome_no_banco.trim() || null,
          agencia: form.agencia.trim() || null,
          conta: form.conta.trim() || null,
          tipo_conta: form.tipo_conta.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Erro ao salvar.");
      }
      setOkMsg("Cadastro atualizado.");
      if (cnpjDigits.length === 14) {
        setForm((prev) => ({ ...prev, cnpj: formatCnpjDisplay(cnpjDigits) }));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function buscarDadosCnpj() {
    setError(null);
    setOkMsg(null);
    const cnpjDigits = normalizeCnpjInput(form.cnpj);
    if (!isValidCnpjDigits(cnpjDigits)) {
      setError("Informe um CNPJ válido antes de buscar.");
      return;
    }
    setLoadingCnpj(true);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }

      const res = await fetch(`/api/fornecedor/cadastro/cnpj?cnpj=${encodeURIComponent(cnpjDigits)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Não foi possível consultar o CNPJ.");
      }

      const empresa = json?.empresa ?? {};
      setForm((prev) => ({
        ...prev,
        cnpj: formatCnpjDisplay(cnpjDigits),
        nome: overwriteFromCnpj || !prev.nome.trim() ? (empresa.nome ?? prev.nome) : prev.nome,
        telefone: overwriteFromCnpj || !prev.telefone.trim() ? (empresa.telefone ?? prev.telefone) : prev.telefone,
        email_comercial:
          overwriteFromCnpj || !prev.email_comercial.trim()
            ? (empresa.email_comercial ?? prev.email_comercial)
            : prev.email_comercial,
        endereco_cep:
          overwriteFromCnpj || !prev.endereco_cep.trim()
            ? (empresa.endereco_cep ?? prev.endereco_cep)
            : prev.endereco_cep,
        endereco_logradouro:
          overwriteFromCnpj || !prev.endereco_logradouro.trim()
            ? (empresa.endereco_logradouro ?? prev.endereco_logradouro)
            : prev.endereco_logradouro,
        endereco_numero:
          overwriteFromCnpj || !prev.endereco_numero.trim()
            ? (empresa.endereco_numero ?? prev.endereco_numero)
            : prev.endereco_numero,
        endereco_complemento:
          overwriteFromCnpj || !prev.endereco_complemento.trim()
            ? (empresa.endereco_complemento ?? prev.endereco_complemento)
            : prev.endereco_complemento,
        endereco_bairro:
          overwriteFromCnpj || !prev.endereco_bairro.trim()
            ? (empresa.endereco_bairro ?? prev.endereco_bairro)
            : prev.endereco_bairro,
        endereco_cidade:
          overwriteFromCnpj || !prev.endereco_cidade.trim()
            ? (empresa.endereco_cidade ?? prev.endereco_cidade)
            : prev.endereco_cidade,
        endereco_uf:
          overwriteFromCnpj || !prev.endereco_uf.trim() ? (empresa.endereco_uf ?? prev.endereco_uf) : prev.endereco_uf,
      }));
      setOkMsg("Dados da empresa carregados pelo CNPJ. Revise e salve.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao consultar CNPJ.");
    } finally {
      setLoadingCnpj(false);
    }
  }

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/fornecedor/login");
  }

  function onCnpjChange(raw: string) {
    const digits = normalizeCnpjInput(raw).slice(0, 14);
    setForm((f) => ({ ...f, cnpj: formatCnpjDisplay(digits) }));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl border-2 border-neutral-200 dark:border-neutral-700 border-t-emerald-500 dark:border-t-emerald-500 animate-spin" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Carregando…</p>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-0 md:pt-14 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="w-full max-w-4xl mx-auto dropcore-px-content py-5 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/fornecedor/dashboard"
            className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1"
          >
            ← Voltar ao dashboard
          </Link>
          <button
            type="button"
            onClick={sair}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            Sair
          </button>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-sm">
          <h1 className="text-lg font-semibold text-[var(--foreground)] mb-1">Cadastro da empresa</h1>
          <p className="text-xs text-[var(--muted)] mb-6">
            Identificação, contato e dados para receber repasses
          </p>

          {error && (
            <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-4">
              {error}
            </div>
          )}
          {okMsg && (
            <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 mb-4">
              {okMsg}
            </div>
          )}

          <form onSubmit={salvar} className="space-y-8">
            <section id="empresa" className="space-y-5">
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-700 pb-2">
                Empresa e contato
              </h2>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Nome / razão social</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  onBlur={() => setForm((f) => ({ ...f, nome: toTitleCase(f.nome) }))}
                  placeholder="Como a empresa deve aparecer"
                  className={inputClass}
                  required
                  minLength={2}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">CNPJ</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.cnpj}
                    onChange={(e) => onCnpjChange(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={buscarDadosCnpj}
                    disabled={loadingCnpj}
                    className="shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-60"
                  >
                    {loadingCnpj ? "Buscando..." : "Buscar CNPJ"}
                  </button>
                </div>
                <p className="text-[11px] text-[var(--muted)] mt-1">14 dígitos (obrigatório para cadastro completo)</p>
                <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={overwriteFromCnpj}
                    onChange={(e) => setOverwriteFromCnpj(e.target.checked)}
                  />
                  Sobrescrever campos já preenchidos ao buscar CNPJ
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Telefone / WhatsApp</label>
                <input
                  type="tel"
                  value={form.telefone}
                  onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">E-mail comercial</label>
                <input
                  type="email"
                  value={form.email_comercial}
                  onChange={(e) => setForm((f) => ({ ...f, email_comercial: e.target.value }))}
                  placeholder="contato@empresa.com.br"
                  className={inputClass}
                />
              </div>
              <div className="pt-1">
                <p className="text-xs font-medium text-[var(--muted)] mb-2">Endereço</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">CEP</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.endereco_cep}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, endereco_cep: e.target.value.replace(/\D/g, "").slice(0, 8) }))
                      }
                      placeholder="00000000"
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Logradouro</label>
                    <input
                      type="text"
                      value={form.endereco_logradouro}
                      onChange={(e) => setForm((f) => ({ ...f, endereco_logradouro: e.target.value }))}
                      placeholder="Rua / Avenida"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Número</label>
                    <input
                      type="text"
                      value={form.endereco_numero}
                      onChange={(e) => setForm((f) => ({ ...f, endereco_numero: e.target.value }))}
                      placeholder="123"
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Complemento</label>
                    <input
                      type="text"
                      value={form.endereco_complemento}
                      onChange={(e) => setForm((f) => ({ ...f, endereco_complemento: e.target.value }))}
                      placeholder="Sala, bloco, etc. (opcional)"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Bairro</label>
                    <input
                      type="text"
                      value={form.endereco_bairro}
                      onChange={(e) => setForm((f) => ({ ...f, endereco_bairro: e.target.value }))}
                      placeholder="Bairro"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Cidade</label>
                    <input
                      type="text"
                      value={form.endereco_cidade}
                      onChange={(e) => setForm((f) => ({ ...f, endereco_cidade: e.target.value }))}
                      placeholder="Cidade"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">UF</label>
                    <input
                      type="text"
                      value={form.endereco_uf}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, endereco_uf: e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2) }))
                      }
                      placeholder="SP"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section id="repasse" className="space-y-5">
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-700 pb-2">
                Dados para repasse
              </h2>
              <p className="text-xs text-[var(--muted)] -mt-2">
                Informe a chave PIX ou os dados bancários (conta em nome da empresa).
              </p>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Chave PIX</label>
                <input
                  type="text"
                  value={form.chave_pix}
                  onChange={(e) => setForm((f) => ({ ...f, chave_pix: e.target.value }))}
                  placeholder="E-mail, telefone, CPF/CNPJ ou chave aleatória"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Nome do banco</label>
                <input
                  type="text"
                  name="nome_banco"
                  list="fornecedor-bancos-brasil"
                  autoComplete="off"
                  value={form.nome_banco}
                  onChange={(e) => setForm((f) => ({ ...f, nome_banco: e.target.value }))}
                  placeholder="Digite para buscar ou selecione…"
                  className={inputClass}
                />
                <datalist id="fornecedor-bancos-brasil">
                  {BANCOS_BRASIL.map((nome) => (
                    <option key={nome} value={nome} />
                  ))}
                </datalist>
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  Lista com principais bancos e instituições de pagamento. Se o seu não aparecer, digite o nome completo.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Nome no banco / titular</label>
                <input
                  type="text"
                  value={form.nome_no_banco}
                  onChange={(e) => setForm((f) => ({ ...f, nome_no_banco: e.target.value }))}
                  onBlur={() => setForm((f) => ({ ...f, nome_no_banco: toTitleCase(f.nome_no_banco) }))}
                  placeholder="Como aparece no extrato"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Agência</label>
                  <input
                    type="text"
                    value={form.agencia}
                    onChange={(e) => setForm((f) => ({ ...f, agencia: e.target.value }))}
                    placeholder="0000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Conta</label>
                  <input
                    type="text"
                    value={form.conta}
                    onChange={(e) => setForm((f) => ({ ...f, conta: e.target.value }))}
                    placeholder="00000-0"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Tipo de conta</label>
                <select
                  value={form.tipo_conta}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_conta: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Selecione</option>
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                </select>
              </div>
            </section>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-[var(--accent)] hover:opacity-90 disabled:opacity-60 text-white font-medium py-3 px-4 text-sm"
            >
              {saving ? "Salvando…" : "Salvar cadastro"}
            </button>
          </form>
        </div>
      </div>
      <FornecedorNav active="cadastro" />
    </div>
  );
}
