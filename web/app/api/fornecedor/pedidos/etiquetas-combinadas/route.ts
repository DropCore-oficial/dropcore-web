/**
 * POST /api/fornecedor/pedidos/etiquetas-combinadas
 * Mescla as etiquetas oficiais (PDF) de vários pedidos num único arquivo para impressão em lote.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { calcularPrazoDespachoPedido } from "@/lib/pedidoSlaDespacho";
import { gerarPaginaInfoPedido, desenharInfoPedidoNaEtiqueta, type ItemInfoEtiqueta } from "@/lib/etiquetaInfoPagePdf";
import { normalizarEtiquetaMlPdf } from "@/lib/mercadoLivreApiClient";
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
      .select(
        "id, seller_id, nome_produto, marketplace_numero, marketplace_pack_id, valor_fornecedor, criado_em, canal_venda, etiqueta_pdf_url, etiqueta_pdf_base64"
      )
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

    // Produto/SKU/cor/tamanho pra imprimir junto da etiqueta (achado 2026-11-02: formato
    // da UpSeller mostra isso, o fornecedor não devia precisar voltar na tela). Busca de
    // TODOS os pedidos do pacote (não só os `ids` selecionados), pra pacote de >1 produto
    // mostrar tudo que vai dentro, igual a lista de separação já faz na tela.
    const packIds = [...new Set((rows ?? []).map((r) => r.marketplace_pack_id).filter(Boolean))] as string[];
    const { data: irmaosDoPackRaw } = packIds.length
      ? await supabaseAdmin
          .from("pedidos")
          .select("id, marketplace_pack_id")
          .eq("org_id", ctx.org_id)
          .eq("fornecedor_id", ctx.fornecedor_id)
          .in("marketplace_pack_id", packIds)
      : { data: [] as Array<{ id: string; marketplace_pack_id: string | null }> };
    const pedidoIdsParaItens = [...new Set([...ids, ...(irmaosDoPackRaw ?? []).map((r) => r.id)])];

    const [sellersRes, itensRes] = await Promise.all([
      supabaseAdmin.from("sellers").select("id, nome").in("id", [...new Set((rows ?? []).map((r) => r.seller_id))]),
      supabaseAdmin
        .from("pedido_itens")
        .select("pedido_id, quantidade, skus(sku, nome_produto, cor, tamanho)")
        .in("pedido_id", pedidoIdsParaItens),
    ]);
    const sellerNomeMap = new Map((sellersRes.data ?? []).map((s) => [s.id, s.nome as string]));
    const itensPorPedido = new Map<string, ItemInfoEtiqueta[]>();
    for (const row of itensRes.data ?? []) {
      const pid = row.pedido_id as string;
      const skusJoined = row.skus as unknown;
      const sku = (Array.isArray(skusJoined) ? skusJoined[0] : skusJoined) as
        | { sku?: string; nome_produto?: string | null; cor?: string | null; tamanho?: string | null }
        | null;
      const lista = itensPorPedido.get(pid) ?? [];
      lista.push({
        sku: sku?.sku ?? null,
        nome_produto: sku?.nome_produto ?? null,
        cor: sku?.cor ?? null,
        tamanho: sku?.tamanho ?? null,
        quantidade: Number(row.quantidade ?? 1),
      });
      itensPorPedido.set(pid, lista);
    }
    const packIdPorPedido = new Map((irmaosDoPackRaw ?? []).map((r) => [r.id as string, r.marketplace_pack_id as string | null]));

    /** Itens do pedido + de todo irmão do mesmo pacote (pacote de N produtos = N pedidos
     * separados do ML compartilhando 1 etiqueta física). */
    function itensDoPacote(pedidoId: string, packId: string | null): ItemInfoEtiqueta[] {
      if (!packId) return itensPorPedido.get(pedidoId) ?? [];
      const todos: ItemInfoEtiqueta[] = [];
      for (const [pid, pkid] of packIdPorPedido.entries()) {
        if (pkid === packId) todos.push(...(itensPorPedido.get(pid) ?? []));
      }
      return todos.length > 0 ? todos : itensPorPedido.get(pedidoId) ?? [];
    }

    const buffers: Array<{ id: string; bytes: Uint8Array }> = [];
    const incluidos: string[] = [];
    const semEtiqueta: string[] = [];
    const falhaDownload: string[] = [];
    // Pedidos do mesmo pack do ML compartilham a mesma etiqueta física (1 pacote, 1
    // etiqueta) — mesclar o PDF de cada irmão geraria páginas duplicadas da mesma
    // etiqueta. Só o primeiro id de cada pack entra no PDF; os outros só são marcados
    // como impressos também (ver `marcarComoImpressos` abaixo).
    const packsJaIncluidos = new Set<string>();
    const duplicatasDoMesmoPack: string[] = [];

    for (const id of ids) {
      const row = byId.get(id)!;
      const packId = (row.marketplace_pack_id as string | null)?.trim() || null;
      if (packId) {
        if (packsJaIncluidos.has(packId)) {
          duplicatasDoMesmoPack.push(id);
          continue;
        }
        packsJaIncluidos.add(packId);
      }
      let bytes = await bytesFromPedido(
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
      // Etiqueta ML cacheada antes da correção de rotação (2026-11-02) ainda está salva
      // no formato antigo (só flag /Rotate, sem geometria física) — normaliza na hora de
      // imprimir em vez de depender de backfill; já normalizada, a função não mexe em nada.
      if (row.canal_venda === "mercado_livre") {
        bytes = await normalizarEtiquetaMlPdf(bytes);
      }
      buffers.push({ id, bytes });
      incluidos.push(id);
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
    for (const { id, bytes: buf } of buffers) {
      try {
        const doc = await PDFDocument.load(buf);
        const row = byId.get(id)!;
        const packId = (row.marketplace_pack_id as string | null)?.trim() || null;
        const infoParams = {
          marketplace_numero: (row.marketplace_numero as string | null) ?? null,
          seller_nome: sellerNomeMap.get(row.seller_id as string) ?? "—",
          valor_fornecedor: Number(row.valor_fornecedor ?? 0),
          criado_em: row.criado_em as string,
          itens: itensDoPacote(id, packId),
        };

        const copied = await merged.copyPages(doc, doc.getPageIndices());
        for (const page of copied) merged.addPage(page);

        // Mercado Livre normalizado tem sempre 1 página só (ver `normalizarEtiquetaMlPdf`) —
        // desenha a info direto na metade de baixo dela, pra sair 1 etiqueta física só, não
        // 2 (achado 2026-11-02: página de info separada fazia a impressora cortar em 2).
        // Outros canais (etiqueta anexada manual) mantêm página própria antes, por segurança.
        if (row.canal_venda === "mercado_livre" && copied.length === 1) {
          const etiquetaPage = copied[0];
          const { width, height } = etiquetaPage.getSize();
          try {
            await desenharInfoPedidoNaEtiqueta(merged, etiquetaPage, width, height, infoParams);
          } catch (e) {
            console.error("[etiquetas-combinadas] falha ao desenhar info na etiqueta ML:", e);
          }
        } else {
          try {
            const primeiraPagina = doc.getPages()[0];
            const { width, height } = primeiraPagina.getSize();
            const infoBytes = await gerarPaginaInfoPedido({ width, height, ...infoParams });
            const infoDoc = await PDFDocument.load(infoBytes);
            const infoCopiada = await merged.copyPages(infoDoc, infoDoc.getPageIndices());
            // Insere antes da(s) página(s) da etiqueta que já foram adicionadas.
            const etiquetaIndex = merged.getPageCount() - copied.length;
            for (let i = 0; i < infoCopiada.length; i++) {
              merged.insertPage(etiquetaIndex + i, infoCopiada[i]);
            }
          } catch (e) {
            console.error("[etiquetas-combinadas] falha ao gerar página de info, seguindo só com a etiqueta:", e);
          }
        }
      } catch (e) {
        console.error("[etiquetas-combinadas] PDF inválido ou corrompido", e);
      }
    }
    const pageCount = merged.getPageCount();
    if (pageCount === 0) {
      return NextResponse.json({ error: "Nenhum PDF válido para mesclar." }, { status: 400 });
    }
    const out = await merged.save();

    const idsParaMarcarImpresso = [...incluidos, ...duplicatasDoMesmoPack];
    if (idsParaMarcarImpresso.length > 0) {
      const agora = new Date().toISOString();
      const { error: marcarImpressaErr } = await supabaseAdmin
        .from("pedidos")
        .update({ etiqueta_impressa_em: agora })
        .in("id", idsParaMarcarImpresso)
        .is("etiqueta_impressa_em", null);
      if (marcarImpressaErr) {
        console.error("[etiquetas-combinadas] marcar etiqueta_impressa_em:", marcarImpressaErr.message);
      } else {
        // SLA de despacho (Shopee/Shein/TikTok) — o relógio começa agora que a etiqueta
        // está impressa. Mercado Livre calcula à parte (prazo vem direto da API do ML,
        // ver web/lib/etiquetaMlRetry.ts), não depende de etiqueta impressa.
        for (const id of idsParaMarcarImpresso) {
          const canalVenda = (byId.get(id)?.canal_venda as string | null) ?? null;
          if (!canalVenda || canalVenda === "mercado_livre") continue;
          try {
            const prazo = await calcularPrazoDespachoPedido({
              canalVenda,
              etiquetaImpressaEm: agora,
              sellerId: "",
              marketplaceNumero: null,
            });
            if (prazo) {
              await supabaseAdmin.from("pedidos").update({ sla_prazo_despacho: prazo.toISOString() }).eq("id", id);
            }
          } catch (e: unknown) {
            console.error("[etiquetas-combinadas] sla_prazo_despacho:", id, e);
          }
        }
      }
    }

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
