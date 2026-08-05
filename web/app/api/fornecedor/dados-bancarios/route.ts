/**
 * PATCH /api/fornecedor/dados-bancarios
 * Não aplica a mudança na hora — grava como pendente e manda link de confirmação por
 * e-mail (POST /api/fornecedor/dados-bancarios/confirmar). Mesma lógica de carência que
 * bancos reais usam pra troca de chave PIX: se um token de fornecedor vazar, quem pegar
 * ainda precisaria do e-mail do fornecedor pra completar a troca de destino do repasse.
 * Requer token de fornecedor.
 */
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { getFornecedorIdFromBearer } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { validarRepasseTitularEmpresa } from "@/lib/repasseTitularCnpj";
import { getUserIdParaEntidade } from "@/lib/entidadeUserId";
import { notifyUserEmail } from "@/lib/notifyEmail";
import { getSiteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRMACAO_EXPIRA_MINUTOS = 30;

export async function PATCH(req: Request) {
  try {
    const fornecedor_id = await getFornecedorIdFromBearer(req);
    if (!fornecedor_id) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const update: Record<string, string | null> = {};
    const fields = ["chave_pix", "nome_banco", "nome_no_banco", "agencia", "conta", "tipo_conta"] as const;

    for (const f of fields) {
      if (f in body) {
        const v = body[f];
        update[f] = v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhum dado alterado." });
    }

    const { data: rowAtual, error: errRow } = await supabaseAdmin
      .from("fornecedores")
      .select("nome, cnpj, chave_pix, nome_banco, nome_no_banco, agencia, conta, tipo_conta")
      .eq("id", fornecedor_id)
      .maybeSingle();

    if (errRow || !rowAtual) {
      return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 404 });
    }

    const repasseCheck = validarRepasseTitularEmpresa({
      razaoSocial: String(rowAtual.nome ?? "").trim(),
      cnpjEmpresa: normalizeCnpjInput(String(rowAtual.cnpj ?? "")),
      chave_pix: ("chave_pix" in update ? update.chave_pix : rowAtual.chave_pix) ?? null,
      nome_banco: ("nome_banco" in update ? update.nome_banco : rowAtual.nome_banco) ?? null,
      nome_no_banco: ("nome_no_banco" in update ? update.nome_no_banco : rowAtual.nome_no_banco) ?? null,
      agencia: ("agencia" in update ? update.agencia : rowAtual.agencia) ?? null,
      conta: ("conta" in update ? update.conta : rowAtual.conta) ?? null,
      tipo_conta: ("tipo_conta" in update ? update.tipo_conta : rowAtual.tipo_conta) ?? null,
    });
    if (!repasseCheck.ok) {
      return NextResponse.json({ error: repasseCheck.error }, { status: 400 });
    }

    const dadosPropostos = {
      chave_pix: "chave_pix" in update ? update.chave_pix : rowAtual.chave_pix,
      nome_banco: "nome_banco" in update ? update.nome_banco : rowAtual.nome_banco,
      nome_no_banco: "nome_no_banco" in update ? update.nome_no_banco : rowAtual.nome_no_banco,
      agencia: "agencia" in update ? update.agencia : rowAtual.agencia,
      conta: "conta" in update ? update.conta : rowAtual.conta,
      tipo_conta: "tipo_conta" in update ? update.tipo_conta : rowAtual.tipo_conta,
    };

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiraEm = new Date(Date.now() + CONFIRMACAO_EXPIRA_MINUTOS * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin.from("fornecedor_dados_bancarios_pendentes").upsert(
      {
        fornecedor_id,
        dados_propostos: dadosPropostos,
        token_hash: tokenHash,
        expira_em: expiraEm,
      },
      { onConflict: "fornecedor_id" }
    );

    if (error) {
      return NextResponse.json({ error: "Erro ao registrar alteração pendente." }, { status: 500 });
    }

    const userId = await getUserIdParaEntidade("fornecedor", fornecedor_id);
    if (userId) {
      const link = `${getSiteUrl()}/fornecedor/confirmar-dados-bancarios?token=${token}`;
      await notifyUserEmail({
        userId,
        subject: "Confirme a troca dos seus dados bancários",
        titulo: "Confirmação de dados bancários",
        mensagem: `Foi solicitada uma troca dos dados de repasse (PIX/conta) do seu cadastro no DropCore. Se foi você, confirme pelo link abaixo — ele vale por ${CONFIRMACAO_EXPIRA_MINUTOS} minutos. Se não foi você, ignore este e-mail e avise o suporte.`,
        ctaUrl: link,
        ctaLabel: "Confirmar dados bancários",
      });
    }

    return NextResponse.json({
      ok: true,
      pendente_confirmacao: true,
      message: "Confirme a alteração pelo link enviado no seu e-mail.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
