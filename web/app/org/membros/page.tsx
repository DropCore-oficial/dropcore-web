"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Member = {
  id: string;
  user_id: string;
  email: string;
  role_base: "owner" | "admin" | "operacional";
  pode_ver_dinheiro: boolean;
};

function Switch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-white
        disabled:opacity-50 disabled:cursor-not-allowed
        ${checked ? "bg-emerald-500" : "bg-neutral-300"}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${checked ? "translate-x-6" : "translate-x-1"}
        `}
      />
    </button>
  );
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || "Resposta inválida do servidor");
  }
}

export default function OrgMembrosPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgIdParam = searchParams.get("orgId");

  const [orgId, setOrgId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<"owner" | "admin" | "operacional" | null>(null);
  const [data, setData] = useState<Member[]>([]);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);

  // Guard: se não tiver sessão -> /login
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      if (!data.session) router.replace("/login");
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  async function load() {
    try {
      setErr("");
      setLoading(true);

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      if (!token) {
        router.replace("/login");
        return;
      }

      const meRes = await fetch("/api/org/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const meJson = await safeJson(meRes);
      if (!meRes.ok || !meJson?.org_id) {
        throw new Error(meJson?.error || "Sua sessão não está ligada a uma organização.");
      }

      const resolvedOrgId = String(meJson.org_id);
      if (orgIdParam && orgIdParam !== resolvedOrgId) {
        setErr("O parâmetro orgId da URL não corresponde à sua organização. Usando a organização da sua sessão.");
        router.replace("/org/membros");
      }

      setOrgId(resolvedOrgId);
      const rb = meJson?.role_base;
      if (rb === "owner" || rb === "admin" || rb === "operacional") {
        setViewerRole(rb);
      } else {
        setViewerRole(null);
      }

      const res = await fetch(`/api/org/membros?orgId=${encodeURIComponent(resolvedOrgId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Erro ao carregar membros");

      setData(json?.data || []);
    } catch (e: any) {
      setErr(e?.message || "Erro desconhecido");
      setData([]);
      setOrgId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdParam]);

  async function handleToggleFinance(targetUserId: string, currentValue: boolean) {
    const newValue = !currentValue;

    setToggling((prev) => new Set(prev).add(targetUserId));

    // otimista
    setData((prev) =>
      prev.map((m) =>
        m.user_id === targetUserId ? { ...m, pode_ver_dinheiro: newValue } : m
      )
    );

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/org/toggle-finance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orgId,
          memberId: targetUserId,
          enable: newValue,
        }),
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Erro ao atualizar permissão");
    } catch (e: any) {
      // rollback
      setData((prev) =>
        prev.map((m) =>
          m.user_id === targetUserId
            ? { ...m, pode_ver_dinheiro: currentValue }
            : m
        )
      );
      setErr(e?.message || "Erro ao atualizar permissão");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        return next;
      });
    }
  }

  async function handleAddMember() {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    setAdding(true);
    setErr("");

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/org/membros", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId, email }),
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Erro ao adicionar membro");

      setNewEmail("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Erro ao adicionar membro");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(memberId: string, email: string) {
    const ok = confirm(`Tem certeza que deseja excluir o membro ${email}? Essa ação remove o acesso à organização.`);
    if (!ok) return;

    setRemoving((prev) => new Set(prev).add(memberId));
    setErr("");

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/org/membros/remover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId, memberId }),
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error || "Erro ao excluir membro");

      await load();
    } catch (e: any) {
      setErr(e?.message || "Erro ao excluir membro");
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)] dropcore-p-auth">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Membros</h1>
            </div>
            <p className="text-sm text-[var(--muted)] mt-1">
              Organização:{" "}
              <span className="font-mono text-[var(--muted)]">{orgId}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={load}
              className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--card-border)] hover:opacity-90 text-[var(--foreground)] text-sm transition-colors"
            >
              Recarregar
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-600 border border-red-300 text-sm transition-colors font-medium"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--muted)] leading-relaxed">
          Aqui você gerencia apenas a{" "}
          <span className="text-[var(--foreground)] font-medium">
            equipe administrativa da organização no DropCore
          </span>{" "}
          (papéis owner, admin e operacional). Contas de fornecedor e de seller não entram nesta
          lista — cada perfil tem o próprio login:{" "}
          <span className="font-mono text-[var(--foreground)]/90">/fornecedor/login</span> e{" "}
          <span className="font-mono text-[var(--foreground)]/90">/seller/login</span>.
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
            <div className="font-medium">Erro</div>
            <div className="mt-1 break-words">{err}</div>
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="text-sm text-[var(--muted)]">
              Adicionar membro por e-mail
            </div>
            <div className="text-xs text-[var(--muted)]">
              Padrão: entra como operacional e pode_ver_dinheiro=false
            </div>
          </div>

          <div className="px-5 py-4 flex flex-col min-[400px]:flex-row gap-3 min-w-0">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@dominio.com"
              className="min-w-0 flex-1 rounded-lg bg-[var(--card)] border border-[var(--card-border)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-emerald-500/60"
            />
            <button
              onClick={handleAddMember}
              disabled={adding || !newEmail.trim()}
              className="w-full min-[400px]:w-auto shrink-0 px-4 py-2 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-sm transition-colors disabled:opacity-50"
            >
              {adding ? "Adicionando..." : "Adicionar"}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div className="text-sm text-[var(--muted)]">
              {loading ? "Carregando..." : `${data.length} membro(s)`}
            </div>
            <div className="text-xs text-[var(--muted)]">
              Dica: <span className="font-mono">/org/membros?orgId=...</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--card)]">
                <tr className="text-left text-[var(--muted)]">
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Papel</th>
                  <th className="px-5 py-3 font-medium">Financeiro</th>
                  <th className="px-5 py-3 font-medium">Ações</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-5 py-4 text-[var(--muted)]" colSpan={4}>
                      Buscando membros...
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td className="px-5 py-4 text-[var(--muted)]" colSpan={4}>
                      Nenhum membro encontrado.
                    </td>
                  </tr>
                ) : (
                  data.map((m) => (
                    <tr
                      key={m.id}
                      className="border-t border-[var(--card-border)] hover:bg-[var(--card)]/50 transition"
                    >
                      <td className="px-5 py-3 text-[var(--foreground)]">{m.email}</td>

                      <td className="px-5 py-3">
                        <select
                          value={m.role_base}
                          onChange={async (e) => {
                            const nextRole =
                              e.target.value as Member["role_base"];

                            try {
                              setErr("");

                              const { data: sess } =
                                await supabase.auth.getSession();
                              const token = sess.session?.access_token;

                              if (!token) {
                                router.replace("/login");
                                return;
                              }

                              const res = await fetch(
                                "/api/org/membros/set-role",
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${token}`,
                                  },
                                  body: JSON.stringify({
                                    orgId,
                                    memberId: m.user_id,
                                    role: nextRole,
                                  }),
                                }
                              );

                              const json = await safeJson(res);
                              if (!res.ok)
                                throw new Error(
                                  json?.error || "Erro ao mudar papel"
                                );

                              setData((prev) =>
                                prev.map((x) =>
                                  x.user_id === m.user_id
                                    ? { ...x, role_base: nextRole }
                                    : x
                                )
                              );
                            } catch (err: any) {
                              setErr(err?.message || "Erro ao mudar papel");
                              await load();
                            }
                          }}
                          className="rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-[var(--foreground)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/60"
                        >
                          <option value="owner">owner</option>
                          <option value="admin">admin</option>
                          <option value="operacional">operacional</option>
                        </select>
                      </td>

                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={m.pode_ver_dinheiro}
                            onChange={() =>
                              handleToggleFinance(
                                m.user_id,
                                m.pode_ver_dinheiro
                              )
                            }
                            disabled={toggling.has(m.user_id)}
                          />
                          <span className="text-xs text-[var(--muted)]">
                            {m.pode_ver_dinheiro ? "Liberado" : "Bloqueado"}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-3">
                        <button
                          onClick={() => handleRemoveMember(m.user_id, m.email)}
                          disabled={removing.has(m.user_id)}
                          className="px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs disabled:opacity-50"
                        >
                          {removing.has(m.user_id)
                            ? "Excluindo..."
                            : "Excluir"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 border-t border-[var(--card-border)] text-xs text-[var(--muted)]">
            Clique no switch para alternar a permissão financeira do membro.
          </div>
        </div>
      </div>
    </div>
  );
}
