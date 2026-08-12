"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { DANGER_PREMIUM_SURFACE, DANGER_PREMIUM_TEXT_BODY, DANGER_PREMIUM_TEXT_SOFT } from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";
import {
  LANDING_COMPARISON,
  LANDING_CTA_FINAL_LABEL,
  LANDING_CTA_FINAL_MESSAGE,
  LANDING_CTA_HEADER_LABEL,
  LANDING_CTA_HERO_LABEL,
  LANDING_FAQ,
  LANDING_FLOW,
  LANDING_FOR_WHOM,
  LANDING_FINAL_CTA,
  LANDING_HERO,
  LANDING_HERO_PROOF,
  LANDING_HERO_VIDEO,
  LANDING_INLINE_CTA,
  LANDING_INTEGRATIONS_BAR,
  LANDING_MARKETPLACES_BAR,
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

const CTA_FINAL_ANCHOR = "cta-final";

/** Dataset "DropCore LP" no Gerenciador de Eventos da Meta — usado só na landing pública,
 * não no app logado (evita rastrear seller/fornecedor já autenticado). */
const META_PIXEL_ID = "1042181891938817";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/** Carrega o Meta Pixel só quando o script termina de rodar (`afterInteractive`) — não atrasa
 * o carregamento inicial da página. `PageView` dispara sozinho a cada visita; `Lead` é
 * disparado manualmente no clique do CTA que de fato abre o WhatsApp (ver `CtaSection`). */
function MetaPixel() {
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${META_PIXEL_ID}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          alt=""
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}

/** Dispara o "Lead" nos dois lados (pixel no client + Conversions API no server, ver
 * `web/app/api/meta-capi/route.ts`) com o mesmo `event_id`, pra Meta deduplicar em vez de
 * contar duas vezes. Não bloqueia o clique — o link pro WhatsApp segue normal. */
function trackFinalCtaLead() {
  const eventId = crypto.randomUUID();
  window.fbq?.("track", "Lead", {}, { eventID: eventId });
  fetch("/api/meta-capi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_name: "Lead",
      event_id: eventId,
      event_source_url: window.location.href,
    }),
    keepalive: true,
  }).catch(() => {});
}

/** Botões que não abrem o WhatsApp direto (ex.: "Comece a vender agora", "Chega de operar
 * sozinho") descem até o CTA final em vez de duplicar conversa — um único ponto de contato
 * no fim da página, não um por botão. */
