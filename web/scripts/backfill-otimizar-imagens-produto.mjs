/**
 * Backfill único: reprocessa as fotos já existentes no bucket "produto-imagens"
 * com o mesmo redimensionamento/compressão agora aplicado no upload (ver lib/imageOptimize.ts).
 * Mantém o mesmo path/content-type — não muda imagem_url nenhuma no banco.
 *
 * Uso (rodar de dentro de web/, Node 20.6+ por causa do --env-file):
 *   node --env-file=.env.local scripts/backfill-otimizar-imagens-produto.mjs --dry
 *   node --env-file=.env.local scripts/backfill-otimizar-imagens-produto.mjs --limit 1
 *   node --env-file=.env.local scripts/backfill-otimizar-imagens-produto.mjs
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "produto-imagens";
const MAX_WIDTH = 1600;
const QUALITY = 82;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

async function optimizeBuffer(buffer, contentType) {
  if (contentType === "image/gif") return buffer;
  try {
    const resized = sharp(buffer, { failOn: "none" }).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });
    if (contentType === "image/png") return await resized.png({ compressionLevel: 9, quality: QUALITY }).toBuffer();
    if (contentType === "image/webp") return await resized.webp({ quality: QUALITY }).toBuffer();
    return await resized.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
  } catch (e) {
    console.warn("  falha ao otimizar, mantendo original:", e.message);
    return buffer;
  }
}

async function listarTudo(prefix = "") {
  const out = [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      // é uma "pasta" (sem metadata) — desce recursivo
      out.push(...(await listarTudo(path)));
    } else {
      out.push({ path, size: item.metadata?.size ?? 0, contentType: item.metadata?.mimetype ?? "image/jpeg" });
    }
  }
  return out;
}

async function main() {
  console.log(`Listando objetos em "${BUCKET}"...`);
  const objetos = await listarTudo();
  console.log(`Total encontrado: ${objetos.length}`);

  const alvo = objetos.slice(0, Number.isFinite(limit) ? limit : objetos.length);
  let totalAntes = 0;
  let totalDepois = 0;
  let processados = 0;
  let pulados = 0;

  for (const obj of alvo) {
    const { data: blob, error: downloadErr } = await supabase.storage.from(BUCKET).download(obj.path);
    if (downloadErr || !blob) {
      console.warn(`[pulado] ${obj.path} — falha no download: ${downloadErr?.message}`);
      pulados++;
      continue;
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    const contentType = obj.contentType || blob.type || "image/jpeg";
    const otimizado = await optimizeBuffer(buffer, contentType);

    totalAntes += buffer.length;
    totalDepois += otimizado.length;

    const economiaPct = buffer.length > 0 ? (100 * (1 - otimizado.length / buffer.length)).toFixed(1) : "0";
    console.log(
      `${dryRun ? "[dry]" : "[ok]"} ${obj.path} — ${(buffer.length / 1024).toFixed(0)}KB → ${(otimizado.length / 1024).toFixed(0)}KB (-${economiaPct}%)`
    );

    if (!dryRun && otimizado.length < buffer.length) {
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(obj.path, otimizado, { upsert: true, contentType });
      if (uploadErr) {
        console.warn(`  falha ao regravar ${obj.path}: ${uploadErr.message}`);
        pulados++;
        continue;
      }
    }
    processados++;
  }

  console.log("\n--- resumo ---");
  console.log(`Processados: ${processados} | Pulados: ${pulados}`);
  console.log(`Total antes:  ${(totalAntes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total depois: ${(totalDepois / 1024 / 1024).toFixed(2)} MB`);
  if (dryRun) console.log("(modo --dry: nada foi regravado)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
