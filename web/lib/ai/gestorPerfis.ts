/**
 * Lista única dos 6 gestores de IA (identidade de produto, 2026-08-23) — fonte de verdade
 * pro slug de URL (/seller/gestores-ia/[gestor]), pro card do hub e pro rótulo em qualquer
 * outro lugar que precise nome/função. `gestorId` é o valor real gravado em
 * `seller_ai_runs.gestor`/`seller_ai_acoes.gestor` — fica `null` pros gestores que ainda
 * não têm pipeline construído (Amanda, Ulisses, Laura, Tiago Silva).
 */
import { isPro, temAddonGestoresIaAtivo } from "@/lib/planos";
import type { GestorId } from "./gestorPrompts";

export type GestorSlug = "diogo" | "andrey" | "amanda" | "ulisses" | "laura" | "tiago-silva";

export type GestorPerfil = {
  slug: GestorSlug;
  nome: string;
  funcao: string;
  gestorId: GestorId | null;
  /** true = já tem painel de verdade construído; false = tela "em breve". */
  ativo: boolean;
  /** true só pro Ulisses — liberado de graça no plano Pro, sem precisar do add-on
   * "Gestores de IA". Os demais exigem o add-on em qualquer plano (ver `gestorLiberadoPorPlano`). */
  gratisNoPro: boolean;
};

export const GESTORES_PERFIS: GestorPerfil[] = [
  { slug: "diogo", nome: "Diogo", funcao: "Risco de Ruptura & Fulfillment", gestorId: "estoque_fulfillment", ativo: true, gratisNoPro: false },
  { slug: "andrey", nome: "Andrey", funcao: "Anúncios & SEO", gestorId: "anuncios_seo", ativo: true, gratisNoPro: false },
  { slug: "amanda", nome: "Amanda", funcao: "Reputação & Atendimento", gestorId: "reputacao", ativo: true, gratisNoPro: false },
  { slug: "ulisses", nome: "Ulisses", funcao: "Ads, Preço & Promoção", gestorId: "ads", ativo: true, gratisNoPro: true },
  { slug: "laura", nome: "Laura", funcao: "Design & Criativo", gestorId: null, ativo: false, gratisNoPro: false },
  { slug: "tiago-silva", nome: "Tiago Silva", funcao: "Gestor Mestre", gestorId: null, ativo: false, gratisNoPro: false },
];

/** Fonte única de verdade do gate por plano/add-on — usada pelas rotas de API, pelo cron
 * diário e pela tela do seller. Add-on "Gestores de IA" ativo libera todos; sem ele, só o
 * Ulisses libera (e só se o seller for Pro). */
export function gestorLiberadoPorPlano(
  gestorId: GestorId,
  seller: { plano?: string | null; gestores_ia_addon_ativo?: boolean | null } | null
): boolean {
  if (temAddonGestoresIaAtivo(seller)) return true;
  return gestorId === "ads" && isPro({ plano: seller?.plano });
}

export function buscarGestorPerfil(slug: string): GestorPerfil | undefined {
  return GESTORES_PERFIS.find((g) => g.slug === slug);
}
