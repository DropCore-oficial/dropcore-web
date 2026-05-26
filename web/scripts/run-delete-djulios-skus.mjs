/**
 * Executa reset de SKUs do fornecedor Djulios (produção via .env.local).
 * Uso: node scripts/run-delete-djulios-skus.mjs [--dry-run]
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

function loadEnv() {
  const path = resolve(__dirname, "../.env.local");
  const raw = readFileSync(path, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltou NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em web/.env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: orgs, error: oErr } = await supabase.from("orgs").select("id, nome").ilike("nome", "dropcore");
  if (oErr) throw new Error(oErr.message);
  const orgIds = (orgs ?? []).map((o) => o.id);
  if (orgIds.length === 0) {
    console.error("Org DropCore não encontrada.");
    process.exit(1);
  }

  const { data: forns, error: fErr } = await supabase
    .from("fornecedores")
    .select("id, nome, org_id")
    .ilike("nome", "%djulios%")
    .in("org_id", orgIds);

  if (fErr) throw new Error(fErr.message);
  const list = forns ?? [];

  if (list.length === 0) {
    console.error("Nenhum fornecedor Djulios na org DropCore.");
    process.exit(1);
  }
  if (list.length > 1) {
    console.error("Vários fornecedores casam:", list.map((f) => `${f.nome} (${f.id})`).join(", "));
    process.exit(1);
  }

  const forn = list[0];
  console.log("Fornecedor:", forn.nome, forn.id);

  const { count, error: cErr } = await supabase
    .from("skus")
    .select("id", { count: "exact", head: true })
    .eq("fornecedor_id", forn.id);
  if (cErr) throw new Error(cErr.message);
  console.log("SKUs a remover:", count ?? 0);

  if (dryRun) {
    console.log("--dry-run: nada foi apagado.");
    return;
  }

  const { error: rascErr } = await supabase
    .from("fornecedor_produto_rascunhos")
    .delete()
    .eq("fornecedor_id", forn.id);
  if (rascErr && rascErr.code !== "42P01") console.warn("rascunhos:", rascErr.message);

  const { error: altErr } = await supabase
    .from("sku_alteracoes_pendentes")
    .delete()
    .eq("fornecedor_id", forn.id);
  if (altErr && altErr.code !== "42P01") console.warn("alteracoes:", altErr.message);

  const { data: skuIds } = await supabase.from("skus").select("id").eq("fornecedor_id", forn.id);
  const ids = (skuIds ?? []).map((r) => r.id);
  if (ids.length > 0) {
    const { error: habErr } = await supabase.from("seller_skus_habilitados").delete().in("sku_id", ids);
    if (habErr && habErr.code !== "42P01") console.warn("habilitados:", habErr.message);
  }

  const { data: skuRows } = await supabase.from("skus").select("sku").eq("fornecedor_id", forn.id);
  const grupoKeys = [
    ...new Set(
      (skuRows ?? []).map((r) => {
        const s = String(r.sku ?? "").trim().toUpperCase();
        const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
        return m ? `${m[1]}${m[2]}000` : s;
      })
    ),
  ].filter(Boolean);
  if (grupoKeys.length > 0) {
    const { error: medErr } = await supabase.from("produto_tabela_medidas").delete().in("grupo_key", grupoKeys);
    if (medErr && medErr.code !== "42P01") console.warn("medidas:", medErr.message);
  }

  const { error: delErr } = await supabase.from("skus").delete().eq("fornecedor_id", forn.id);
  if (delErr) throw new Error(delErr.message);

  const { count: after } = await supabase
    .from("skus")
    .select("id", { count: "exact", head: true })
    .eq("fornecedor_id", forn.id);

  console.log("OK. SKUs restantes:", after ?? 0);
  console.log("Próximo produto novo deve gerar SKU a partir de DJU001000 (iniciais do fornecedor).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
