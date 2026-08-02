"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { cn } from "@/lib/utils";
import {
  LANDING_COMPARISON,
  LANDING_CTA_FINAL_LABEL,
  LANDING_CTA_HEADER_LABEL,
  LANDING_CTA_HERO_LABEL,
  LANDING_CTA_SECONDARY_LABEL,
  LANDING_FAQ,
  LANDING_FLOW,
  LANDING_FOOTER_LINKS,
  LANDING_FOR_WHOM,
  LANDING_FINAL_CTA,
  LANDING_HERO,
  LANDING_HERO_ORDER_TRACKER,
  LANDING_HERO_PROOF,
  LANDING_INLINE_CTA,
  LANDING_INTEGRATIONS_BAR,
  LANDING_SALES_EMAIL,
  LANDING_SECTIONS,
  LANDING_STEPS,
  landingSalesWhatsapp,
} from "@/lib/landingContent";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const NAV = [
  { href: "#solucao", label: "Solução" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#faq", label: "FAQ" },
] as const;

function IconArrow({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


function PrimaryButton({
  className,
  children,
  href,
}: {
  className?: string;
  children: React.ReactNode;
  href?: string;
}) {
  return (
    <a
      href={href ?? landingSalesWhatsapp()}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 hover:scale-[1.03] active:scale-[0.97]",
        className,
      )}
    >
      {children}
      <IconArrow />
    </a>
  );
}

function GhostButton({
  href,
  children,
  onDark = false,
}: {
  href: string;
  children: React.ReactNode;
  /** Fundo escuro por trás (ex.: dentro do Hero) — troca pra contorno claro em vez do padrão emerald/branco. */
  onDark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3 text-sm font-medium transition hover:scale-[1.03] active:scale-[0.97]",
        onDark
          ? "border-white/35 bg-transparent text-white hover:bg-white/10"
          : "border-emerald-300 bg-white text-[var(--foreground)] hover:bg-emerald-50/70",
      )}
    >
      {children}
    </Link>
  );
}

/** Observa o elemento e marca "visível" na 1ª vez que entra na viewport (fica visível pra sempre depois). */
function useRevealVisible(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return visible;
}

function revealClassName(visible: boolean, className?: string): string {
  return cn(
    "transition-all duration-700 ease-out",
    visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
    className,
  );
}

/** Bloco que entra com fade + leve subida ao rolar até ele (uma vez só). */
function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useRevealVisible(ref);
  return (
    <div ref={ref} className={revealClassName(visible, className)} style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}>
      {children}
    </div>
  );
}

/** Mesma animação que `Reveal`, mas renderiza `<li>` — pra usar dentro de `<ul>`/`<ol>` sem quebrar semântica. */
function RevealLi({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const visible = useRevealVisible(ref);
  return (
    <li ref={ref} className={revealClassName(visible, className)} style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}>
      {children}
    </li>
  );
}

function SectionHeader({
  id,
  title,
  subtitle,
  align = "center",
  tone = "light",
}: {
  id: string;
  title: string;
  subtitle: string;
  align?: "center" | "left";
  tone?: "light" | "dark";
}) {
  return (
    <header id={id} className={cn("scroll-mt-28", align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl")}>
      <h2
        className={cn(
          "text-3xl font-semibold tracking-tight sm:text-[2.15rem] sm:leading-tight",
          tone === "dark" ? "text-white" : "text-[var(--foreground)]",
        )}
      >
        {title}
      </h2>
      <p className={cn("mt-4 text-base leading-relaxed", tone === "dark" ? "text-white/75" : "text-[var(--muted)]")}>{subtitle}</p>
    </header>
  );
}

function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-[var(--background)]/80 backdrop-blur-xl transition-shadow duration-300",
        scrolled ? "border-[var(--border-subtle)] shadow-sm" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <DropCoreLogo variant="horizontal" href="/" theme="light" />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Principal">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/seller/login" className="hidden text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)] sm:inline">
            Entrar
          </Link>
          <PrimaryButton className="!px-4 !py-2 !text-xs sm:!px-5 sm:!text-sm">{LANDING_CTA_HEADER_LABEL}</PrimaryButton>
        </div>
      </div>
    </header>
  );
}

