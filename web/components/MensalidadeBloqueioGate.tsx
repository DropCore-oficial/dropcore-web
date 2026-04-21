"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Mensalidade = {
  id: string;
  ciclo: string;
  valor: number;
  status: string;
  vencimento_em: string | null;
  vencido: boolean;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function MensalidadeBloqueioGate({
  context,
  nome,
  children,
  logoHref,
}: {
  context: "seller" | "fornecedor";
  nome?: string | null;
  children: React.ReactNode;
  logoHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === `/${context}/login`;
  /** Registo por convite é público (sem sessão), como o login. */
  const isRegisterPage = pathname.startsWith(`/${context}/register`);
  const isSellerCalculadora = context === "seller" && pathname.startsWith("/seller/calculadora");
  const isSellerCadastro = context === "seller" && pathname.startsWith("/seller/cadastro");
  const [loading, setLoading] = useState(true);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [modalPix, setModalPix] = useState<Mensalidade | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopiaCola, setPixCopiaCola] = useState<string | null>(null);
  const [pixErro, setPixErro] = useState<string | null>(null);
  const [pixExpiraEm, setPixExpiraEm] = useState<string | null>(null);
  const [pixRestanteSec, setPixRestanteSec] = useState<number | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [trialAtivo, setTrialAtivo] = useState(false);

  const apiMens = context === "seller" ? "/api/seller/mensalidades" : "/api/fornecedor/mensalidades";
  const apiSync = context === "seller" ? "/api/seller/mensalidades/sync" : "/api/fornecedor/mensalidades/sync";
  const apiCobranca = (id: string) =>
    context === "seller" ? `/api/seller/mensalidades/${id}/cobranca-pix` : `/api/fornecedor/mensalidades/${id}/cobranca-pix`;
  const loginPath = context === "seller" ? "/seller/login" : "/fornecedor/login";

  const load = async (opts?: { doSync?: boolean; silent?: boolean }) => {
    const { doSync = false, silent = false } = opts ?? {};
    if (!silent) setLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setTrialAtivo(false);
        router.replace(loginPath);
        return;
      }
      // Sync: verifica no MP se pagamento foi aprovado (fallback do webhook em localhost)
      if (doSync) {
        try {
          await fetch(apiSync, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
        } catch {
          // ignora erro do sync
        }
      }
      const res = await fetch(apiMens, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          setTrialAtivo(false);
          await supabaseBrowser.auth.signOut();
          router.replace(loginPath);
          return;
        }
        setMensalidades([]);
        setTrialAtivo(false);
        return;
      }
      const json = await res.json();
      setMensalidades(json.items ?? []);
      setTrialAtivo(!!json.trial_ativo);
    } catch {
      setMensalidades([]);
      setTrialAtivo(false);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    // Login, registo por convite, cadastro comercial e calculadora do seller não passam pelo gate de mensalidade
    if (isLoginPage || isRegisterPage || isSellerCalculadora || isSellerCadastro) {
      setLoading(false);
      return;
    }
    load();
  }, [apiMens, isLoginPage, isRegisterPage, isSellerCalculadora, isSellerCadastro]);

  useEffect(() => {
    const vencida = mensalidades.some((m) => m.vencido);
    if (!vencida || trialAtivo) return;
    const run = () => load({ doSync: true, silent: true });
    const id = setInterval(run, 10000);
    return () => clearInterval(id);
  }, [mensalidades, trialAtivo]);

  const abrirPix = async (m: Mensalidade) => {
    setModalPix(m);
    setPixLoading(true);
    setPixQrCode(null);
    setPixCopiaCola(null);
    setPixErro(null);
    setPixExpiraEm(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace(loginPath);
        return;
      }
      const res = await fetch(apiCobranca(m.id), {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao gerar PIX.");
      setPixQrCode(json.qr_code_base64 ?? null);
      setPixCopiaCola(json.qr_code ?? null);
      setPixExpiraEm(json.expira_em ?? null);
    } catch (e: unknown) {
      setPixErro(e instanceof Error ? e.message : "Erro ao gerar PIX.");
    } finally {
      setPixLoading(false);
    }
  };

  useEffect(() => {
    if (!pixExpiraEm || !pixQrCode) return;
    const tick = () => {
      const rest = Math.max(0, Math.floor((new Date(pixExpiraEm!).getTime() - Date.now()) / 1000));
      setPixRestanteSec(rest);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pixExpiraEm, pixQrCode]);

  const sair = async () => {
    await supabaseBrowser.auth.signOut();
    router.replace(loginPath);
  };

  const temMensalidadeVencida = mensalidades.some((m) => m.vencido);
  const primeiraVencida = mensalidades.find((m) => m.vencido) ?? mensalidades[0];
  const bloquearPorMensalidade = temMensalidadeVencida && !trialAtivo;

  if (isLoginPage || isRegisterPage || isSellerCalculadora || isSellerCadastro) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-emerald-500 dark:border-neutral-700 dark:border-t-emerald-400" />
      </div>
    );
  }

  if (bloquearPorMensalidade && primeiraVencida) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)] p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-between">
            {logoHref ? (
              <DropCoreLogo variant="horizontal" href={logoHref} className="min-w-[140px]" />
            ) : (
              <DropCoreLogo variant="horizontal" href={null} className="min-w-[140px]" />
            )}
            <div className="flex items-center gap-2">
              <NotificationBell context={context} />
              <ThemeToggle />
              <button
                onClick={sair}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Sair
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center shadow-lg">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7 text-[var(--muted)]">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-[var(--foreground)] mb-2">Acesso bloqueado</h1>
            <p className="text-sm text-[var(--muted)] mb-6">
              Regularize sua mensalidade para voltar a acessar o sistema.
            </p>
            <button
              onClick={() => abrirPix(primeiraVencida)}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 text-sm transition-colors shadow-sm"
            >
              Pagar mensalidade
            </button>
          </div>

          {modalPix && (
            <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--card-border)]">
                  <h2 className="text-sm font-semibold text-[var(--foreground)]">Pagar mensalidade</h2>
                  <button
                    onClick={() => setModalPix(null)}
                    className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors text-xl leading-none"
                  >
                    ×
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-sm text-[var(--muted)]">
                    Valor: <strong className="text-[var(--foreground)]">{BRL.format(modalPix.valor)}</strong>
                  </p>
                  {pixErro && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
                      {pixErro}
                    </p>
                  )}
                  {pixLoading && <p className="text-sm text-[var(--muted)]">Gerando PIX…</p>}
                  {!pixLoading && pixQrCode && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <span className="text-lg">✓</span>
                        <p className="text-sm font-semibold">PIX gerado! Pague agora</p>
                      </div>
                      {pixRestanteSec !== null && (
                        <div
                          className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium ${
                            pixRestanteSec <= 60 ? "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200" : "bg-neutral-100 dark:bg-neutral-800 text-[var(--muted)]"
                          }`}
                        >
                          <span className={pixRestanteSec <= 60 ? "animate-pulse" : ""}>⏱</span> Válido por{" "}
                          {Math.floor(pixRestanteSec / 60)}:{(pixRestanteSec % 60).toString().padStart(2, "0")}
                        </div>
                      )}
                      <div className="flex justify-center p-4 bg-white dark:bg-neutral-900 rounded-xl">
                        <img src={`data:image/png;base64,${pixQrCode}`} alt="QR Code PIX" className="w-40 h-40" />
                      </div>
                      {pixCopiaCola && (
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(pixCopiaCola!);
                            setPixCopiado(true);
                            setTimeout(() => setPixCopiado(false), 2000);
                          }}
                          className="w-full rounded-xl border-2 border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                          {pixCopiado ? "✓ Copiado!" : "📋 Copiar código PIX"}
                        </button>
                      )}
                      <p className="text-[11px] text-[var(--muted)]">Após pagar, o acesso será liberado automaticamente.</p>
                    </div>
                  )}
                  {!pixLoading && !pixQrCode && !pixErro && <p className="text-sm text-[var(--muted)]">Gerando PIX…</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
