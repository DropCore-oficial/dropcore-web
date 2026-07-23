"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { cn } from "@/lib/utils";
import {
  LANDING_COMPARISON,
  LANDING_CTA_MAIL_SUBJECT,
  LANDING_CTA_PRIMARY_LABEL,
  LANDING_CTA_SECONDARY_LABEL,
  LANDING_ENTRY_CAPITAL,
  LANDING_FAQ,
  LANDING_FIRST_30_DAYS,
  LANDING_FEATURES,
  LANDING_FOR_WHOM,
  LANDING_FINAL_CTA,
  LANDING_FOCUS,
  LANDING_HERO,
  LANDING_HERO_SIMULATION,
  LANDING_HERO_IMPACT,
  LANDING_HERO_PROOF,
  LANDING_PAIN_SIGNALS,
  LANDING_PLANS,
  LANDING_SALES_EMAIL,
  LANDING_SECTIONS,
  LANDING_STEPS,
  landingSalesMailto,
} from "@/lib/landingContent";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const NAV = [
  { href: "#solucao", label: "Solução" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Planos" },
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

function PrimaryButton({
  className,
  children,
  href,
}: {
  className?: string;
  children?: React.ReactNode;
  href?: string;
}) {
  return (
    <a
      href={href ?? landingSalesMailto(LANDING_CTA_MAIL_SUBJECT)}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--primary-blue)] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--primary-blue-hover)]",
        className,
      )}
    >
      {children ?? LANDING_CTA_PRIMARY_LABEL}
      <IconArrow />
    </a>
  );
}

function GhostButton({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white px-6 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-emerald-50/70",
        className,
      )}
    >
      {children}
    </Link>
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
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)]/80 bg-[var(--background)]/80 backdrop-blur-xl">
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
          <PrimaryButton className="!px-4 !py-2 !text-xs sm:!px-5 sm:!text-sm" />
        </div>
      </div>
    </header>
  );
}

function HeroImpactPanel() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--danger)]/25 bg-[var(--card)]">
        <div className="flex items-center justify-between border-b border-[var(--danger)]/20 px-4 py-3">
          <span className="text-sm font-semibold text-[var(--danger)]">{LANDING_HERO_IMPACT.title}</span>
          <span className="rounded-full bg-[var(--danger)]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--danger)]">
            Alerta
          </span>
        </div>
        <div className="space-y-2 p-4 sm:p-5">
          <ul className="space-y-2">
            {LANDING_HERO_IMPACT.items.map((row) => (
              <li
                key={row.label}
                className="rounded-xl border border-[var(--danger)]/15 bg-[var(--danger)]/5 px-3.5 py-3"
              >
                <p className="text-sm font-medium text-[var(--foreground)]">{row.label}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{row.detail}</p>
              </li>
            ))}
          </ul>
          <p className="pt-2 text-xs font-medium text-[var(--danger)]">{LANDING_HERO_IMPACT.footnote}</p>
        </div>
      </div>
    </div>
  );
}

