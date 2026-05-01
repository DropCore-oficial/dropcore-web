/**
 * GET  /api/fornecedor/produtos/rascunho — lê o rascunho «criar variantes» do fornecedor autenticado
 * PUT  /api/fornecedor/produtos/rascunho — grava/atualiza o mesmo rascunho (corpo = JSON v1 do formulário)
 * DELETE — remove o rascunho (ex.: após publicar ou ao descartar)
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin, supabaseServiceRoleConfigured } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPO_RASCUNHO = "criar-variantes-v1";
/** Limite aproximado do corpo JSON (fotos em data URL podem estourar quota do navegador). */
const MAX_PAYLOAD_CHARS = 1_800_000;

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

function isMissingRascunhosTable(err: { message?: string; code?: string } | null): boolean {
  const m = String(err?.message ?? "");
  return err?.code === "42P01" || m.includes("fornecedor_produto_rascunhos") && m.includes("does not exist");
}

function sanitizarPayloadLeve(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const p = payload as Record<string, unknown>;
  const fotos = p.fotoUrlPorCor;
  if (!fotos || typeof fotos !== "object" || Array.isArray(fotos)) return payload;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fotos as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (s.startsWith("http://") || s.startsWith("https://")) out[k] = s;
  }
  return { ...p, fotoUrlPorCor: out };
}

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("fornecedor_produto_rascunhos")
      .select("payload, atualizado_em")
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("tipo", TIPO_RASCUNHO)
      .maybeSingle();

    if (error) {
      if (isMissingRascunhosTable(error)) {
        return NextResponse.json({ draft: null, atualizado_em: null, tabela_pendente: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.payload) {
      return NextResponse.json({ draft: null, atualizado_em: null });
    }

    return NextResponse.json({
      draft: data.payload,
      atualizado_em: data.atualizado_em ?? null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    if (!supabaseServiceRoleConfigured) {
      return NextResponse.json(
        {
          error:
            "Servidor sem SUPABASE_SERVICE_ROLE_KEY. Em localhost crie web/.env.local com a chave service_role (Supabase → Settings → API). Sem ela o app não grava rascunhos na nuvem.",
        },
        { status: 503 }
      );
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Payload obrigatório (objeto)." }, { status: 400 });
    }

    const v = (payload as { v?: unknown }).v;
    if (v !== 1) {
      return NextResponse.json({ error: "Versão de rascunho não suportada." }, { status: 400 });
    }

    let serializado = JSON.stringify(payload);
    if (serializado.length > MAX_PAYLOAD_CHARS) {
      const leve = sanitizarPayloadLeve(payload);
      serializado = JSON.stringify(leve);
      if (serializado.length > MAX_PAYLOAD_CHARS) {
        return NextResponse.json(
          {
            error:
              "Rascunho muito grande para salvar na nuvem. Use URLs https para as fotos por cor ou reduza imagens.",
          },
          { status: 413 }
        );
      }
      payload = leve;
    }

    const { error } = await supabaseAdmin.from("fornecedor_produto_rascunhos").upsert(
      {
        org_id: ctx.org_id,
        fornecedor_id: ctx.fornecedor_id,
        tipo: TIPO_RASCUNHO,
        payload,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "fornecedor_id,tipo" }
    );

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[fornecedor/produtos/rascunho PUT] upsert:", error.code, error.message, error.details);
      }
      if (isMissingRascunhosTable(error)) {
        return NextResponse.json(
          {
            error:
              "Tabela de rascunhos ainda não criada. Execute o script web/scripts/create-fornecedor-produto-rascunhos.sql no Supabase.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, atualizado_em: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from("fornecedor_produto_rascunhos")
      .delete()
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("tipo", TIPO_RASCUNHO);

    if (error && !isMissingRascunhosTable(error)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
