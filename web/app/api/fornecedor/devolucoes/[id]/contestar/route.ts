/**
 * POST /api/fornecedor/devolucoes/[id]/contestar — fornecedor contesta a devolução (defeito,
 * produto errado, não recebeu nada). Recebe texto obrigatório + várias evidências opcionais
 * (foto ou vídeo, FormData, campo "evidencias" repetido). Trava a liberação automática de
 * 48h — o caso cai pro admin decidir manual.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { notifyAdminDevolucaoContestada } from "@/lib/notifyAdminDevolucaoContestada";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "disputas-evidencias";
const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
const TIPOS_VIDEO = ["video/mp4", "video/quicktime", "video/webm"];
const TIPOS_PERMITIDOS = [...TIPOS_IMAGEM, ...TIPOS_VIDEO];
const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;
const TAMANHO_MAXIMO_VIDEO = 50 * 1024 * 1024;
const MAX_EVIDENCIAS = 6;

const EXTENSAO_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFornecedorContextFromBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;

  const formData = await req.formData().catch(() => null);
  const texto = formData?.get("texto")?.toString().trim();
  if (!texto) {
    return NextResponse.json({ error: "Explique o que aconteceu." }, { status: 400 });
  }

  const arquivos = (formData?.getAll("evidencias") ?? []).filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  if (arquivos.length > MAX_EVIDENCIAS) {
    return NextResponse.json({ error: `Envie no máximo ${MAX_EVIDENCIAS} evidências.` }, { status: 400 });
  }

  const evidenciasPaths: string[] = [];
  for (let i = 0; i < arquivos.length; i++) {
    const file = arquivos[i];
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      return NextResponse.json({ error: "Tipo de arquivo inválido. Use JPEG, PNG, WebP, MP4, MOV ou WebM." }, { status: 400 });
    }
    const tamanhoMaximo = TIPOS_VIDEO.includes(file.type) ? TAMANHO_MAXIMO_VIDEO : TAMANHO_MAXIMO_IMAGEM;
    if (file.size > tamanhoMaximo) {
      return NextResponse.json(
        { error: `Arquivo muito grande (máx. ${Math.round(tamanhoMaximo / (1024 * 1024))} MB).` },
        { status: 400 }
      );
    }
    const ext = EXTENSAO_POR_TIPO[file.type];
    const path = `fornecedor-contestacao/${id}/evidencia-${i + 1}-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }
    evidenciasPaths.push(path);
  }

  const { data, error } = await supabaseAdmin
    .rpc("fn_devolucao_fornecedor_contestar", {
      p_ledger_id: id,
      p_fornecedor_id: ctx.fornecedor_id,
      p_texto: texto,
      p_evidencias_paths: evidenciasPaths.length ? evidenciasPaths : null,
    })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultado = data as { ok: boolean; motivo: string | null } | null;
  if (!resultado?.ok) {
    return NextResponse.json({ error: resultado?.motivo ?? "Não foi possível registrar a contestação." }, { status: 400 });
  }

  // Avisa admin + seller — sem isso a contestação ficava só gravada no banco, sem ninguém
  // saber que precisa decidir (achado real 2026-11-11: um caso ficou 8 dias parado).
  const { data: ledgerRow } = await supabaseAdmin
    .from("financial_ledger")
    .select("org_id, seller_id, pedido_id, pedidos(marketplace_numero)")
    .eq("id", id)
    .maybeSingle<{
      org_id: string;
      seller_id: string | null;
      pedido_id: string | null;
      pedidos: { marketplace_numero: string | null } | null;
    }>();

  if (ledgerRow) {
    const { data: fornecedorRow } = await supabaseAdmin
      .from("fornecedores")
      .select("nome")
      .eq("id", ctx.fornecedor_id)
      .maybeSingle();

    await Promise.all([
      notifyAdminDevolucaoContestada({
        org_id: ledgerRow.org_id,
        ledger_id: id,
        pedido_id: ledgerRow.pedido_id,
        marketplace_numero: ledgerRow.pedidos?.marketplace_numero ?? null,
        fornecedor_nome: fornecedorRow?.nome ?? null,
      }),
      ledgerRow.seller_id
        ? notifySellerPedidoAtencao({
            org_id: ledgerRow.org_id,
            seller_id: ledgerRow.seller_id,
            pedido_id: ledgerRow.pedido_id,
            tipo: "devolucao_contestada_fornecedor_seller",
            motivo:
              "O fornecedor contestou a devolução desse pedido — o admin vai revisar as evidências e decidir.",
          })
        : Promise.resolve(),
    ]);
  }

  return NextResponse.json({ ok: true, mensagem: "Contestação registrada. O admin vai revisar o caso." });
}
