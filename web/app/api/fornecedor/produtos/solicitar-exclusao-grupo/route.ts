/**
 * POST /api/fornecedor/produtos/solicitar-exclusao-grupo
 * Envia pedido para a DropCore (admin) aprovar a exclusão de todo o grupo de variantes.
 */
import { NextResponse } from "next/server";
import { resolverFornecedorContexto } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyAdminsAlteracaoProdutoPendente } from "@/lib/notifyAdminsAlteracaoProduto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function paiKey(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  if (!m) return s;
  return `${m[1]}${m[2]}000`;
}

export async function POST(req: Request) {
  try {
    const ctx = await resolverFornecedorContexto(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const grupoKey = typeof body?.grupoKey === "string" ? body.grupoKey.trim().toUpperCase() : "";
    const nomeProduto =
      typeof body?.nome_produto === "string" ? body.nome_produto.trim().slice(0, 500) : "";

    if (!grupoKey) {
      return NextResponse.json({ error: "grupoKey é obrigatório." }, { status: 400 });
    }

    const { data: skus, error: listErr } = await supabaseAdmin
      .from("skus")
      .select("id, sku, nome_produto")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id);

    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const noGrupo = (skus ?? []).filter((s) => paiKey(s.sku) === grupoKey || String(s.sku).toUpperCase() === grupoKey);
    if (noGrupo.length === 0) {
      return NextResponse.json({ error: "Grupo não encontrado ou não pertence a você." }, { status: 404 });
    }

    const idsGrupo = noGrupo.map((s) => s.id);

    // Admin usando o mesmo assistente do fornecedor (achado 2026-11-24, Sr Stark: admin é
    // quem aprovaria mesmo, então pedir aprovação pra si mesmo não faz sentido) — exclui na
    // hora, mesma lógica que já existia só em
    // app/api/org/alteracoes-pendentes/[id]/aprovar/route.ts pro branch exclusao_grupo.
    if (ctx.via === "admin") {
      const { error: delErr } = await supabaseAdmin
        .from("skus")
        .delete()
        .in("id", idsGrupo)
        .eq("org_id", ctx.org_id)
        .eq("fornecedor_id", ctx.fornecedor_id);

      if (delErr) {
        return NextResponse.json(
          {
            error: delErr.message.includes("violates")
              ? "Não foi possível excluir (pode haver pedidos ou vínculos)."
              : delErr.message,
          },
          { status: 500 }
        );
      }

      const { data: fornMember } = await supabaseAdmin
        .from("org_members")
        .select("user_id")
        .eq("org_id", ctx.org_id)
        .eq("fornecedor_id", ctx.fornecedor_id)
        .limit(1)
        .maybeSingle();
      if (fornMember?.user_id) {
        await supabaseAdmin.from("notifications").insert({
          user_id: fornMember.user_id,
          tipo: "alteracao_aprovada",
          titulo: "Produto excluído",
          mensagem: `A DropCore excluiu o produto (${grupoKey}).`,
          metadata: { grupo_key: grupoKey },
        });
      }

      return NextResponse.json({ ok: true, mensagem: "Grupo excluído do catálogo." });
    }
    const { data: pendentes, error: pendErr } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .select("id, dados_propostos")
      .in("sku_id", idsGrupo)
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("status", "pendente");

    if (pendErr) return NextResponse.json({ error: pendErr.message }, { status: 500 });

    for (const p of pendentes ?? []) {
      const dp = (p.dados_propostos as Record<string, unknown> | null) ?? {};
      if (dp._solicitacao_dropcore === "exclusao_grupo") {
        return NextResponse.json(
          { error: "Já existe um pedido de exclusão deste produto aguardando a DropCore." },
          { status: 400 }
        );
      }
    }

    if ((pendentes ?? []).length > 0) {
      return NextResponse.json(
        {
          error:
            "Há alterações em análise neste produto. Aguarde a análise ou atualize a solicitação pendente antes de pedir exclusão.",
        },
        { status: 400 }
      );
    }

    const paiRow =
      noGrupo.find((s) => String(s.sku).toUpperCase() === grupoKey) ??
      [...noGrupo].sort((a, b) => String(a.sku).localeCompare(String(b.sku)))[0];

    if (!paiRow) {
      return NextResponse.json({ error: "Não foi possível localizar o SKU base do grupo." }, { status: 400 });
    }

    const nome =
      nomeProduto ||
      paiRow.nome_produto ||
      noGrupo.find((s) => s.nome_produto)?.nome_produto ||
      grupoKey;

    const dados_propostos: Record<string, unknown> = {
      _solicitacao_dropcore: "exclusao_grupo",
      grupo_key: grupoKey,
      nome_produto_exclusao: nome,
    };

    const { data: criada, error: insErr } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .insert({
        sku_id: paiRow.id,
        fornecedor_id: ctx.fornecedor_id,
        org_id: ctx.org_id,
        dados_propostos,
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

    await notifyAdminsAlteracaoProdutoPendente({
      org_id: ctx.org_id,
      titulo: "Pedido de exclusão de produto",
      mensagem: `${nomeForn} pediu exclusão do produto «${nome}» (${grupoKey}). Analise em Alterações de produtos.`,
      metadata: {
        alteracao_id: criada?.id,
        grupo_key: grupoKey,
        exclusao_grupo: true,
      },
    });

    return NextResponse.json({
      ok: true,
      mensagem:
        "Pedido de exclusão enviado. A equipe DropCore vai analisar em Alterações de produtos — você será notificado após a decisão.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
