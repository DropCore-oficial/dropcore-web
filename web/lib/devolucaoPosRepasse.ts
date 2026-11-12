/**
 * Núcleo de "registrar devolução depois que o repasse já saiu" — extraído de
 * `app/api/org/financial/devolucao-pos-repasse/route.ts` (ação manual do admin) pra também
 * ser chamado automaticamente pela detecção de devolução (`mlDevolucaoDeteccao.ts`). Achado
 * real 2026-11-11: quando o Mercado Livre confirma a devolução DEPOIS do ledger já estar
 * `PAGO`, `fn_devolucao_auto_travar` recusa travar (não tem mais o que bloquear — o dinheiro
 * já saiu) e, sem esse fallback automático, a devolução ficava só notificada (aviso de "48h
 * pra confirmar" sem sentido nenhum, já que não tinha nada travado) sem nenhum rastro
 * financeiro real — o pedido continuava com status normal, nada indicava que precisava
 * descontar do fornecedor. Mesmo efeito da ação manual do admin: débito em
 * `financial_debito_descontar` pro próximo repasse + crédito de volta pro seller.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { proximoCicloRepasse } from "@/lib/cicloRepasse";
import { notifyFornecedorDebitoDevolucaoRegistrado } from "@/lib/notifyFornecedorDebitoDevolucao";

export type RegistrarDevolucaoPosRepasseResultado =
  | { ok: true; id: string; cicloADescontar: string }
  | { ok: false; error: string };

export async function registrarDevolucaoPosRepasse(
  orgId: string,
  ledgerId: string,
  cicloADescontarInput?: string | null
): Promise<RegistrarDevolucaoPosRepasseResultado> {
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("financial_ledger")
    .select(
      "id, org_id, seller_id, fornecedor_id, tipo, status, valor_fornecedor, valor_dropcore, valor_total, pedido_id, ciclo_repasse"
    )
    .eq("id", ledgerId)
    .eq("org_id", orgId)
    .single();

  if (fetchErr || !row) return { ok: false, error: "Registro do ledger não encontrado." };
  if (row.status !== "PAGO") {
    return { ok: false, error: "Só é possível registrar devolução pós-repasse para registros já com status PAGO." };
  }
  if (row.tipo !== "BLOQUEIO" && row.tipo !== "VENDA") {
    return { ok: false, error: "Tipo de registro não permite devolução pós-repasse." };
  }
  if (!row.fornecedor_id) {
    return { ok: false, error: "Registro sem fornecedor associado; não é possível gerar débito a descontar." };
  }

  const { data: jaExiste } = await supabaseAdmin
    .from("financial_debito_descontar")
    .select("id")
    .eq("ledger_id", ledgerId)
    .limit(1)
    .maybeSingle();
  if (jaExiste) return { ok: false, error: "Já existe um débito a descontar registrado para este ledger." };

  let cicloADescontar = cicloADescontarInput ?? null;
  if (!cicloADescontar) {
    cicloADescontar = proximoCicloRepasse();
  } else {
    const d = new Date(cicloADescontar);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "ciclo_a_descontar deve ser uma data válida (YYYY-MM-DD)." };
    }
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("financial_debito_descontar")
    .insert({
      org_id: orgId,
      fornecedor_id: row.fornecedor_id,
      pedido_id: row.pedido_id ?? null,
      ledger_id: ledgerId,
      valor_fornecedor: row.valor_fornecedor,
      valor_dropcore: row.valor_dropcore,
      valor_total: row.valor_total,
      ciclo_a_descontar: cicloADescontar,
      descontado: false,
    })
    .select("id, ciclo_a_descontar")
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  // Crédito de volta pro seller — se falhar, desfaz o débito já inserido acima, senão o
  // fornecedor fica debitado no próximo repasse sem o seller nunca ter recebido o crédito de
  // volta (achado real 2026-10-11, nunca confirmar ok:true nesse caso).
  if (row.seller_id) {
    const { error: devErr } = await supabaseAdmin.from("financial_ledger").insert({
      org_id: orgId,
      seller_id: row.seller_id,
      fornecedor_id: row.fornecedor_id ?? null,
      pedido_id: row.pedido_id ?? null,
      tipo: "DEVOLUCAO",
      valor_fornecedor: Number(row.valor_fornecedor),
      valor_dropcore: Number(row.valor_dropcore),
      valor_total: Number(row.valor_total),
      status: "DEVOLVIDO",
      ciclo_repasse: row.ciclo_repasse ?? null,
      referencia: `devolução pós-repasse (ledger ${ledgerId})`,
    });
    if (devErr) {
      console.error("[devolucao-pos-repasse] Erro ao criar DEVOLUCAO, desfazendo débito:", devErr.message);
      await supabaseAdmin.from("financial_debito_descontar").delete().eq("id", inserted?.id);
      return { ok: false, error: "Erro ao creditar o seller — nada foi registrado." };
    }
  }

  // Pedido fica "entregue" pra sempre sem isso — o débito é o fim de linha dessa devolução
  // (não tem trava de 72h nem confirmação de fornecedor nesse caminho, já foi pago), então o
  // status final é "devolvido" direto, igual ao que a liberação automática normal usa.
  if (row.pedido_id) {
    await supabaseAdmin.from("pedidos").update({ status: "devolvido" }).eq("id", row.pedido_id);
  }

  if (row.fornecedor_id) {
    const { data: pedidoRow } = row.pedido_id
      ? await supabaseAdmin.from("pedidos").select("marketplace_numero").eq("id", row.pedido_id).maybeSingle()
      : { data: null };
    await notifyFornecedorDebitoDevolucaoRegistrado({
      org_id: orgId,
      fornecedor_id: row.fornecedor_id,
      pedido_id: row.pedido_id ?? null,
      marketplace_numero: pedidoRow?.marketplace_numero ?? null,
      valor_fornecedor: Number(row.valor_fornecedor),
      ciclo_a_descontar: cicloADescontar,
    });
  }

  return { ok: true, id: inserted!.id as string, cicloADescontar };
}
