/**
 * GET/POST/DELETE /api/gestores-ia-avulso/ulisses/custos — custo que o assinante digita por
 * anúncio/família (avulso não tem `skus.custo_base` do hub). GET devolve o catálogo ativo do
 * Mercado Livre já cruzado com o custo salvo (null quando ainda não digitou); POST salva 1
 * custo; DELETE remove. Lê/grava via RPC — ver gestorAdsDadosAvulso.ts.
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import {
  buscarCatalogoComCustoAvulso,
  salvarCustoUlissesAvulso,
  removerCustoUlissesAvulso,
} from "@/lib/ai/gestorAdsDadosAvulso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const catalogo = await buscarCatalogoComCustoAvulso(assinante.id);
  if (catalogo === null) {
    return NextResponse.json({ error: "Conecte sua conta do Mercado Livre antes." }, { status: 422 });
  }

  return NextResponse.json({
    catalogo: catalogo.map((c) => ({
      chave: c.grupo.chave,
      item_id_representante: c.grupo.itemIdRepresentante,
      nome_produto: c.grupo.nomeProduto,
      preco: c.grupo.preco,
      membros: c.grupo.membros,
      custo: c.custo,
    })),
  });
}

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { chave?: unknown; custo?: unknown };
  const chave = typeof body.chave === "string" ? body.chave.trim() : "";
  const custo = Number(body.custo);
  if (!chave || !Number.isFinite(custo) || custo < 0) {
    return NextResponse.json({ error: "chave e custo (≥ 0) são obrigatórios." }, { status: 400 });
  }

  try {
    await salvarCustoUlissesAvulso(assinante.id, chave, custo);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao salvar custo." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const chave = searchParams.get("chave")?.trim() ?? "";
  if (!chave) {
    return NextResponse.json({ error: "chave é obrigatória." }, { status: 400 });
  }

  try {
    await removerCustoUlissesAvulso(assinante.id, chave);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao remover custo." }, { status: 500 });
  }
}
