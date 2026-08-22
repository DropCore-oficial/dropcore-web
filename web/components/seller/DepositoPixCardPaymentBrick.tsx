"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_SOFT,
} from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";
import { carregarSdkMercadoPago } from "@/lib/mercadopagoSdkLoader";

type BrickController = { unmount?: () => void };

type CardSubmitPayload = {
  token?: string;
  payment_method_id?: string;
  installments?: number;
  issuer_id?: string | number;
};

declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale?: string },
    ) => {
      bricks: () => {
        create: (
          brickType: string,
          container: string | HTMLElement,
          settings: Record<string, unknown>,
        ) => Promise<BrickController>;
      };
    };
  }
}

/**
 * Card Brick pra recarga de crédito (deposito-pix) — espelha
 * `components/portal/MensalidadeCardPaymentBrick.tsx`, trocando o endpoint de mensalidade
 * pelo de recarga. Duplicado de propósito em vez de generalizar o componente da mensalidade
 * — evita risco no fluxo de cobrança que já está em produção.
 *
 * O valor mostrado dentro do Brick (`amount`) é o crédito pedido; o valor real por parcela
 * (com a taxa da Mercado Pago já embutida) é o que o próprio Brick mostra no dropdown de
 * parcelas — o servidor cobra exatamente esse mesmo valor (consulta a mesma API de
 * parcelamento da MP em `lib/mercadopagoInstallmentsLookup.ts`), sem estimar nada. Só 1x
 * (à vista) não é oferecido: a MP não expõe taxa nenhuma pro pagador nesse caso.
 */
function extrairDadosCartao(raw: unknown): CardSubmitPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const form = (o.formData ?? o) as Record<string, unknown>;
  const token = typeof form.token === "string" ? form.token : undefined;
  const payment_method_id =
    typeof form.payment_method_id === "string" ? form.payment_method_id : undefined;
  if (!token || !payment_method_id) return null;
  return {
    token,
    payment_method_id,
    installments:
      typeof form.installments === "number"
        ? form.installments
        : Number(form.installments) || 1,
    issuer_id:
      typeof form.issuer_id === "string" || typeof form.issuer_id === "number"
        ? form.issuer_id
        : undefined,
  };
}

