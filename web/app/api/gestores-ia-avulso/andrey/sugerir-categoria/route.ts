/**
 * POST /api/gestores-ia-avulso/andrey/sugerir-categoria — passo 2 do fluxo "ideias pra
 * anúncio novo": sugere categoria a partir do título digitado (reaproveita
 * `mlSugerirCategoria`, já usado pelo diagnóstico do Andrey). Devolve o CAMINHO completo de
 * cada categoria (não só o nome curto) — achado ao vivo 2026-10-07: o Mercado Livre pode
 * sugerir duas categorias diferentes com o mesmo nome curto (ex.: "Camisas" dentro de
 * Masculino e dentro de Feminino), impossível de diferenciar sem o caminho inteiro.
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import { mlSugerirCategoria, mlBuscarCaminhoCategoria } from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { titulo?: string };
  const titulo = body.titulo?.trim();
  if (!titulo) {
    return NextResponse.json({ error: "titulo é obrigatório." }, { status: 400 });
  }

  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinante.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte o Mercado Livre primeiro." }, { status: 422 });
  }

  const categorias = await mlSugerirCategoria(titulo, ctx);
  const categoriasComCaminho = await Promise.all(
    categorias.map(async (c) => ({
      categoryId: c.categoryId,
      categoryName: await mlBuscarCaminhoCategoria(c.categoryId, ctx),
    }))
  );
  return NextResponse.json({ categorias: categoriasComCaminho });
}
