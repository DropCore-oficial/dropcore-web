/**
 * Copia NCM/origem/CEST/CFOP de detalhes_produto_json.logistica → colunas em skus (cadastros legados).
 * Uso: node scripts/backfill-sku-fiscal-from-detalhes.mjs [--dry-run] [--fornecedor-id=UUID]
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const fornArg = process.argv.find((a) => a.startsWith("--fornecedor-id="));
const fornecedorIdFilter = fornArg ? fornArg.split("=")[1] : null;

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

function str(v) {
  if (v == null || typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function ncmOrigemFromRow(row) {
  let ncm = str(row.ncm);
  let origem = str(row.origem);
  const det = row.detalhes_produto_json;
  if ((!ncm || !origem) && det && typeof det === "object" && !Array.isArray(det)) {
    const log = det.logistica;
    if (log && typeof log === "object" && !Array.isArray(log)) {
      if (!ncm) ncm = str(log.ncm);
      if (!origem) origem = str(log.origemProduto) ?? str(log.origem);
    }
  }
  return { ncm, origem };
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  let q = supabase
    .from("skus")
    .select("id, sku, ncm, origem, cest, cfop, categoria, expedicao_override_linha, detalhes_produto_json, fornecedor_id")
    .not("detalhes_produto_json", "is", null);
  if (fornecedorIdFilter) q = q.eq("fornecedor_id", fornecedorIdFilter);

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  let updated = 0;
  for (const row of rows ?? []) {
    const det = row.detalhes_produto_json;
    const log =
      det && typeof det === "object" && !Array.isArray(det) && det.logistica && typeof det.logistica === "object"
        ? det.logistica
        : null;
    const info =
      det && typeof det === "object" && !Array.isArray(det) && det.infoBasica && typeof det.infoBasica === "object"
        ? det.infoBasica
        : null;

    const fiscal = ncmOrigemFromRow(row);
    const patch = {};
    if (!str(row.ncm) && fiscal.ncm) patch.ncm = fiscal.ncm;
    if (!str(row.origem) && fiscal.origem) patch.origem = fiscal.origem;
    if (!str(row.cest) && log) {
      const c = str(log.cest);
      if (c) patch.cest = c;
    }
    if (!str(row.cfop) && log) {
      const c = str(log.cfop);
      if (c) patch.cfop = c;
    }
    if (!str(row.categoria) && info) {
      const c = str(info.categoria);
      if (c) patch.categoria = c;
    }
    if (!str(row.expedicao_override_linha) && log) {
      const c = str(log.cdSaida);
      if (c) patch.expedicao_override_linha = c;
    }

    if (Object.keys(patch).length === 0) continue;
    updated += 1;
    console.log(row.sku, "→", patch);
    if (!dryRun) {
      const { error: upErr } = await supabase.from("skus").update(patch).eq("id", row.id);
      if (upErr) throw new Error(`${row.sku}: ${upErr.message}`);
    }
  }

  console.log(dryRun ? `[dry-run] ${updated} SKU(s) precisariam de update.` : `OK. ${updated} SKU(s) atualizados.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
