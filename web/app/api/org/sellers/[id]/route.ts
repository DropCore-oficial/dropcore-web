import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { buildSellerFornecedorIdPatch, uuidNormFornecedor } from "@/lib/applySellerFornecedorIdChange";

function uuidNorm(v: unknown): string | null {
  return uuidNormFornecedor(v);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Segurança: requireAdmin + .eq("org_id", org_id) — cada org só acessa seus próprios sellers; seller (cadastro) não é usuário de login.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id } = await params;

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("*")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    // Filtra por org_id para evitar IDOR — não basta filtrar por seller_id
    const { data: movimentacoes } = await supabaseAdmin
      .from("seller_movimentacoes")
      .select("id, tipo, valor, motivo, referencia, criado_em")
      .eq("seller_id", id)
      .eq("org_id", org_id)
      .order("criado_em", { ascending: false })
      .limit(100);

    return NextResponse.json({ ...seller, movimentacoes: movimentacoes ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id } = await params;
    const body = await req.json();

    const { data: curRow, error: curErr } = await supabaseAdmin
      .from("sellers")
      .select("*")
      .eq("id", id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (curErr || !curRow) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const cur = curRow as Record<string, unknown>;
    const curForn = uuidNorm(cur.fornecedor_id);
    const curVin = (cur.fornecedor_vinculado_em as string | null | undefined) ?? null;
    const curLib = Boolean(cur.fornecedor_desvinculo_liberado);

    const allowed: Record<string, unknown> = {};
    if (body?.nome != null) allowed.nome = String(body.nome).trim();
    if (body?.documento != null) allowed.documento = String(body.documento).trim();
    if (body?.plano != null) allowed.plano = String(body.plano).trim();
    if (["ativo", "inativo", "bloqueado"].includes(String(body?.status ?? "").toLowerCase())) {
      allowed.status = String(body.status).toLowerCase();
    }
    if (body?.data_entrada != null) allowed.data_entrada = body.data_entrada;
    if (body?.email !== undefined) allowed.email = body?.email != null ? String(body.email).trim() : null;
    if (body?.telefone !== undefined) allowed.telefone = body?.telefone != null ? String(body.telefone).trim() : null;
    if (body?.cep !== undefined) allowed.cep = body?.cep != null ? String(body.cep).trim() : null;
    if (body?.endereco !== undefined) allowed.endereco = body?.endereco != null ? String(body.endereco).trim() : null;
    if (body?.nome_responsavel !== undefined) allowed.nome_responsavel = body?.nome_responsavel != null ? String(body.nome_responsavel).trim() : null;
    if (body?.cpf_responsavel !== undefined) allowed.cpf_responsavel = body?.cpf_responsavel != null ? String(body.cpf_responsavel).trim() : null;
    if (body?.data_nascimento !== undefined) allowed.data_nascimento = body?.data_nascimento != null ? String(body.data_nascimento).trim() : null;
    if (body?.nome_banco !== undefined) allowed.nome_banco = body?.nome_banco != null ? String(body.nome_banco).trim() : null;
    if (body?.nome_no_banco !== undefined) allowed.nome_no_banco = body?.nome_no_banco != null ? String(body.nome_no_banco).trim() : null;
    if (body?.agencia !== undefined) allowed.agencia = body?.agencia != null ? String(body.agencia).trim() : null;
    if (body?.conta !== undefined) allowed.conta = body?.conta != null ? String(body.conta).trim() : null;
    if (body?.tipo_conta !== undefined) allowed.tipo_conta = body?.tipo_conta != null ? String(body.tipo_conta).trim() : null;

    const libNoBody =
      body?.fornecedor_desvinculo_liberado !== undefined ? Boolean(body.fornecedor_desvinculo_liberado) : undefined;
    const liberadoParaChecagem = libNoBody !== undefined ? libNoBody : curLib;
    const confirmAdmin = Boolean(body?.confirmar_troca_fornecedor_antes_prazo);

    if (body?.fornecedor_id !== undefined) {
      const novoForn = uuidNorm(body.fornecedor_id);
      if (novoForn !== curForn) {
        const vin = buildSellerFornecedorIdPatch(
          {
            fornecedor_id: curForn,
            fornecedor_vinculado_em: curVin,
            fornecedor_desvinculo_liberado: liberadoParaChecagem,
          },
          novoForn,
          confirmAdmin,
          {
            mensagemCompromisso:
              "Este seller está no período mínimo de 3 meses com o armazém. Para trocar ou desvincular antes, marque «Liberar troca antecipada» e/ou «Confirmo exceção documentada», ou aguarde a data indicada.",
          }
        );
        if (!vin.ok) {
          return NextResponse.json(
            {
              error: vin.error,
              code: vin.code,
              pode_trocar_fornecedor_a_partir_de: vin.pode_trocar_fornecedor_a_partir_de ?? null,
            },
            { status: vin.status }
          );
        }
        Object.assign(allowed, vin.allowed);
      }
    }

    if (libNoBody !== undefined && body?.fornecedor_id === undefined) {
      allowed.fornecedor_desvinculo_liberado = libNoBody;
    } else if (libNoBody !== undefined && body?.fornecedor_id !== undefined && uuidNorm(body.fornecedor_id) === curForn) {
      allowed.fornecedor_desvinculo_liberado = libNoBody;
    }

    allowed.atualizado_em = new Date().toISOString();

    const keysMeaningful = Object.keys(allowed).filter((k) => k !== "atualizado_em");
    if (keysMeaningful.length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("sellers")
      .update(allowed)
      .eq("id", id)
      .eq("org_id", org_id)
      .select()
      .single();

    if (error) {
      if (error.message.includes("fornecedor_vinculado_em") || error.message.includes("fornecedor_desvinculo")) {
        return NextResponse.json(
          {
            error:
              "Execute o script SQL `seller-fornecedor-vinculo-minimo.sql` no Supabase para criar as colunas de víncio.",
          },
          { status: 500 }
        );
      }
      console.error("[sellers PATCH]", error.message);
      return NextResponse.json({ error: "Erro ao atualizar seller." }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id } = await params;

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, status")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const estaInativo = seller.status === "inativo";

    // Tenta verificar se existem pedidos associados (pode não existir a tabela ainda)
    let temPedidos = false;
    try {
      const { data: pedidos, error: pedidosErr } = await supabaseAdmin
        .from("pedidos")
        .select("id")
        .eq("seller_id", id)
        .limit(1);

      // Se a tabela não existir, ignora e continua
      if (pedidosErr) {
        if (pedidosErr.message.includes("does not exist") || pedidosErr.message.includes("relation") || pedidosErr.code === "42P01") {
          temPedidos = false; // Tabela não existe, então não tem pedidos
        } else {
          console.warn("Erro ao verificar pedidos:", pedidosErr.message);
          temPedidos = false; // Em caso de erro desconhecido, assume que não tem pedidos
        }
      } else {
        temPedidos = pedidos && pedidos.length > 0;
      }
    } catch (e) {
      // Se der qualquer erro, assume que não tem pedidos e continua
      temPedidos = false;
    }

    // Se está ativo e tem pedidos, não permite excluir
    if (!estaInativo && temPedidos) {
      return NextResponse.json(
        { error: "Não é possível excluir este seller porque existem pedidos associados a ele. Marque como 'inativo' em vez de excluir." },
        { status: 400 }
      );
    }

    // Se está inativo e tem pedidos, deleta tudo em cascata na ordem correta
    if (estaInativo && temPedidos) {
      try {
        // Busca todos os pedidos para deletar em cascata
        const { data: todosPedidos } = await supabaseAdmin
          .from("pedidos")
          .select("id")
          .eq("seller_id", id);

        if (todosPedidos && todosPedidos.length > 0) {
          const pedidoIds = todosPedidos.map((p: { id: string }) => p.id);

          // 1. Deleta repasses_fornecedor primeiro (se existir)
          try {
            await supabaseAdmin
              .from("repasses_fornecedor")
              .delete()
              .in("pedido_id", pedidoIds);
          } catch (e) {
            // Ignora erro se a tabela não existir
          }

          // 2. Deleta pedido_itens (se existir)
          try {
            await supabaseAdmin
              .from("pedido_itens")
              .delete()
              .in("pedido_id", pedidoIds);
          } catch (e) {
            // Ignora erro se a tabela não existir
          }

          // 3. Deleta os pedidos
          await supabaseAdmin
            .from("pedidos")
            .delete()
            .eq("seller_id", id);
        }
      } catch (e) {
        // Se der erro ao deletar pedidos, continua mesmo assim (pode ser que a tabela não exista)
        console.warn("Erro ao deletar pedidos (ignorado):", e);
      }
    }

    // Deleta movimentações primeiro
    await supabaseAdmin.from("seller_movimentacoes").delete().eq("seller_id", id);
    
    // Deleta o seller
    const { error: delErr } = await supabaseAdmin
      .from("sellers")
      .delete()
      .eq("id", id)
      .eq("org_id", org_id);

    if (delErr) {
      // Se ainda der erro de foreign key relacionado a pedidos ou repasses, tenta deletar tudo em cascata
      if (delErr.message.includes("foreign key") && (delErr.message.includes("pedidos") || delErr.message.includes("repasses"))) {
        try {
          // Busca todos os pedidos
          const { data: todosPedidos } = await supabaseAdmin
            .from("pedidos")
            .select("id")
            .eq("seller_id", id);
          
          if (todosPedidos && todosPedidos.length > 0) {
            const pedidoIds = todosPedidos.map((p: { id: string }) => p.id);

            // 1. Deleta repasses_fornecedor primeiro
            try {
              await supabaseAdmin
                .from("repasses_fornecedor")
                .delete()
                .in("pedido_id", pedidoIds);
            } catch (e) {
              // Ignora erro se a tabela não existir
            }

            // 2. Deleta pedido_itens
            try {
              await supabaseAdmin
                .from("pedido_itens")
                .delete()
                .in("pedido_id", pedidoIds);
            } catch (e) {
              // Ignora erro se a tabela não existir
            }

            // 3. Deleta os pedidos
            await supabaseAdmin
              .from("pedidos")
              .delete()
              .eq("seller_id", id);
          }

          // Tenta deletar o seller novamente
          const { error: retryErr } = await supabaseAdmin
            .from("sellers")
            .delete()
            .eq("id", id)
            .eq("org_id", org_id);

          if (retryErr) {
            return NextResponse.json(
              { error: "Não é possível excluir este seller porque existem dados associados a ele. Marque como 'inativo' em vez de excluir." },
              { status: 400 }
            );
          }
          return NextResponse.json({ ok: true });
        } catch (e) {
          return NextResponse.json(
            { error: "Não é possível excluir este seller porque existem dados associados a ele. Marque como 'inativo' em vez de excluir." },
            { status: 400 }
          );
        }
      }
      console.error("[sellers DELETE]", delErr.message);
      return NextResponse.json({ error: "Erro ao excluir seller." }, { status: 500 });
    }
    
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
