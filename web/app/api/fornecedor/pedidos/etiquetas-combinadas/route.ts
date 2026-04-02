/**
 * POST /api/fornecedor/pedidos/etiquetas-combinadas
 * Mescla as etiquetas oficiais (PDF) de vários pedidos num único arquivo para impressão em lote.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 40;
const FETCH_TIMEOUT_MS = 45_000;
const MAX_SINGLE_PDF_BYTES = 12 * 1024 * 1024;

async function getFornecedorFromToken(req: Request): Promise<{ fornecedor_id: string; org_id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) return null;
  return { fornecedor_id: member.fornecedor_id, org_id: member.org_id };
}

function base64ToUint8Array(raw: string): Uint8Array {
  const s = raw.trim();
  const m = /^data:application\/pdf[^;]*;base64,(.+)$/i.exec(s);
  const b64 = m ? m[1] : s;
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

async function bytesFromPedido(
  etiqueta_pdf_url: string | null | undefined,
  etiqueta_pdf_base64: string | null | undefined
): Promise<Uint8Array | null> {
  const url = etiqueta_pdf_url?.trim();
  if (url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { Accept: "application/pdf,*/*" },
      });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_SINGLE_PDF_BYTES) return null;
      return new Uint8Array(ab);
    } finally {
      clearTimeout(t);
    }
  }
  const b64 = etiqueta_pdf_base64?.trim();
  if (b64) {
    const u8 = base64ToUint8Array(b64);
    if (u8.byteLength > MAX_SINGLE_PDF_BYTES) return null;
    return u8;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    let body: { ids?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
    }

    const rawIds = body.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: "Informe ao menos um id de pedido em ids." }, { status: 400 });
    }
    if (rawIds.length > MAX_IDS) {
      return NextResponse.json({ error: `No máximo ${MAX_IDS} pedidos por vez.` }, { status: 400 });
    }

    const ids = [...new Set(rawIds.map((x) => String(x).trim()).filter(Boolean))];
    if (ids.length === 0) {
      return NextResponse.json({ error: "Nenhum id válido." }, { status: 400 });
    }

    const { data: rows, error: qErr } = await supabaseAdmin
      .from("pedidos")
      .select("id, etiqueta_pdf_url, etiqueta_pdf_base64")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .in("id", ids);

    if (qErr) {
      console.error("[etiquetas-combinadas]", qErr.message);
      return NextResponse.json({ error: "Erro ao buscar pedidos." }, { status: 500 });
    }

    const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Alguns pedidos não foram encontrados ou não pertencem a você.", missing },
        { status: 400 }
      );
    }

    const buffers: Uint8Array[] = [];
    const semEtiqueta: string[] = [];
    const falhaDownload: string[] = [];

    for (const id of ids) {
      const row = byId.get(id)!;
      const bytes = await bytesFromPedido(
        row.etiqueta_pdf_url as string | null | undefined,
        row.etiqueta_pdf_base64 as string | null | undefined
      );
      if (!bytes) {
        const hasMeta =
          !!(row.etiqueta_pdf_url as string | null)?.trim() ||
          !!(row.etiqueta_pdf_base64 as string | null)?.trim();
        if (!hasMeta) semEtiqueta.push(id);
        else falhaDownload.push(id);
        continue;
      }
      buffers.push(bytes);
    }

    if (buffers.length === 0) {
      return NextResponse.json(
        {
          error:
            semEtiqueta.length > 0
              ? "Nenhum dos pedidos selecionados tem etiqueta oficial (PDF) disponível."
              : "Não foi possível baixar as etiquetas. Tente de novo ou abra cada pedido individualmente.",
          sem_etiqueta: semEtiqueta,
          falha_download: falhaDownload,
        },
        { status: 400 }
      );
    }

    const merged = await PDFDocument.create();
    for (const buf of buffers) {
      try {
        const doc = await PDFDocument.load(buf);
        const copied = await merged.copyPages(doc, doc.getPageIndices());
        for (const page of copied) merged.addPage(page);
      } catch (e) {
        console.error("[etiquetas-combinadas] PDF inválido ou corrompido", e);
      }
    }
    const pageCount = merged.getPageCount();
    if (pageCount === 0) {
      return NextResponse.json({ error: "Nenhum PDF válido para mesclar." }, { status: 400 });
    }
    const out = await merged.save();

    const filename = `etiquetas-${pageCount}-paginas.pdf`;
    return new NextResponse(Buffer.from(out), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
        ...(semEtiqueta.length + falhaDownload.length > 0
          ? {
              "X-Dropcore-Etiquetas-Aviso": encodeURIComponent(
                JSON.stringify({ omitidos: [...semEtiqueta, ...falhaDownload] })
              ),
            }
          : {}),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
