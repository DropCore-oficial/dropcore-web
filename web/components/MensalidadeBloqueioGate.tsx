"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { PortalMensalidadeBloqueioOverlay } from "@/components/portal/PortalMensalidadeBloqueioOverlay";
import {
  MensalidadeBloqueioContext,
  type MensalidadeBloqueioContextValue,
} from "@/lib/mensalidadeBloqueioContext";
import { resolverEmailPagadorMp } from "@/lib/mercadopagoPayerEmail";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Mensalidade = {
  id: string;
  ciclo: string;
  valor: number;
  status: string;
  vencimento_em: string | null;
  vencido: boolean;
};

function mensalidadeBloqueia(m: Mensalidade): boolean {
  return m.vencido || m.status === "inadimplente";
}

function mensalidadesIguais(a: Mensalidade[], b: Mensalidade[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.vencido !== y.vencido ||
      x.valor !== y.valor ||
      x.vencimento_em !== y.vencimento_em
    ) {
      return false;
    }
  }
  return true;
}

export function MensalidadeBloqueioGate({
  context,
  nome,
  children,
  logoHref,
}: {
  context: "seller" | "fornecedor";
  nome?: string | null;
  children: ReactNode;
  logoHref?: string;
}) {
  return (
    <MensalidadeBloqueioGateInner context={context} nome={nome} logoHref={logoHref}>
      {children}
    </MensalidadeBloqueioGateInner>
  );
}

