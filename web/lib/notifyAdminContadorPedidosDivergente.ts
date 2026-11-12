import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TIPO = "contador_pedidos_divergente_admin" as const;

/** Dedupe de 24h — essa checagem roda de hora em hora (ver pedidosContadoresConsistencia.ts),
 * não faz sentido reinserir a mesma notificação toda hora enquanto ninguém mexe. */
const JANELA_DEDUPE_HORAS = 24;

/** Notifica owners/admins da org quando a contagem de uma aba de pedidos (seller ou
 * fornecedor) diverge do que existe de verdade no banco — qualquer motivo, não só o bug de
 * `DISTINCT ON` já corrigido (ver fn_seller_pedidos_lista). É uma rede de segurança genérica:
 * se essa checagem nunca mais disparar, não significa que o bug específico nunca mais vai
 * acontecer — significa que, se acontecer de novo (nessa ou em outra categoria/entidade),
 * alguém vai saber sem precisar notar por acaso num print. */
export async function notifyAdminContadorPedidosDivergente(params: {
  org_id: string;
  entidade_tipo: "seller" | "fornecedor";
  entidade_id: string;
  entidade_nome: string | null;
  categoria: string;
  contador_mostrado: number;
  contador_real: number;
}): Promise<void> {
  const desde = new Date(Date.now() - JANELA_DEDUPE_HORAS * 60 * 60 * 1000).toISOString();
  const { data: jaNotificado } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("tipo", TIPO)
    .gte("criado_em", desde)
    .contains("metadata", { entidade_id: params.entidade_id, categoria: params.categoria })
    .limit(1)
    .maybeSingle();
  if (jaNotificado) return;

  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .in("role_base", ["owner", "admin"]);

  const entidadeLabel = params.entidade_tipo === "seller" ? "Seller" : "Fornecedor";
  const nome = params.entidade_nome ? ` ${params.entidade_nome}` : "";

  const rows = (admins ?? [])
    .filter((a): a is { user_id: string } => typeof a.user_id === "string" && a.user_id.length > 0)
    .map((a) => ({
      user_id: a.user_id,
      tipo: TIPO,
      titulo: "Contador de pedidos divergente",
      mensagem: `${entidadeLabel}${nome}: a aba "${params.categoria}" mostra ${params.contador_mostrado}, mas o banco tem ${params.contador_real} de verdade. Confira a tela de pedidos dessa entidade.`,
      metadata: {
        entidade_tipo: params.entidade_tipo,
        entidade_id: params.entidade_id,
        categoria: params.categoria,
        contador_mostrado: params.contador_mostrado,
        contador_real: params.contador_real,
      },
    }));

  if (rows.length === 0) return;
  await supabaseAdmin.from("notifications").insert(rows);
}

export { TIPO as NOTIFICACAO_TIPO_CONTADOR_PEDIDOS_DIVERGENTE_ADMIN };