function scrollToFinalCta(e: React.MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  document.getElementById(CTA_FINAL_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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

function IconPlay({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

/** Glifo oficial (Simple Icons, CC0) — mesmo ícone usado no SiteFooter.tsx. */
function IconWhatsApp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}


function PrimaryButton({
  className,
  children,
  href,
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <a
      href={href ?? landingSalesWhatsapp()}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 hover:scale-[1.03] active:scale-[0.97] sm:gap-2 sm:px-6 sm:py-3 sm:text-sm",
        className,
      )}
    >
      {children}
      <IconArrow />
    </a>
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
  titleClassName,
}: {
  id: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  tone?: "light" | "dark";
  /** Override pontual pro título — usado no FAQ pra caber numa linha só no desktop
   * (`lg:whitespace-nowrap` + fonte um pouco menor), sem mexer nos outros headers. */
  titleClassName?: string;
}) {
  return (
    <header id={id} className={cn("scroll-mt-28", align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl")}>
      <h2
        className={cn(
          "text-3xl font-semibold tracking-tight sm:text-[2.15rem] sm:leading-tight",
          tone === "dark" ? "text-white" : "text-[var(--foreground)]",
          titleClassName,
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p className={cn("mt-4 text-base leading-relaxed", tone === "dark" ? "text-white/75" : "text-[var(--muted)]")}>{subtitle}</p>
      )}
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
      <div className="dropcore-shell-6xl flex h-[4.25rem] items-center justify-between gap-4">
        <DropCoreLogo variant="horizontal" href="/" theme="light" />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Principal">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/seller/login" className="text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]">
            Entrar
          </Link>
          <PrimaryButton
            href={`#${CTA_FINAL_ANCHOR}`}
            onClick={scrollToFinalCta}
            className="!px-4 !py-2 !text-xs sm:!px-5 sm:!text-sm"
          >
            {LANDING_CTA_HEADER_LABEL}
          </PrimaryButton>
        </div>
      </div>
    </header>
  );
}

/** Vídeo auto-hospedado (Supabase Storage), sem player de terceiro — `preload="none"` +
 * clique pra tocar evita baixar o arquivo antes do visitante decidir assistir. 16:9 único,
 * toca inline no próprio card em qualquer largura (sem modal — ver LANDING_HERO_VIDEO). */
function HeroVideoPanel() {
  const [playing, setPlaying] = useState(false);
  const { src, poster, title } = LANDING_HERO_VIDEO;

  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      <div
        className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-emerald-400/20 blur-3xl motion-safe:animate-[pulse-glow_4s_ease-in-out_infinite]"
        aria-hidden
      />
      <div className="relative aspect-video overflow-hidden rounded-3xl border border-black/5 bg-black shadow-2xl shadow-black/30">
        {playing ? (
          <video src={src} poster={poster} controls autoPlay playsInline preload="none" title={title} className="h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group relative flex h-full w-full items-center justify-center"
            aria-label={`Assistir vídeo: ${title}`}
          >
            <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/60 text-[var(--foreground)] transition group-hover:bg-white/80">
              <IconPlay className="h-5 w-5" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[var(--foreground)]">
      <div className="relative dropcore-shell-6xl pb-12 pt-12 sm:pb-16 sm:pt-16 lg:grid lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-14 lg:pt-20">
        <Reveal className="text-center lg:min-w-0 lg:text-left">
          <h1 className="font-bold leading-[1.03] tracking-tight text-white">
            <span className="block whitespace-nowrap text-6xl sm:text-6xl lg:text-7xl">{LANDING_HERO.title}</span>
            <span className="block whitespace-nowrap text-3xl text-emerald-300 sm:text-6xl lg:mt-2 lg:text-[2.75rem]">
              {LANDING_HERO.titleAccent}
            </span>
          </h1>
          {/* Mobile/tablet: highlight maior, própria linha (ajustes pedidos nessa conversa). */}
          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-white/80 lg:hidden">
            {LANDING_HERO.subtitle}{" "}
            <span className="block whitespace-nowrap text-lg font-semibold text-white sm:inline sm:text-base">
              {LANDING_HERO.subtitleHighlight}
            </span>
          </p>
          {/* Desktop: parágrafo corrido, sem ajuste nenhum — exatamente como sempre foi. */}
          <p className="hidden max-w-lg text-base leading-relaxed text-white/80 lg:mt-6 lg:block">
            {LANDING_HERO.subtitle} <span className="font-semibold text-white">{LANDING_HERO.subtitleHighlight}</span>
          </p>
          {/* Vídeo entra aqui só no mobile (depois do texto de apoio, antes dos CTAs). No
           * desktop ele fica na coluna direita, ver o segundo <HeroVideoPanel /> abaixo. Duas
           * instâncias porque não dá pra só reordenar com CSS sem arriscar quebrar o grid 2
           * colunas do desktop; mesmo padrão já usado no sistema pra bloco que muda de posição
           * por breakpoint. */}
          <div className="mt-10 lg:hidden">
            <HeroVideoPanel />
          </div>
          <div className="mt-10 flex flex-row items-center justify-center gap-2 sm:gap-3 lg:mt-6 lg:justify-start">
            <a
              href={`#${CTA_FINAL_ANCHOR}`}
              onClick={scrollToFinalCta}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 hover:scale-[1.03] active:scale-[0.97]"
            >
              {LANDING_CTA_HERO_LABEL}
              <IconArrow />
            </a>
          </div>
        </Reveal>
        <Reveal className="hidden lg:block" delayMs={150}>
          <HeroVideoPanel />
        </Reveal>
      </div>
      {/* Risca só no mobile separando os CTAs do bloco de prova (dl) abaixo. */}
      <div className="dropcore-shell-6xl sm:hidden">
        <div className="h-px bg-white/15" />
      </div>
      <dl className="relative dropcore-shell-6xl grid gap-4 pb-12 pt-12 sm:grid-cols-3 sm:gap-6 sm:pb-16 sm:pt-0">
        {LANDING_HERO_PROOF.map((item, idx) => (
          <Reveal
            key={item.label}
            delayMs={idx * 100}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-8 text-center"
          >
            <dt className="text-base font-semibold text-emerald-300 sm:text-sm">{item.value}</dt>
            <dd className="mt-1 text-lg font-bold text-white/90 sm:text-sm">{item.label}</dd>
            <dd className="mt-2 text-sm leading-relaxed text-white/60 sm:text-xs">{item.detail}</dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}

/** Parceiros (integração operacional real) + marketplaces atendidos, numa fileira só rolando
 * automático — resolve o desalinho visual de logo com tamanho/estilo bem diferente (wordmark
 * fino do Olist ao lado do ícone+texto do TikTok Shop) sem precisar encaixar tudo estático
 * numa linha. Lista duplicada 2x pro loop do `animate-marquee` ficar contínuo. */
function IntegrationsBar() {
  const items = [...LANDING_INTEGRATIONS_BAR.items, ...LANDING_MARKETPLACES_BAR.items];
  const looped = [...items, ...items];

  return (
    <div className="border-y border-[var(--border-subtle)] bg-white py-6 sm:py-12 lg:py-8">
      <div className="dropcore-shell-6xl flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <p className="shrink-0 whitespace-nowrap text-2xl font-bold uppercase tracking-wider text-emerald-600 sm:text-lg lg:text-base">
          {LANDING_INTEGRATIONS_BAR.label}
        </p>
        <div className="w-full overflow-hidden sm:min-w-0 sm:flex-1 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <div className="flex w-max items-center gap-20 animate-marquee motion-reduce:animate-none">
            {looped.map((item, idx) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${item.name}-${idx}`}
                src={item.logo}
                alt={item.name}
                className="h-16 w-auto shrink-0 object-contain sm:h-20 lg:h-11"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparisonSection() {
  return (
    <section id="solucao" className="border-b border-white/15 bg-[var(--foreground)] py-14 sm:py-20">
      <div className="dropcore-shell-6xl">
        <Reveal>
          <SectionHeader id="solucao-titulo" title={LANDING_SECTIONS.comparison.title} tone="dark" />
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
      <div className="dropcore-shell-6xl">
        <Reveal className="flex flex-col items-center justify-between gap-6 rounded-3xl bg-emerald-600 px-6 py-9 text-center shadow-lg shadow-emerald-900/10 sm:flex-row sm:px-10 sm:py-8 sm:text-left">
          <div>
            <h3 className="text-2xl font-semibold text-white sm:text-3xl">{LANDING_INLINE_CTA.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-emerald-50 sm:text-base">{LANDING_INLINE_CTA.subtitle}</p>
          </div>
          <a
            href={`#${CTA_FINAL_ANCHOR}`}
            onClick={scrollToFinalCta}
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
    <section id="como-funciona" className="border-y border-white/15 bg-[var(--foreground)] py-14 sm:py-20">
      <div className="dropcore-shell-6xl">
        <Reveal>
          <SectionHeader id="como-funciona-titulo" title={LANDING_SECTIONS.steps.title} tone="dark" />
        </Reveal>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {LANDING_STEPS.map((step, idx) => (
            <RevealLi
              key={step.step}
              delayMs={idx * 120}
              className={cn(
                "rounded-3xl border p-8 transition-all hover:-translate-y-0.5",
                idx === 1 ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 bg-white/[0.04]",
              )}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                {step.step}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70">{step.body}</p>
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
      <div className="dropcore-shell-6xl">
        <Reveal>
          <SectionHeader id="fluxo-titulo" title={LANDING_SECTIONS.flow.title} subtitle={LANDING_SECTIONS.flow.subtitle} />
        </Reveal>
        <div className="relative mt-14">
          <div
            className="absolute left-6 right-6 top-6 hidden h-px bg-emerald-100 lg:block"
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
      <div className="dropcore-shell-6xl">
        <Reveal>
          <SectionHeader id="fit-titulo" title={LANDING_SECTIONS.fit.title} />
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Reveal className="rounded-3xl bg-emerald-600 p-8 shadow-lg shadow-emerald-900/10">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-50">Para quem é</p>
            <ul className="mt-4 space-y-3">
              {LANDING_FOR_WHOM.yes.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-white">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delayMs={120} className={cn("rounded-3xl p-8", DANGER_PREMIUM_SURFACE)}>
            <p className={cn("text-xs font-bold uppercase tracking-wider", DANGER_PREMIUM_TEXT_SOFT)}>Para quem não é</p>
            <ul className="mt-4 space-y-3">
              {LANDING_FOR_WHOM.no.map((item) => (
                <li key={item} className={cn("flex gap-3 text-sm", DANGER_PREMIUM_TEXT_BODY)}>
                  <IconX className={cn("mt-0.5 h-4 w-4 shrink-0", DANGER_PREMIUM_TEXT_SOFT)} />
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
          <SectionHeader id="faq-titulo" title={LANDING_SECTIONS.faq.title} titleClassName="lg:whitespace-nowrap lg:text-[1.7rem]" />
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
    <section id={CTA_FINAL_ANCHOR} className="scroll-mt-24 border-t border-[var(--border-subtle)] bg-white">
      <div className="dropcore-shell-6xl py-14 sm:py-20">
        <Reveal className="rounded-3xl border border-[var(--foreground)]/10 bg-[var(--foreground)] px-6 py-10 text-center sm:px-12 sm:py-14">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{LANDING_FINAL_CTA.title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/75">
            {LANDING_FINAL_CTA.subtitle}
            <span className="font-semibold text-white">{LANDING_FINAL_CTA.subtitleHighlight}</span>
          </p>
          <ul className="mt-6 flex flex-col items-center justify-center gap-2 text-sm font-semibold text-white sm:flex-row sm:gap-6">
            {LANDING_FINAL_CTA.recap.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <IconCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={landingSalesWhatsapp(LANDING_CTA_FINAL_MESSAGE)}
              onClick={trackFinalCtaLead}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 hover:scale-[1.03] active:scale-[0.97]"
            >
              <IconWhatsApp className="h-4 w-4" />
              {LANDING_CTA_FINAL_LABEL}
            </a>
          </div>
          <p className="mt-4 text-xs text-white/60">
            {LANDING_FINAL_CTA.reassurance}
            <span className="font-semibold text-white/80">{LANDING_FINAL_CTA.reassuranceHighlight}</span>
          </p>
        </Reveal>
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
      <MetaPixel />
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
    </div>
  );
}
