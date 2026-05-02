"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toTitleCase } from "@/lib/formatText";
import { normalizeSellerDocDigits } from "@/lib/sellerDocumento";
import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { empresaCnpjParaEnderecoLinha, type EmpresaCnpjPayload } from "@/lib/cnpjBrasilConsulta";
import { cepParaConsultaViaCep } from "@/lib/cepViaCep";

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
  email: string;
  telefone: string;
  cep: string;
  endereco: string;
  nome_responsavel: string;
  cpf_responsavel: string;
  data_nascimento: string;
};

const emptyForm: Form = {
  nome: "",
  tipo_documento: "CNPJ",
  documento: "",
  email: "",
  telefone: "",
  cep: "",
  endereco: "",
  nome_responsavel: "",
  cpf_responsavel: "",
  data_nascimento: "",
};

export default function SellerCadastroPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cnpjBuscaLoading, setCnpjBuscaLoading] = useState(false);
  const [overwriteFromCnpj, setOverwriteFromCnpj] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
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
      setCadastroPendente(!!j.cadastro_dados_pendente);
      const docDigits = normalizeSellerDocDigits(String(j.documento ?? ""));
      const tipoApi = j.tipo_documento === "CPF" ? "CPF" : "CNPJ";
      const tipo: "CNPJ" | "CPF" =
        docDigits.length === 11 ? "CPF" : docDigits.length === 14 ? "CNPJ" : tipoApi;
      const docFmt = docDigits ? formatarCNPJouCPF(docDigits, tipo) : "";
      setForm({
        nome: String(j.nome ?? ""),
        tipo_documento: tipo,
        documento: docFmt,
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
    const cepConsulta = cepParaConsultaViaCep(form.cep);
    if (!cepConsulta) {
      if (form.cep.replace(/\D/g, "").length === 0) setCepLoading(false);
      return;
    }
    setCepLoading(true);
    const ac = new AbortController();
    fetch(`https://viacep.com.br/ws/${cepConsulta}/json/`, { signal: ac.signal })
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
    setOkMsg(null);
    try {
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
          documento: form.documento,
          email: form.email.trim(),
          telefone: form.telefone.trim(),
          cep: form.cep.replace(/\D/g, ""),
          endereco: form.endereco.trim(),
          nome_responsavel: form.nome_responsavel.trim(),
          cpf_responsavel: form.cpf_responsavel.trim(),
          data_nascimento: form.data_nascimento.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar.");
      setCadastroPendente(!!j.cadastro_dados_pendente);
      if (!j.cadastro_dados_pendente) {
        router.replace("/seller/dashboard");
        return;
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
    if (form.tipo_documento !== "CNPJ") {
      setError("A consulta na Receita só vale para CNPJ.");
      return;
    }
    const cnpjDigits = normalizeCnpjInput(form.documento);
    if (!isValidCnpjDigits(cnpjDigits)) {
      setError("Informe um CNPJ válido (14 dígitos e dígitos verificadores) antes de buscar.");
      return;
    }
    setCnpjBuscaLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch(`/api/seller/cadastro/cnpj?cnpj=${encodeURIComponent(cnpjDigits)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Não foi possível consultar o CNPJ.");
      }
      const empresa = (json?.empresa ?? {}) as EmpresaCnpjPayload;
      const endLinha = empresaCnpjParaEnderecoLinha(empresa);
      const cepDigits = String(empresa.endereco_cep ?? "").replace(/\D/g, "").slice(0, 8);
      const cepFmt = cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : "";

      setForm((prev) => ({
        ...prev,
        documento: formatarCNPJouCPF(cnpjDigits, "CNPJ"),
        nome:
          overwriteFromCnpj || !prev.nome.trim()
            ? toTitleCase(String(empresa.nome ?? empresa.razao_social ?? prev.nome).trim() || prev.nome)
            : prev.nome,
        telefone:
          overwriteFromCnpj || !prev.telefone.trim()
            ? String(empresa.telefone ?? prev.telefone).trim()
            : prev.telefone,
        email:
          overwriteFromCnpj || !prev.email.trim()
            ? String(empresa.email_comercial ?? prev.email)
                .trim()
                .toLowerCase()
            : prev.email,
        cep:
          overwriteFromCnpj || prev.cep.replace(/\D/g, "").length === 0
            ? cepFmt || prev.cep
            : prev.cep,
        endereco:
          overwriteFromCnpj || !prev.endereco.trim()
            ? toTitleCase(endLinha.trim() || prev.endereco)
            : prev.endereco,
      }));
      setOkMsg("CNPJ encontrado na base pública. Confira os campos e salve.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao consultar CNPJ.");
    } finally {
      setCnpjBuscaLoading(false);
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
              ? "Preencha CNPJ ou CPF, contato e endereço. O CNPJ deve ser o da sua conta no marketplace. Depois de salvar, você escolhe o plano (Starter ou Pro) no painel inicial."
              : "Revise ou atualize seus dados comerciais quando precisar."
          }
        />

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-100 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        )}
        {okMsg && (
          <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-100 dark:bg-emerald-950/25 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
            {okMsg}
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
                  setOkMsg(null);
                  setForm((f) => ({ ...f, tipo_documento: t, documento: "" }));
                }}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              >
                <option value="CNPJ">CNPJ</option>
                <option value="CPF">CPF</option>
              </select>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">{form.tipo_documento} *</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <input
                  type="text"
                  value={form.documento}
                  onChange={(e) => {
                    setOkMsg(null);
                    setForm((f) => ({ ...f, documento: formatarCNPJouCPF(e.target.value, f.tipo_documento) }));
                  }}
                  className="w-full min-w-0 flex-1 rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm font-mono"
                  maxLength={form.tipo_documento === "CPF" ? 14 : 18}
                />
                {form.tipo_documento === "CNPJ" && (
                  <button
                    type="button"
                    onClick={() => void buscarDadosCnpj()}
                    disabled={cnpjBuscaLoading}
                    className="shrink-0 rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                  >
                    {cnpjBuscaLoading ? "A consultar..." : "Validar na Receita"}
                  </button>
                )}
              </div>
              {form.tipo_documento === "CNPJ" && (
                <label className="flex items-start gap-2 text-[11px] text-neutral-600 dark:text-neutral-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwriteFromCnpj}
                    onChange={(e) => setOverwriteFromCnpj(e.target.checked)}
                    className="mt-0.5 rounded border-neutral-300"
                  />
                  <span>Substituir nome, e-mail, telefone, CEP e endereço já preenchidos pelos dados da consulta.</span>
                </label>
              )}
              {form.tipo_documento === "CNPJ" && (
                <p className="text-[10px] text-neutral-500 dark:text-neutral-500 leading-relaxed">
                  Consulta BrasilAPI / fallback ReceitaWS: confirma que o CNPJ existe na base pública e ajuda a evitar erro de digitação. O cadastro final continua sujeito à revisão da organização.
                </p>
              )}
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
            {cepLoading && <p className="text-[11px] text-emerald-600 mt-1">Buscando endereço...</p>}
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
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Responsável (opcional)</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 -mt-1 leading-relaxed">
              Dados da pessoa de contato ou representante legal, quando quiser deixar registrado no cadastro.
            </p>
            <div>
              <label htmlFor="seller_nome_responsavel" className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                Nome do responsável
              </label>
              <input
                id="seller_nome_responsavel"
                type="text"
                placeholder="Nome completo"
                value={form.nome_responsavel}
                onChange={(e) => setForm((f) => ({ ...f, nome_responsavel: e.target.value }))}
                onBlur={() => setForm((f) => ({ ...f, nome_responsavel: toTitleCase(f.nome_responsavel) }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="seller_cpf_responsavel" className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                CPF do responsável
              </label>
              <input
                id="seller_cpf_responsavel"
                type="text"
                placeholder="000.000.000-00"
                value={form.cpf_responsavel}
                onChange={(e) => setForm((f) => ({ ...f, cpf_responsavel: formatarCNPJouCPF(e.target.value, "CPF") }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
                maxLength={14}
              />
            </div>
            <div>
              <label htmlFor="seller_data_nascimento_responsavel" className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                Data de nascimento do responsável
              </label>
              <input
                id="seller_data_nascimento_responsavel"
                type="date"
                value={form.data_nascimento}
                onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              />
              <p className="text-[10px] text-neutral-500 dark:text-neutral-500 mt-1 leading-relaxed">
                Opcional. Usada apenas como referência no cadastro comercial.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={saving}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2.5 text-sm disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar"}
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
