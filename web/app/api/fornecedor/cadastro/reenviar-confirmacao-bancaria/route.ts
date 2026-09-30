/**
 * POST /api/fornecedor/cadastro/reenviar-confirmacao-bancaria
 * Reenvia o e-mail de confirmação de troca de PIX/conta pro fornecedor autenticado —
 * mesma lógica de PATCH /api/fornecedor/cadastro, só que sem precisar reenviar o
 * formulário inteiro (achado real 2026-09-29: fornecedor não tem como adivinhar que
 * precisa clicar num link de e-mail que ele nem sabia que existia).
 */
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { getFornecedorIdFromBearer } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdParaEntidade } from "@/lib/entidadeUserId";
import { notifyUserEmail } from "@/lib/notifyEmail";
import { getSiteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRMACAO_BANCARIA_EXPIRA_MINUTOS = 30;

export async function POST(req: Request) {
  const fornecedor_id = await getFornecedorIdFromBearer(req);
  if (!fornecedor_id) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: pendente, error: pendErr } = await supabaseAdmin
    .from("fornecedor_dados_bancarios_pendentes")
    .select("dados_propostos")
    .eq("fornecedor_id", fornecedor_id)
    .maybeSingle();
  if (pendErr) {
    return NextResponse.json({ error: pendErr.message }, { status: 500 });
  }
  if (!pendente) {
    return NextResponse.json({ error: "Não tem troca de dados bancários pendente." }, { status: 404 });
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiraEm = new Date(Date.now() + CONFIRMACAO_BANCARIA_EXPIRA_MINUTOS * 60 * 1000).toISOString();

  const { error: upsertErr } = await supabaseAdmin.from("fornecedor_dados_bancarios_pendentes").upsert(
    { fornecedor_id, dados_propostos: pendente.dados_propostos, token_hash: tokenHash, expira_em: expiraEm },
    { onConflict: "fornecedor_id" }
  );
  if (upsertErr) {
    return NextResponse.json({ error: "Erro ao renovar a pendência." }, { status: 500 });
  }

  const userId = await getUserIdParaEntidade("fornecedor", fornecedor_id);
  if (userId) {
    const link = `${getSiteUrl()}/fornecedor/confirmar-dados-bancarios?token=${token}`;
    await notifyUserEmail({
      userId,
      subject: "Confirme a troca dos seus dados bancários",
      titulo: "Confirmação de dados bancários",
      mensagem: `Foi solicitada uma troca dos dados de repasse (PIX/conta) do seu cadastro no DropCore. Se foi você, confirme pelo link abaixo — ele vale por ${CONFIRMACAO_BANCARIA_EXPIRA_MINUTOS} minutos. Se não foi você, ignore este e-mail e avise o suporte.`,
      ctaUrl: link,
      ctaLabel: "Confirmar dados bancários",
    });
  }

  return NextResponse.json({ ok: true, expira_em: expiraEm });
}