function MensalidadeBloqueioGateInner({
  context,
  children,
  logoHref,
}: {
  context: "seller" | "fornecedor";
  nome?: string | null;
  children: ReactNode;
  logoHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const routerRef = useRef(router);
  routerRef.current = router;
  const retornoRef = useRef(false);
  const retornoHandled = useRef(false);
  const bloqueadoRef = useRef(false);

  const isLoginPage = pathname === `/${context}/login`;
  const isRegisterPage = pathname.startsWith(`/${context}/register`);
  const isSellerCalculadora = context === "seller" && pathname.startsWith("/seller/calculadora");
  const isSellerCadastro = context === "seller" && pathname.startsWith("/seller/cadastro");
  const skipGate = isLoginPage || isRegisterPage || isSellerCalculadora || isSellerCadastro;

  const [booting, setBooting] = useState(!skipGate);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [metodo, setMetodo] = useState<"pix" | "cartao">("pix");
  const [payerEmail, setPayerEmail] = useState("");
  const [pixLoading, setPixLoading] = useState(false);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopiaCola, setPixCopiaCola] = useState<string | null>(null);
  const [pagamentoErro, setPagamentoErro] = useState<string | null>(null);
  const [pixExpiraEm, setPixExpiraEm] = useState<string | null>(null);
  const [pixRestanteSec, setPixRestanteSec] = useState<number | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [trialAtivo, setTrialAtivo] = useState(false);

  const apiMens = context === "seller" ? "/api/seller/mensalidades" : "/api/fornecedor/mensalidades";
  const apiSync = context === "seller" ? "/api/seller/mensalidades/sync" : "/api/fornecedor/mensalidades/sync";
  const apiCobrancaPix = (id: string) =>
    context === "seller"
      ? `/api/seller/mensalidades/${id}/cobranca-pix`
      : `/api/fornecedor/mensalidades/${id}/cobranca-pix`;
  const loginPath = context === "seller" ? "/seller/login" : "/fornecedor/login";
  const mercadoPagoPublicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY?.trim() || null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    retornoRef.current = q.get("mensalidade") === "retorno";
  }, [pathname]);

  const applyMensalidades = useCallback((items: Mensalidade[], trial: boolean) => {
    setMensalidades((prev) => (mensalidadesIguais(prev, items) ? prev : items));
    setTrialAtivo((prev) => (prev === trial ? prev : trial));
    bloqueadoRef.current = items.some((m) => mensalidadeBloqueia(m)) && !trial;
  }, []);

  const load = useCallback(async (opts?: { doSync?: boolean }) => {
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        if (!bloqueadoRef.current) {
          setTrialAtivo(false);
        }
        setPayerEmail("");
        routerRef.current.replace(loginPath);
        return;
      }
      let cadastroEmail: string | null = null;
      const mePath = context === "seller" ? "/api/seller/me" : "/api/fornecedor/me";
      try {
        const meRes = await fetch(mePath, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (meRes.ok) {
          const meJson = await meRes.json();
          cadastroEmail =
            context === "seller"
              ? (meJson.seller?.email as string | null | undefined) ?? null
              : (meJson.fornecedor?.email_comercial as string | null | undefined) ?? null;
        }
      } catch {
        // ignora
      }
      setPayerEmail(resolverEmailPagadorMp(session.user.email, cadastroEmail));
      if (opts?.doSync) {
        try {
          await fetch(apiSync, {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
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
          routerRef.current.replace(loginPath);
          return;
        }
        // Falha transitória: mantém último estado conhecido (evita piscar desbloqueio).
        return;
      }
      const json = await res.json();
      const items = (json.items ?? []) as Mensalidade[];
      const trial = !!json.trial_ativo;
      const aindaBloqueia = items.some((m) => mensalidadeBloqueia(m)) && !trial;

      applyMensalidades(items, trial);

      if (!aindaBloqueia) {
        setPixQrCode(null);
        setPixCopiaCola(null);
        setPagamentoErro(null);
        setPixExpiraEm(null);
        setPixCopiado(false);
        if (retornoRef.current && !retornoHandled.current) {
          retornoHandled.current = true;
          const dash = context === "seller" ? "/seller/dashboard" : "/fornecedor/dashboard";
          routerRef.current.replace(dash);
        }
      }
    } catch {
      // Mantém estado anterior em erro de rede.
    }
  }, [apiMens, apiSync, applyMensalidades, context, loginPath]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (skipGate) {
      setBooting(false);
      bloqueadoRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadRef.current({ doSync: true });
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [skipGate]);

  const bloquearPorMensalidade =
    mensalidades.some((m) => mensalidadeBloqueia(m)) && !trialAtivo;
  const primeiraBloqueante =
    mensalidades.find((m) => mensalidadeBloqueia(m)) ?? mensalidades[0];

  useEffect(() => {
    if (skipGate || booting || !bloquearPorMensalidade) return;
    const id = setInterval(() => void loadRef.current(), 60_000);
    return () => clearInterval(id);
  }, [skipGate, booting, bloquearPorMensalidade]);

  const gerarPixMensalidade = async (m: Mensalidade) => {
    setPixLoading(true);
    setPixQrCode(null);
    setPixCopiaCola(null);
    setPagamentoErro(null);
    setPixExpiraEm(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        routerRef.current.replace(loginPath);
        return;
      }
      const res = await fetch(apiCobrancaPix(m.id), {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao gerar PIX.");
      setPixQrCode(json.qr_code_base64 ?? null);
      setPixCopiaCola(json.qr_code ?? null);
      setPixExpiraEm(json.expira_em ?? null);
      void load({ doSync: true });
    } catch (e: unknown) {
      setPagamentoErro(e instanceof Error ? e.message : "Erro ao gerar PIX.");
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
    routerRef.current.replace(loginPath);
  };

  if (skipGate) return <>{children}</>;

  const exibirBloqueio = !booting && bloquearPorMensalidade && !!primeiraBloqueante;

  const ctx: MensalidadeBloqueioContextValue = {
    portalBloqueado: exibirBloqueio,
    verificando: booting,
  };

  return (
    <MensalidadeBloqueioContext.Provider value={ctx}>
      {!booting ? children : null}

      {booting ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--background)]"
          aria-busy="true"
          aria-label="Verificando mensalidade"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-emerald-500 dark:border-neutral-700 dark:border-t-emerald-400" />
        </div>
      ) : null}

      {exibirBloqueio && primeiraBloqueante ? (
        <PortalMensalidadeBloqueioOverlay
          embedded
          context={context}
          logoHref={logoHref ?? null}
          onSair={sair}
          vencimentoEm={primeiraBloqueante.vencimento_em}
          valor={primeiraBloqueante.valor}
          mensalidadeId={primeiraBloqueante.id}
          payerEmail={payerEmail}
          mercadoPagoPublicKey={mercadoPagoPublicKey}
          metodo={metodo}
          onMetodoChange={(m) => {
            setMetodo(m);
            setPagamentoErro(null);
          }}
          onCartaoAprovado={() => void load({ doSync: true })}
          onPagamentoErro={setPagamentoErro}
          pixLoading={pixLoading}
          pagamentoErro={pagamentoErro}
          pixQrCode={pixQrCode}
          pixCopiaCola={pixCopiaCola}
          pixRestanteSec={pixRestanteSec}
          pixCopiado={pixCopiado}
          onGerarPix={() => void gerarPixMensalidade(primeiraBloqueante)}
          onCopiarPix={async () => {
            if (!pixCopiaCola) return;
            await navigator.clipboard.writeText(pixCopiaCola);
            setPixCopiado(true);
            setTimeout(() => setPixCopiado(false), 2000);
          }}
          onGerarNovoPix={() => {
            setPixQrCode(null);
            setPixCopiaCola(null);
            setPagamentoErro(null);
            setPixExpiraEm(null);
            void gerarPixMensalidade(primeiraBloqueante);
          }}
        />
      ) : null}
    </MensalidadeBloqueioContext.Provider>
  );
}
