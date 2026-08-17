"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS, MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";

/**
 * Avisa o seller que já está vinculado a um fornecedor mas nunca fez nenhuma recarga
 * PIX aprovada — evita operar (estoque no marketplace, pedidos) sem saldo nenhum. Mesmo
 * padrão de gate do `MensalidadeBloqueioGate`, mas sem embutir o fluxo de pagamento:
 * manda pro dashboard (`?recarregar=1`), que já abre o modal de recarga sozinho.
 *
 * Telas em `EXIGE_SEM_FORNECEDOR_PATHS` bloqueiam por "nunca depositou" mesmo sem
 * fornecedor vinculado ainda (ex.: integração ERP — não faz sentido configurar Olist/
 * Bling sem saldo pra honrar o pedido que isso vai trazer).
 *
 * Fora de `SEM_DISPENSA_PATHS`, o seller pode fechar o modal e navegar (dashboard,
 * pedidos, créditos) — o aviso volta a aparecer sempre que ele entrar de novo numa tela
 * de risco financeiro real (assumir produto/estoque ou configurar ERP sem saldo).
 */
const EXIGE_SEM_FORNECEDOR_PATHS = ["/seller/integracoes-erp"];
const SEM_DISPENSA_PATHS = ["/seller/integracoes-erp", "/seller/produtos"];
const DISMISS_KEY = "dropcore_seller_deposito_dismissed";

export function SellerDepositoObrigatorioGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname === "/seller/login";
  const isRegisterPage = pathname.startsWith("/seller/register");
  const isCalculadora = pathname.startsWith("/seller/calculadora");
  const isCadastro = pathname.startsWith("/seller/cadastro");
  const skipGate = isLoginPage || isRegisterPage || isCalculadora || isCadastro;
  const exigeSemFornecedor = EXIGE_SEM_FORNECEDOR_PATHS.some((p) => pathname.startsWith(p));
  const semDispensa = SEM_DISPENSA_PATHS.some((p) => pathname.startsWith(p));

  const [booting, setBooting] = useState(!skipGate);
  const [precisaDepositar, setPrecisaDepositar] = useState(false);
  const [nuncaDepositou, setNuncaDepositou] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  useEffect(() => {
    if (skipGate) {
      setBooting(false);
      return;
    }
    cancelledRef.current = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token || cancelledRef.current) return;
        const res = await fetch("/api/seller/deposito-status", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!res.ok || cancelledRef.current) return;
        const json = (await res.json()) as { precisa_depositar?: boolean; nunca_depositou?: boolean };
        setPrecisaDepositar(Boolean(json.precisa_depositar));
        setNuncaDepositou(Boolean(json.nunca_depositou));
      } catch {
        // Falha de rede: não bloqueia por conta própria, mantém estado anterior.
      } finally {
        if (!cancelledRef.current) setBooting(false);
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, [skipGate, pathname]);

  const bloqueado = exigeSemFornecedor ? nuncaDepositou : precisaDepositar;
  const mostrarModal = bloqueado && (semDispensa || !dismissed);

  if (skipGate || booting || !mostrarModal) return <>{children}</>;

  function fechar() {
    setDismissed(true);
    if (typeof window !== "undefined") window.sessionStorage.setItem(DISMISS_KEY, "1");
  }

  return (
    <>
      {children}
      <div className={MODAL_OVERLAY_CLASS}>
        <div className={MODAL_PANEL_CLASS}>
          <div className={cn(MODAL_PANEL_BODY_CLASS, "p-5 space-y-4 text-center")}>
            <h2 className="text-lg font-bold text-[var(--foreground)]">Recarregue para continuar</h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              {exigeSemFornecedor
                ? "Configurar a integração de ERP exige ter feito pelo menos uma recarga PIX aprovada — sem saldo, não há como honrar os pedidos que essa integração vai trazer."
                : semDispensa
                  ? "Gerenciar produtos exige ter feito pelo menos uma recarga PIX aprovada — sem saldo, não há como honrar o pedido que esse estoque vai trazer."
                  : "Sua conta já está vinculada a um fornecedor, mas ainda não tem nenhuma recarga PIX aprovada. Faça sua primeira recarga de créditos DropCore para liberar o uso do painel."}
            </p>
            <button
              type="button"
              onClick={() => router.push("/seller/dashboard?recarregar=1")}
              className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              Recarregar agora
            </button>
            {!semDispensa && (
              <button
                type="button"
                onClick={fechar}
                className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
              >
                Fechar
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                await supabaseBrowser.auth.signOut();
                router.replace("/seller/login");
              }}
              className="text-[11px] font-medium text-[var(--muted)] underline hover:text-[var(--foreground)]"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
