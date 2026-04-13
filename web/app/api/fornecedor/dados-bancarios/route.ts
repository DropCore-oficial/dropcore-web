/**
 * PATCH /api/fornecedor/dados-bancarios
 * Atualiza dados bancários do fornecedor autenticado.
 * Requer token de fornecedor.
 */
import { NextResponse } from "next/server";
import { getFornecedorIdFromBearer } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { validarRepasseTitularEmpresa } from "@/lib/repasseTitularCnpj";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const { error } = await supabaseAdmin
      .from("fornecedores")
      .update(update)
      .eq("id", fornecedor_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
