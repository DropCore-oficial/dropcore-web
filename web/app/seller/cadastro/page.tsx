"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { toTitleCase } from "@/lib/formatText";
import { normalizeSellerDocDigits } from "@/lib/sellerDocumento";
import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { empresaCnpjParaEnderecoLinha, type EmpresaCnpjPayload } from "@/lib/cnpjBrasilConsulta";
import { cepParaConsultaViaCep } from "@/lib/cepViaCep";
import { cn } from "@/lib/utils";

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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

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
      const lu = j.logo_url;
      setLogoUrl(typeof lu === "string" && lu.length > 0 ? lu : null);
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

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    setError(null);
    setOkMsg(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/seller/logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "Erro ao enviar logo.");
      }
      if (typeof json.logo_url === "string" && json.logo_url.length > 0) {
        setLogoUrl(json.logo_url);
      }
      setOkMsg("Logo da marca atualizada.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao enviar logo.");
    } finally {
      setLogoUploading(false);
    }
  }

  async function removeLogo() {
    setLogoUploading(true);
    setError(null);
    setOkMsg(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/logo", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "Erro ao remover logo.");
      }
      setLogoUrl(null);
      setOkMsg("Logo da marca removida.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover logo.");
    } finally {
      setLogoUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-xl border-2 border-[var(--card-border)] border-t-neutral-500 dark:border-t-neutral-400" />
          <p className="text-sm font-medium text-[var(--muted)]">Carregando...</p>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40";
  const inputMonoClass = `${inputClass} font-mono`;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="dropcore-shell-4xl space-y-5 py-5 md:space-y-6 md:py-7">
        <SellerPageHeader
          surface="hero"
          showBack
          backHref="/seller/dashboard"
          title={cadastroPendente ? "Complete seu cadastro" : "Dados comerciais"}
          subtitle={
            cadastroPendente
              ? "Preencha CNPJ ou CPF, contato e endereço. O CNPJ deve ser o da sua conta no marketplace. Depois de salvar, você escolhe o plano (Start ou Pro) no painel inicial."
              : "Revise ou atualize seus dados comerciais quando precisar."
          }
        />

        {error && (
          <div className="rounded-2xl border border-[var(--danger)]/40 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/35 dark:text-red-300">
            {error}
          </div>
        )}
        {okMsg && (
          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/25 dark:text-emerald-300">
            {okMsg}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
          className="space-y-5 md:space-y-6"
        >
          <section className="space-y-4 overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:space-y-5 sm:p-5">
            <h2 className="border-b border-[var(--card-border)] pb-2 text-sm font-semibold text-[var(--foreground)]">Loja e contato</h2>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-24 w-24 shrink-0 rounded-2xl border-0 object-contain bg-transparent p-0 outline-none ring-0"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--muted)]/8 px-2 text-center text-[11px] text-[var(--muted)]">
                    Sem logo
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="text-xs font-medium text-[var(--muted)]">Logo da marca</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    PNG, JPG, WebP ou GIF até 2 MB. Aparece no painel ao lado do nome da loja.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={cn(
                      "inline-flex cursor-pointer items-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--muted)]/10",
                      logoUploading && "pointer-events-none opacity-60",
                    )}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="sr-only"
                      disabled={logoUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void uploadLogo(f);
                      }}
                    />
                    {logoUploading ? "Enviando…" : "Enviar imagem"}
                  </label>
                  {logoUrl ? (
                    <button
                      type="button"
                      onClick={() => void removeLogo()}
                      disabled={logoUploading}
                      className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)] disabled:opacity-60"
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Razão social ou nome fantasia *</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                onBlur={() => setForm((f) => ({ ...f, nome: toTitleCase(f.nome) }))}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Tipo *</label>
                <select
                  value={form.tipo_documento}
                  onChange={(e) => {
                    const t = e.target.value === "CPF" ? "CPF" : "CNPJ";
                    setOkMsg(null);
                    setForm((f) => ({ ...f, tipo_documento: t, documento: "" }));
                  }}
                  className={inputClass}
                >
                  <option value="CNPJ">CNPJ</option>
                  <option value="CPF">CPF</option>
                </select>
              </div>
              <div className="sm:col-span-2 space-y-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">{form.tipo_documento} *</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <input
                    type="text"
                    value={form.documento}
                    onChange={(e) => {
                      setOkMsg(null);
                      setForm((f) => ({ ...f, documento: formatarCNPJouCPF(e.target.value, f.tipo_documento) }));
                    }}
                    className={`min-h-10 min-w-0 flex-1 ${inputMonoClass}`}
                    maxLength={form.tipo_documento === "CPF" ? 14 : 18}
                  />
                  {form.tipo_documento === "CNPJ" && (
                    <button
                      type="button"
                      onClick={() => void buscarDadosCnpj()}
                      disabled={cnpjBuscaLoading}
                      className="min-h-10 shrink-0 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:text-neutral-300 dark:hover:bg-neutral-800 whitespace-nowrap"
                    >
                      {cnpjBuscaLoading ? "A consultar..." : "Validar na Receita"}
                    </button>
                  )}
                </div>
                {form.tipo_documento === "CNPJ" && (
                  <label className="flex cursor-pointer items-start gap-2.5 text-[11px] text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={overwriteFromCnpj}
                      onChange={(e) => setOverwriteFromCnpj(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--card-border)] bg-[var(--background)] text-emerald-600 focus:ring-emerald-500/40"
                    />
                    <span>Substituir nome, e-mail, telefone, CEP e endereço já preenchidos pelos dados da consulta.</span>
                  </label>
                )}
                {form.tipo_documento === "CNPJ" && (
                  <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                    Consulta BrasilAPI / fallback ReceitaWS: confirma que o CNPJ existe na base pública e ajuda a evitar erro de digitação. O cadastro final continua sujeito à revisão da organização.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">E-mail comercial *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Telefone (com DDD) *</label>
              <input
                type="text"
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">CEP *</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.cep}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                  setForm((f) => ({ ...f, cep: v.length <= 5 ? v : `${v.slice(0, 5)}-${v.slice(5)}` }));
                }}
                placeholder="00000-000"
                className={inputClass}
                maxLength={9}
              />
              <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
                {cepLoading ? "A consultar CEP (ViaCEP)…" : "Com 8 dígitos preenchemos logradouro, bairro, cidade e UF quando disponível."}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Endereço da loja *</label>
              <input
                type="text"
                value={form.endereco}
                onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
                onBlur={() => setForm((f) => ({ ...f, endereco: toTitleCase(f.endereco) }))}
                className={inputClass}
              />
            </div>
          </section>

          <section className="space-y-4 overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:space-y-5 sm:p-5">
            <h2 className="border-b border-[var(--card-border)] pb-2 text-sm font-semibold text-[var(--foreground)]">Responsável (opcional)</h2>
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">
              Dados da pessoa de contato ou representante legal, quando quiser deixar registrado no cadastro.
            </p>
            <div>
              <label htmlFor="seller_nome_responsavel" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                Nome do responsável
              </label>
              <input
                id="seller_nome_responsavel"
                type="text"
                placeholder="Nome completo"
                value={form.nome_responsavel}
                onChange={(e) => setForm((f) => ({ ...f, nome_responsavel: e.target.value }))}
                onBlur={() => setForm((f) => ({ ...f, nome_responsavel: toTitleCase(f.nome_responsavel) }))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="seller_cpf_responsavel" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                CPF do responsável
              </label>
              <input
                id="seller_cpf_responsavel"
                type="text"
                placeholder="000.000.000-00"
                value={form.cpf_responsavel}
                onChange={(e) => setForm((f) => ({ ...f, cpf_responsavel: formatarCNPJouCPF(e.target.value, "CPF") }))}
                className={inputMonoClass}
                maxLength={14}
              />
            </div>
            <div>
              <label htmlFor="seller_data_nascimento_responsavel" className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                Data de nascimento do responsável
              </label>
              <input
                id="seller_data_nascimento_responsavel"
                type="date"
                value={form.data_nascimento}
                onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))}
                className={inputClass}
              />
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                Opcional. Usada apenas como referência no cadastro comercial.
              </p>
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {!cadastroPendente ? (
              <Link
                href="/seller/dashboard"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-5 py-2.5 text-center text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)] sm:min-h-0 sm:justify-start"
              >
                Voltar ao painel
              </Link>
            ) : (
              <span className="hidden sm:block" aria-hidden />
            )}
            <div className="flex justify-center sm:justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 w-full max-w-sm items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 active:brightness-[0.92] disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-700 sm:w-auto sm:max-w-none sm:min-w-[11rem]"
              >
                {saving ? "Salvando..." : "Salvar cadastro"}
              </button>
            </div>
          </div>
        </form>
      </div>
      <SellerNav active="cadastro" />
    </div>
  );
}
