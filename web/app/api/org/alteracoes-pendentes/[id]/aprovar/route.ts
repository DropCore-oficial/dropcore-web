/**
 * POST /api/org/alteracoes-pendentes/[id]/aprovar — aprova alterações e aplica no SKU
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { toTitleCase } from "@/lib/formatText";
import { notifyEstoqueBaixo } from "@/lib/notifyEstoqueBaixo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXT_FIELDS = ["nome_produto", "categoria", "cor", "tamanho", "link_fotos", "imagem_url", "descricao", "ncm", "origem", "cest", "cfop"] as const;
const NUM_FIELDS = ["comprimento_cm", "largura_cm", "altura_cm", "peso_kg", "peso_liquido_kg", "peso_bruto_kg", "estoque_atual", "estoque_minimo", "custo_base", "custo_dropcore"] as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id } = await params;

    const { data: alteracao, error: fetchErr } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .select("id, sku_id, fornecedor_id, org_id, dados_propostos, status")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !alteracao) {
      return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
    }
    if (alteracao.status !== "pendente") {
      return NextResponse.json({ error: "Esta solicitação já foi analisada." }, { status: 400 });
    }

    const dados = alteracao.dados_propostos as Record<string, unknown>;
    const clean: Record<string, unknown> = {};

    for (const k of [...TEXT_FIELDS, ...NUM_FIELDS]) {
      if (!(k in dados)) continue;
      const v = dados[k];
      if (TEXT_FIELDS.includes(k as typeof TEXT_FIELDS[number]) && (typeof v === "string" || v == null)) {
        const trimOnly = ["link_fotos", "imagem_url", "descricao", "ncm", "origem", "cest", "cfop"];
        clean[k] = v == null || v === "" ? null : (trimOnly.includes(k) ? String(v).trim() || null : toTitleCase(String(v)));
      } else if (NUM_FIELDS.includes(k as typeof NUM_FIELDS[number])) {
        if (v == null || v === "") clean[k] = null;
        else if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
        else if (typeof v === "string") {
          const n = parseFloat(v.replace(",", "."));
          clean[k] = Number.isFinite(n) ? n : null;
        } else clean[k] = null;
      }
    }

    if (Object.keys(clean).length > 0) {
      const { data: skuAtual, error: updErr } = await supabaseAdmin
        .from("skus")
        .update(clean)
        .eq("id", alteracao.sku_id)
        .eq("org_id", org_id)
        .eq("fornecedor_id", alteracao.fornecedor_id)
        .select("id, sku, nome_produto, estoque_atual, estoque_minimo")
        .single();

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

      const atualizaEstoque = "estoque_atual" in clean || "estoque_minimo" in clean;
      if (atualizaEstoque && skuAtual) {
        const atual = skuAtual.estoque_atual != null ? Number(skuAtual.estoque_atual) : null;
        const min = skuAtual.estoque_minimo != null ? Number(skuAtual.estoque_minimo) : null;
        if (min != null && atual != null && atual < min) {
          await notifyEstoqueBaixo({
            org_id,
            fornecedor_id: alteracao.fornecedor_id,
            produtos: [{ sku: skuAtual.sku ?? "", nome: skuAtual.nome_produto ?? undefined }],
          });
        }
      }
    }

    // Aplicar tabela de medidas no grupo (produto_tabela_medidas)
    const tabelaMedidas = dados.tabela_medidas as { tipo_produto?: string; medidas?: Record<string, Record<string, number>> } | undefined;
    if (tabelaMedidas?.medidas != null && typeof tabelaMedidas.medidas === "object") {
      const { data: skuRow } = await supabaseAdmin
        .from("skus")
        .select("sku")
        .eq("id", alteracao.sku_id)
        .single();
      const skuStr = (skuRow?.sku ?? "") as string;
      const grupoSku = (() => {
        const s = skuStr.trim().toUpperCase();
        const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
        return m ? `${m[1]}${m[2]}000` : s;
      })();
      const tipoProduto = typeof tabelaMedidas.tipo_produto === "string" ? tabelaMedidas.tipo_produto.trim() || "generico" : "generico";
      const { error: upsertErr } = await supabaseAdmin
        .from("produto_tabela_medidas")
        .upsert(
          {
            org_id,
            fornecedor_id: alteracao.fornecedor_id,
            grupo_sku: grupoSku,
            tipo_produto: tipoProduto,
            medidas: tabelaMedidas.medidas as Record<string, unknown>,
          },
          { onConflict: "org_id,fornecedor_id,grupo_sku" }
        );
      if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    const { data: member } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("role_base", "owner")
      .limit(1)
      .maybeSingle();
    const analisadoPor = member?.user_id ?? null;

    const { error: statusErr } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .update({
        status: "aprovado",
        analisado_em: new Date().toISOString(),
        analisado_por: analisadoPor,
      })
      .eq("id", id)
      .eq("org_id", org_id);

    if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

    const { data: forn } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("fornecedor_id", alteracao.fornecedor_id)
      .limit(1)
      .maybeSingle();
    const fornecedorUserId = forn?.user_id;

    if (fornecedorUserId) {
      await supabaseAdmin.from("notifications").insert({
        user_id: fornecedorUserId,
        tipo: "alteracao_aprovada",
        titulo: "Alterações aprovadas",
        mensagem: "Suas alterações no produto foram aprovadas e já estão em vigor.",
        metadata: { alteracao_id: id, sku_id: alteracao.sku_id },
      });
    }

    return NextResponse.json({ ok: true, mensagem: "Alterações aprovadas e aplicadas." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
