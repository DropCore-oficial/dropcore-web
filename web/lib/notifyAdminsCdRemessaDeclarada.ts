/**
 * Notifica quem opera o Centro de Distribuição (owner/admin/operacional da org — todos têm
 * acesso à tela /admin/cd) sempre que um fornecedor declara uma remessa nova, pra não
 * depender de alguém entrar manualmente na aba "Remessas pendentes" pra descobrir que tem
 * conferência pra fazer.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";

export async function notifyAdminsCdRemessaDeclarada(params: {
  org_id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  sku: string;
  nome_produto: string | null;
  quantidade: number;
}): Promise<void> {
  const { data: staff } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .in("role_base", ["owner", "admin", "operacional"]);

  const destinatarios = (staff ?? []).filter(
    (a): a is { user_id: string } => typeof a.user_id === "string" && a.user_id.length > 0
  );
  if (destinatarios.length === 0) return;

  const produto = params.nome_produto ? `${params.sku} (${params.nome_produto})` : params.sku;
  const titulo = "Remessa nova no CD aguardando conferência";
  const mensagem = `${params.fornecedor_nome} declarou ${params.quantidade} unidade(s) de ${produto} — aguardando conferência física.`;

  await supabaseAdmin.from("notifications").insert(
    destinatarios.map((a) => ({
      user_id: a.user_id,
      tipo: "cd_remessa_declarada",
      titulo,
      mensagem,
      metadata: { fornecedor_id: params.fornecedor_id, sku: params.sku, quantidade: params.quantidade },
    }))
  );

  await Promise.all(
    destinatarios.map((a) =>
      notifyUserEmail({
        userId: a.user_id,
        subject: titulo,
        titulo,
        mensagem,
        ctaUrl: "https://www.dropcore.com.br/admin/cd",
        ctaLabel: "Conferir remessa",
      })
    )
  );
}
