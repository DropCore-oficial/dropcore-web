import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { uuidNormFornecedor } from "@/lib/applySellerFornecedorIdChange";
import { clampMensalidadeDiaVencimento } from "@/lib/mensalidadeDiaVencimento";
import { deleteSellerCascade } from "@/lib/sellerDeleteCascade";
import { DIAS_JANELA_ESCOLHA_FORNECEDOR } from "@/lib/sellerFornecedorVinculo";
import { notifyUserEmail } from "@/lib/notifyEmail";
import { logAdminAction } from "@/lib/adminAuditLog";

function uuidNorm(v: unknown): string | null {
  return uuidNormFornecedor(v);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Segurança: requireAdmin + .eq("org_id", org_id) — cada org só acessa seus próprios sellers; seller (cadastro) não é usuário de login.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id } = await params;

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("*")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    // Filtra por org_id para evitar IDOR — não basta filtrar por seller_id
    const { data: movimentacoes } = await supabaseAdmin
      .from("seller_movimentacoes")
      .select("id, tipo, valor, motivo, referencia, criado_em")
      .eq("seller_id", id)
      .eq("org_id", org_id)
      .order("criado_em", { ascending: false })
      .limit(100);

    return NextResponse.json({ ...seller, movimentacoes: movimentacoes ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id, user_id } = await requireAdmin(req);
    const { id } = await params;
    const body = await req.json();

    const { data: curRow, error: curErr } = await supabaseAdmin
      .from("sellers")
      .select("*")
      .eq("id", id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (curErr || !curRow) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const allowed: Record<string, unknown> = {};
    if (body?.nome != null) allowed.nome = String(body.nome).trim();
    if (body?.documento != null) allowed.documento = String(body.documento).trim();
    if (body?.plano != null) allowed.plano = String(body.plano).trim();
    if (["ativo", "inativo", "bloqueado"].includes(String(body?.status ?? "").toLowerCase())) {
      allowed.status = String(body.status).toLowerCase();
    }
    if (body?.data_entrada != null) allowed.data_entrada = body.data_entrada;
    if (body?.email !== undefined) allowed.email = body?.email != null ? String(body.email).trim() : null;
    if (body?.telefone !== undefined) allowed.telefone = body?.telefone != null ? String(body.telefone).trim() : null;
    if (body?.cep !== undefined) allowed.cep = body?.cep != null ? String(body.cep).trim() : null;
    if (body?.endereco !== undefined) allowed.endereco = body?.endereco != null ? String(body.endereco).trim() : null;
    if (body?.nome_responsavel !== undefined) allowed.nome_responsavel = body?.nome_responsavel != null ? String(body.nome_responsavel).trim() : null;
    if (body?.cpf_responsavel !== undefined) allowed.cpf_responsavel = body?.cpf_responsavel != null ? String(body.cpf_responsavel).trim() : null;
    if (body?.data_nascimento !== undefined) allowed.data_nascimento = body?.data_nascimento != null ? String(body.data_nascimento).trim() : null;
    if (body?.nome_banco !== undefined) allowed.nome_banco = body?.nome_banco != null ? String(body.nome_banco).trim() : null;
    if (body?.nome_no_banco !== undefined) allowed.nome_no_banco = body?.nome_no_banco != null ? String(body.nome_no_banco).trim() : null;
    if (body?.agencia !== undefined) allowed.agencia = body?.agencia != null ? String(body.agencia).trim() : null;
    if (body?.conta !== undefined) allowed.conta = body?.conta != null ? String(body.conta).trim() : null;
    if (body?.tipo_conta !== undefined) allowed.tipo_conta = body?.tipo_conta != null ? String(body.tipo_conta).trim() : null;
    if (body?.mensalidade_dia_vencimento !== undefined) {
      if (body.mensalidade_dia_vencimento === null) {
        allowed.mensalidade_dia_vencimento = null;
      } else {
        allowed.mensalidade_dia_vencimento = clampMensalidadeDiaVencimento(Number(body.mensalidade_dia_vencimento));
      }
    }

    const confirmAdmin = Boolean(body?.confirmar_troca_fornecedor_antes_prazo);
    let liberacaoConcedidaAgora = false;

    // Fonte real do vínculo agora é seller_fornecedor_vinculos — sellers.fornecedor_id é só
    // cache, mantido em sincronia pelas RPCs (fn_seller_fornecedor_sync_cache). "Trocar" só
    // faz sentido no caso avulso clássico (exatamente 1 vínculo ativo, fora do CD) — nunca
    // mexe em vínculo nenhum quando o seller tem vínculo(s) do CD (achado real 2026-11-23:
    // sem essa checagem, pegava o único resultado de .maybeSingle() — que ERRA e vira
    // null em silêncio quando há mais de 1 vínculo ativo — ou, com exatamente 1 vínculo do
    // CD, desvinculava ele à toa antes de descobrir que o fornecedor novo também não serve).
    const { data: vinculosAtivosRows } = await supabaseAdmin
      .from("seller_fornecedor_vinculos")
      .select("id, fornecedor_id, fornecedores(opera_no_cd)")
      .eq("seller_id", id)
      .is("desvinculado_em", null);
    const vinculosAtivos = (vinculosAtivosRows ?? []) as {
      id: string;
      fornecedor_id: string;
      fornecedores: { opera_no_cd: boolean }[] | null;
    }[];
    const vinculoAtual =
      vinculosAtivos.length === 1 && vinculosAtivos[0].fornecedores?.[0]?.opera_no_cd === false
        ? vinculosAtivos[0]
        : null;

    if (body?.fornecedor_id !== undefined) {
      const novoForn = uuidNorm(body.fornecedor_id);
      const curForn = vinculoAtual?.fornecedor_id ?? null;
      if (novoForn !== curForn) {
        if (curForn && vinculoAtual) {
          const { data: desv, error: desvErr } = await supabaseAdmin.rpc("fn_seller_fornecedor_desvincular", {
            p_vinculo_id: vinculoAtual.id,
            p_org_id: org_id,
            p_confirmar_antes_prazo_admin: confirmAdmin,
          });
          if (desvErr) return NextResponse.json({ error: desvErr.message }, { status: 500 });
          const desvResult = desv as { ok: boolean; error_code?: string; pode_trocar_fornecedor_a_partir_de?: string };
          if (!desvResult.ok) {
            return NextResponse.json(
              {
                error:
                  desvResult.error_code === "COMPROMISSO_FORNECEDOR_ATIVO"
                    ? "Este seller está no período mínimo de 3 meses com o armazém. Para trocar ou desvincular antes, marque «Liberar troca antecipada» e/ou «Confirmo exceção documentada», ou aguarde a data indicada."
                    : "Vínculo não encontrado.",
                code: desvResult.error_code,
                pode_trocar_fornecedor_a_partir_de: desvResult.pode_trocar_fornecedor_a_partir_de ?? null,
              },
              { status: 400 }
            );
          }
        }
        if (novoForn) {
          const { data: vinc, error: vincErr } = await supabaseAdmin.rpc("fn_seller_fornecedor_vincular", {
            p_seller_id: id,
            p_fornecedor_id: novoForn,
            p_org_id: org_id,
            p_criado_por_tipo: "admin",
            p_criado_por_user_id: user_id,
          });
          if (vincErr) return NextResponse.json({ error: vincErr.message }, { status: 500 });
          const vincResult = vinc as { ok: boolean; error_code?: string };
          if (!vincResult.ok) {
            const mensagens: Record<string, string> = {
              FORNECEDOR_NAO_ENCONTRADO: "Fornecedor não encontrado.",
              FORNECEDOR_NAO_OPERA_NO_CD: "Esse fornecedor não opera no Centro de Distribuição.",
              JA_TEM_FORNECEDOR_VINCULADO: "Este seller já tem um fornecedor vinculado — desvincule antes de trocar.",
              JA_VINCULADO: "Seller já está vinculado a este fornecedor.",
            };
            return NextResponse.json(
              { error: mensagens[vincResult.error_code ?? ""] ?? "Erro ao vincular.", code: vincResult.error_code },
              { status: 400 }
            );
          }
        }
      }
    }

    // Liberação antecipada — ação independente de trocar fornecedor, agora escrita na
    // própria linha de vínculo ativa (não mais em sellers direto).
    if (body?.fornecedor_desvinculo_liberado !== undefined) {
      const liberar = Boolean(body.fornecedor_desvinculo_liberado);
      const { data: vinculoParaLiberar } = await supabaseAdmin
        .from("seller_fornecedor_vinculos")
        .select("id, desvinculo_liberado")
        .eq("seller_id", id)
        .is("desvinculado_em", null)
        .maybeSingle();
      if (vinculoParaLiberar) {
        const row = vinculoParaLiberar as { id: string; desvinculo_liberado: boolean };
        const { error: libErr } = await supabaseAdmin.rpc("fn_seller_fornecedor_liberar_desvinculo", {
          p_vinculo_id: row.id,
          p_org_id: org_id,
          p_liberado: liberar,
        });
        if (libErr) return NextResponse.json({ error: libErr.message }, { status: 500 });
        liberacaoConcedidaAgora = liberar && !row.desvinculo_liberado;
      }
    }

    allowed.atualizado_em = new Date().toISOString();

    const keysMeaningful = Object.keys(allowed).filter((k) => k !== "atualizado_em");
    if (
      keysMeaningful.length === 0 &&
      body?.fornecedor_id === undefined &&
      body?.fornecedor_desvinculo_liberado === undefined
    ) {
      return NextResponse.json({ error: "Nenhum campo para atualizar." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("sellers")
      .update(allowed)
      .eq("id", id)
      .eq("org_id", org_id)
      .select()
      .single();

    if (error) {
      if (error.message.includes("fornecedor_vinculado_em") || error.message.includes("fornecedor_desvinculo")) {
        return NextResponse.json(
          {
            error:
              "Execute o script SQL `seller-fornecedor-vinculo-minimo.sql` no Supabase para criar as colunas de víncio.",
          },
          { status: 500 }
        );
      }
      console.error("[sellers PATCH]", error.message);
      return NextResponse.json({ error: "Erro ao atualizar seller." }, { status: 500 });
    }

    const sellerUserId = (curRow as Record<string, unknown>).user_id as string | null | undefined;
    if (liberacaoConcedidaAgora && sellerUserId) {
      await notifyUserEmail({
        userId: sellerUserId,
        subject: "Você já pode trocar de fornecedor",
        titulo: "Liberação antecipada concedida",
        mensagem: `Você foi liberado para trocar ou desvincular do fornecedor atual. Você tem ${DIAS_JANELA_ESCOLHA_FORNECEDOR} dias para escolher — se não agir nesse prazo, o vínculo atual será renovado automaticamente.`,
      });
    }

    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user_id, org_id } = await requireAdmin(req);
    const { id } = await params;

    const result = await deleteSellerCascade(supabaseAdmin, org_id, id);
    if (!result.ok) {
      const status = result.message === "Seller não encontrado." ? 404 : 400;
      return NextResponse.json({ error: result.message }, { status });
    }

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: user_id,
      action: "seller.excluir",
      targetTable: "sellers",
      targetId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
