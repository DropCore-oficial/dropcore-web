/**
 * PATCH /api/fornecedor/produtos/[id] — edita produto do fornecedor (nome, cor, tamanho, link_fotos, etc.)
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toTitleCase } from "@/lib/formatText";
import { notifyAdminsAlteracaoProdutoPendente } from "@/lib/notifyAdminsAlteracaoProduto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SKU_FIELDS = `
  id, sku, nome_produto, cor, tamanho, status, fornecedor_id, fornecedor_org_id, org_id,
  estoque_atual, estoque_minimo, custo_base, custo_dropcore, peso_kg, categoria,
  dimensoes_pacote, comprimento_cm, largura_cm, altura_cm, link_fotos, imagem_url, descricao,
  ncm, origem, cest, cfop, peso_liquido_kg, peso_bruto_kg, criado_em
`;

/** SKU pai do bloco multivariante (ex.: DJU001001 → DJU001000). */
function skuPaiDoBloco(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  if (!m) return s;
  return `${m[1]}${m[2]}000`;
}

/** Prefixo de 6 caracteres do bloco (ex.: DJU001) para listar variantes do mesmo grupo. */
function skuPrefix6(sku: string): string | null {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})\d{3}$/);
  return m ? `${m[1]}${m[2]}` : null;
}

