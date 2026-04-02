/**
 * Aprova manualmente um depósito PIX.
 * Uso: npx tsx scripts/aprovar-deposito-manual.ts [deposito_id]
 * Ex: npx tsx scripts/aprovar-deposito-manual.ts c422ffdb-71ff-4688-80dc-d22937cf8251
 */
import { createClient } from "@supabase/supabase-js";

const depositoId = process.argv[2] || "c422ffdb-71ff-4688-80dc-d22937cf8251";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: deposito, error: fetchErr } = await supabase
    .from("seller_depositos_pix")
    .select("id, org_id, seller_id, valor, status")
    .eq("id", depositoId)
    .single();

  if (fetchErr || !deposito) {
    console.error("Depósito não encontrado:", fetchErr?.message ?? "ID inválido");
    process.exit(1);
  }
  if (deposito.status !== "pendente") {
    console.error("Depósito já foi processado. Status atual:", deposito.status);
    process.exit(1);
  }

  const valor = Number(deposito.valor);
  const now = new Date().toISOString();

  await supabase.from("financial_ledger").insert({
    org_id: deposito.org_id,
    seller_id: deposito.seller_id,
    fornecedor_id: null,
    pedido_id: null,
    tipo: "CREDITO",
    valor_fornecedor: 0,
    valor_dropcore: valor,
    valor_total: valor,
    status: "LIBERADO",
    referencia: "PIX aprovado (manual)",
  });

  const { data: seller } = await supabase.from("sellers").select("saldo_atual").eq("id", deposito.seller_id).single();
  const novoSaldo = (Number(seller?.saldo_atual) || 0) + valor;
  await supabase.from("sellers").update({ saldo_atual: novoSaldo, atualizado_em: now }).eq("id", deposito.seller_id);

  await supabase.from("seller_movimentacoes").insert({
    seller_id: deposito.seller_id,
    tipo: "credito",
    valor,
    motivo: "PIX",
    referencia: `Depósito PIX aprovado ${depositoId}`,
  });

  await supabase
    .from("seller_depositos_pix")
    .update({ status: "aprovado", aprovado_em: now })
    .eq("id", depositoId)
    .eq("org_id", deposito.org_id);

  console.log("Depósito aprovado:", depositoId, "- Valor:", valor, "- Novo saldo Galileus:", novoSaldo);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
