/**
 * Corrige retroativamente pedidos que foram gravados/debitados sem os 15% de
 * margem do DropCore (bug em web/lib/erp/submitSellerErpPedido.ts e
 * web/app/api/erp/pedidos/route.ts, já corrigido no código pra pedidos novos).
 *
 * Pra cada pedido afetado (status em enviado/aguardando_repasse/entregue/devolvido,
 * valor_dropcore = 0, valor_fornecedor > 0):
 *   1. Calcula o delta que faltou: round(valor_fornecedor * 0.15, 2).
 *   2. Confere saldo_disponivel atual do seller — se não for suficiente, PULA (não
 *      força saldo negativo) e lista no relatório final.
 *   3. Corrige pedidos.valor_dropcore/valor_total e pedido_itens.preco_unitario/
 *      valor_total pra refletir o valor certo (o que aparece pro seller em
 *      /seller/pedidos).
 *   4. Insere um lançamento BLOQUEIO no financial_ledger (valor_fornecedor=0,
 *      valor_dropcore=delta) — entra no saldo bloqueado e no ciclo de repasse como
 *      qualquer bloqueio normal.
 *   5. Consome o delta dos lotes de crédito ativos do seller (FIFO), mesma lógica
 *      de web/lib/sellerCreditLots.ts.
 *   6. Notifica o seller sobre o ajuste (transparência).
 *
 * Idempotente: pula pedidos que já têm um lançamento de ajuste (referencia
 * "Ajuste retroativo margem 15%") — pode rodar de novo com segurança.
 *
 * Uso:
 *   npx tsx scripts/corrigir-pedidos-sem-margem-dropcore.ts            (dry-run, não escreve nada)
 *   npx tsx scripts/corrigir-pedidos-sem-margem-dropcore.ts --apply    (aplica de verdade)
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}
const supabase = createClient(url, key);

const AJUSTE_PREFIXO = "Ajuste retroativo margem 15%";

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

type PedidoAfetado = {
  id: string;
  org_id: string;
  seller_id: string;
  fornecedor_id: string;
  valor_fornecedor: number;
  valor_dropcore: number;
  valor_total: number;
};

async function jaFoiCorrigido(pedido_id: string): Promise<boolean> {
  const { data } = await supabase
    .from("financial_ledger")
    .select("id")
    .eq("pedido_id", pedido_id)
    .ilike("referencia", `${AJUSTE_PREFIXO}%`)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/** Mesma lógica de web/lib/sellerCreditLots.ts consumirSellerCreditLots (FIFO por expiração). */
async function consumirCreditoFifo(seller_id: string, valor: number): Promise<void> {
  const now = new Date().toISOString();
  const { data: lots, error } = await supabase
    .from("seller_credit_lots")
    .select("id, valor_restante")
    .eq("seller_id", seller_id)
    .eq("status", "ativo")
    .gt("valor_restante", 0)
    .gte("expira_em", now)
    .order("expira_em", { ascending: true });

  if (error) {
    console.error("  ! erro ao consultar seller_credit_lots:", error.message);
    return;
  }

  let restante = valor;
  for (const lot of lots ?? []) {
    if (restante <= 0) break;
    const vr = Number(lot.valor_restante);
    if (vr <= 0) continue;
    const consumir = Math.min(restante, vr);
    const novo = round2(vr - consumir);
    restante = round2(restante - consumir);
    await supabase
      .from("seller_credit_lots")
      .update({ valor_restante: novo, status: novo <= 0 ? "esgotado" : "ativo", atualizado_em: now })
      .eq("id", lot.id);
  }
}