export function DepositoPixCardPaymentBrick({
  depositoId,
  amount,
  payerEmail,
  publicKey,
  onAprovado,
  onErro,
}: {
  depositoId: string;
  amount: number;
  payerEmail: string;
  publicKey: string | null;
  onAprovado: (info: { taxaMp: number; valorCobrado: number }) => void;
  onErro: (msg: string) => void;
}) {
  const containerId = `mp-card-brick-deposito-${depositoId}`;
  const controllerRef = useRef<BrickController | null>(null);
  const brickReadyRef = useRef(false);
  const onAprovadoRef = useRef(onAprovado);
  const onErroRef = useRef(onErro);
  onAprovadoRef.current = onAprovado;
  onErroRef.current = onErro;
  const [brickReady, setBrickReady] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [carregandoBrick, setCarregandoBrick] = useState(false);
  const [sdkErro, setSdkErro] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    if (!payerEmail?.trim()) {
      onErroRef.current(
        "E-mail não encontrado. Atualize o e-mail no cadastro ou na conta de login.",
      );
      return;
    }
    if (amount <= 0) return;

    let cancelled = false;
    brickReadyRef.current = false;
    setSdkErro(null);
    setCarregandoBrick(true);
    setBrickReady(false);

    const mount = async () => {
      try {
        await carregarSdkMercadoPago();
      } catch (e: unknown) {
        if (cancelled) return;
        const msg =
          e instanceof Error
            ? e.message
            : "Não foi possível carregar o Mercado Pago. Recarregue a página.";
        setSdkErro(msg);
        onErroRef.current(msg);
        setCarregandoBrick(false);
        return;
      }

      if (cancelled || !window.MercadoPago) return;

      const el = document.getElementById(containerId);
      if (!el) {
        setCarregandoBrick(false);
        return;
      }

      controllerRef.current?.unmount?.();
      controllerRef.current = null;
      el.innerHTML = "";

      const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
      const bricksBuilder = mp.bricks();

      try {
        const controller = await bricksBuilder.create("cardPayment", containerId, {
          initialization: {
            amount: Number(amount.toFixed(2)),
            payer: { email: payerEmail.trim() },
          },
          customization: {
            visual: { style: { theme: "default" } },
            paymentMethods: { minInstallments: 2, maxInstallments: 12 },
          },
          callbacks: {
            onReady: () => {
              if (!cancelled) {
                brickReadyRef.current = true;
                setBrickReady(true);
                setCarregandoBrick(false);
              }
            },
            onSubmit: (cardFormData: unknown) => {
              const dados = extrairDadosCartao(cardFormData);
              if (!dados?.token || !dados.payment_method_id) {
                onErroRef.current("Não foi possível ler os dados do cartão. Tente de novo.");
                return Promise.reject();
              }

              setProcessando(true);
              onErroRef.current("");

              return (async () => {
                try {
                  const {
                    data: { session },
                  } = await supabaseBrowser.auth.getSession();
                  if (!session?.access_token) {
                    onErroRef.current("Sessão expirada. Faça login de novo.");
                    return;
                  }

                  const res = await fetch(`/api/seller/deposito-pix/${depositoId}/cobranca-cartao`, {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${session.access_token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      token: dados.token,
                      payment_method_id: dados.payment_method_id,
                      installments: dados.installments ?? 1,
                      issuer_id: dados.issuer_id,
                    }),
                  });
                  const json = await res.json();
                  if (!res.ok) {
                    onErroRef.current(
                      typeof json?.error === "string" ? json.error : "Pagamento recusado.",
                    );
                    throw new Error("payment_failed");
                  }
                  if (json.status === "approved" || json.deposito_liberado) {
                    onAprovadoRef.current({
                      taxaMp: Number(json.taxa_mp ?? 0),
                      valorCobrado: Number(json.valor_cobrado ?? 0),
                    });
                    return;
                  }
                  if (json.status === "pending" || json.status === "in_process") {
                    onErroRef.current("Pagamento em análise. Aguarde alguns minutos ou tente PIX.");
                    throw new Error("payment_pending");
                  }
                  onErroRef.current("Pagamento não aprovado. Verifique o cartão ou use PIX.");
                  throw new Error("payment_rejected");
                } catch (err) {
                  if (err instanceof Error && err.message.startsWith("payment_")) {
                    throw err;
                  }
                  onErroRef.current("Erro de rede ao processar o cartão.");
                  throw err;
                } finally {
                  setProcessando(false);
                }
              })();
            },
            onError: (error: unknown) => {
              const msg =
                error && typeof error === "object" && "message" in error
                  ? String((error as { message: unknown }).message)
                  : "Erro no formulário de cartão.";
              if (!cancelled) {
                setSdkErro(msg);
                onErroRef.current(msg);
                setCarregandoBrick(false);
              }
            },
          },
        });
        if (!cancelled) controllerRef.current = controller;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Não foi possível carregar o formulário de cartão.";
        if (!cancelled) {
          setSdkErro(msg);
          onErroRef.current(msg);
          setCarregandoBrick(false);
        }
      }
    };

    const t = window.setTimeout(() => void mount(), 80);

    const timeoutId = window.setTimeout(() => {
      if (cancelled || brickReadyRef.current) return;
      const msg =
        "O formulário de cartão demorou para carregar. Recarregue a página (Cmd+Shift+R).";
      setSdkErro(msg);
      onErroRef.current(msg);
      setCarregandoBrick(false);
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.clearTimeout(timeoutId);
      controllerRef.current?.unmount?.();
      controllerRef.current = null;
    };
  }, [publicKey, payerEmail, amount, depositoId, containerId]);

  if (!publicKey) {
    return (
      <p
        className={cn(
          "mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
          DANGER_PREMIUM_SURFACE_TRANSPARENT,
          DANGER_PREMIUM_TEXT_SOFT,
        )}
      >
        Cartão indisponível no momento.
      </p>
    );
  }

  if (!payerEmail?.trim()) {
    return (
      <p
        className={cn(
          "mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
          DANGER_PREMIUM_SURFACE_TRANSPARENT,
          DANGER_PREMIUM_TEXT_SOFT,
        )}
      >
        Informe um e-mail no cadastro pra pagar com cartão.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-[var(--muted)]">
        Cartão só parcelado (2x a 12x) — o valor de cada opção já é o valor real cobrado pela
        Mercado Pago, igual aparece no formulário abaixo. Pra pagamento único (à vista), use o
        Pix.
      </p>
      {sdkErro && !carregandoBrick ? (
        <p
          className={cn(
            "mb-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
            DANGER_PREMIUM_SURFACE_TRANSPARENT,
            DANGER_PREMIUM_TEXT_SOFT,
          )}
        >
          {sdkErro}
        </p>
      ) : null}
      <div className="relative min-h-[22rem] w-full">
        {carregandoBrick && !brickReady ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)]"
            aria-busy="true"
          >
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-200 border-t-emerald-500 dark:border-neutral-700 dark:border-t-emerald-400" />
            <p className="text-xs text-[var(--muted)]">Carregando formulário de cartão…</p>
          </div>
        ) : null}
        <div
          id={containerId}
          className={cn(
            "min-h-[22rem] w-full rounded-xl border border-[var(--card-border)] bg-white p-1 dark:bg-neutral-950",
            processando && "pointer-events-none opacity-60",
          )}
          aria-busy={processando || carregandoBrick}
        />
      </div>
      {processando ? (
        <p className="mt-2 text-center text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Processando pagamento…
        </p>
      ) : null}
    </div>
  );
}
