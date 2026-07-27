import Link from "next/link";
import { LANDING_SALES_EMAIL } from "@/lib/landingContent";
import { LOGO_GREEN_HEX } from "@/lib/dropcorePalette";

const TELEFONE_DISPLAY = "+55 (62) 99263-3065";
const TELEFONE_TEL_HREF = "tel:+5562992633065";

const LINKS_UTEIS = [
  { label: "Sobre", href: "/sobre" },
  { label: "Termos de Uso", href: "/termos-de-uso" },
  { label: "Política de Privacidade", href: "/privacidade" },
  { label: "Central de Ajuda", href: "/central-de-ajuda" },
] as const;

/**
 * Rodapé único do sistema — montado uma vez em app/layout.tsx, aparece em toda tela
 * (admin/fornecedor/seller). Sem CNPJ ainda (empresa não tem CNPJ). Os links de
 * "Links Úteis" apontam pra rotas que ainda não existem — criar as páginas depois
 * (Sr Stark confirmou que quer os links já no ar antes das páginas existirem).
 *
 * EM TESTE (2026-07-22): fundo/texto voltaram a reagir ao tema — cinza claro + letras
 * pretas no tema claro, preto + letras brancas no tema escuro (antes era preto fixo nos
 * dois). Só "Romanos 11:36" fica verde (`LOGO_GREEN_HEX`) fixo nos dois temas — mesma
 * exceção deliberada de sempre à regra "LOGO_GREEN_HEX exclusivo do logo" do skill
 * dropcore-layout. A risca verde neon no topo continua só no tema escuro.
 *
 * Padding inferior extra no mobile (`pb-[calc(1.5rem+6.25rem+...)]`) é pra não ficar embaixo
 * da barra de navegação fixa do celular (SellerNav/FornecedorNav/AdminMobileBottomNav) — sem
 * isso o "© ano DropCore..." ficava escondido atrás da barra, mesmo bug do padding que as
 * próprias páginas já reservam pra si (`pb-[calc(6.25rem+...)]`), só que o rodapé fica fora
 * do wrapper de cada página, então precisa reservar esse espaço por conta própria.
 */
export function SiteFooter() {
  const ano = new Date().getFullYear();
  return (
    <footer className="w-full bg-[#FFFFFF] dark:bg-black">
      <div
        className="hidden h-0.5 w-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 dark:block"
        aria-hidden
      />
      <div className="dropcore-shell-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-x-10 sm:gap-y-8">
          <div className="min-w-0 sm:max-w-xs">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">Sobre o DropCore</p>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-600 dark:text-white/85">
              DropCore é o hub B2B que conecta sellers e fornecedores num só lugar — catálogo,
              pedidos, estoque e financeiro integrados, com crédito, mensalidade e repasse
              automatizados. Menos planilha solta, mais operação sob controle.
            </p>
          </div>
          <div className="min-w-0 sm:shrink-0">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">Links Úteis</p>
            <ul className="mt-2 space-y-1.5">
              {LINKS_UTEIS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[13px] text-neutral-600 hover:text-neutral-900 hover:underline dark:text-white/85 dark:hover:text-white"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 sm:shrink-0">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">Contato</p>
            <div className="mt-2 space-y-1.5 text-[13px] text-neutral-600 dark:text-white/85">
              <a
                href={`mailto:${LANDING_SALES_EMAIL}`}
                className="block hover:text-neutral-900 hover:underline dark:hover:text-white"
              >
                {LANDING_SALES_EMAIL}
              </a>
              <a
                href={TELEFONE_TEL_HREF}
                className="block hover:text-neutral-900 hover:underline dark:hover:text-white"
              >
                {TELEFONE_DISPLAY}
              </a>
              <p>Av. Presidente Vargas, 1095</p>
              <p>Setor Jardim Marista, GO, CEP: 75383-423</p>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-neutral-300 px-4 py-6 pb-[calc(1.5rem+6.25rem+env(safe-area-inset-bottom,0px))] text-center dark:border-white/20 sm:px-6 sm:pb-6">
        <p className="mx-auto text-[11px] leading-snug text-neutral-900 dark:text-white sm:text-sm sm:leading-relaxed sm:whitespace-nowrap">
          <span className="italic">
            “Porque dele, e por ele, e para ele são todas as coisas; glória, pois, a ele eternamente. Amém!”
          </span>
          <span className="mx-1 text-neutral-400 dark:text-white/60 sm:mx-2">—</span>
          <span className="font-semibold" style={{ color: LOGO_GREEN_HEX }}>
            Romanos 11:36
          </span>
        </p>
        <p className="mt-3 text-[11px] text-neutral-500 dark:text-white/70">
          © {ano} DropCore. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