async function getFornecedorFromToken(req: Request): Promise<{ fornecedor_id: string; org_id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) return null;
  return { fornecedor_id: member.fornecedor_id, org_id: member.org_id };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { id: skuId } = await params;
    if (!skuId) return NextResponse.json({ error: "ID do produto é obrigatório." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    }

    const allowed = [
      "nome_produto",
      "cor",
      "tamanho",
      "descricao",
      "imagem_url",
      "peso_kg",
      "estoque_atual",
      "custo_base",
      "custo_dropcore",
      "categoria",
      "dimensoes_pacote",
      "comprimento_cm",
      "largura_cm",
      "altura_cm",
      "link_fotos",
      "ncm",
      "origem",
      "cest",
      "cfop",
      "peso_liquido_kg",
      "peso_bruto_kg",
    ] as const;

    const clean: Record<string, unknown> = {};
    const textFields = ["nome_produto", "categoria", "cor", "tamanho", "dimensoes_pacote", "link_fotos", "imagem_url", "descricao", "ncm", "origem", "cest", "cfop"] as const;
    const numFields = ["comprimento_cm", "largura_cm", "altura_cm", "peso_kg", "peso_liquido_kg", "peso_bruto_kg", "estoque_atual", "custo_base", "custo_dropcore"] as const;

    for (const k of allowed) {
      if (!(k in body)) continue;
      const v = body[k];
      if (textFields.includes(k as typeof textFields[number]) && (typeof v === "string" || v == null)) {
        const trimOnly = ["link_fotos", "imagem_url", "ncm", "origem", "cest", "cfop"];
        clean[k] = v == null || v === "" ? null : (trimOnly.includes(k as typeof trimOnly[number]) ? v.trim() || null : toTitleCase(v));
      } else if (numFields.includes(k as typeof numFields[number])) {
        if (v == null || v === "") clean[k] = null;
        else if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
        else if (typeof v === "string") {
          const n = parseFloat(v.replace(",", "."));
          clean[k] = Number.isFinite(n) ? n : null;
        } else clean[k] = null;
      }
    }

    // Tabela de medidas (por grupo): entra em dados_propostos para o admin aprovar
    let tabelaMedidas: { tipo_produto: string; medidas: Record<string, Record<string, number>> } | null = null;
    if (body.tabela_medidas != null && typeof body.tabela_medidas === "object") {
      const tm = body.tabela_medidas as Record<string, unknown>;
      const tipo = typeof tm.tipo_produto === "string" ? tm.tipo_produto.trim() || "generico" : "generico";
      const med = tm.medidas;
      if (med != null && typeof med === "object" && !Array.isArray(med)) {
        const medidas: Record<string, Record<string, number>> = {};
        for (const [tamanho, vals] of Object.entries(med)) {
          if (vals != null && typeof vals === "object" && !Array.isArray(vals)) {
            const row: Record<string, number> = {};
            for (const [k, v] of Object.entries(vals)) {
              const n = typeof v === "number" ? v : parseFloat(String(v));
              if (Number.isFinite(n)) row[k] = n;
            }
            medidas[tamanho] = row;
          }
        }
        tabelaMedidas = { tipo_produto: tipo, medidas };
      }
    }

    const dadosPropostos: Record<string, unknown> = { ...clean };
    if (tabelaMedidas) dadosPropostos.tabela_medidas = tabelaMedidas;

    if (Object.keys(dadosPropostos).length === 0) {
      return NextResponse.json({ error: "Nenhum campo editável enviado." }, { status: 400 });
    }

    // Verificar se o SKU existe e pertence ao fornecedor
    const { data: sku, error: skuErr } = await supabaseAdmin
      .from("skus")
      .select("id, sku, nome_produto")
      .eq("id", skuId)
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .single();

    if (skuErr || !sku) {
      return NextResponse.json({ error: "Produto não encontrado ou não pertence a você." }, { status: 404 });
    }

    // Se já existe pendência: mescla em dados_propostos (fornecedor pode corrigir antes do admin analisar)
    const { data: existente } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .select("id, dados_propostos")
      .eq("sku_id", skuId)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("org_id", ctx.org_id)
      .eq("status", "pendente")
      .maybeSingle();

    if (existente) {
      const prev = (existente.dados_propostos as Record<string, unknown> | null) ?? {};
      const merged: Record<string, unknown> = { ...prev, ...dadosPropostos };
      const { error: updErr } = await supabaseAdmin
        .from("sku_alteracoes_pendentes")
        .update({ dados_propostos: merged })
        .eq("id", existente.id)
        .eq("org_id", ctx.org_id);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    } else {
      const { data: criada, error: insErr } = await supabaseAdmin
        .from("sku_alteracoes_pendentes")
        .insert({
          sku_id: skuId,
          fornecedor_id: ctx.fornecedor_id,
          org_id: ctx.org_id,
          dados_propostos: dadosPropostos,
          status: "pendente",
        })
        .select("id")
        .single();
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

      const { data: fornNome } = await supabaseAdmin
        .from("fornecedores")
        .select("nome")
        .eq("id", ctx.fornecedor_id)
        .maybeSingle();
      const nomeForn = (fornNome?.nome as string | undefined)?.trim() || "Fornecedor";
      const rotulo = sku.nome_produto ? `«${sku.nome_produto}»` : `SKU ${sku.sku ?? ""}`;

      await notifyAdminsAlteracaoProdutoPendente({
        org_id: ctx.org_id,
        titulo: "Alteração de produto para analisar",
        mensagem: `${nomeForn} enviou alterações em ${rotulo}. Revise em Alterações de produtos.`,
        metadata: {
          alteracao_id: criada?.id,
          sku_id: skuId,
        },
      });
    }

    // Devolver o SKU atual para o front não quebrar
    const { data: skuAtual } = await supabaseAdmin
      .from("skus")
      .select(SKU_FIELDS)
      .eq("id", skuId)
      .single();

    return NextResponse.json({
      ...skuAtual,
      _enviado_para_analise: true,
      _alteracao_atualizada: !!existente,
      mensagem: existente
        ? "Alteração atualizada e segue em análise. O admin verá a última versão em Alterações de produtos."
        : "Alteração enviada para análise. O admin verá em Alterações de produtos.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/fornecedor/produtos/[id] — remove um SKU do fornecedor.
 * Não permite excluir o SKU pai (…000) se ainda existir outra variante no mesmo bloco.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { id: skuId } = await params;
    if (!skuId) return NextResponse.json({ error: "ID do produto é obrigatório." }, { status: 400 });

    const { data: row, error: skuErr } = await supabaseAdmin
      .from("skus")
      .select("id, sku")
      .eq("id", skuId)
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .single();

    if (skuErr || !row?.sku) {
      return NextResponse.json({ error: "Produto não encontrado ou não pertence a você." }, { status: 404 });
    }

    const skuU = String(row.sku).trim().toUpperCase();
    const parentSku = skuPaiDoBloco(skuU);
    const prefix6 = skuPrefix6(skuU);

    if (prefix6 && skuU === parentSku) {
      const { count, error: cntErr } = await supabaseAdmin
        .from("skus")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.org_id)
        .eq("fornecedor_id", ctx.fornecedor_id)
        .like("sku", `${prefix6}%`)
        .neq("id", skuId);

      if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 500 });
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Não é possível excluir o SKU pai (produto base) enquanto existirem outras variantes neste grupo. Exclua primeiro as variantes ou desative a categoria inteira.",
          },
          { status: 400 }
        );
      }
    }

    const { error: delErr } = await supabaseAdmin.from("skus").delete().eq("id", skuId).eq("org_id", ctx.org_id).eq("fornecedor_id", ctx.fornecedor_id);

    if (delErr) {
      return NextResponse.json(
        { error: delErr.message.includes("violates") ? "Não foi possível excluir (pode haver pedidos ou vínculos)." : delErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, mensagem: "Variante removida do catálogo." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
