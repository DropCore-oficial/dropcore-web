/**
 * GET /api/fornecedor/desempenho
 * Dados para gráfico e analytics do fornecedor (valor_fornecedor por dia, totais, top produto).
 * Query: dias=7|14|30|60|90|120
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const modo = searchParams.get("modo") ?? "dias";
    const periodoParam = searchParams.get("periodo") ?? searchParams.get("dias") ?? "14";

    const { fornecedor_id, org_id } = ctx;

    const TZ = "America/Sao_Paulo";
    const agora = new Date();
    const hojeStart = new Date(agora.toLocaleString("en-US", { timeZone: TZ }));
    hojeStart.setHours(0, 0, 0, 0);
    const hojeEnd = new Date(hojeStart);
    hojeEnd.setDate(hojeEnd.getDate() + 1);

    let inicio: Date;
    let fim: Date;
    let dias: number;

    if (modo === "hoje") {
      inicio = hojeStart;
      fim = hojeEnd;
      dias = 1;
    } else if (periodoParam.startsWith("month:")) {
      const hojeKey = agora.toLocaleDateString("en-CA", { timeZone: TZ });
      if (periodoParam === "month:current") {
        inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
        fim = new Date(agora.getTime() + 864e5);
        dias = Math.ceil((agora.getTime() - inicio.getTime()) / 864e5) + 1;
      } else if (periodoParam === "month:last") {
        inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
        fim = new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59, 999);
        dias = new Date(agora.getFullYear(), agora.getMonth(), 0).getDate();
      } else {
        const [y, m] = periodoParam.slice(6).split("-").map(Number);
        inicio = new Date(y, (m ?? 1) - 1, 1);
        const ate = hojeKey.startsWith(`${y}-${String(m).padStart(2, "0")}`)
          ? new Date(agora)
          : new Date(y, m ?? 1, 0);
        fim = new Date(ate.getTime() + 864e5);
        dias = Math.ceil((ate.getTime() - inicio.getTime()) / 864e5) + 1;
      }
    } else {
      const diasParam = parseInt(periodoParam, 10);
      dias = Math.min(120, Math.max(7, Number.isNaN(diasParam) ? 14 : diasParam));
      inicio = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
      fim = new Date(agora.getTime() + 864e5);
    }

    const { data: pedidos, error } = await supabaseAdmin
      .from("pedidos")
      .select("id, criado_em, valor_fornecedor, nome_produto")
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .in("status", ["enviado", "aguardando_repasse", "entregue"])
      .gte("criado_em", inicio.toISOString())
      .lt("criado_em", modo === "hoje" ? fim.toISOString() : fim.toISOString())
      .order("criado_em", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const lista = pedidos ?? [];
    const toKey = (d: Date) =>
      d.toLocaleDateString("en-CA", { timeZone: TZ });
    const isoToLocalKey = (iso: string) => toKey(new Date(iso));
    const getHourBR = (iso: string) => {
      const parts = new Date(iso).toLocaleTimeString("en-CA", { timeZone: TZ, hour12: false }).split(":");
      return parseInt(parts[0] ?? "0", 10);
    };

    let vendasPorDia: { dia: string; valor: number; count: number }[];

    if (modo === "hoje") {
      const horasArr: { dia: string; valor: number; count: number }[] = [];
      for (let h = 0; h < 24; h++) {
        horasArr.push({ dia: `${String(h).padStart(2, "0")}:00`, valor: 0, count: 0 });
      }
      const mapH = new Map(horasArr.map((x) => [x.dia.slice(0, 2), x]));
      for (const p of lista) {
        const h = getHourBR(p.criado_em);
        const key = String(h).padStart(2, "0");
        const row = mapH.get(key);
        if (row) {
          row.valor += Number(p.valor_fornecedor ?? 0) || 0;
          row.count += 1;
        }
      }
      vendasPorDia = horasArr;
    } else {
      const diasArr: { dia: string; valor: number; count: number }[] = [];
      if (periodoParam.startsWith("month:")) {
        const [primeiro, ultimo] = (() => {
          if (periodoParam === "month:current") {
            return [new Date(agora.getFullYear(), agora.getMonth(), 1), new Date(agora)];
          }
          if (periodoParam === "month:last") {
            return [
              new Date(agora.getFullYear(), agora.getMonth() - 1, 1),
              new Date(agora.getFullYear(), agora.getMonth(), 0),
            ];
          }
          const [y, m] = periodoParam.slice(6).split("-").map(Number);
          const primeiro = new Date(y, (m ?? 1) - 1, 1);
          const hojeKey = agora.toLocaleDateString("en-CA", { timeZone: TZ });
          const ate = hojeKey.startsWith(`${y}-${String(m).padStart(2, "0")}`)
            ? new Date(agora)
            : new Date(y, m ?? 1, 0);
          return [primeiro, ate];
        })();
        for (let d = new Date(primeiro); d <= ultimo; d.setDate(d.getDate() + 1)) {
          diasArr.push({ dia: toKey(d), valor: 0, count: 0 });
        }
      } else {
        for (let i = dias - 1; i >= 0; i--) {
          const d = new Date(agora.getTime() - i * 24 * 60 * 60 * 1000);
          diasArr.push({ dia: toKey(d), valor: 0, count: 0 });
        }
      }
      const map = new Map(diasArr.map((x) => [x.dia, x]));
      for (const p of lista) {
        const raw = p.criado_em;
        if (!raw || typeof raw !== "string" || raw.length < 10) continue;
        const key = isoToLocalKey(raw);
        const row = map.get(key);
        if (row) {
          row.valor += Number(p.valor_fornecedor ?? 0) || 0;
          row.count += 1;
        }
      }
      vendasPorDia = diasArr;
    }

    // Totais
    const totalPedidos = lista.length;
    const valorTotal = lista.reduce((s, p) => s + Number(p.valor_fornecedor ?? 0) || 0, 0);
    const ticketMedio = totalPedidos > 0 ? valorTotal / totalPedidos : null;

    // Top produto por quantidade
    const produtosMap: Record<string, { nome: string; count: number; valor: number }> = {};
    for (const p of lista) {
      const nome = p.nome_produto ?? "Produto sem nome";
      if (!produtosMap[nome]) produtosMap[nome] = { nome, count: 0, valor: 0 };
      produtosMap[nome].count += 1;
      produtosMap[nome].valor += Number(p.valor_fornecedor ?? 0) || 0;
    }
    const topProduto = Object.values(produtosMap).sort((a, b) => b.count - a.count)[0] ?? null;

    // Período anterior (para comparação %)
    let valorAnterior = 0;
    let pedidosAnteriores = 0;
    if (modo === "dias" && dias > 0) {
      const inicioAnt = new Date(inicio.getTime() - dias * 24 * 60 * 60 * 1000);
      const { data: pedidosAnt } = await supabaseAdmin
        .from("pedidos")
        .select("valor_fornecedor")
        .eq("org_id", org_id)
        .eq("fornecedor_id", fornecedor_id)
        .in("status", ["enviado", "aguardando_repasse", "entregue"])
        .gte("criado_em", inicioAnt.toISOString())
        .lt("criado_em", inicio.toISOString());
      pedidosAnteriores = pedidosAnt?.length ?? 0;
      valorAnterior = (pedidosAnt ?? []).reduce((s, p) => s + Number(p.valor_fornecedor ?? 0), 0);
    }

    const pedidosParaGrafico =
      modo === "dias"
        ? lista.map((p) => ({
            criado_em: p.criado_em,
            valor_fornecedor: Number(p.valor_fornecedor ?? 0),
            nome_produto: p.nome_produto ?? null,
          }))
        : undefined;

    return NextResponse.json({
      vendasPorDia,
      totalPedidos,
      valorTotal,
      ticketMedio,
      topProduto,
      dias,
      pedidos: pedidosParaGrafico,
      modo,
      valorAnterior,
      pedidosAnteriores,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
