import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Segurança: apenas owner/admin da org (requireAdmin). Dados filtrados por org_id — um seller (cadastro) não tem login; quem acessa é sempre membro da org, vendo só sellers da própria org.
export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const q = searchParams.get("q")?.trim().toLowerCase();

    let query = supabaseAdmin
      .from("sellers")
      .select("id, nome, documento, plano, status, saldo_atual, saldo_bloqueado, data_entrada, criado_em")
      .eq("org_id", org_id)
      .order("nome", { ascending: true });

    if (status && ["ativo", "inativo", "bloqueado"].includes(status)) {
      query = query.eq("status", status);
    }
    if (q) {
      query = query.or(`nome.ilike.%${q}%,documento.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json();
    const nome = String(body?.nome ?? "").trim();
    const documento = body?.documento != null ? String(body.documento).trim() : null;
    const plano = body?.plano != null ? String(body.plano).trim() : null;
    const status = ["ativo", "inativo", "bloqueado"].includes(String(body?.status ?? "").toLowerCase())
      ? String(body.status).toLowerCase()
      : "ativo";

    if (!nome) return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
    if (!documento) return NextResponse.json({ error: "CNPJ ou CPF é obrigatório." }, { status: 400 });

    const insertData: Record<string, unknown> = {
      org_id,
      nome,
      documento: documento.trim(),
      plano: plano || null,
      status,
      saldo_atual: 0,
      saldo_bloqueado: 0,
      data_entrada: body?.data_entrada || new Date().toISOString().slice(0, 10),
    };

    if (body?.email !== undefined) insertData.email = body.email ? String(body.email).trim() : null;
    if (body?.telefone !== undefined) insertData.telefone = body.telefone ? String(body.telefone).trim() : null;
    if (body?.cep !== undefined) insertData.cep = body.cep ? String(body.cep).trim() : null;
    if (body?.endereco !== undefined) insertData.endereco = body.endereco ? String(body.endereco).trim() : null;
    if (body?.nome_responsavel !== undefined) insertData.nome_responsavel = body.nome_responsavel ? String(body.nome_responsavel).trim() : null;
    if (body?.cpf_responsavel !== undefined) insertData.cpf_responsavel = body.cpf_responsavel ? String(body.cpf_responsavel).trim() : null;
    if (body?.data_nascimento !== undefined) insertData.data_nascimento = body.data_nascimento ? String(body.data_nascimento).trim() : null;
    if (body?.nome_banco !== undefined) insertData.nome_banco = body.nome_banco ? String(body.nome_banco).trim() : null;
    if (body?.nome_no_banco !== undefined) insertData.nome_no_banco = body.nome_no_banco ? String(body.nome_no_banco).trim() : null;
    if (body?.agencia !== undefined) insertData.agencia = body.agencia ? String(body.agencia).trim() : null;
    if (body?.conta !== undefined) insertData.conta = body.conta ? String(body.conta).trim() : null;
    if (body?.tipo_conta !== undefined) insertData.tipo_conta = body.tipo_conta ? String(body.tipo_conta).trim() : null;

    const { data, error } = await supabaseAdmin
      .from("sellers")
      .insert(insertData)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
