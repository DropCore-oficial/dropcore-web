"use client";

import { useState, type ReactNode } from "react";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

/**
 * Padrão visual único para todo login DropCore (estilo SaaS / Shopify):
 * fundo neutro, card branco com sombra suave, tipografia em camadas, divisória antes do formulário.
 */

export const authLabelClass =
  "mb-1.5 block text-[13px] font-medium text-neutral-600 dark:text-neutral-400";

export const authInputClass = cn(
  "w-full min-h-[44px] rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-[15px] text-neutral-900",
  "placeholder:text-neutral-400 outline-none transition-[box-shadow,border-color]",
  "hover:border-neutral-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20",
  "dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500",
  "dark:hover:border-neutral-500 dark:focus:border-emerald-500",
);

export const authCardWrapperClass = cn(
  "w-full max-w-[380px]",
);

export const authShellPageClass = cn(
  "min-h-screen min-h-[100dvh] flex flex-col items-center justify-center",
  "bg-[#f6f6f7] px-4 py-6 sm:py-8",
  "dark:bg-neutral-950",
);

export const authCardClass = cn(
  "overflow-hidden rounded-2xl border border-neutral-200/90 bg-white",
  "shadow-[0_1px_0_rgba(0,0,0,0.03),0_2px_8px_rgba(0,0,0,0.035),0_6px_18px_rgba(0,0,0,0.045)]",
  "dark:border-neutral-800 dark:bg-neutral-900",
);

export const authAlertErrorClass =
  "mt-4 rounded-lg border border-red-200 bg-red-100 px-3.5 py-3 text-sm leading-relaxed text-red-800 break-words dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200";

/** Aviso “porta errada” (seller/fornecedor no /login) — discreto, não compete com o botão Entrar. */
export const authPortalHintClass = cn(
  "mt-4 rounded-lg border border-neutral-200/90 border-l-[3px] border-l-amber-400 bg-neutral-50/90",
  "ring-1 ring-amber-600/10 px-3.5 py-3.5 dark:border-neutral-700 dark:border-l-amber-400 dark:bg-neutral-900 dark:ring-amber-400/35",
);

export const authAlertSuccessClass =
  "mt-4 rounded-lg border border-emerald-300 bg-emerald-100 px-3.5 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300";

/** Link secundário (esqueci senha, rodapé). */
export const authMutedLinkClass =
  "text-center text-[13px] text-neutral-500 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200";

export const authFooterDividerClass =
  "mt-4 border-t border-neutral-200 pt-3.5 text-center text-[12px] leading-relaxed text-neutral-600 dark:border-neutral-700 dark:text-neutral-400";

export const authPrimaryButtonClass =
  "mt-1 w-full rounded-lg py-3 text-[15px] font-semibold shadow-sm transition hover:shadow";

export type DropcoreAuthShellProps = {
  /** Rótulo curto em caixa alta (ex.: «Seller», «Organização»). */
  eyebrow: string;
  /** Título principal do painel. */
  heading: string;
  /** Linha de apoio abaixo do título. */
  description?: string;
  headingClassName?: string;
  children: ReactNode;
};

export function DropcoreAuthShell({ eyebrow, heading, description, headingClassName, children }: DropcoreAuthShellProps) {
  return (
    <div className={cn(authShellPageClass, "dropcore-p-auth")}>
      <div className={authCardWrapperClass}>
        <div className={authCardClass}>
          {/* Cabeçalho da marca — sempre igual em todas as rotas */}
          <div className="border-b border-neutral-100 px-6 pb-3 pt-5 text-center dark:border-neutral-800 sm:px-7 sm:pb-4 sm:pt-6">
            <div className="flex items-center justify-between">
              <DropCoreLogo variant="horizontal" href={null} className="shrink-0" />
              <ThemeToggle className="min-h-[34px] min-w-[34px] inline-flex touch-manipulation items-center justify-center rounded-md border border-neutral-200 bg-neutral-100 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700" />
            </div>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
              {eyebrow}
            </p>
            <h1 className={cn("mt-0.5 text-[1.25rem] font-semibold leading-snug tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-[1.38rem]", headingClassName)}>
              {heading}
            </h1>
            {description ? (
              <p className="mx-auto mt-1 max-w-[20rem] text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                {description}
              </p>
            ) : null}
          </div>

          {/* Formulário e conteúdo específico da rota */}
          <div className="px-6 py-5.5 sm:px-7 sm:py-6.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

type AuthEmailInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  autoComplete?: string;
};

export function AuthEmailInput({
  id = "dropcore-auth-email",
  value,
  onChange,
  onEnter,
  placeholder = "seu@email.com",
  autoComplete = "email",
}: AuthEmailInputProps) {
  return (
    <div>
      <label htmlFor={id} className={authLabelClass}>
        E-mail
      </label>
      <input
        id={id}
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={authInputClass}
      />
    </div>
  );
}

type AuthPasswordInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
};

export function AuthPasswordInput({
  id = "dropcore-auth-senha",
  value,
  onChange,
  onEnter,
  placeholder = "••••••",
}: AuthPasswordInputProps) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={authLabelClass}>
        Senha
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={mostrar ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          placeholder={placeholder}
          autoComplete="current-password"
          className={cn(authInputClass, "pr-11")}
        />
        <button
          type="button"
          onClick={() => setMostrar(!mostrar)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          title={mostrar ? "Ocultar senha" : "Mostrar senha"}
        >
          {mostrar ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
