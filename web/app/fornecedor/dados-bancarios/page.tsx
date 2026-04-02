"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";
import { toTitleCase } from "@/lib/formatText";

type DadosBancarios = {
  chave_pix: string | null;
  nome_banco: string | null;
  nome_no_banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
};
type DadosBancariosForm = {
  chave_pix: string;
  nome_banco: string;
  nome_no_banco: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
};

export default function FornecedorDadosBancariosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [data, setData] = useState<DadosBancarios>({
    chave_pix: null,
    nome_banco: null,
    nome_no_banco: null,
    agencia: null,
    conta: null,
    tipo_conta: null,
  });
  const [form, setForm] = useState<DadosBancariosForm>({
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
      const d: DadosBancarios = {
        chave_pix: f.chave_pix ?? null,
        nome_banco: f.nome_banco ?? null,
        nome_no_banco: f.nome_no_banco ?? null,
        agencia: f.agencia ?? null,
        conta: f.conta ?? null,
        tipo_conta: f.tipo_conta ?? null,
      };
      setData(d);
      setForm({
        chave_pix: d.chave_pix ?? "",
        nome_banco: d.nome_banco ?? "",
        nome_no_banco: d.nome_no_banco ?? "",
        agencia: d.agencia ?? "",
        conta: d.conta ?? "",
        tipo_conta: d.tipo_conta ?? "",
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
      const res = await fetch("/api/fornecedor/dados-bancarios", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
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
      setOkMsg("Dados bancários atualizados.");
      setData({
        chave_pix: form.chave_pix.trim() || null,
        nome_banco: form.nome_banco.trim() || null,
        nome_no_banco: form.nome_no_banco.trim() || null,
        agencia: form.agencia.trim() || null,
        conta: form.conta.trim() || null,
        tipo_conta: form.tipo_conta.trim() || null,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/fornecedor/login");
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

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-0 md:pt-14 pb-24 md:pb-8">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-5 py-5 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/fornecedor/dashboard"
            className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1"
          >
            ← Voltar ao dashboard
          </Link>
          <button
            onClick={sair}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            Sair
          </button>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-sm">
          <h1 className="text-lg font-semibold text-[var(--foreground)] mb-1">Dados bancários</h1>
          <p className="text-xs text-[var(--muted)] mb-6">Configure onde deseja receber os repasses</p>

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

          <form onSubmit={salvar} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Chave PIX</label>
              <input
                type="text"
                value={form.chave_pix}
                onChange={(e) => setForm((f) => ({ ...f, chave_pix: e.target.value }))}
                placeholder="Email, telefone, CPF ou chave aleatória"
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Nome do banco</label>
              <input
                type="text"
                value={form.nome_banco}
                onChange={(e) => setForm((f) => ({ ...f, nome_banco: e.target.value }))}
                onBlur={() => setForm((f) => ({ ...f, nome_banco: toTitleCase(f.nome_banco) }))}
                placeholder="Ex: Banco do Brasil"
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Nome no banco / Razão social</label>
              <input
                type="text"
                value={form.nome_no_banco}
                onChange={(e) => setForm((f) => ({ ...f, nome_no_banco: e.target.value }))}
                onBlur={() => setForm((f) => ({ ...f, nome_no_banco: toTitleCase(f.nome_no_banco) }))}
                placeholder="Como aparece no extrato"
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Conta</label>
                <input
                  type="text"
                  value={form.conta}
                  onChange={(e) => setForm((f) => ({ ...f, conta: e.target.value }))}
                  placeholder="00000-0"
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Tipo de conta</label>
              <select
                value={form.tipo_conta}
                onChange={(e) => setForm((f) => ({ ...f, tipo_conta: e.target.value }))}
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                <option value="">Selecione</option>
                <option value="corrente">Corrente</option>
                <option value="poupanca">Poupança</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-[var(--accent)] hover:opacity-90 disabled:opacity-60 text-white font-medium py-3 px-4 text-sm"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </form>
        </div>

      </div>
      <FornecedorNav active="dados-bancarios" />
    </div>
  );
}
