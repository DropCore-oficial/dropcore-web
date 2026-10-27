/**
 * POST /api/gestores-ia-avulso/design/gerar-foto — o seller clica pra gerar uma foto nova,
 * só pro item que o diagnóstico já marcou como "ruim" (`gestorDesignFotoAvulso.ts`). Exige a
 * chave do Gemini conectada (BYOK obrigatório, sem fallback da casa — decisão 2026-10-26).
 * Salva o resultado no bucket privado `design-fotos-geradas` via RPC, nunca `.from()`
 * (regra 9).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { decryptCalculadoraAssinanteSecret } from "@/lib/calculadoraAssinanteSecretBox";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import { mlBuscarItensDetalhe } from "@/lib/mercadoLivreApiClient";
import { gerarFotoProdutoAvulso } from "@/lib/ai/gestorDesignGerarFotoAvulso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnuncioComFoto = {
  chave: string;
  item_id_representante: string;
  foto_diagnostico: { veredito: "boa" | "ruim"; motivo: string; picture_ids: string[] } | null;
};

type RunRow = { resultado: { anuncios?: AnuncioComFoto[] } | null };

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const chave = typeof body?.chave === "string" ? body.chave : "";
  if (!chave) {
    return NextResponse.json({ error: "Anúncio inválido." }, { status: 422 });
  }

  const [{ data: keyEncriptada }, { data: runsRecentes }] = await Promise.all([
    supabaseAdmin.rpc("fn_gestores_ia_avulso_byok_gemini_get", { p_assinante_id: assinante.id }),
    supabaseAdmin.rpc("fn_gestores_ia_avulso_ai_runs_recentes", {
      p_assinante_id: assinante.id,
      p_gestor: "anuncios_seo",
      p_limit: 1,
    }),
  ]);

  if (!keyEncriptada) {
    return NextResponse.json(
      { error: "Conecte sua chave do Gemini em Integrações antes de gerar uma foto." },
      { status: 422 }
    );
  }

  const run = ((runsRecentes ?? []) as RunRow[])[0] ?? null;
  const anuncio = run?.resultado?.anuncios?.find((a) => a.chave === chave) ?? null;
  if (!anuncio?.foto_diagnostico || anuncio.foto_diagnostico.veredito !== "ruim") {
    return NextResponse.json({ error: "Esse anúncio não tem diagnóstico de foto ruim pra corrigir." }, { status: 422 });
  }

  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinante.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte sua conta do Mercado Livre primeiro." }, { status: 422 });
  }

  const [item] = await mlBuscarItensDetalhe([anuncio.item_id_representante], ctx);
  const fotoCapaUrl = item?.pictures?.[0]?.secure_url;
  if (!fotoCapaUrl) {
    return NextResponse.json({ error: "Não encontrei a foto atual desse anúncio." }, { status: 502 });
  }

  const apiKey = decryptCalculadoraAssinanteSecret(keyEncriptada);
  const resultado = await gerarFotoProdutoAvulso(fotoCapaUrl, anuncio.foto_diagnostico.motivo, apiKey);
  if (!resultado) {
    return NextResponse.json({ error: "Não consegui gerar a foto — confira se sua chave do Gemini é válida." }, { status: 502 });
  }

  const extensao = resultado.mimeType.split("/")[1] ?? "png";
  const path = `${assinante.id}/${chave}/${Date.now()}.${extensao}`;
  const bytes = Buffer.from(resultado.data, "base64");

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("design-fotos-geradas")
    .upload(path, bytes, { contentType: resultado.mimeType, upsert: false });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  await supabaseAdmin
    .rpc("fn_gestores_ia_avulso_foto_gerada_insert", {
      p_assinante_id: assinante.id,
      p_chave: chave,
      p_storage_path: path,
    })
    .then(({ error }) => {
      if (error) console.error("[design/gerar-foto] registrar foto gerada falhou", error);
    });

  const { data: signed } = await supabaseAdmin.storage
    .from("design-fotos-geradas")
    .createSignedUrl(path, 60 * 60);

  return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null });
}
