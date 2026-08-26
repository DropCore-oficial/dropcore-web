/**
 * Lista única dos 6 gestores de IA (identidade de produto, 2026-08-23) — fonte de verdade
 * pro slug de URL (/seller/gestores-ia/[gestor]), pro card do hub e pro rótulo em qualquer
 * outro lugar que precise nome/função. `gestorId` é o valor real gravado em
 * `seller_ai_runs.gestor`/`seller_ai_acoes.gestor` — fica `null` pros gestores que ainda
 * não têm pipeline construído (Amanda, Ulisses, Laura, Tiago Silva).
 */
import type { GestorId } from "./gestorPrompts";

export type GestorSlug = "diogo" | "andrey" | "amanda" | "ulisses" | "laura" | "tiago-silva";

export type GestorPerfil = {
  slug: GestorSlug;
  nome: string;
  funcao: string;
  gestorId: GestorId | null;
  /** true = já tem painel de verdade construído; false = tela "em breve". */
  ativo: boolean;
};

export const GESTORES_PERFIS: GestorPerfil[] = [
  { slug: "diogo", nome: "Diogo", funcao: "Risco de Ruptura & Fulfillment", gestorId: "estoque_fulfillment", ativo: true },
  { slug: "andrey", nome: "Andrey", funcao: "Anúncios & SEO", gestorId: "anuncios_seo", ativo: true },
  { slug: "amanda", nome: "Amanda", funcao: "Reputação & Atendimento", gestorId: "reputacao", ativo: true },
  { slug: "ulisses", nome: "Ulisses", funcao: "Ads", gestorId: null, ativo: false },
  { slug: "laura", nome: "Laura", funcao: "Design & Criativo", gestorId: null, ativo: false },
  { slug: "tiago-silva", nome: "Tiago Silva", funcao: "Gestor Mestre", gestorId: null, ativo: false },
];

export function buscarGestorPerfil(slug: string): GestorPerfil | undefined {
  return GESTORES_PERFIS.find((g) => g.slug === slug);
}