function HeroSimulationPanel() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="rounded-2xl border border-[var(--primary-blue)]/20 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary-blue)]">{LANDING_HERO_SIMULATION.title}</p>
        <div className="mt-4 grid gap-3">
          <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/5 p-3.5">
            <p className="text-sm font-semibold text-[var(--danger)]">{LANDING_HERO_SIMULATION.leftTitle}</p>
            <ul className="mt-2 space-y-1.5 text-xs text-[var(--muted)]">
              {LANDING_HERO_SIMULATION.leftItems.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/45 p-3.5">
            <p className="text-sm font-semibold text-emerald-700">{LANDING_HERO_SIMULATION.rightTitle}</p>
            <ul className="mt-2 space-y-1.5 text-xs text-[var(--muted)]">
              {LANDING_HERO_SIMULATION.rightItems.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">{LANDING_HERO_SIMULATION.footnote}</p>
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[var(--foreground)]">
      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-20 lg:grid lg:grid-cols-2 lg:items-center lg:gap-14 lg:pt-24">
        <div className="text-center lg:text-left">
          <p className="mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/85">
            {LANDING_HERO.eyebrow}
          </p>
          <h1 className="text-4xl font-semibold leading-[1.07] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
            {LANDING_HERO.title}
            <span className="block text-emerald-300">{LANDING_HERO.titleAccent}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-white/80 lg:mx-0">{LANDING_HERO.subtitle}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <PrimaryButton />
            <GhostButton href="/seller/login" className="border-white/35 bg-transparent text-white hover:bg-white/10">
              {LANDING_CTA_SECONDARY_LABEL}
            </GhostButton>
          </div>
        </div>
        <div className="mt-14 lg:mt-0">
          <div className="space-y-4 rounded-3xl border border-white/15 bg-white/5 p-4 sm:p-5">
            <HeroImpactPanel />
            <HeroSimulationPanel />
          </div>
        </div>
      </div>
      <dl className="relative mx-auto grid max-w-6xl gap-px border-y border-white/15 bg-white/10 sm:grid-cols-3">
        {LANDING_HERO_PROOF.map((item) => (
          <div key={item.label} className="bg-[var(--foreground)] px-6 py-8 text-center sm:py-10">
            <dt className="text-sm font-semibold text-white">{item.value}</dt>
            <dd className="mt-1 text-sm text-white/80">{item.label}</dd>
            <dd className="mt-2 text-xs leading-relaxed text-white/70">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function EntryCapitalSection() {
  return (
    <section className="border-b border-[var(--border-subtle)] bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="rounded-3xl border border-[var(--primary-blue)]/25 bg-[var(--primary-blue)]/5 p-7 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary-blue)]">{LANDING_ENTRY_CAPITAL.badge}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
            {LANDING_ENTRY_CAPITAL.title}
          </h2>
          <p className="mt-2 text-xl font-bold text-[var(--primary-blue)]">{LANDING_ENTRY_CAPITAL.highlight}</p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">{LANDING_ENTRY_CAPITAL.subtitle}</p>
          <ul className="mt-7 grid gap-3 md:grid-cols-3">
            {LANDING_ENTRY_CAPITAL.points.map((point) => (
              <li key={point} className="rounded-xl border border-[var(--primary-blue)]/15 bg-[var(--primary-blue)]/5 px-4 py-3 text-sm text-[var(--foreground)]">
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ComparisonSection() {
  return (
    <section id="solucao" className="border-b border-white/15 bg-[var(--foreground)] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeader
          id="solucao-titulo"
          title={LANDING_SECTIONS.comparison.title}
          subtitle={LANDING_SECTIONS.comparison.subtitle}
          tone="dark"
        />
        <ul className="mt-16 space-y-4">
          {LANDING_COMPARISON.map((row) => (
            <li
              key={row.before}
              className="grid gap-4 rounded-2xl border border-white/20 bg-white/10 p-6 sm:grid-cols-2 sm:gap-8 sm:p-8"
            >
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/60">Antes</p>
                <p className="mt-2 text-sm leading-relaxed text-white/80 sm:text-base">{row.before}</p>
              </div>
              <div className="sm:border-l sm:border-white/20 sm:pl-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Com DropCore</p>
                <p className="mt-2 text-sm leading-relaxed text-white sm:text-base">{row.after}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PainSignalsSection() {
  return (
    <section className="border-b border-white/15 bg-[var(--foreground)] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Diagnóstico rápido</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">Se você se identifica com estes sinais, o DropCore não é opcional</h3>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {LANDING_PAIN_SIGNALS.map((item) => (
            <article key={item.title} className="rounded-2xl border border-white/20 bg-white/10 p-7">
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/75">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepsSection() {
  return (
    <section id="como-funciona" className="border-y border-white/15 bg-[var(--foreground)] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeader id="como-funciona-titulo" title={LANDING_SECTIONS.steps.title} subtitle={LANDING_SECTIONS.steps.subtitle} tone="dark" />
        <ol className="mt-16 grid gap-6 md:grid-cols-3">
          {LANDING_STEPS.map((step, idx) => (
            <li
              key={step.step}
              className={cn(
                "rounded-2xl border p-8",
                idx === 1
                  ? "border-[var(--primary-blue)]/45 bg-[var(--primary-blue)]/20"
                  : "border-white/20 bg-white/10",
              )}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-semibold text-emerald-300">
                {step.step}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/75">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="recursos" className="border-y border-[var(--border-subtle)] bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeader id="recursos-titulo" title={LANDING_SECTIONS.features.title} subtitle={LANDING_SECTIONS.features.subtitle} />
        <ul className="mt-16 grid gap-6 sm:grid-cols-2">
          {LANDING_FEATURES.map((f, idx) => (
            <li
              key={f.title}
              className={cn(
                "rounded-2xl border p-8",
                idx % 2 === 0 ? "border-emerald-100 bg-emerald-50/40" : "border-[var(--border-subtle)] bg-[var(--card)]",
              )}
            >
              <h3 className="text-base font-semibold text-[var(--foreground)]">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FocusSection() {
  return (
    <section className="bg-[var(--foreground)] py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-20">
        <SectionHeader
          id="foco"
          align="left"
          title={LANDING_SECTIONS.focus.title}
          subtitle={LANDING_SECTIONS.focus.subtitle}
          tone="dark"
        />
        <ul className="space-y-3">
          {LANDING_FOCUS.map((item) => (
            <li key={item} className="flex gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                <IconCheck className="h-3 w-3" />
              </span>
              <span className="text-sm leading-relaxed text-white/90">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function First30DaysSection() {
  return (
    <section className="border-t border-[var(--border-subtle)] bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="rounded-3xl border border-[var(--primary-blue)]/25 bg-[var(--primary-blue)]/5 p-8 sm:p-10">
          <h3 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Primeiros 30 dias no DropCore</h3>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            Uma evolução prática de operação para seller que quer consistência antes de acelerar.
          </p>
          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {LANDING_FIRST_30_DAYS.map((item) => (
              <li key={item} className="flex gap-3 rounded-xl border border-[var(--primary-blue)]/15 bg-white px-4 py-3">
                <span className="mt-0.5 text-emerald-600">
                  <IconCheck className="h-4 w-4" />
                </span>
                <span className="text-sm text-[var(--foreground)]">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FitSection() {
  return (
    <section className="border-t border-white/15 bg-[var(--foreground)] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Para quem é</p>
            <ul className="mt-4 space-y-3">
              {LANDING_FOR_WHOM.yes.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-white/90">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 p-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/65">Para quem não é</p>
            <ul className="mt-4 space-y-3">
              {LANDING_FOR_WHOM.no.map((item) => (
                <li key={item} className="text-sm text-white/75">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="planos" className="border-t border-[var(--border-subtle)] bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeader id="planos-titulo" title={LANDING_SECTIONS.plans.title} subtitle={LANDING_SECTIONS.plans.subtitle} />
        <ul className="mt-16 grid gap-6 lg:grid-cols-2 lg:gap-8">
          {LANDING_PLANS.map((plan) => (
            <li
              key={plan.id}
              className={cn(
                "flex flex-col rounded-2xl border bg-[var(--card)] p-8 sm:p-10",
                plan.highlighted ? "border-[var(--primary-blue)]/35 bg-[var(--primary-blue)]/5" : "border-[var(--border-subtle)]",
              )}
            >
              {plan.highlighted ? (
                <span className="mb-4 inline-flex w-fit rounded-full bg-[var(--primary-blue)]/10 px-3 py-1 text-xs font-medium text-[var(--primary-blue)]">
                  {plan.badge}
                </span>
              ) : (
                <span className="mb-4 inline-flex w-fit rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                  {plan.badge}
                </span>
              )}
              <h3 className="text-xl font-semibold text-[var(--foreground)]">{plan.name}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{plan.description}</p>
              <p className="mt-8 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight tabular-nums text-[var(--foreground)]">{plan.priceLabel}</span>
                <span className="text-sm text-[var(--muted)]">{plan.period}</span>
              </p>
              <ul className="mt-8 flex-1 space-y-3 border-t border-[var(--border-subtle)] pt-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3 text-sm text-[var(--muted)]">
                    <IconCheck className="mt-0.5 shrink-0 text-emerald-600" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={landingSalesMailto(`Plano ${plan.name} — DropCore`)}
                className={cn(
                  "mt-10 inline-flex w-full items-center justify-center rounded-full py-3 text-sm font-medium transition",
                  plan.highlighted
                    ? "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90"
                    : "border border-[var(--border-subtle)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
                )}
              >
                {plan.cta}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="bg-[var(--foreground)] py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <SectionHeader id="faq-titulo" title={LANDING_SECTIONS.faq.title} subtitle={LANDING_SECTIONS.faq.subtitle} tone="dark" />
        <dl className="mt-14 divide-y divide-white/15 border-y border-white/15">
          {LANDING_FAQ.map((item) => (
            <div key={item.q} className="py-6">
              <dt className="text-base font-medium text-white">{item.q}</dt>
              <dd className="mt-3 text-sm leading-relaxed text-white/75">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="border-t border-[var(--border-subtle)] bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="rounded-3xl border border-[var(--foreground)]/10 bg-[var(--foreground)] px-6 py-14 text-center sm:px-12 sm:py-16">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{LANDING_FINAL_CTA.title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/75">{LANDING_FINAL_CTA.subtitle}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={landingSalesMailto(LANDING_CTA_MAIL_SUBJECT)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-[var(--foreground)] shadow-sm transition hover:opacity-90"
            >
              {LANDING_CTA_PRIMARY_LABEL}
              <IconArrow />
            </a>
            <Link
              href="/seller/login"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/35 bg-transparent px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              {LANDING_CTA_SECONDARY_LABEL}
            </Link>
          </div>
          <p className="mt-8 text-sm text-blue-100">
            <a href={landingSalesMailto()} className="font-medium text-white underline decoration-blue-200/70 underline-offset-4 transition hover:decoration-white">
              {LANDING_SALES_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </section>
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
        <EntryCapitalSection />
        <ComparisonSection />
        <PainSignalsSection />
        <StepsSection />
        <FeaturesSection />
        <FocusSection />
        <First30DaysSection />
        <FitSection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
    </div>
  );
}
