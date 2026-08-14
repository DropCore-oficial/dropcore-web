"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS, MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";

/**
 * Bloqueia o portal do seller que já está vinculado a um fornecedor mas nunca fez
 * nenhuma recarga PIX aprovada — evita operar (estoque no marketplace, pedidos) sem
 * saldo nenhum. Mesmo padrão de gate do `MensalidadeBloqueioGate`, mas sem embutir o
 * fluxo de pagamento: manda pro dashboard (`?recarregar=1`), que já abre o modal de
 * recarga sozinho.
 */
export function SellerDepositoObrigatorioGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname === "/seller/login";
  const isRegisterPage = pathname.startsWith("/seller/register");
  const isCalculadora = pathname.startsWith("/seller/calculadora");
  const isCadastro = pathname.startsWith("/seller/cadastro");
  const skipGate = isLoginPage || isRegisterPage || isCalculadora || isCadastro;

  const [booting, setBooting] = useState(!skipGate);
  const [precisaDepositar, setPrecisaDepositar] = useState(false);
  const cancelledRef = useRef(false);

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
        const json = (await res.json()) as { precisa_depositar?: boolean };
        setPrecisaDepositar(Boolean(json.precisa_depositar));
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

  if (skipGate || booting || !precisaDepositar) return <>{children}</>;

  return (
    <>
      {children}
      <div className={MODAL_OVERLAY_CLASS}>
        <div className={MODAL_PANEL_CLASS}>
          <div className={cn(MODAL_PANEL_BODY_CLASS, "p-5 space-y-4 text-center")}>
            <h2 className="text-lg font-bold text-[var(--foreground)]">Recarregue para continuar</h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Sua conta já está vinculada a um fornecedor, mas ainda não tem nenhuma recarga PIX aprovada.
              Faça sua primeira recarga de créditos DropCore para liberar o uso do painel.
            </p>
            <button
              type="button"
              onClick={() => router.push("/seller/dashboard?recarregar=1")}
              className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              Recarregar agora
            </button>
            <button
              type="button"
              onClick={async () => {
                await supabaseBrowser.auth.signOut();
                router.replace("/seller/login");
              }}
              className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
