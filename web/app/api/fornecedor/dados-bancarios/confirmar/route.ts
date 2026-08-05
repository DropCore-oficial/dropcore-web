/**
 * POST /api/fornecedor/dados-bancarios/confirmar
 * Aplica em `fornecedores` a troca de dados bancários que ficou pendente no PATCH de
 * /api/fornecedor/dados-bancarios. O token (vindo do link do e-mail) é a prova de
 * intenção — sem exigir login, mesmo padrão dos convites de seller/fornecedor.
 * Body: { token: string }
 */
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { validarRepasseTitularEmpresa } from "@/lib/repasseTitularCnpj";
import { getRequestIp } from "@/lib/requestIp";

const BANK_FIELDS = ["chave_pix", "nome_banco", "nome_no_banco", "agencia", "conta", "tipo_conta"] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ error: "Token ausente." }, { status: 400 });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { data: pendente, error: buscaErr } = await supabaseAdmin
      .from("fornecedor_dados_bancarios_pendentes")
      .select("id, fornecedor_id, dados_propostos, expira_em")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (buscaErr || !pendente) {
      return NextResponse.json({ error: "Link inválido ou já utilizado." }, { status: 400 });
    }
    if (new Date(pendente.expira_em) < new Date()) {
      await supabaseAdmin.from("fornecedor_dados_bancarios_pendentes").delete().eq("id", pendente.id);
      return NextResponse.json(
        { error: "Este link expirou. Solicite a troca novamente no painel do fornecedor." },
        { status: 400 }
      );
    }

    const { data: rowAtual, error: errRow } = await supabaseAdmin
      .from("fornecedores")
      .select("nome, cnpj, chave_pix, nome_banco, nome_no_banco, agencia, conta, tipo_conta")
      .eq("id", pendente.fornecedor_id)
      .maybeSingle();
    if (errRow || !rowAtual) {
      return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 404 });
    }

    const dados = pendente.dados_propostos as {
      chave_pix: string | null;
      nome_banco: string | null;
      nome_no_banco: string | null;
      agencia: string | null;
      conta: string | null;
      tipo_conta: string | null;
    };

    const repasseCheck = validarRepasseTitularEmpresa({
      razaoSocial: String(rowAtual.nome ?? "").trim(),
      cnpjEmpresa: normalizeCnpjInput(String(rowAtual.cnpj ?? "")),
      ...dados,
    });
    if (!repasseCheck.ok) {
      return NextResponse.json({ error: repasseCheck.error }, { status: 400 });
    }

    const { error: updErr } = await supabaseAdmin
      .from("fornecedores")
      .update(dados)
      .eq("id", pendente.fornecedor_id);
    if (updErr) {
      return NextResponse.json({ error: "Erro ao aplicar alteração." }, { status: 500 });
    }

    const dadosAntigos: Record<string, string | null> = {};
    for (const f of BANK_FIELDS) {
      dadosAntigos[f] = (rowAtual as Record<string, string | null>)[f] ?? null;
    }
    await supabaseAdmin.from("fornecedor_dados_bancarios_historico").insert({
      fornecedor_id: pendente.fornecedor_id,
      dados_antigos: dadosAntigos,
      dados_novos: dados,
      ip_confirmacao: getRequestIp(req),
    });

    await supabaseAdmin.from("fornecedor_dados_bancarios_pendentes").delete().eq("id", pendente.id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