function HeroOrderTrackerPanel() {
  const steps = LANDING_HERO_ORDER_TRACKER.steps;
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div
        className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-emerald-400/20 blur-3xl motion-safe:animate-[pulse-glow_4s_ease-in-out_infinite]"
        aria-hidden
      />
      <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-2xl shadow-black/30 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{LANDING_HERO_ORDER_TRACKER.title}</p>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
            {LANDING_HERO_ORDER_TRACKER.orderLabel}
          </span>
        </div>
        <ol className="relative mt-5 space-y-5">
          {steps.map((step, idx) => (
            <li key={step.label} className="relative flex gap-3">
              {idx < steps.length - 1 && (
                <span className="absolute left-3 top-6 h-full w-px -translate-x-1/2 bg-emerald-100" aria-hidden />
              )}
              <span
                className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white opacity-0 motion-safe:animate-[pop-in_0.4s_ease-out_forwards] motion-reduce:opacity-100"
                style={{ animationDelay: `${500 + idx * 220}ms` }}
              >
                <IconCheck className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 pb-0.5">
                <p className="text-sm font-semibold text-[var(--foreground)]">{step.label}</p>
                <p className="text-xs text-[var(--muted)]">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-t border-[var(--border-subtle)] pt-3 text-[11px] leading-relaxed text-[var(--muted)]">
          {LANDING_HERO_ORDER_TRACKER.footnote}
        </p>
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[var(--foreground)]">
      <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16 lg:grid lg:grid-cols-2 lg:items-center lg:gap-14 lg:pt-20">
        <Reveal className="text-center lg:text-left">
          <p className="mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/85">
            {LANDING_HERO.eyebrow}
          </p>
          <h1 className="text-5xl font-bold leading-[1.03] tracking-tight text-white sm:text-6xl lg:text-[4rem]">
            {LANDING_HERO.title}
            <span className="block text-emerald-300">{LANDING_HERO.titleAccent}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-white/80 lg:mx-0">{LANDING_HERO.subtitle}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <PrimaryButton>{LANDING_CTA_HERO_LABEL}</PrimaryButton>
            <GhostButton href="/seller/login" onDark>
              {LANDING_CTA_SECONDARY_LABEL}
            </GhostButton>
          </div>
        </Reveal>
        <Reveal className="mt-10 lg:mt-0" delayMs={150}>
          <HeroOrderTrackerPanel />
        </Reveal>
      </div>
      <dl className="relative mx-auto grid max-w-6xl gap-4 px-5 pb-12 sm:grid-cols-3 sm:gap-6 sm:px-8 sm:pb-16">
        {LANDING_HERO_PROOF.map((item, idx) => (
          <Reveal
            key={item.label}
            delayMs={idx * 100}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-8 text-center"
          >
            <dt className="text-sm font-semibold text-emerald-300">{item.value}</dt>
            <dd className="mt-1 text-sm text-white/90">{item.label}</dd>
            <dd className="mt-2 text-xs leading-relaxed text-white/60">{item.detail}</dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}

function IntegrationsBar() {
  return (
    <div className="border-y border-[var(--border-subtle)] bg-white py-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 sm:flex-row sm:gap-6 sm:px-8">
        <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{LANDING_INTEGRATIONS_BAR.label}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 sm:justify-start">
          {LANDING_INTEGRATIONS_BAR.items.map((item) => (
            <span key={item} className="text-base font-semibold text-[var(--foreground)]/70">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ComparisonSection() {
  return (
    <section id="solucao" className="border-b border-white/15 bg-[var(--foreground)] py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeader
            id="solucao-titulo"
            title={LANDING_SECTIONS.comparison.title}
            subtitle={LANDING_SECTIONS.comparison.subtitle}
            tone="dark"
          />
        </Reveal>
        <ul className="mt-10 space-y-4">
          {LANDING_COMPARISON.map((row, idx) => (
            <RevealLi
              key={row.before}
              delayMs={idx * 100}
              className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:grid-cols-2 sm:gap-8 sm:p-8"
            >
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/50">
                  <IconX className="h-3 w-3" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-white/50">Antes</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/80 sm:text-base">{row.before}</p>
                </div>
              </div>
              <div className="flex gap-3 sm:border-l sm:border-white/10 sm:pl-8">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Com DropCore</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-white sm:text-base">{row.after}</p>
                </div>
              </div>
            </RevealLi>
          ))}
        </ul>
      </div>
    </section>
  );
}

function InlineCtaSection() {
  return (
    <section className="bg-white py-10 sm:py-12">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="flex flex-col items-center justify-between gap-6 rounded-3xl bg-emerald-600 px-6 py-9 text-center shadow-lg shadow-emerald-900/10 sm:flex-row sm:px-10 sm:py-8 sm:text-left">
          <div>
            <h3 className="text-xl font-semibold text-white sm:text-2xl">{LANDING_INLINE_CTA.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-emerald-50 sm:text-base">{LANDING_INLINE_CTA.subtitle}</p>
          </div>
          <a
            href={landingSalesWhatsapp(LANDING_INLINE_CTA.whatsappMessage)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-emerald-700 shadow-sm transition hover:scale-[1.03] hover:bg-emerald-50 active:scale-[0.97]"
          >
            {LANDING_INLINE_CTA.label}
            <IconArrow />
          </a>
        </Reveal>
      </div>
    </section>
  );
}

function StepsSection() {
  return (
    <section id="como-funciona" className="border-y border-[var(--border-subtle)] bg-white py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeader id="como-funciona-titulo" title={LANDING_SECTIONS.steps.title} subtitle={LANDING_SECTIONS.steps.subtitle} />
        </Reveal>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {LANDING_STEPS.map((step, idx) => (
            <RevealLi
              key={step.step}
              delayMs={idx * 120}
              className={cn(
                "rounded-3xl border p-8 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-900/5",
                idx === 1
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-[var(--border-subtle)]/70 bg-white",
              )}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                {step.step}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-[var(--foreground)]">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{step.body}</p>
            </RevealLi>
          ))}
        </ol>
      </div>
    </section>
  );
}

function IconFlowCart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function IconFlowPackage({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}

function IconFlowTruck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="1" y="7" width="13" height="9" rx="1" />
      <path d="M14 10h4l4 3v3h-8" />
      <circle cx="6.5" cy="18.5" r="1.5" />
      <circle cx="17.5" cy="18.5" r="1.5" />
    </svg>
  );
}

function IconFlowWallet({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

const FLOW_ICONS: Record<(typeof LANDING_FLOW)[number]["icon"], (props: { className?: string }) => React.ReactNode> = {
  cart: IconFlowCart,
  package: IconFlowPackage,
  truck: IconFlowTruck,
  wallet: IconFlowWallet,
};

function FlowSection() {
  return (
    <section className="border-y border-[var(--border-subtle)] bg-white py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeader id="fluxo-titulo" title={LANDING_SECTIONS.flow.title} subtitle={LANDING_SECTIONS.flow.subtitle} />
        </Reveal>
        <div className="relative mt-14">
          <div
            className="absolute left-6 right-6 top-6 hidden h-px bg-gradient-to-r from-emerald-200 via-emerald-300 to-emerald-200 lg:block"
            aria-hidden
          />
          <ol className="grid gap-8 lg:grid-cols-4 lg:gap-6">
            {LANDING_FLOW.map((item, idx) => {
              const Icon = FLOW_ICONS[item.icon];
              return (
                <RevealLi key={item.title} delayMs={idx * 120} className="relative flex gap-4 lg:flex-col lg:gap-0 lg:text-center">
                  <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 lg:mx-auto">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="lg:mt-5">
                    <h3 className="text-base font-semibold text-[var(--foreground)]">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{item.detail}</p>
                  </div>
                </RevealLi>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

function FitSection() {
  return (
    <section className="border-t border-[var(--border-subtle)] bg-[var(--surface-hover)] py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeader id="fit-titulo" title={LANDING_SECTIONS.fit.title} subtitle={LANDING_SECTIONS.fit.subtitle} />
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Reveal className="rounded-3xl border border-emerald-300 bg-emerald-50/40 p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Para quem é</p>
            <ul className="mt-4 space-y-3">
              {LANDING_FOR_WHOM.yes.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-[var(--foreground)]">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delayMs={120} className="rounded-3xl border border-[var(--border-subtle)]/70 bg-white p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Para quem não é</p>
            <ul className="mt-4 space-y-3">
              {LANDING_FOR_WHOM.no.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-[var(--muted)]">
                  <IconX className="mt-1 h-3 w-3 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-white py-14 sm:py-20">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal>
          <SectionHeader id="faq-titulo" title={LANDING_SECTIONS.faq.title} subtitle={LANDING_SECTIONS.faq.subtitle} />
        </Reveal>
        <Reveal delayMs={100}>
          <div className="mt-10 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
            {LANDING_FAQ.map((item, idx) => {
              const open = openIdx === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenIdx(open ? null : idx)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                  >
                    <span className="text-base font-medium text-[var(--foreground)]">{item.q}</span>
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                        open ? "rotate-180 bg-emerald-100 text-emerald-700" : "bg-[var(--surface-hover)] text-[var(--muted)]",
                      )}
                    >
                      <IconChevronDown className="h-3.5 w-3.5" />
                    </span>
                  </button>
                  <div
                    className="grid overflow-hidden transition-all duration-300 ease-out"
                    style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                  >
                    <div className="overflow-hidden">
                      <p className="pb-5 text-sm leading-relaxed text-[var(--muted)]">{item.a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="border-t border-[var(--border-subtle)] bg-white">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <Reveal className="rounded-3xl border border-[var(--foreground)]/10 bg-[var(--foreground)] px-6 py-10 text-center sm:px-12 sm:py-14">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{LANDING_FINAL_CTA.title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/75">{LANDING_FINAL_CTA.subtitle}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={landingSalesWhatsapp("Olá! Vim pela landing page e quero começar a vender na DropCore.")}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-[var(--foreground)] shadow-sm transition hover:scale-[1.03] hover:opacity-90 active:scale-[0.97]"
            >
              {LANDING_CTA_FINAL_LABEL}
              <IconArrow />
            </a>
            <Link
              href="/seller/login"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/35 bg-transparent px-6 py-3 text-sm font-medium text-white transition hover:scale-[1.03] hover:bg-white/10 active:scale-[0.97]"
            >
              {LANDING_CTA_SECONDARY_LABEL}
            </Link>
          </div>
          <p className="mt-6 text-xs text-white/60">{LANDING_FINAL_CTA.riskNote}</p>
        </Reveal>
      </div>
    </section>
  );
}

const FOOTER_ICON_CLASS =
  "flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]";

/** Glifo oficial (Simple Icons, CC0) — mesmo ícone usado no SiteFooter.tsx. */
function IconWhatsApp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function IconMail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

/** Glifo oficial (Simple Icons, CC0) — mesmo ícone usado no SiteFooter.tsx. */
function IconInstagram({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077" />
    </svg>
  );
}

/** Rodapé próprio da landing — sem o tom institucional/versículo do SiteFooter.tsx (que é
 * pra quem já é cliente logado), já que aqui é a primeira impressão de um visitante frio. */
function LandingFooter() {
  const ano = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--border-subtle)] bg-white">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <DropCoreLogo variant="horizontal" href="/" theme="light" />
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Links úteis">
            {LANDING_FOOTER_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <a href={landingSalesWhatsapp()} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={FOOTER_ICON_CLASS}>
              <IconWhatsApp className="h-4 w-4" />
            </a>
            <a href={`mailto:${LANDING_SALES_EMAIL}`} aria-label="E-mail" className={FOOTER_ICON_CLASS}>
              <IconMail className="h-4 w-4" />
            </a>
            <a
              href="https://www.instagram.com/dropcore.oficial/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className={FOOTER_ICON_CLASS}
            >
              <IconInstagram className="h-4 w-4" />
            </a>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-[var(--muted)] sm:text-left">© {ano} DropCore. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}

function SessionBanner() {
  const [sellerHref, setSellerHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token || cancelled) return;
      try {
        const res = await fetch("/api/org/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { seller_id?: string };
        if (!cancelled && json.seller_id) setSellerHref("/seller/dashboard");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!sellerHref) return null;

  return (
    <div className="border-b border-[var(--border-subtle)] bg-[var(--card)] px-4 py-2.5 text-center text-sm text-[var(--muted)]">
      Você está conectado.{" "}
      <Link href={sellerHref} className="font-medium text-[var(--foreground)] underline underline-offset-2">
        Abrir painel
      </Link>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="landing-light-only min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">
      <SessionBanner />
      <LandingHeader />
      <main>
        <HeroSection />
        <IntegrationsBar />
        <ComparisonSection />
        <InlineCtaSection />
        <StepsSection />
        <FlowSection />
        <FitSection />
        <FaqSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
