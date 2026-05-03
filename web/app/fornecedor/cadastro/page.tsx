"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";
import { BankCombobox } from "@/components/fornecedor/BankCombobox";
import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { cepParaConsultaViaCep } from "@/lib/cepViaCep";
import {
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_PRIMARY,
  AMBER_PREMIUM_TEXT_SECONDARY,
} from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

function upper(s: string): string {
  return s.toLocaleUpperCase("pt-BR");
}

/** Resposta mínima do ViaCEP (https://viacep.com.br/). */
type ViaCepJson = {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

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
  expedicao_cep: string;
  expedicao_logradouro: string;
  expedicao_numero: string;
  expedicao_complemento: string;
  expedicao_bairro: string;
  expedicao_cidade: string;
  expedicao_uf: string;
  chave_pix: string;
  nome_banco: string;
  nome_no_banco: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
};

function enderecoDespachoIgualMatriz(f: FormState): boolean {
  return (
    f.expedicao_cep === f.endereco_cep &&
    f.expedicao_logradouro === f.endereco_logradouro &&
    f.expedicao_numero === f.endereco_numero &&
    f.expedicao_complemento === f.endereco_complemento &&
    f.expedicao_bairro === f.endereco_bairro &&
    f.expedicao_cidade === f.endereco_cidade &&
    f.expedicao_uf === f.endereco_uf
  );
}

function copiarMatrizParaDespacho(f: FormState): Pick<
  FormState,
  | "expedicao_cep"
  | "expedicao_logradouro"
  | "expedicao_numero"
  | "expedicao_complemento"
  | "expedicao_bairro"
  | "expedicao_cidade"
  | "expedicao_uf"
> {
  return {
    expedicao_cep: f.endereco_cep,
    expedicao_logradouro: f.endereco_logradouro,
    expedicao_numero: f.endereco_numero,
    expedicao_complemento: f.endereco_complemento,
    expedicao_bairro: f.endereco_bairro,
    expedicao_cidade: f.endereco_cidade,
    expedicao_uf: f.endereco_uf,
  };
}