async function main() {
  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select("id, org_id, seller_id, fornecedor_id, valor_fornecedor, valor_dropcore, valor_total")
    .in("status", ["enviado", "aguardando_repasse", "entregue", "devolvido"])
    .eq("valor_dropcore", 0)
    .gt("valor_fornecedor", 0)
    .order("criado_em", { ascending: true })
    .returns<PedidoAfetado[]>();

  if (error) {
    console.error("Erro ao buscar pedidos afetados:", error.message);
    process.exit(1);
  }

  console.log(`Modo: ${APPLY ? "APLICANDO" : "DRY-RUN (nada será escrito)"}`);
  console.log(`Pedidos candidatos: ${pedidos?.length ?? 0}\n`);

  let corrigidos = 0;
  let valorCobrado = 0;
  const pulados: { pedido_id: string; seller_id: string; motivo: string; delta: number }[] = [];

  for (const pedido of pedidos ?? []) {
    if (await jaFoiCorrigido(pedido.id)) {
      console.log(`- ${pedido.id}: já corrigido antes, pulando.`);
      continue;
    }

    const delta = round2(Number(pedido.valor_fornecedor) * 0.15);

    const { data: saldoRows, error: saldoErr } = await supabase.rpc("fn_seller_saldo_from_ledger", {
      p_seller_id: pedido.seller_id,
    });
    if (saldoErr) {
      console.error(`- ${pedido.id}: erro ao consultar saldo do seller:`, saldoErr.message);
      pulados.push({ pedido_id: pedido.id, seller_id: pedido.seller_id, motivo: "erro_ao_consultar_saldo", delta });
      continue;
    }
    const saldo = Array.isArray(saldoRows) ? saldoRows[0] : saldoRows;
    const saldoDisponivel = Number(saldo?.saldo_disponivel ?? 0);

    if (saldoDisponivel < delta) {
      console.log(
        `- ${pedido.id}: saldo insuficiente (disponível R$ ${saldoDisponivel.toFixed(2)} < delta R$ ${delta.toFixed(2)}) — pulando.`
      );
      pulados.push({ pedido_id: pedido.id, seller_id: pedido.seller_id, motivo: "saldo_insuficiente", delta });
      continue;
    }

    console.log(`- ${pedido.id}: delta R$ ${delta.toFixed(2)} (seller ${pedido.seller_id}, saldo disponível R$ ${saldoDisponivel.toFixed(2)})`);

    if (!APPLY) {
      corrigidos++;
      valorCobrado = round2(valorCobrado + delta);
      continue;
    }

    // Ciclo de repasse do bloqueio original (mesmo pedido), pra manter o ajuste no mesmo ciclo.
    const { data: bloqueioOriginal } = await supabase
      .from("financial_ledger")
      .select("ciclo_repasse")
      .eq("pedido_id", pedido.id)
      .eq("tipo", "BLOQUEIO")
      .order("criado_em", { ascending: true })
      .limit(1)
      .maybeSingle();

    let ciclo_repasse = bloqueioOriginal?.ciclo_repasse ?? null;
    if (!ciclo_repasse) {
      const { data: cicloRow } = await supabase.rpc("fn_ciclo_repasse", { data_evento: new Date().toISOString() });
      ciclo_repasse = cicloRow ?? null;
    }

    const { error: ledgerErr } = await supabase.from("financial_ledger").insert({
      org_id: pedido.org_id,
      seller_id: pedido.seller_id,
      fornecedor_id: pedido.fornecedor_id,
      pedido_id: pedido.id,
      tipo: "BLOQUEIO",
      valor_fornecedor: 0,
      valor_dropcore: delta,
      valor_total: delta,
      status: "BLOQUEADO",
      ciclo_repasse,
      referencia: `${AJUSTE_PREFIXO} — pedido ${pedido.id}`,
    });
    if (ledgerErr) {
      console.error(`  ! erro ao inserir lançamento de ajuste:`, ledgerErr.message);
      pulados.push({ pedido_id: pedido.id, seller_id: pedido.seller_id, motivo: "erro_ledger", delta });
      continue;
    }

    const { error: pedidoUpErr } = await supabase
      .from("pedidos")
      .update({
        valor_dropcore: delta,
        valor_total: round2(Number(pedido.valor_total) + delta),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", pedido.id);
    if (pedidoUpErr) {
      console.error(`  ! erro ao atualizar pedido:`, pedidoUpErr.message);
    }

    const { data: itens } = await supabase
      .from("pedido_itens")
      .select("id, quantidade, preco_unitario")
      .eq("pedido_id", pedido.id);
    for (const item of itens ?? []) {
      const novoPrecoUnit = round2(Number(item.preco_unitario) * 1.15);
      const novoValorTotal = round2(novoPrecoUnit * Number(item.quantidade));
      await supabase
        .from("pedido_itens")
        .update({ preco_unitario: novoPrecoUnit, valor_total: novoValorTotal })
        .eq("id", item.id);
    }

    await consumirCreditoFifo(pedido.seller_id, delta);

    const { data: sellerRow } = await supabase.from("sellers").select("user_id").eq("id", pedido.seller_id).maybeSingle();
    if (sellerRow?.user_id) {
      const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
      await supabase.from("notifications").insert({
        user_id: sellerRow.user_id,
        tipo: "ajuste_pedido_margem",
        titulo: "Ajuste em pedido",
        mensagem: `Identificamos que o pedido ${pedido.id} foi cobrado a menos por uma falha no cálculo. Foi debitado um ajuste de ${fmt.format(delta)} do seu crédito DropCore.`,
        metadata: { pedido_id: pedido.id, delta },
      });
    }

    corrigidos++;
    valorCobrado = round2(valorCobrado + delta);
  }

  console.log("\n=== Resumo ===");
  console.log(`Pedidos ${APPLY ? "corrigidos" : "que seriam corrigidos"}: ${corrigidos}`);
  console.log(`Valor ${APPLY ? "cobrado" : "que seria cobrado"}: R$ ${valorCobrado.toFixed(2)}`);
  if (pulados.length > 0) {
    console.log(`Pulados (${pulados.length}):`);
    for (const p of pulados) {
      console.log(`  - pedido ${p.pedido_id} (seller ${p.seller_id}): ${p.motivo}, delta R$ ${p.delta.toFixed(2)}`);
    }
  }
  if (!APPLY) {
    console.log("\nDry-run — nada foi escrito. Rode com --apply pra aplicar de verdade.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
