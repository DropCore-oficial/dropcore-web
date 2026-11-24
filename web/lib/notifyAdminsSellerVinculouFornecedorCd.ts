import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";
import { resolverCobrancaVinculoCd, type CobrancaVinculoResultado } from "@/lib/cdFornecedorExtraAddonPrecos";

const TIPO = "seller_vinculou_fornecedor_cd" as const;

/** Mesma regra de `mensagemCobrancaVinculo`, mas escrita na 3ª pessoa (leitor é o admin,
 * não o seller) — nunca reaproveitar aquela função aqui, ela usa "sua" assumindo que quem
 * lê é o próprio seller. */
function mensagemCobrancaParaAdmin(r: CobrancaVinculoResultado, sellerNome: string): string {
  if (!r.opera_no_cd) return "";
  if (r.incluso) return " Incluso na mensalidade dele, sem custo extra.";
  if (r.isento_cortesia) {
    return r.cortesia_ate
      ? ` Isento de cobrança por cortesia até ${new Date(`${r.cortesia_ate}T00:00:00`).toLocaleDateString("pt-BR")}.`
      : " Isento de cobrança por cortesia.";
  }
  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(r.valor);
  return ` Por ser mais de 1 fornecedor do Centro de Distribuição, isso soma ${valorBRL}/mês na próxima mensalidade de ${sellerNome}.`;
}

/**
 * Notifica owners/admins da org (sino + e-mail) quando o PRÓPRIO seller se vincula
 * (self-service) a um fornecedor do Centro de Distribuição — até aqui só o seller era
 * avisado (notifySellerVinculoFornecedorProprio) e a org só ficava sabendo se abrisse a
 * tela do seller no admin (achado 2026-11-24, durante teste ao vivo do link "Ver meu
 * plano" nessa mesma notificação).
 */
export async function notifyAdminsSellerVinculouFornecedorCd(params: {
  org_id: string;
  seller_id: string;
  fornecedor_id: string;
}): Promise<void> {
  const [{ data: admins }, { data: seller }, { data: forn }, cobranca] = await Promise.all([
    supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", params.org_id)
      .is("fornecedor_id", null)
      .is("seller_id", null)
      .in("role_base", ["owner", "admin"]),
    supabaseAdmin.from("sellers").select("nome").eq("id", params.seller_id).maybeSingle(),
    supabaseAdmin.from("fornecedores").select("nome").eq("id", params.fornecedor_id).maybeSingle(),
    resolverCobrancaVinculoCd({ seller_id: params.seller_id, org_id: params.org_id, fornecedor_id: params.fornecedor_id }),
  ]);

  const destinatarios = (admins ?? []).filter(
    (a): a is { user_id: string } => typeof a.user_id === "string" && a.user_id.length > 0,
  );
  if (destinatarios.length === 0) return;

  const sellerNome = seller?.nome?.trim() || "Um seller";
  const fornecedorNome = forn?.nome?.trim() || "um fornecedor";
  const titulo = "Seller vinculou fornecedor do Centro de Distribuição";
  const mensagem = `${sellerNome} se vinculou a ${fornecedorNome} no Centro de Distribuição por conta própria.${mensagemCobrancaParaAdmin(cobranca, sellerNome)}`;

  await supabaseAdmin.from("notifications").insert(
    destinatarios.map((a) => ({
      user_id: a.user_id,
      tipo: TIPO,
      titulo,
      mensagem,
      metadata: { seller_id: params.seller_id, fornecedor_id: params.fornecedor_id },
    })),
  );

  await Promise.all(
    destinatarios.map((a) =>
      notifyUserEmail({
        userId: a.user_id,
        subject: titulo,
        titulo,
        mensagem,
      }),
    ),
  );
}

export { TIPO as NOTIFICACAO_TIPO_SELLER_VINCULOU_FORNECEDOR_CD };
