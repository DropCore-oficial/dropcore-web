"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";
import { BankCombobox } from "@/components/fornecedor/BankCombobox";
import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";

function upper(s: string): string {
  return s.toLocaleUpperCase("pt-BR");
}

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
  /** CD / despacho padrão (texto livre); sede fiscal continua nos campos de endereço acima. */
  expedicao_padrao_linha: string;
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
  const [confirmoRepasseTitularCnpj, setConfirmoRepasseTitularCnpj] = useState(false);
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
    expedicao_padrao_linha: "",
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
        nome: upper(String(f.nome ?? "")),
        cnpj: formatCnpjDisplay(cnpjDigits),
        telefone: upper(String(f.telefone ?? "")),
        email_comercial: upper(String(f.email_comercial ?? "")),
        endereco_cep: String(f.endereco_cep ?? "").replace(/\D/g, "").slice(0, 8),
        endereco_logradouro: upper(String(f.endereco_logradouro ?? "")),
        endereco_numero: upper(String(f.endereco_numero ?? "")),
        endereco_complemento: upper(String(f.endereco_complemento ?? "")),
        endereco_bairro: upper(String(f.endereco_bairro ?? "")),
        endereco_cidade: upper(String(f.endereco_cidade ?? "")),
        endereco_uf: upper(String(f.endereco_uf ?? "")).replace(/[^A-Z]/g, "").slice(0, 2),
        expedicao_padrao_linha: String(f.expedicao_padrao_linha ?? ""),
        chave_pix: upper(String(f.chave_pix ?? "")),
        nome_banco: upper(String(f.nome_banco ?? "")),
        nome_no_banco: upper(String(f.nome_no_banco ?? "")),
        agencia: upper(String(f.agencia ?? "")),
        conta: upper(String(f.conta ?? "")),
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

  function temDadosRepassePreenchidos(f: FormState): boolean {
    return [f.chave_pix, f.nome_banco, f.nome_no_banco, f.agencia, f.conta, f.tipo_conta].some(
      (s) => String(s ?? "").trim().length > 0
    );
  }

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
      if (temDadosRepassePreenchidos(form) && !confirmoRepasseTitularCnpj) {
        setError(
          "Marque a confirmação: os dados de PIX/conta são da empresa (mesmo CNPJ e razão social informados acima)."
        );
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
          nome: upper(form.nome.trim()),
          cnpj: cnpjDigits.length > 0 ? cnpjDigits : null,
          telefone: upper(form.telefone.trim()) || null,
          email_comercial: upper(form.email_comercial.trim()) || null,
          endereco_cep: form.endereco_cep.replace(/\D/g, "") || null,
          endereco_logradouro: upper(form.endereco_logradouro.trim()) || null,
          endereco_numero: upper(form.endereco_numero.trim()) || null,
          endereco_complemento: upper(form.endereco_complemento.trim()) || null,
          endereco_bairro: upper(form.endereco_bairro.trim()) || null,
          endereco_cidade: upper(form.endereco_cidade.trim()) || null,
          endereco_uf: upper(form.endereco_uf.trim()).replace(/[^A-Z]/g, "").slice(0, 2) || null,
          expedicao_padrao_linha: form.expedicao_padrao_linha.trim() || null,
          chave_pix: upper(form.chave_pix.trim()) || null,
          nome_banco: upper(form.nome_banco.trim()) || null,
          nome_no_banco: upper(form.nome_no_banco.trim()) || null,
          agencia: upper(form.agencia.trim()) || null,
          conta: upper(form.conta.trim()) || null,
          tipo_conta: form.tipo_conta.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Erro ao salvar.");
      }
      setOkMsg("Cadastro atualizado.");
      setConfirmoRepasseTitularCnpj(false);
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
        nome:
          overwriteFromCnpj || !prev.nome.trim()
            ? upper(String(empresa.nome ?? prev.nome))
            : prev.nome,
        telefone:
          overwriteFromCnpj || !prev.telefone.trim()
            ? upper(String(empresa.telefone ?? prev.telefone))
            : prev.telefone,
        email_comercial:
          overwriteFromCnpj || !prev.email_comercial.trim()
            ? upper(String(empresa.email_comercial ?? prev.email_comercial))
            : prev.email_comercial,
        endereco_cep:
          overwriteFromCnpj || !prev.endereco_cep.trim()
            ? String(empresa.endereco_cep ?? prev.endereco_cep).replace(/\D/g, "").slice(0, 8)
            : prev.endereco_cep,
        endereco_logradouro:
          overwriteFromCnpj || !prev.endereco_logradouro.trim()
            ? upper(String(empresa.endereco_logradouro ?? prev.endereco_logradouro))
            : prev.endereco_logradouro,
        endereco_numero:
          overwriteFromCnpj || !prev.endereco_numero.trim()
            ? upper(String(empresa.endereco_numero ?? prev.endereco_numero))
            : prev.endereco_numero,
        endereco_complemento:
          overwriteFromCnpj || !prev.endereco_complemento.trim()
            ? upper(String(empresa.endereco_complemento ?? prev.endereco_complemento))
            : prev.endereco_complemento,
        endereco_bairro:
          overwriteFromCnpj || !prev.endereco_bairro.trim()
            ? upper(String(empresa.endereco_bairro ?? prev.endereco_bairro))
            : prev.endereco_bairro,
        endereco_cidade:
          overwriteFromCnpj || !prev.endereco_cidade.trim()
            ? upper(String(empresa.endereco_cidade ?? prev.endereco_cidade))
            : prev.endereco_cidade,
        endereco_uf:
          overwriteFromCnpj || !prev.endereco_uf.trim()
            ? upper(String(empresa.endereco_uf ?? prev.endereco_uf)).replace(/[^A-Z]/g, "").slice(0, 2)
            : prev.endereco_uf,
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
    "w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm uppercase text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
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

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-sm overflow-visible">
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
                  onChange={(e) => setForm((f) => ({ ...f, nome: upper(e.target.value) }))}
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
                  onChange={(e) => setForm((f) => ({ ...f, telefone: upper(e.target.value) }))}
                  placeholder="(00) 00000-0000"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">E-mail comercial</label>
                <input
                  type="email"
                  value={form.email_comercial}
                  onChange={(e) => setForm((f) => ({ ...f, email_comercial: upper(e.target.value) }))}
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
                      onChange={(e) => setForm((f) => ({ ...f, endereco_logradouro: upper(e.target.value) }))}
                      placeholder="Rua / Avenida"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Número</label>
                    <input
                      type="text"
                      value={form.endereco_numero}
                      onChange={(e) => setForm((f) => ({ ...f, endereco_numero: upper(e.target.value) }))}
                      placeholder="123"
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Complemento</label>
                    <input
                      type="text"
                      value={form.endereco_complemento}
                      onChange={(e) => setForm((f) => ({ ...f, endereco_complemento: upper(e.target.value) }))}
                      placeholder="Sala, bloco, etc. (opcional)"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Bairro</label>
                    <input
                      type="text"
                      value={form.endereco_bairro}
                      onChange={(e) => setForm((f) => ({ ...f, endereco_bairro: upper(e.target.value) }))}
                      placeholder="Bairro"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Cidade</label>
                    <input
                      type="text"
                      value={form.endereco_cidade}
                      onChange={(e) => setForm((f) => ({ ...f, endereco_cidade: upper(e.target.value) }))}
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
                <div className="mt-3">
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                    Despacho / CD padrão (opcional)
                  </label>
                  <textarea
                    value={form.expedicao_padrao_linha}
                    onChange={(e) => setForm((f) => ({ ...f, expedicao_padrao_linha: e.target.value }))}
                    rows={3}
                    placeholder="Ex.: Todos os produtos — CD Goiânia GO + endereço completo de saída"
                    className={`${inputClass} resize-y min-h-[4.5rem]`}
                  />
                  <p className="text-[11px] text-[var(--muted)] mt-1 leading-snug">
                    O bloco «Endereço» acima é a sede/fiscal. Use este campo quando o stock sair sempre do mesmo CD; em
                    produtos específicos pode haver excepção ao editar o SKU.
                  </p>
                </div>
              </div>
            </section>

            <section id="repasse" className="space-y-5 overflow-visible">
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 border-b border-neutral-200 dark:border-neutral-700 pb-2">
                Editar dados bancários e PIX (repasse)
              </h2>
              <p className="text-xs leading-relaxed text-[var(--muted)] -mt-2">
                Informe a chave PIX e/ou conta <strong className="text-[var(--foreground)]">em nome da empresa</strong>{" "}
                (mesma razão social e CNPJ deste cadastro). Contas de terceiros não são aceitas. A equipe DropCore
                confere os dados antes de liberar repasses.
              </p>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Chave PIX</label>
                <input
                  type="text"
                  value={form.chave_pix}
                  onChange={(e) => setForm((f) => ({ ...f, chave_pix: upper(e.target.value) }))}
                  placeholder="E-mail, telefone, CPF/CNPJ ou chave aleatória"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5" htmlFor="fornecedor-nome-banco">
                  Nome do banco
                </label>
                <BankCombobox
                  id="fornecedor-nome-banco"
                  value={form.nome_banco}
                  onChange={(v) => setForm((f) => ({ ...f, nome_banco: upper(v) }))}
                  inputClassName={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Nome no banco / titular</label>
                <input
                  type="text"
                  value={form.nome_no_banco}
                  onChange={(e) => setForm((f) => ({ ...f, nome_no_banco: upper(e.target.value) }))}
                  placeholder="MESMA RAZÃO SOCIAL DO CAMPO «NOME / RAZÃO SOCIAL»"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Agência</label>
                  <input
                    type="text"
                    value={form.agencia}
                    onChange={(e) => setForm((f) => ({ ...f, agencia: upper(e.target.value) }))}
                    placeholder="0000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Conta</label>
                  <input
                    type="text"
                    value={form.conta}
                    onChange={(e) => setForm((f) => ({ ...f, conta: upper(e.target.value) }))}
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
                  <option value="">SELECIONE</option>
                  <option value="corrente">CORRENTE</option>
                  <option value="poupanca">POUPANÇA</option>
                </select>
              </div>
              {temDadosRepassePreenchidos(form) && (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-3 text-xs text-neutral-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-neutral-200">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300"
                    checked={confirmoRepasseTitularCnpj}
                    onChange={(e) => setConfirmoRepasseTitularCnpj(e.target.checked)}
                  />
                  <span>
                    Declaro que a chave PIX e/ou a conta informadas são da <strong>empresa cadastrada acima</strong>{" "}
                    (mesmo CNPJ e titular igual à razão social). Entendo que dados inconsistentes serão rejeitados e
                    que a DropCore pode solicitar comprovante.
                  </span>
                </label>
              )}
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