export default function FornecedorCadastroPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [overwriteFromCnpj, setOverwriteFromCnpj] = useState(false);
  const [confirmoRepasseTitularCnpj, setConfirmoRepasseTitularCnpj] = useState(false);
  /** Quando activo, o endereço de despacho copia o da matriz (sede) em tempo real. */
  const [envioIgualMatriz, setEnvioIgualMatriz] = useState(false);
  const [buscandoCepMatriz, setBuscandoCepMatriz] = useState(false);
  const [buscandoCepDespacho, setBuscandoCepDespacho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
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
    expedicao_cep: "",
    expedicao_logradouro: "",
    expedicao_numero: "",
    expedicao_complemento: "",
    expedicao_bairro: "",
    expedicao_cidade: "",
    expedicao_uf: "",
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
        const j = await res.json().catch(() => ({}));
        if (
          res.status === 401 ||
          res.status === 404 ||
          (res.status === 403 && j?.code === "FORNECEDOR_SEM_VINCULO_ORG_MEMBERS")
        ) {
          await supabaseBrowser.auth.signOut();
          router.replace("/fornecedor/login");
          return;
        }
        throw new Error(typeof j?.error === "string" ? j.error : "Erro ao carregar dados.");
      }
      const json = await res.json();
      const f = json.fornecedor ?? {};
      const cnpjDigits = normalizeCnpjInput(f.cnpj ?? "");
      const legExpLinha = String(f.expedicao_padrao_linha ?? "").trim();
      const expCep = String(f.expedicao_cep ?? "").replace(/\D/g, "").slice(0, 8);
      const expLog = upper(String(f.expedicao_logradouro ?? ""));
      const expNum = upper(String(f.expedicao_numero ?? ""));
      const expComp = upper(String(f.expedicao_complemento ?? ""));
      const expBai = upper(String(f.expedicao_bairro ?? ""));
      const expCid = upper(String(f.expedicao_cidade ?? ""));
      const expUf = upper(String(f.expedicao_uf ?? "")).replace(/[^A-Z]/g, "").slice(0, 2);
      const structVazio =
        !expCep && !expLog && !expNum && !expComp && !expBai && !expCid && !expUf;
      const nextForm: FormState = {
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
        expedicao_cep: expCep,
        expedicao_logradouro: structVazio && legExpLinha ? legExpLinha : expLog,
        expedicao_numero: expNum,
        expedicao_complemento: expComp,
        expedicao_bairro: expBai,
        expedicao_cidade: expCid,
        expedicao_uf: expUf,
        chave_pix: upper(String(f.chave_pix ?? "")),
        nome_banco: upper(String(f.nome_banco ?? "")),
        nome_no_banco: upper(String(f.nome_no_banco ?? "")),
        agencia: upper(String(f.agencia ?? "")),
        conta: upper(String(f.conta ?? "")),
        tipo_conta: f.tipo_conta ?? "",
      };
      setForm(nextForm);
      setEnvioIgualMatriz(enderecoDespachoIgualMatriz(nextForm));
      const lu = f.logo_url;
      setLogoUrl(typeof lu === "string" && lu.length > 0 ? lu : null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!envioIgualMatriz) return;
    setForm((f) => {
      const copia = copiarMatrizParaDespacho(f);
      if (
        f.expedicao_cep === copia.expedicao_cep &&
        f.expedicao_logradouro === copia.expedicao_logradouro &&
        f.expedicao_numero === copia.expedicao_numero &&
        f.expedicao_complemento === copia.expedicao_complemento &&
        f.expedicao_bairro === copia.expedicao_bairro &&
        f.expedicao_cidade === copia.expedicao_cidade &&
        f.expedicao_uf === copia.expedicao_uf
      ) {
        return f;
      }
      return { ...f, ...copia };
    });
  }, [
    envioIgualMatriz,
    form.endereco_cep,
    form.endereco_logradouro,
    form.endereco_numero,
    form.endereco_complemento,
    form.endereco_bairro,
    form.endereco_cidade,
    form.endereco_uf,
  ]);

  useEffect(() => {
    const cepConsulta = cepParaConsultaViaCep(form.endereco_cep);
    if (!cepConsulta) {
      if (form.endereco_cep.replace(/\D/g, "").length === 0) setBuscandoCepMatriz(false);
      return;
    }
    setBuscandoCepMatriz(true);
    const ac = new AbortController();
    void fetch(`https://viacep.com.br/ws/${cepConsulta}/json/`, { signal: ac.signal })
      .then((r) => r.json() as Promise<ViaCepJson>)
      .then((data) => {
        if (data.erro) {
          setBuscandoCepMatriz(false);
          return;
        }
        const log = String(data.logradouro ?? "").trim();
        const bai = String(data.bairro ?? "").trim();
        const cid = String(data.localidade ?? "").trim();
        const uf = String(data.uf ?? "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 2);
        setForm((f) => {
          if (cepParaConsultaViaCep(f.endereco_cep) !== cepConsulta) return f;
          return {
            ...f,
            endereco_cep: cepConsulta,
            endereco_logradouro: log ? upper(log) : f.endereco_logradouro,
            endereco_bairro: bai ? upper(bai) : f.endereco_bairro,
            endereco_cidade: cid ? upper(cid) : f.endereco_cidade,
            endereco_uf: uf ? uf : f.endereco_uf,
          };
        });
        setBuscandoCepMatriz(false);
      })
      .catch(() => setBuscandoCepMatriz(false));
    return () => ac.abort();
  }, [form.endereco_cep]);

  useEffect(() => {
    if (envioIgualMatriz) {
      setBuscandoCepDespacho(false);
      return;
    }
    const cepConsulta = cepParaConsultaViaCep(form.expedicao_cep);
    if (!cepConsulta) {
      if (form.expedicao_cep.replace(/\D/g, "").length === 0) setBuscandoCepDespacho(false);
      return;
    }
    setBuscandoCepDespacho(true);
    const ac = new AbortController();
    void fetch(`https://viacep.com.br/ws/${cepConsulta}/json/`, { signal: ac.signal })
      .then((r) => r.json() as Promise<ViaCepJson>)
      .then((data) => {
        if (data.erro) {
          setBuscandoCepDespacho(false);
          return;
        }
        const log = String(data.logradouro ?? "").trim();
        const bai = String(data.bairro ?? "").trim();
        const cid = String(data.localidade ?? "").trim();
        const uf = String(data.uf ?? "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 2);
        setForm((f) => {
          if (cepParaConsultaViaCep(f.expedicao_cep) !== cepConsulta) return f;
          return {
            ...f,
            expedicao_cep: cepConsulta,
            expedicao_logradouro: log ? upper(log) : f.expedicao_logradouro,
            expedicao_bairro: bai ? upper(bai) : f.expedicao_bairro,
            expedicao_cidade: cid ? upper(cid) : f.expedicao_cidade,
            expedicao_uf: uf ? uf : f.expedicao_uf,
          };
        });
        setBuscandoCepDespacho(false);
      })
      .catch(() => setBuscandoCepDespacho(false));
    return () => ac.abort();
  }, [form.expedicao_cep, envioIgualMatriz]);

  function temDadosRepassePreenchidos(f: FormState): boolean {
    return [f.chave_pix, f.nome_banco, f.nome_no_banco, f.agencia, f.conta, f.tipo_conta].some(
      (s) => String(s ?? "").trim().length > 0
    );
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
        router.replace("/fornecedor/login");
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/fornecedor/logo", {
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
      setOkMsg("Logo atualizada.");
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
        router.replace("/fornecedor/login");
        return;
      }
      const res = await fetch("/api/fornecedor/logo", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "Erro ao remover logo.");
      }
      setLogoUrl(null);
      setOkMsg("Logo removida.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover logo.");
    } finally {
      setLogoUploading(false);
    }
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
          expedicao_cep: form.expedicao_cep.replace(/\D/g, "") || null,
          expedicao_logradouro: upper(form.expedicao_logradouro.trim()) || null,
          expedicao_numero: upper(form.expedicao_numero.trim()) || null,
          expedicao_complemento: upper(form.expedicao_complemento.trim()) || null,
          expedicao_bairro: upper(form.expedicao_bairro.trim()) || null,
          expedicao_cidade: upper(form.expedicao_cidade.trim()) || null,
          expedicao_uf: upper(form.expedicao_uf.trim()).replace(/[^A-Z]/g, "").slice(0, 2) || null,
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

  function onCnpjChange(raw: string) {
    const digits = normalizeCnpjInput(raw).slice(0, 14);
    setForm((f) => ({ ...f, cnpj: formatCnpjDisplay(digits) }));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl border-2 border-[var(--card-border)] border-t-neutral-500 dark:border-t-neutral-400 animate-spin" />
          <p className="text-sm text-[var(--muted)] font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm uppercase text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-neutral-500 dark:focus:ring-neutral-400";
  const btnAtalhoNumero =
    "rounded-full border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="dropcore-shell-4xl py-5 space-y-6">
        <div>
          <Link
            href="/fornecedor/dashboard"
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center gap-1 transition-colors"
          >
            ← Voltar ao dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm overflow-visible">
          <h1 className="text-lg font-semibold text-[var(--foreground)] mb-1">Cadastro da empresa</h1>
          <p className="text-xs text-[var(--muted)] mb-6">
            Identificação, contato e dados para receber repasses
          </p>

          {error && (
            <div className="rounded-lg border border-[var(--danger)]/40 bg-red-50 dark:bg-red-950/35 px-4 py-3 text-sm text-red-800 dark:text-red-300 mb-4">
              {error}
            </div>
          )}
          {okMsg && (
            <div className="rounded-lg border border-emerald-500/35 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/25 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 mb-4">
              {okMsg}
            </div>
          )}

          <form onSubmit={salvar} className="space-y-8">
            <section id="empresa" className="space-y-5">
              <h2 className="text-sm font-semibold text-[var(--foreground)] border-b border-[var(--card-border)] pb-2">
                Empresa e contato
              </h2>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="shrink-0">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt=""
                      className="h-24 w-24 shrink-0 rounded-2xl border-0 object-contain bg-transparent p-0 outline-none ring-0"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-[var(--background)] px-2 text-center text-[11px] text-[var(--muted)]">
                      Sem logo
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-xs font-medium text-[var(--muted)]">Logo da empresa</p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      PNG, JPG, WebP ou GIF até 2 MB. Aparece no painel ao lado do nome.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={cn(
                        "inline-flex cursor-pointer items-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)]",
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
                        className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)] disabled:opacity-60"
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
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
                    className="shrink-0 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] disabled:opacity-60"
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
                    <p className="text-[11px] text-[var(--muted)] mt-1 leading-snug">
                      {buscandoCepMatriz
                        ? "A consultar CEP..."
                        : "Com 8 dígitos (ou 7 se faltar o zero no início), preenche logradouro, bairro, cidade e UF (ViaCEP)."}
                    </p>
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
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1">Número</label>
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, endereco_numero: "S/N" }))}
                        className={btnAtalhoNumero}
                      >
                        S/N
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, endereco_numero: "SEM NUMERO" }))}
                        className={btnAtalhoNumero}
                      >
                        Sem número
                      </button>
                    </div>
                    <input
                      type="text"
                      value={form.endereco_numero}
                      onChange={(e) => setForm((f) => ({ ...f, endereco_numero: upper(e.target.value) }))}
                      placeholder="Ex.: 123, S/N"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">Sem número na fachada? Use os atalhos ou digite.</p>
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
                <div className="mt-5 pt-4 border-t border-[var(--card-border)]">
                  <p className="text-xs font-medium text-[var(--muted)] mb-2">Despacho / CD padrão (opcional)</p>
                  <p className="text-[11px] text-[var(--muted)] mb-3 leading-snug">
                    O bloco «Endereço» acima é a <strong className="text-[var(--foreground)]">sede / fiscal</strong>. Aqui
                    fica o local de <strong className="text-[var(--foreground)]">expedição</strong> por padrão; em
                    produtos específicos você pode definir outro endereço ao editar o SKU.
                  </p>
                  <label className="flex items-start gap-2.5 mb-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={envioIgualMatriz}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setEnvioIgualMatriz(on);
                        if (on) {
                          setForm((f) => ({ ...f, ...copiarMatrizParaDespacho(f) }));
                        }
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--card-border)] bg-[var(--background)] text-emerald-600 shrink-0"
                    />
                    <span className="text-sm text-[var(--foreground)] leading-snug">
                      Endereço de envio é o mesmo endereço da matriz
                    </span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">CEP</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={envioIgualMatriz}
                        value={form.expedicao_cep}
                        onChange={(e) => {
                          setEnvioIgualMatriz(false);
                          setForm((f) => ({
                            ...f,
                            expedicao_cep: e.target.value.replace(/\D/g, "").slice(0, 8),
                          }));
                        }}
                        placeholder="00000000"
                        className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                      />
                      {!envioIgualMatriz && (
                        <p className="text-[11px] text-[var(--muted)] mt-1 leading-snug">
                          {buscandoCepDespacho
                            ? "A consultar CEP..."
                            : "Com 8 dígitos (ou 7 se faltar o zero no início), preenche logradouro, bairro, cidade e UF (ViaCEP)."}
                        </p>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Logradouro</label>
                      <input
                        type="text"
                        disabled={envioIgualMatriz}
                        value={form.expedicao_logradouro}
                        onChange={(e) => {
                          setEnvioIgualMatriz(false);
                          setForm((f) => ({ ...f, expedicao_logradouro: upper(e.target.value) }));
                        }}
                        placeholder="Rua / Avenida"
                        className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--muted)] mb-1">Número</label>
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={envioIgualMatriz}
                          onClick={() => {
                            setEnvioIgualMatriz(false);
                            setForm((f) => ({ ...f, expedicao_numero: "S/N" }));
                          }}
                          className={btnAtalhoNumero}
                        >
                          S/N
                        </button>
                        <button
                          type="button"
                          disabled={envioIgualMatriz}
                          onClick={() => {
                            setEnvioIgualMatriz(false);
                            setForm((f) => ({ ...f, expedicao_numero: "SEM NUMERO" }));
                          }}
                          className={btnAtalhoNumero}
                        >
                          Sem número
                        </button>
                      </div>
                      <input
                        type="text"
                        disabled={envioIgualMatriz}
                        value={form.expedicao_numero}
                        onChange={(e) => {
                          setEnvioIgualMatriz(false);
                          setForm((f) => ({ ...f, expedicao_numero: upper(e.target.value) }));
                        }}
                        placeholder="Ex.: 123, S/N"
                        className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                      />
                      <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">Sem número na fachada? Use os atalhos ou digite.</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Complemento</label>
                      <input
                        type="text"
                        disabled={envioIgualMatriz}
                        value={form.expedicao_complemento}
                        onChange={(e) => {
                          setEnvioIgualMatriz(false);
                          setForm((f) => ({ ...f, expedicao_complemento: upper(e.target.value) }));
                        }}
                        placeholder="Sala, bloco, etc. (opcional)"
                        className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Bairro</label>
                      <input
                        type="text"
                        disabled={envioIgualMatriz}
                        value={form.expedicao_bairro}
                        onChange={(e) => {
                          setEnvioIgualMatriz(false);
                          setForm((f) => ({ ...f, expedicao_bairro: upper(e.target.value) }));
                        }}
                        placeholder="Bairro"
                        className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Cidade</label>
                      <input
                        type="text"
                        disabled={envioIgualMatriz}
                        value={form.expedicao_cidade}
                        onChange={(e) => {
                          setEnvioIgualMatriz(false);
                          setForm((f) => ({ ...f, expedicao_cidade: upper(e.target.value) }));
                        }}
                        placeholder="Cidade"
                        className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">UF</label>
                      <input
                        type="text"
                        disabled={envioIgualMatriz}
                        value={form.expedicao_uf}
                        onChange={(e) => {
                          setEnvioIgualMatriz(false);
                          setForm((f) => ({
                            ...f,
                            expedicao_uf: e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2),
                          }));
                        }}
                        placeholder="SP"
                        className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="repasse" className="space-y-5 overflow-visible">
              <h2 className="text-sm font-semibold text-[var(--foreground)] border-b border-[var(--card-border)] pb-2">
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
                <label
                  className={cn(
                    AMBER_PREMIUM_SURFACE_TRANSPARENT,
                    "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-3 text-xs leading-relaxed"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--card-border)] bg-[var(--background)]"
                    checked={confirmoRepasseTitularCnpj}
                    onChange={(e) => setConfirmoRepasseTitularCnpj(e.target.checked)}
                  />
                  <span className={AMBER_PREMIUM_TEXT_SECONDARY}>
                    Declaro que a chave PIX e/ou a conta informadas são da{" "}
                    <strong className={cn("font-semibold", AMBER_PREMIUM_TEXT_PRIMARY)}>empresa cadastrada acima</strong>{" "}
                    (mesmo CNPJ e titular igual à razão social). Entendo que dados inconsistentes serão rejeitados e que a
                    DropCore pode solicitar comprovante.
                  </span>
                </label>
              )}
            </section>

            <div className="flex justify-center pt-1 md:justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 w-full max-w-sm items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 active:brightness-[0.92] disabled:opacity-60 md:w-auto md:max-w-none md:min-w-[11rem] dark:bg-emerald-600 dark:hover:bg-emerald-700"
              >
                {saving ? "Salvando..." : "Salvar cadastro"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <FornecedorNav active="cadastro" />
    </div>
  );
}
