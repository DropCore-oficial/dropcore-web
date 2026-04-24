"use client";
/* @refresh reset — evita estado preso (ex.: fornecedor seleccionado) ao gravar com Fast Refresh */

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toTitleCase } from "@/lib/formatText";
import { HelpBubble } from "@/components/HelpBubble";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { normalizarFornecedoresSellerApi, type FornecedorSellerListaRow } from "@/lib/mapFornecedorSellerPublico";
import { mascararSkuListagem } from "@/lib/sellerCatalogoPrivacidade";
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MARGEM_MINIMA = 5;

// Visual base — cards neutros e polidos
const cardClass = "rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm";
/** Inputs base igual ao Dashboard */
const inputLight =
  "w-full rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 px-3 py-3 md:py-2.5 text-neutral-900 dark:text-neutral-100 text-base md:text-sm focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-500 placeholder-neutral-400 dark:placeholder-neutral-500";
/** Só Perdas — destaque escuro para chamar atenção */
const inputPerdas =
  "w-full rounded-xl bg-neutral-900 dark:bg-neutral-950 border border-neutral-900 dark:border-neutral-700 px-3 py-2.5 text-white text-base md:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-neutral-500/40 placeholder-neutral-300";
const btnSecondaryClass =
  "rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors";
const unitBadge =
  "inline-flex items-center justify-center w-[52px] h-[42px] rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 shrink-0 select-none";
const perdaToggleClass =
  "inline-flex items-center justify-center w-[52px] h-[42px] rounded-xl bg-neutral-900 dark:bg-neutral-950 border border-neutral-900 dark:border-neutral-700 text-xs font-semibold text-white shrink-0 select-none cursor-pointer hover:opacity-90 transition-colors";

type Extra = { id: string; nome: string; valorStr: string; tipo: "brl" | "pct" };

/** Comissões tabela (variantes Shein/ML) */
const COMISSOES = {
  tiktok: 6,
  shopee: 18,
  shein_masc: 18,
  shein_fem: 20,
  meli_classico: 14,
  meli_premium: 19,
} as const;

/** Preset → nome do marketplace na UI */
const PRESET_TO_MARKETPLACE_NOME: Record<string, string> = {
  tiktok: "TikTok Shop",
  shopee: "Shopee",
  shein: "Shein",
  meli: "Mercado Livre",
  meli_classico: "Mercado Livre",
  meli_premium: "Mercado Livre",
  todos: "Todos os marketplaces",
};

function operacionalPreenchido(s: string): boolean {
  return String(s ?? "").trim().length > 0;
}

type ResultadoVariante = {
  key: string;
  label: string;
  comissao: number;
  precoVenda: number;
  valorLucro: number;
  valorComissao: number;
  valorImposto: number;
  custosFixos: number;
  recebe: number;
  operacionalBruto?: number;
  /** Valor devolvido pelo ML (estorno de tarifa) — soma ao bolso, não é “menos” */
  rebateAplicado?: number;
  /** Lucro na margem + rebate devolvido (referência de “ganho” em duas partes) */
  lucroMaisRebate?: number;
};

/** Cupom reduz o peso dos % “variáveis” na fórmula → preço sugerido menor (não é custo em R$) */
type EfeitoCupom = {
  cupomPct: number;
  descontoPct: number;
  precoSemCupom: number;
  reducaoPreco: number;
};

type CalcAccess = "loading" | "seller" | "calc_only" | "denied";

export default function SellerCalculadoraPage() {
  const router = useRouter();
  const [calcAccess, setCalcAccess] = useState<CalcAccess>("loading");
  const [calcValidoAte, setCalcValidoAte] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [preset, setPreset] = useState("");
  const [custoProduto, setCustoProduto] = useState("");
  const [embFul, setEmbFul] = useState("");
  const [opMeli, setOpMeli] = useState("");
  const [opTiktok, setOpTiktok] = useState("");
  const [opShopee, setOpShopee] = useState("");
  const [opShein, setOpShein] = useState("");
  const [margem, setMargem] = useState("15");
  const [comissao, setComissao] = useState("");
  const [imposto, setImposto] = useState("");
  const [ads, setAds] = useState("");
  const [perda, setPerda] = useState("");
  const [perdaTipo, setPerdaTipo] = useState<"brl" | "pct">("pct");
  const [extras, setExtras] = useState<Extra[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorSellerListaRow[]>([]);
  const [fornecedorConectadoId, setFornecedorConectadoId] = useState<string | null>(null);
  /** null = catálogo ainda não carregado ou erro; true = sem armazém em Produtos (não mostrar selector de fornecedor). */
  const [semArmazemCatalogo, setSemArmazemCatalogo] = useState<boolean | null>(null);
  const [selectedFornecedorId, setSelectedFornecedorId] = useState("");
  const [produtos, setProdutos] = useState<{ id: string; sku: string; nome_produto: string; custo: number; custo_base: number; custo_dropcore: number }[]>([]);
  const [selectedProdutoId, setSelectedProdutoId] = useState("");
  const [produtosLoading, setProdutosLoading] = useState(false);
  const [rebateML, setRebateML] = useState("");
  /** Cupom (%) — modo único ou por família em “todos” */
  const [cupomUnico, setCupomUnico] = useState("");
  const [cupomMl, setCupomMl] = useState("");
  const [cupomShopee, setCupomShopee] = useState("");
  const [cupomTiktok, setCupomTiktok] = useState("");
  const [cupomShein, setCupomShein] = useState("");
  /** Painel de ajuda (?): rebate | ads | cupom (todos) | cupomUnico */
  const [helpOpen, setHelpOpen] = useState<null | "rebate" | "ads" | "cupom" | "cupomUnico">(null);

  const [resultado, setResultado] = useState<{
    modo: "single" | "dual_shein" | "dual_meli" | "todos";
    precoVenda: number;
    valorLucro: number;
    custosFixos: number;
    valorComissao: number;
    valorImposto: number;
    valorAds: number;
    valorPerda: number;
    valorExtrasPct: number;
    percTotal: number;
    variantes?: ResultadoVariante[];
    porMarketplace: {
      nome: string;
      precoVenda: number | null;
      valorLucro: number | null;
      recebe?: number | null;
      semOperacional?: boolean;
    }[];
    operacionalMeliBruto?: number;
    rebate?: number;
    recebe?: number;
    efeitoCupom?: EfeitoCupom | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/calculadora/login");
        return;
      }
      const res = await fetch("/api/calculadora/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.status === 503) {
        setAccessError(
          typeof j?.error === "string"
            ? j.error
            : "Base de assinatura da calculadora não configurada. Rode create-calculadora-assinantes.sql no Supabase.",
        );
        setCalcAccess("denied");
        return;
      }
      if (!res.ok) {
        await supabaseBrowser.auth.signOut();
        router.replace("/calculadora/login");
        return;
      }
      if (j.access === "seller") {
        setCalcAccess("seller");
        setCalcValidoAte(null);
      } else if (j.access === "calc_only") {
        setCalcAccess("calc_only");
        setCalcValidoAte(typeof j.valido_ate === "string" ? j.valido_ate : null);
      } else {
        setCalcAccess("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  /** Migra preset antigo “só Clássico” / “só Premium” → comparativo Clássico + Premium */
  useEffect(() => {
    if (preset === "meli_classico" || preset === "meli_premium") {
      setPreset("meli");
      setComissao("");
    }
  }, [preset]);

  useEffect(() => {
    setHelpOpen(null);
  }, [preset]);

  // Buscar fornecedores + meta do catálogo (mesma origem que /seller/produtos) — só para seller completo
  useEffect(() => {
    if (calcAccess !== "seller") return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token || cancelled) return;
      const authH = { Authorization: `Bearer ${session.access_token}` };
      const [resForn, resCat] = await Promise.all([
        fetch("/api/seller/fornecedores", { headers: authH }),
        fetch("/api/seller/catalogo", { headers: authH, cache: "no-store" }),
      ]);
      const jsonForn = await resForn.json().catch(() => ({}));
      const jsonCat = await resCat.json().catch(() => ({}));
      if (cancelled) return;
      if (!resForn.ok) return;
      setFornecedores(normalizarFornecedoresSellerApi(jsonForn.fornecedores));
      const fidCat = jsonCat?.fornecedor_id as string | null | undefined;
      const fidCatNorm = typeof fidCat === "string" && fidCat.trim() ? fidCat.trim() : null;
      const fidForn = jsonForn.fornecedor_conectado_id as string | null | undefined;
      const fidFornNorm = typeof fidForn === "string" && fidForn.trim() ? fidForn.trim() : null;
      const semArm =
        resCat.ok &&
        (typeof jsonCat?.sem_armazem_ligado === "boolean"
          ? Boolean(jsonCat.sem_armazem_ligado)
          : !fidCatNorm);
      setSemArmazemCatalogo(resCat.ok ? semArm : null);
      /** Mesmo critério que a página Produtos (GET catálogo); fallback ao GET fornecedores se o catálogo falhar. */
      setFornecedorConectadoId(resCat.ok ? fidCatNorm : fidFornNorm);
      /** Não pré-seleccionar pelo vínculo: o seller escolhe o armazém; «ligado ao perfil» = armazém gravado em Produtos. */
      setSelectedFornecedorId("");
      /** Sem armazém gravado, não manter fornecedor/produto da sessão (ex.: cache ou estado antigo). */
      if (resCat.ok && semArm) {
        setSelectedProdutoId("");
        setProdutos([]);
        setCustoProduto("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [calcAccess]);

  /** Garante que o DOM do `<select>` não fica com valor antigo quando o catálogo exige armazém. */
  useLayoutEffect(() => {
    if (calcAccess !== "seller" || semArmazemCatalogo !== true) return;
    setSelectedFornecedorId("");
    setSelectedProdutoId("");
    setProdutos([]);
  }, [calcAccess, semArmazemCatalogo]);

  function paiKeySkuCal(sku: string): string {
    const s = String(sku ?? "").trim();
    if (s.length >= 3) return s.slice(0, -3) + "000";
    return s;
  }

  const opcoesProdutoCalculadora = useMemo(() => {
    type Opc = { id: string; label: string; custo: number };
    const list = produtos;
    if (list.length === 0) return [] as Opc[];
    const eps = 0.015;

    const byPai = new Map<string, typeof list>();
    for (const p of list) {
      const k = paiKeySkuCal(p.sku);
      if (!byPai.has(k)) byPai.set(k, []);
      byPai.get(k)!.push(p);
    }

    const unicos: Opc[] = [];
    const variaveis: Opc[] = [];

    for (const rows of byPai.values()) {
      const minC = Math.min(...rows.map((r) => r.custo));
      const maxC = Math.max(...rows.map((r) => r.custo));
      const uniform = maxC - minC < eps;
      const rep =
        rows.find((r) => String(r.sku).endsWith("000")) ??
        [...rows].sort((a, b) => String(a.sku).localeCompare(String(b.sku)))[0]!;
      const nome = String(rep.nome_produto ?? "").trim() || mascararSkuListagem(rep.sku);
      if (uniform) {
        unicos.push({ id: rep.id, custo: rep.custo, label: `${nome} — ${BRL.format(rep.custo)}` });
      } else {
        for (const p of [...rows].sort((a, b) => String(a.sku).localeCompare(String(b.sku)))) {
          variaveis.push({
            id: p.id,
            custo: p.custo,
            label: `${String(p.nome_produto ?? "").trim() || mascararSkuListagem(p.sku)} — ${BRL.format(p.custo)} · ${p.sku}`,
          });
        }
      }
    }

    unicos.sort((a, b) => a.label.localeCompare(b.label, "pt"));
    variaveis.sort((a, b) => a.label.localeCompare(b.label, "pt"));
    return [...unicos, ...variaveis];
  }, [produtos]);

  useEffect(() => {
    if (!selectedProdutoId || opcoesProdutoCalculadora.length === 0) return;
    const ok = opcoesProdutoCalculadora.some((o) => o.id === selectedProdutoId);
    if (!ok) {
      setSelectedProdutoId("");
      setCustoProduto("");
    }
  }, [opcoesProdutoCalculadora, selectedProdutoId]);

  // Buscar produtos quando fornecedor selecionado (seller completo)
  useEffect(() => {
    if (calcAccess !== "seller") return;
    if (!selectedFornecedorId) {
      setProdutos([]);
      setSelectedProdutoId("");
      return;
    }
    let cancelled = false;
    setProdutosLoading(true);
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token || cancelled) return;
      const res = await fetch(`/api/seller/produtos?fornecedorId=${encodeURIComponent(selectedFornecedorId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (cancelled) return;
      setProdutos(json.produtos ?? []);
      setSelectedProdutoId("");
      setProdutosLoading(false);
    })();
    return () => { cancelled = true; };
  }, [calcAccess, selectedFornecedorId]);

  function handleProdutoSelect(produtoId: string) {
    setSelectedProdutoId(produtoId);
    const p = produtos.find((x) => x.id === produtoId);
    if (p) setCustoProduto(p.custo.toFixed(2).replace(".", ","));
  }

  function addExtra() {
    setExtras((e) => [...e, { id: crypto.randomUUID(), nome: "", valorStr: "", tipo: "brl" }]);
  }

  function removeExtra(id: string) {
    setExtras((e) => e.filter((x) => x.id !== id));
  }

  function updateExtra(id: string, field: keyof Extra, val: string | number) {
    setExtras((e) =>
      e.map((x) => (x.id === id ? { ...x, [field]: val } : x))
    );
  }

  function handlePresetChange(val: string) {
    setPreset(val);
    if (val === "tiktok") setComissao(String(COMISSOES.tiktok));
    else if (val === "shopee") setComissao(String(COMISSOES.shopee));
    else setComissao("");
  }

  const parseNum = useCallback((s: string | undefined): number => {
    if (s == null || typeof s !== "string") return 0;
    // Remove espaços, %, e caracteres invisíveis que quebram o parsing (ex: zero-width)
    const cleaned = String(s)
      .replace(/[\s\u200B\u200C\u200D\uFEFF]/g, "")
      .replace(/%/g, "")
      .replace(",", ".")
      .trim();
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }, []);

  /** Permite apenas dígitos, uma vírgula ou ponto decimal, e sinal negativo */
  const sanitizeNumInput = useCallback((val: string): string => {
    let s = val.replace(/[^\d,.\-]/g, "").replace(/\s/g, "");
    const parts = s.split(/[.,]/);
    if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
    return s;
  }, []);

  const isMeliFamilia = preset === "meli";
  const isPresetShein = preset === "shein";
  const isModoTodos = preset === "todos";

  function operacionalDoPreset(): string {
    if (isMeliFamilia) return opMeli;
    if (preset === "tiktok") return opTiktok;
    if (preset === "shopee") return opShopee;
    if (preset === "shein") return opShein;
    return "";
  }

  /** Mostrar campo operacional só para o canal ativo (ou todos em modo comparativo) */
  function showOpMeli() {
    return isModoTodos || isMeliFamilia;
  }
  function showOpTiktok() {
    return isModoTodos || preset === "tiktok";
  }
  function showOpShopee() {
    return isModoTodos || preset === "shopee";
  }
  function showOpShein() {
    return isModoTodos || preset === "shein";
  }

  const calcular = useCallback(() => {
    const custo = parseNum(custoProduto);
    const emb = parseNum(embFul);
    const marg = parseNum(margem);
    const com = parseNum(comissao);
    const imp = parseNum(imposto);
    const adsVal = parseNum(ads);
    const perdaVal = parseNum(perda);
    const rebateVal =
      preset === "meli" || preset === "todos" ? parseNum(rebateML) : 0;
    const cupomU = parseNum(cupomUnico);

    const opMeliNum = parseNum(opMeli);
    const opTikNum = parseNum(opTiktok);
    const opShopNum = parseNum(opShopee);
    const opSheinNum = parseNum(opShein);

    const perdaBrl = perdaTipo === "brl" ? perdaVal : 0;
    const perdaPct = perdaTipo === "pct" ? perdaVal : 0;

    const extrasTotais = (isSheinChannel: boolean) => {
      let extraBrl = 0;
      let extraPct = 0;
      const list = isSheinChannel ? extras.filter((x) => !x.nome.toLowerCase().includes("ads")) : extras;
      list.forEach((x) => {
        const v = parseNum(x.valorStr);
        if (x.tipo === "brl") extraBrl += v;
        else extraPct += v;
      });
      return { extraBrl, extraPct };
    };

    /** Uma linha de preço; cupom reduz o peso dos % variáveis (preço cai), não é custo em R$ */
    const computeLinha = (
      comissao: number,
      freteEfetivo: number,
      isSheinChannel: boolean,
      cupomPct: number,
    ) => {
      const { extraBrl, extraPct } = extrasTotais(isSheinChannel);
      const adsPct = isSheinChannel ? 0 : adsVal;
      const brutoPct = marg + imp + adsPct + perdaPct + extraPct;
      const descontoPct = Math.max(0, cupomPct);
      const percBase = Math.max(0.01, brutoPct - descontoPct);
      const percTotalLinha = percBase + comissao;
      if (percTotalLinha >= 100) return null;
      const baseFixos = custo + emb + freteEfetivo + extraBrl + perdaBrl;
      const precoVenda = baseFixos / (1 - percTotalLinha / 100);
      const valorLucro = precoVenda * (marg / 100);
      const valorComissao = precoVenda * (comissao / 100);
      const valorImposto = precoVenda * (imp / 100);
      const valorAds = precoVenda * (adsPct / 100);
      const valorPerda = perdaTipo === "pct" ? precoVenda * (perdaPct / 100) : perdaBrl;
      const valorExtrasPct = precoVenda * (extraPct / 100);

      let precoSemCupom = precoVenda;
      let reducaoPreco = 0;
      if (descontoPct > 0) {
        const refLinha = computeLinha(comissao, freteEfetivo, isSheinChannel, 0);
        if (refLinha) {
          precoSemCupom = refLinha.precoVenda;
          reducaoPreco = Math.max(0, precoSemCupom - precoVenda);
        }
      }

      const efeitoCupom: EfeitoCupom = {
        cupomPct,
        descontoPct,
        precoSemCupom,
        reducaoPreco,
      };

      return {
        precoVenda,
        valorLucro,
        custosFixos: baseFixos,
        valorComissao,
        valorImposto,
        valorAds,
        valorPerda,
        valorExtrasPct,
        percTotal: percTotalLinha,
        efeitoCupom,
      };
    };

    if (!preset) {
      setResultado(null);
      return;
    }

    if (preset !== "todos") {
      const opPresetStr = operacionalDoPreset();
      if (!operacionalPreenchido(opPresetStr)) {
        setResultado(null);
        return;
      }
    }

    // ——— Modo TODOS: comparativo 6 linhas + cupom por família ———
    if (preset === "todos") {
      const cMl = parseNum(cupomMl);
      const cSp = parseNum(cupomShopee);
      const cTk = parseNum(cupomTiktok);
      const cSh = parseNum(cupomShein);

      const linhasTodos: {
        nome: string;
        comissao: number;
        opStr: string;
        rebate: boolean;
        cupom: number;
        shein: boolean;
      }[] = [
        { nome: "ML Clássico", comissao: COMISSOES.meli_classico, opStr: opMeli, rebate: true, cupom: cMl, shein: false },
        { nome: "ML Premium", comissao: COMISSOES.meli_premium, opStr: opMeli, rebate: true, cupom: cMl, shein: false },
        { nome: "TikTok Shop", comissao: COMISSOES.tiktok, opStr: opTiktok, rebate: false, cupom: cTk, shein: false },
        { nome: "Shopee", comissao: COMISSOES.shopee, opStr: opShopee, rebate: false, cupom: cSp, shein: false },
        { nome: "Shein masc.", comissao: COMISSOES.shein_masc, opStr: opShein, rebate: false, cupom: cSh, shein: true },
        { nome: "Shein fem.", comissao: COMISSOES.shein_fem, opStr: opShein, rebate: false, cupom: cSh, shein: true },
      ];

      const porMarketplace = linhasTodos.map((row) => {
        if (!operacionalPreenchido(row.opStr)) {
          return { nome: row.nome, precoVenda: null, valorLucro: null, recebe: null, semOperacional: true };
        }
        const opBruto = parseNum(row.opStr);
        const freteEf = row.rebate ? Math.max(0, opBruto - rebateVal) : opBruto;
        const out = computeLinha(row.comissao, freteEf, row.shein, row.cupom);
        if (!out) {
          return { nome: row.nome, precoVenda: 0, valorLucro: 0, recebe: 0, semOperacional: false };
        }
        let recebeLinha: number;
        if (row.nome.startsWith("ML")) {
          recebeLinha = out.precoVenda - out.valorComissao - opBruto + rebateVal;
        } else {
          recebeLinha = out.precoVenda - out.valorComissao - freteEf;
        }
        return {
          nome: row.nome,
          precoVenda: out.precoVenda,
          valorLucro: out.valorLucro,
          recebe: recebeLinha,
          semOperacional: false,
        };
      });

      const idxResumo = porMarketplace.findIndex(
        (x) => x.precoVenda != null && (x.precoVenda ?? 0) > 0 && !x.semOperacional,
      );
      let resumo: {
        precoVenda: number;
        valorLucro: number;
        custosFixos: number;
        valorComissao: number;
        valorImposto: number;
        valorAds: number;
        valorPerda: number;
        valorExtrasPct: number;
        percTotal: number;
        efeitoCupom: EfeitoCupom;
      } | null = null;
      if (idxResumo >= 0) {
        const row = linhasTodos[idxResumo];
        const opBruto = parseNum(row.opStr);
        const freteEf = row.rebate ? Math.max(0, opBruto - rebateVal) : opBruto;
        resumo = computeLinha(row.comissao, freteEf, row.shein, row.cupom);
      }

      if (!resumo) {
        setResultado({
          modo: "todos",
          precoVenda: 0,
          valorLucro: 0,
          custosFixos: 0,
          valorComissao: 0,
          valorImposto: 0,
          valorAds: 0,
          valorPerda: 0,
          valorExtrasPct: 0,
          percTotal: 0,
          porMarketplace,
          efeitoCupom: null,
        });
        return;
      }

      setResultado({
        modo: "todos",
        precoVenda: resumo.precoVenda,
        valorLucro: resumo.valorLucro,
        custosFixos: resumo.custosFixos,
        valorComissao: resumo.valorComissao,
        valorImposto: resumo.valorImposto,
        valorAds: resumo.valorAds,
        valorPerda: resumo.valorPerda,
        valorExtrasPct: resumo.valorExtrasPct,
        percTotal: resumo.percTotal,
        porMarketplace,
        efeitoCupom: resumo.efeitoCupom,
      });
      return;
    }

    // ——— SHEIN dual ———
    if (preset === "shein") {
      const freteEf = opSheinNum;
      const vMasc = computeLinha(COMISSOES.shein_masc, freteEf, true, cupomU);
      const vFem = computeLinha(COMISSOES.shein_fem, freteEf, true, cupomU);
      if (!vMasc || !vFem) {
        setResultado(null);
        return;
      }
      const { efeitoCupom: _eM, ...coreMasc } = vMasc;
      const { efeitoCupom: _eF, ...coreFem } = vFem;
      const variantes: ResultadoVariante[] = [
        {
          key: "shein_masc",
          label: "Shein masculino (18%)",
          comissao: COMISSOES.shein_masc,
          ...coreMasc,
          recebe: vMasc.precoVenda - vMasc.valorComissao - freteEf,
        },
        {
          key: "shein_fem",
          label: "Shein feminino (20%)",
          comissao: COMISSOES.shein_fem,
          ...coreFem,
          recebe: vFem.precoVenda - vFem.valorComissao - freteEf,
        },
      ];
      setResultado({
        modo: "dual_shein",
        precoVenda: vMasc.precoVenda,
        valorLucro: vMasc.valorLucro,
        custosFixos: vMasc.custosFixos,
        valorComissao: vMasc.valorComissao,
        valorImposto: vMasc.valorImposto,
        valorAds: vMasc.valorAds,
        valorPerda: vMasc.valorPerda,
        valorExtrasPct: vMasc.valorExtrasPct,
        percTotal: vMasc.percTotal,
        variantes,
        porMarketplace: [],
        efeitoCupom: vMasc.efeitoCupom,
      });
      return;
    }

    // ——— ML dual ———
    if (preset === "meli") {
      const freteEf = Math.max(0, opMeliNum - rebateVal);
      const vCl = computeLinha(COMISSOES.meli_classico, freteEf, false, cupomU);
      const vPr = computeLinha(COMISSOES.meli_premium, freteEf, false, cupomU);
      if (!vCl || !vPr) {
        setResultado(null);
        return;
      }
      const { efeitoCupom: _eCl, ...coreCl } = vCl;
      const { efeitoCupom: _ePr, ...corePr } = vPr;
      const variantes: ResultadoVariante[] = [
        {
          key: "meli_classico",
          label: "Mercado Livre Clássico (14%)",
          comissao: COMISSOES.meli_classico,
          ...coreCl,
          recebe: vCl.precoVenda - vCl.valorComissao - opMeliNum + rebateVal,
          operacionalBruto: opMeliNum,
          rebateAplicado: rebateVal > 0 ? rebateVal : undefined,
          lucroMaisRebate:
            rebateVal > 0 ? vCl.valorLucro + rebateVal : vCl.valorLucro,
        },
        {
          key: "meli_premium",
          label: "Mercado Livre Premium (19%)",
          comissao: COMISSOES.meli_premium,
          ...corePr,
          recebe: vPr.precoVenda - vPr.valorComissao - opMeliNum + rebateVal,
          operacionalBruto: opMeliNum,
          rebateAplicado: rebateVal > 0 ? rebateVal : undefined,
          lucroMaisRebate:
            rebateVal > 0 ? vPr.valorLucro + rebateVal : vPr.valorLucro,
        },
      ];
      setResultado({
        modo: "dual_meli",
        precoVenda: vCl.precoVenda,
        valorLucro: vCl.valorLucro,
        custosFixos: vCl.custosFixos,
        valorComissao: vCl.valorComissao,
        valorImposto: vCl.valorImposto,
        valorAds: vCl.valorAds,
        valorPerda: vCl.valorPerda,
        valorExtrasPct: vCl.valorExtrasPct,
        percTotal: vCl.percTotal,
        variantes,
        operacionalMeliBruto: opMeliNum,
        rebate: rebateVal > 0 ? rebateVal : undefined,
        recebe: vCl.precoVenda - vCl.valorComissao - opMeliNum + rebateVal,
        porMarketplace: [],
        efeitoCupom: vCl.efeitoCupom,
      });
      return;
    }

    // ——— TikTok / Shopee single ———
    let freteEfetivo = 0;
    if (preset === "tiktok") freteEfetivo = opTikNum;
    else if (preset === "shopee") freteEfetivo = opShopNum;
    const out = computeLinha(com, freteEfetivo, false, cupomU);
    if (!out) {
      setResultado(null);
      return;
    }
    const {
      precoVenda,
      valorLucro,
      custosFixos: baseFixos,
      valorComissao,
      valorImposto,
      valorAds,
      valorPerda,
      valorExtrasPct,
      percTotal,
      efeitoCupom,
    } = out;

    const recebeSingle =
      preset === "tiktok"
        ? precoVenda - valorComissao - opTikNum
        : preset === "shopee"
          ? precoVenda - valorComissao - opShopNum
          : precoVenda - valorComissao;

    setResultado({
      modo: "single",
      precoVenda,
      valorLucro,
      custosFixos: baseFixos,
      valorComissao,
      valorImposto,
      valorAds,
      valorPerda,
      valorExtrasPct,
      percTotal,
      recebe: recebeSingle,
      porMarketplace: [],
      efeitoCupom,
    });
  }, [
    custoProduto, embFul, margem, comissao, imposto, ads, perda, perdaTipo, preset, extras,
    opMeli, opTiktok, opShopee, opShein, rebateML, parseNum,
    cupomUnico, cupomMl, cupomShopee, cupomTiktok, cupomShein,
  ]);

  // Recalcula quando qualquer dependência de `calcular` mudar (incl. cupom, margem, operacional…)
  useEffect(() => {
    calcular();
  }, [calcular]);

  function limpar() {
    setPreset("");
    setCustoProduto("");
    setSelectedProdutoId("");
    setEmbFul("");
    setOpMeli("");
    setOpTiktok("");
    setOpShopee("");
    setOpShein("");
    setRebateML("");
    setCupomUnico("");
    setCupomMl("");
    setCupomShopee("");
    setCupomTiktok("");
    setCupomShein("");
    setMargem("15");
    setComissao("");
    setImposto("");
    setAds("");
    setPerda("");
    setPerdaTipo("pct");
    setExtras([]);
    setResultado(null);
  }

  // Preço mínimo (5% margem); dual Shein/ML usa a comissão mais alta do par + cupom
  const precoMinimo = (() => {
    if (preset === "todos") return null;
    const custo = parseNum(custoProduto);
    const emb = parseNum(embFul);
    let com = parseNum(comissao);
    if (preset === "shein") com = COMISSOES.shein_fem;
    else if (preset === "meli") com = COMISSOES.meli_premium;
    const imp = parseNum(imposto);
    const adsPreco = preset === "shein" ? 0 : parseNum(ads);
    const descontoPct = Math.max(0, parseNum(cupomUnico));
    let extraBrl = 0;
    let extraPct = 0;
    const exList = preset === "shein" ? extras.filter((x) => !x.nome.toLowerCase().includes("ads")) : extras;
    exList.forEach((x) => {
      const v = parseNum(x.valorStr);
      if (x.tipo === "brl") extraBrl += v;
      else extraPct += v;
    });
    const perdaVMin = parseNum(perda);
    const perdaBrlMin = perdaTipo === "brl" ? perdaVMin : 0;
    const perdaPctMin = perdaTipo === "pct" ? perdaVMin : 0;
    const brutoPct = MARGEM_MINIMA + imp + adsPreco + perdaPctMin + extraPct;
    const percBase = Math.max(0.01, brutoPct - descontoPct);
    const percSemMargem = percBase + com;
    if (percSemMargem >= 100) return null;
    const rebateVal = preset === "meli" ? parseNum(rebateML) : 0;
    let freteMin = 0;
    if (preset === "meli") {
      if (!operacionalPreenchido(opMeli)) return null;
      freteMin = Math.max(0, parseNum(opMeli) - rebateVal);
    } else if (preset === "tiktok") {
      if (!operacionalPreenchido(opTiktok)) return null;
      freteMin = parseNum(opTiktok);
    } else if (preset === "shopee") {
      if (!operacionalPreenchido(opShopee)) return null;
      freteMin = parseNum(opShopee);
    } else if (preset === "shein") {
      if (!operacionalPreenchido(opShein)) return null;
      freteMin = parseNum(opShein);
    } else return null;
    const custosFixos = custo + emb + freteMin + extraBrl + perdaBrlMin;
    return custosFixos / (1 - percSemMargem / 100);
  })();

  const margemAtual =
    resultado && resultado.precoVenda > 0 ? (resultado.valorLucro / resultado.precoVenda) * 100 : null;
  const abaixoMinimo = margemAtual !== null && margemAtual < MARGEM_MINIMA;

  function badgeSeuCanal(mpNome: string): boolean {
    if (!preset) return false;
    if (preset === "tiktok") return mpNome === "TikTok Shop";
    if (preset === "shopee") return mpNome === "Shopee";
    if (preset === "shein") return mpNome === "Shein";
    if (preset === "meli") return mpNome === "Mercado Livre" || mpNome.startsWith("ML");
    return PRESET_TO_MARKETPLACE_NOME[preset] === mpNome;
  }

  if (calcAccess === "loading") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center pt-14">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Carregando calculadora…</p>
      </div>
    );
  }

  if (calcAccess === "denied") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6 pt-14">
        <div className="max-w-md text-center space-y-3">
          <p className="text-red-600 dark:text-red-400 text-sm font-medium">
            {accessError ?? "Seu acesso à calculadora expirou."}
          </p>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Se o teste grátis terminou ou a assinatura venceu, fale com o suporte para renovar o acesso.
          </p>
          <a href="/calculadora/login" className="text-sm text-emerald-600 dark:text-emerald-400 underline">
            Voltar ao login
          </a>
        </div>
      </div>
    );
  }

  const calcOnly = calcAccess === "calc_only";

  return (
    <div
      className={
        calcOnly
          ? "min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-8"
          : "min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8"
      }
    >
      <div className="w-full max-w-6xl mx-auto dropcore-px-calc py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-5 md:space-y-6">
        <SellerPageHeader
          title="Calculadora de preço"
          subtitle="Preencha custos e operacionais por marketplace para gerar preço e margem."
        />
        {calcOnly && calcValidoAte && (
          <div
            className="rounded-xl border border-neutral-200 dark:border-neutral-700/80 border-l-[3px] border-l-emerald-500 dark:border-l-emerald-400 bg-white dark:bg-neutral-900/60 px-3 py-2.5 sm:px-4 sm:py-3 text-[13px] sm:text-sm leading-snug flex gap-2.5 items-start text-emerald-800 dark:text-emerald-300 shadow-sm dark:shadow-none"
            role="status"
          >
            <span className="text-lg leading-none shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" aria-hidden>
              ✓
            </span>
            <span>
              <strong className="font-semibold text-emerald-900 dark:text-emerald-200">Teste da calculadora:</strong>{" "}
              <span className="text-emerald-700 dark:text-emerald-400/95">
                válido até{" "}
                {new Date(calcValidoAte).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
              .
            </span>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-8 w-full">
        <div className="w-full lg:flex-1 lg:min-w-0 space-y-4">
        {!calcOnly && (
          <div className="block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                <span className="text-amber-700 dark:text-amber-300">Regra:</span> margem mínima de {MARGEM_MINIMA}%
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                O preço mínimo deve garantir pelo menos {MARGEM_MINIMA}% de margem de lucro.
              </p>
            </div>
            <span className="shrink-0 text-3xl leading-none text-amber-500 dark:text-amber-400">
              ⚠️
            </span>
          </div>
        )}
        <div className={`${cardClass} px-4 py-3.5`}>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Operacional por marketplace</p>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
            Informe o <strong>operacional (R$)</strong> de cada marketplace — não usamos valores automáticos. Na tabela de preços só aparece o canal em que você preencheu o operacional.
          </p>
        </div>

        {!calcOnly && semArmazemCatalogo === true && (
          <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-700/70 bg-white dark:bg-neutral-900/70 shadow-sm overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-600 sm:hidden" aria-hidden />
            <div className="flex flex-col sm:flex-row sm:items-stretch">
              <div
                className="hidden sm:block w-1 shrink-0 self-stretch min-h-[4.5rem] bg-gradient-to-b from-emerald-500 to-teal-600"
                aria-hidden
              />
              <div className="flex flex-1 flex-col sm:flex-row sm:items-center gap-4 px-4 py-4 sm:px-5 sm:py-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200/80 dark:ring-emerald-800/50">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
                    <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" />
                    <path d="M12 5V3" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 leading-snug">
                    Armazém ainda não ligado
                  </p>
                  <p className="text-xs sm:text-[13px] text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-xl">
                    Sem vínculo em <strong className="text-neutral-800 dark:text-neutral-200">Produtos</strong>, o catálogo da API não aparece aqui — evita misturar com vitrines de outros armazéns. Usa <strong className="text-neutral-800 dark:text-neutral-200">custo manual</strong> abaixo ou liga o armazém primeiro.
                  </p>
                </div>
                <Link
                  href="/seller/produtos"
                  className="shrink-0 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-colors text-center sm:text-left"
                >
                  Ligar em Produtos
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm overflow-visible">

          {!calcOnly && semArmazemCatalogo !== true && fornecedores.length > 0 && (
            <>
              <Row label="Fornecedor">
                <div className="space-y-2 w-full min-w-0">
                  <select
                    key={fornecedorConectadoId ?? "sem-vinculo"}
                    value={selectedFornecedorId}
                    onChange={(e) => setSelectedFornecedorId(e.target.value)}
                    className={inputLight}
                    autoComplete="off"
                  >
                    <option value="">Selecionar fornecedor</option>
                    {fornecedores.map((f) => {
                      const ativo = String(f.status ?? "").toLowerCase() === "ativo";
                      const loc = f.local_resumido ? String(f.local_resumido) : "";
                      const label = `${f.nome_publico}${loc ? ` · ${loc}` : ""}`;
                      return (
                        <option key={f.id} value={f.id} disabled={!ativo}>
                          {label}
                          {fornecedorConectadoId === f.id ? " (ligado ao perfil)" : ""}
                          {!ativo ? " — inativo" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </Row>
              {selectedFornecedorId && (
                <Row label="Produto">
                  <select
                    value={selectedProdutoId}
                    onChange={(e) => handleProdutoSelect(e.target.value)}
                    className={`${inputLight} min-w-[200px] w-full`}
                    disabled={produtosLoading}
                    title="Fornecedor + DropCore"
                  >
                    <option value="">Selecionar (fornecedor + DropCore)</option>
                    {opcoesProdutoCalculadora.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                    {!produtosLoading && produtos.length === 0 && selectedFornecedorId && (
                      <option value="">Nenhum produto ativo</option>
                    )}
                  </select>
                </Row>
              )}
            </>
          )}

          <Row label="Marketplace (predefinido)">
            <select
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className={`${inputLight} w-full min-w-0 sm:min-w-[260px]`}
            >
              <option value="">Marketplace (selecionar)</option>
              <option value="tiktok">TikTok Shop (6%)</option>
              <option value="shopee">Shopee (~18%)</option>
              <option value="shein">SHEIN — masc. 18% + fem. 20% (juntos)</option>
              <option value="meli">Mercado Livre — Clássico 14% + Premium 19% (juntos)</option>
              <option value="todos">Todos os marketplaces (comparar)</option>
            </select>
          </Row>

          <Row label="Custo do produto" unit="R$">
            <input type="text" inputMode="decimal" value={custoProduto}
              onChange={(e) => setCustoProduto(sanitizeNumInput(e.target.value))} placeholder="0,00" className={inputLight} />
          </Row>

          <Row label="Embalagem / Fulfillment" unit="R$">
            <input type="text" inputMode="decimal" value={embFul}
              onChange={(e) => setEmbFul(sanitizeNumInput(e.target.value))} placeholder="0,00" className={inputLight} />
          </Row>

          <div className="px-4 py-2.5 border-b border-neutral-200/70 dark:border-neutral-700/60 bg-neutral-50 dark:bg-neutral-900/50">
            <p className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-widest">
              Operacional por marketplace (R$)
              {preset && preset !== "todos" && (
                <span className="block font-normal normal-case text-[10px] mt-1 text-neutral-500">
                  Mostrando só o canal selecionado. Em &quot;Todos os marketplaces&quot;, preencha cada um que quiser comparar.
                </span>
              )}
            </p>
          </div>
          {showOpMeli() && (
            <Row label="Mercado Livre" unit="R$">
              <input type="text" inputMode="decimal" value={opMeli}
                onChange={(e) => setOpMeli(sanitizeNumInput(e.target.value))} placeholder="Ex.: frete + extras ML" className={inputLight} />
            </Row>
          )}
          {showOpTiktok() && (
            <Row label="TikTok Shop" unit="R$">
              <input type="text" inputMode="decimal" value={opTiktok}
                onChange={(e) => setOpTiktok(sanitizeNumInput(e.target.value))} placeholder="Ex.: frete + extras TikTok" className={inputLight} />
            </Row>
          )}
          {showOpShopee() && (
            <Row label="Shopee" unit="R$">
              <input type="text" inputMode="decimal" value={opShopee}
                onChange={(e) => setOpShopee(sanitizeNumInput(e.target.value))} placeholder="Ex.: frete + extras Shopee" className={inputLight} />
            </Row>
          )}
          {showOpShein() && (
            <Row label="Shein" unit="R$">
              <input type="text" inputMode="decimal" value={opShein}
                onChange={(e) => setOpShein(sanitizeNumInput(e.target.value))} placeholder="Ex.: frete + extras Shein" className={inputLight} />
            </Row>
          )}
          {(preset === "meli" || preset === "todos") && (
            <div className="px-4 py-2.5 border-b border-neutral-200/70 dark:border-[var(--card-border)]/70">
              <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(140px,34%)_1fr_52px] sm:items-center sm:gap-x-3">
                <div className="flex items-center gap-1.5 min-w-0 sm:pt-0">
                  <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 truncate">
                    Rebate (ML)
                  </span>
                  <HelpBubble
                    open={helpOpen === "rebate"}
                    onOpen={() => setHelpOpen("rebate")}
                    onClose={() => setHelpOpen(null)}
                    ariaLabel="O que é rebate no Mercado Livre"
                    side="above"
                  >
                    {preset === "todos" ? (
                      <>
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1.5">Rebate (só Mercado Livre)</p>
                        <p>
                          É dinheiro devolvido pelo ML (estorno de parte da tarifa) e <strong>soma</strong> ao que você recebe na venda.
                        </p>
                        <p className="mt-2 pt-2 border-t border-neutral-200/80 dark:border-neutral-600/60">
                          No comparativo abaixo, este valor entra <strong>apenas</strong> nas linhas <strong>Mercado Livre (Clássico e Premium)</strong>. TikTok, Shopee e Shein <strong>não</strong> usam rebate.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1.5">Rebate</p>
                        <p>
                          Estorno de parte da tarifa do Mercado Livre por venda. Soma ao valor líquido que você recebe (não é desconto no preço de venda).
                        </p>
                      </>
                    )}
                  </HelpBubble>
                </div>
                <div className="flex flex-row items-center gap-2 min-w-0 sm:contents">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rebateML}
                    onChange={(e) => setRebateML(sanitizeNumInput(e.target.value))}
                    placeholder="0,00"
                    className={`${inputLight} w-full min-w-0 flex-1 sm:flex-none sm:w-full`}
                  />
                  <span className={`${unitBadge} shrink-0`}>R$</span>
                </div>
              </div>
              {isModoTodos && (
                <p className="text-[11px] leading-snug text-orange-600 dark:text-orange-400 font-medium mt-2">
                  Só entra nas linhas Mercado Livre do comparativo — TikTok, Shopee e Shein não usam.
                </p>
              )}
            </div>
          )}

          {isModoTodos && (
            <div className="px-4 py-3.5 border-b border-neutral-200/70 dark:border-neutral-700/60 bg-neutral-50/50 dark:bg-neutral-900/30">
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm p-4 space-y-3 overflow-visible">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 pr-1">Cupom por canal (%)</p>
                  <HelpBubble
                    open={helpOpen === "cupom"}
                    onOpen={() => setHelpOpen("cupom")}
                    onClose={() => setHelpOpen(null)}
                    ariaLabel="Como funciona o cupom por canal"
                    side="above"
                    align="end"
                  >
                    <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1.5">Cupom por canal</p>
                    <p>
                      Cada marketplace tem o seu %. O cupom <strong>reduz</strong> o peso de margem, imposto e outros percentuais <strong>só naquele canal</strong> — não é um custo em R$ à parte.
                    </p>
                    <p className="mt-2 pt-2 border-t border-neutral-200/80 dark:border-neutral-600/60">
                      O efeito em reais aparece na <strong>composição de custos</strong> quando houver linha de resumo calculada.
                    </p>
                  </HelpBubble>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      ["Mercado Livre", cupomMl, setCupomMl] as const,
                      ["Shopee", cupomShopee, setCupomShopee] as const,
                      ["TikTok Shop", cupomTiktok, setCupomTiktok] as const,
                      ["Shein (masc. + fem.)", cupomShein, setCupomShein] as const,
                    ] as const
                  ).map(([nome, val, setVal]) => (
                    <div
                      key={nome}
                      className="rounded-lg border border-neutral-200/80 dark:border-neutral-700/70 bg-neutral-50/80 dark:bg-neutral-800/40 px-3 py-2.5"
                    >
                      <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-2">{nome}</p>
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={val}
                          onChange={(e) => setVal(sanitizeNumInput(e.target.value))}
                          placeholder="0"
                          className={`${inputLight} flex-1 min-w-0`}
                        />
                        <span className={unitBadge}>%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isModoTodos && preset && (
            <Row
              label={
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="truncate">Cupom de desconto</span>
                  <HelpBubble
                    open={helpOpen === "cupomUnico"}
                    onOpen={() => setHelpOpen("cupomUnico")}
                    onClose={() => setHelpOpen(null)}
                    ariaLabel="Como funciona o cupom"
                    side="above"
                  >
                    <p className="font-semibold text-emerald-900 dark:text-emerald-100 mb-1.5">Cupom de desconto</p>
                    <p>
                      Reduz o peso dos percentuais na fórmula (margem, imposto, ADS/TACOS, etc.). <strong>Não</strong> é custo em R$ separado. Quanto maior o %, menor o preço sugerido; o efeito em R$ aparece na composição.
                    </p>
                  </HelpBubble>
                </span>
              }
              unit="%"
            >
              <input type="text" inputMode="decimal" value={cupomUnico} onChange={(e) => setCupomUnico(sanitizeNumInput(e.target.value))} placeholder="0" className={inputLight} />
            </Row>
          )}

          <Row label="Margem de lucro" unit="%">
            <input type="text" inputMode="decimal" value={margem}
              onChange={(e) => setMargem(sanitizeNumInput(e.target.value))} placeholder="15" className={inputLight} />
          </Row>

          <Row label="Comissão (Marketplace)" unit="%">
            {(preset === "shein" || preset === "todos" || preset === "meli") ? (
              <span className="text-sm text-neutral-600 dark:text-neutral-400 leading-snug">
                {preset === "shein" && "18% (masc.) e 20% (fem.) — dois cards"}
                {preset === "meli" && "14% (Cláss.) e 19% (Premium) — dois cards"}
                {preset === "todos" && "Definida por linha na tabela de comparativo"}
              </span>
            ) : (
              <input type="text" inputMode="decimal" value={comissao}
                onChange={(e) => setComissao(sanitizeNumInput(e.target.value))} placeholder="0" className={inputLight} />
            )}
          </Row>

          <Row label="Imposto" unit="%">
            <input type="text" inputMode="decimal" value={imposto}
              onChange={(e) => setImposto(sanitizeNumInput(e.target.value))} placeholder="0" className={inputLight} />
          </Row>

          {/* ADS/TACOS — oculto no modo Shein único (na Shein a conta do seller costuma não usar esse % como nos outros canais) */}
          {!isPresetShein && (
            <div className="px-4 py-2.5 border-b border-neutral-200/70 dark:border-[var(--card-border)]/70 last:border-b-0">
              <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(140px,34%)_1fr_52px] sm:items-center sm:gap-x-3">
                <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                  <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 truncate">ADS/TACOS</span>
                  <HelpBubble
                    open={helpOpen === "ads"}
                    onOpen={() => setHelpOpen("ads")}
                    onClose={() => setHelpOpen(null)}
                    ariaLabel="O que é ADS/TACOS e como calcular"
                    side="above"
                  >
                    <p className="font-semibold text-emerald-900 dark:text-emerald-100 mb-1.5">ADS/TACOS (%)</p>
                    <p className="mb-2">
                      <strong>ADS/TACOS</strong> é o percentual de <strong>custo de mídia em relação à receita</strong> que você quer considerar no preço (no varejo também aparece como “custo publicitário sobre vendas”).
                    </p>
                    <p className="mb-2">
                      <strong>Como a seller costuma chegar no %:</strong> pegue um período (ex.: últimos 7 ou 30 dias), some o <strong>gasto em anúncios</strong> do canal e divida pela <strong>receita de vendas</strong> (ou pelo faturamento que você atribui às campanhas), e multiplique por 100. Ex.: R$ 500 em anúncios ÷ R$ 5.000 em vendas = <strong>10%</strong>. Use a média que faz sentido para o seu mix de produtos.
                    </p>
                    <p>
                      Nesta calculadora, esse % entra na fórmula como variável sobre o <strong>preço de venda</strong> (junto com margem, imposto, perdas, etc.); em R$, o valor aparece na composição de custos abaixo.
                    </p>
                    {isModoTodos && (
                      <p className="mt-2 pt-2 border-t border-neutral-200/80 dark:border-neutral-600/60">
                        No comparativo, este % <strong>não vale</strong> para as linhas <strong>Shein</strong> (masc. e fem.). Vale para <strong>ML, TikTok e Shopee</strong>.
                      </p>
                    )}
                  </HelpBubble>
                </div>
                <div className="flex flex-row items-center gap-2 min-w-0 sm:contents">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={ads}
                    onChange={(e) => setAds(sanitizeNumInput(e.target.value))}
                    placeholder="0"
                    className={`${inputLight} w-full min-w-0 flex-1 sm:flex-none sm:w-full`}
                  />
                  <span className={`${unitBadge} shrink-0 sm:shrink-0`}>%</span>
                </div>
              </div>
              {isModoTodos && (
                <p className="text-[11px] leading-snug text-orange-600 dark:text-orange-400 font-medium mt-2">
                  No comparativo, as linhas Shein ignoram ADS/TACOS (vale ML, TikTok e Shopee).
                </p>
              )}
            </div>
          )}

          {/* Perdas — único campo em cinza escuro (destaque para ajustar) */}
          <div className="px-4 py-3 sm:py-2.5 border-b border-neutral-200/70 dark:border-[var(--card-border)]/70 bg-neutral-200/40 dark:bg-neutral-900/50">
            <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(140px,34%)_1fr_52px] sm:items-center sm:gap-x-3">
              <label className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 shrink-0 truncate">Perdas/Devoluções</label>
              <div className="flex gap-2 items-center min-w-0 sm:contents">
                <input type="text" inputMode="decimal" value={perda}
                  onChange={(e) => setPerda(sanitizeNumInput(e.target.value))} placeholder="0" className={`${inputPerdas} min-w-0 flex-1`} />
                <button
                  type="button"
                  onClick={() => setPerdaTipo(perdaTipo === "pct" ? "brl" : "pct")}
                  className={`${perdaToggleClass} h-[42px] w-[52px] shrink-0`}
                  title="Alternar % ou R$"
                >
                  {perdaTipo === "pct" ? "%" : "R$"}
                </button>
              </div>
            </div>
          </div>

          {/* Outros */}
          <div className="px-4 border-b border-neutral-200/70 dark:border-[var(--card-border)]/70">
            <div className="flex items-center justify-between gap-3 min-h-[52px]">
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 shrink-0">Outros (opcional)</span>
              <button type="button" onClick={addExtra} className={`${btnSecondaryClass} shrink-0`}>
                + Adicionar
              </button>
            </div>
            {extras.length > 0 && (
              <div className="space-y-2 pb-3">
                {extras.map((x) => (
                  <div key={x.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_72px_64px_40px] gap-2 items-center">
                    <input type="text" placeholder="Nome" value={x.nome}
                      onChange={(e) => updateExtra(x.id, "nome", e.target.value)}
                      onBlur={() => updateExtra(x.id, "nome", toTitleCase(x.nome))}
                      autoComplete="off" className={`${inputLight} min-w-0`} />
                    <input type="text" inputMode="decimal" placeholder="0" value={x.valorStr}
                      onChange={(e) => updateExtra(x.id, "valorStr", sanitizeNumInput(e.target.value))}
                      autoComplete="off" className={`${inputLight} w-full min-w-0`} />
                    <select value={x.tipo}
                      onChange={(e) => updateExtra(x.id, "tipo", e.target.value as "brl" | "pct")}
                      className={`${inputLight} w-full min-w-0 px-2`}>
                      <option value="brl">R$</option>
                      <option value="pct">%</option>
                    </select>
                    <button type="button" onClick={() => removeExtra(x.id)}
                      className="shrink-0 w-10 h-10 rounded-xl border border-red-900/60 bg-red-950/40 text-red-300 hover:bg-red-950/60 text-sm font-bold flex items-center justify-center">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex gap-2 px-3 sm:px-4 py-3 sm:py-4 items-center bg-white dark:bg-neutral-900/50 border-t border-neutral-200/60 dark:border-neutral-700/60">
            <button
              type="button"
              onClick={calcular}
              className="flex-1 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold py-3.5 sm:py-2.5 text-base sm:text-sm hover:opacity-90 transition-colors touch-manipulation min-h-[48px] sm:min-h-0"
            >
              Calcular
            </button>
            <button
              type="button"
              onClick={limpar}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 px-4 py-3.5 sm:py-2.5 text-base sm:text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors shrink-0 touch-manipulation min-h-[48px] sm:min-h-0 min-w-[5.5rem]"
            >
              Limpar
            </button>
          </div>
        </div>
        </div>

        {/* Coluna direita: resultado */}
        <div className="w-full lg:w-[min(100%,440px)] xl:w-[min(100%,480px)] lg:shrink-0 space-y-4 lg:sticky lg:top-20 self-start">
        {!calcOnly && precoMinimo != null && custoProduto && parseNum(custoProduto) > 0 ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm px-4 py-3.5">
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">Preço mínimo ({MARGEM_MINIMA}% margem)</div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{BRL.format(precoMinimo)}</div>
          </div>
        ) : !calcOnly ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm p-4 min-h-[80px] flex items-center justify-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center">Preencha o custo e clique em Calcular.</p>
          </div>
        ) : !resultado ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm p-4 min-h-[72px] flex items-center justify-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center">Preencha o custo e clique em Calcular.</p>
          </div>
        ) : null}

        {resultado ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-neutral-200 dark:border-[var(--card-border)]">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Resultado</h3>
            </div>
            <div className="p-4 space-y-4">
              {!calcOnly && abaixoMinimo && (
                <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-800 dark:text-red-200">
                  ⚠️ Margem abaixo do mínimo! Você está vendendo com menos de {MARGEM_MINIMA}% de lucro.
                </div>
              )}
              {resultado.variantes && resultado.variantes.length > 0 ? (
                <div
                  className={
                    resultado.variantes.length > 1
                      ? "grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4"
                      : "grid grid-cols-1 gap-3 w-full max-w-md lg:max-w-none mx-auto lg:mx-0"
                  }
                >
                  {resultado.variantes.map((v) => (
                    <div
                      key={v.key}
                      className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm px-4 py-3.5 space-y-2"
                    >
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wide">{v.label}</p>
                      <div className="flex justify-between items-center gap-2 text-sm">
                        <span className="text-neutral-500 shrink-0">Preço</span>
                        <span className="font-bold tabular-nums text-neutral-900 dark:text-neutral-100 text-right">
                          {BRL.format(v.precoVenda)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline gap-2 text-sm flex-wrap">
                        <span className="text-neutral-500 shrink-0">Lucro na margem</span>
                        <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300 text-right">
                          {BRL.format(v.valorLucro)}
                          <span className="text-xs font-medium text-emerald-600/95 dark:text-emerald-400/95 whitespace-nowrap">
                            {" "}
                            · {v.precoVenda > 0 ? ((v.valorLucro / v.precoVenda) * 100).toFixed(1) : "0"}% margem
                          </span>
                        </span>
                      </div>
                      {v.rebateAplicado != null && v.rebateAplicado > 0 && (
                        <>
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="text-neutral-500">Rebate devolvido (ML)</span>
                            <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                              +{BRL.format(v.rebateAplicado)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-2 text-xs text-neutral-600 dark:text-neutral-400 pt-0.5 border-t border-dashed border-neutral-200/90 dark:border-neutral-700/80">
                            <span>Referência: margem + rebate</span>
                            <span className="font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">
                              {BRL.format(
                                v.lucroMaisRebate ?? v.valorLucro + v.rebateAplicado,
                              )}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/70 shadow-sm overflow-hidden">
                        <div className="flex min-h-0 border-l-[3px] border-l-emerald-500 dark:border-l-emerald-400">
                          <div className="min-w-0 flex-1 px-3 py-3">
                            <div className="flex justify-between items-center gap-3">
                              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 leading-snug">
                                Você recebe{" "}
                                <span className="text-[10px] font-normal text-neutral-400 dark:text-neutral-500">(estimado)</span>
                              </span>
                              <span className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300 leading-none shrink-0">
                                {BRL.format(v.recebe)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      {v.operacionalBruto != null && (
                        <div className="text-[11px] text-neutral-500 space-y-0.5 pt-1 border-t border-neutral-200/80 dark:border-neutral-700/80">
                          <div className="flex justify-between"><span>Operacional (pago)</span><span>{BRL.format(v.operacionalBruto)}</span></div>
                          {v.rebateAplicado != null && v.rebateAplicado > 0 && (
                            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                              <span>Rebate devolvido</span>
                              <span>+{BRL.format(v.rebateAplicado)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm px-4 py-3.5 space-y-1.5">
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Preço</span>
                      <span className="text-xl font-bold tabular-nums text-right shrink-0 text-neutral-900 dark:text-neutral-50 tracking-tight">
                        {resultado.precoVenda > 0 ? BRL.format(resultado.precoVenda) : "—"}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {PRESET_TO_MARKETPLACE_NOME[preset] ?? (preset === "todos" ? "Comparativo" : "Canal")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm px-4 py-3.5 space-y-1">
                    <div className="flex justify-between items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 shrink-0">Lucro</span>
                      <span className="text-xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums text-right min-w-0">
                        {resultado.precoVenda > 0 ? (
                          <>
                            {BRL.format(resultado.valorLucro)}
                            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                              {" "}
                              · {((resultado.valorLucro / resultado.precoVenda) * 100).toFixed(1)}% margem
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                    {resultado.precoVenda <= 0 && preset === "todos" && (
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Preencha os operacionais na tabela abaixo</p>
                    )}
                  </div>
                </div>
              )}

              {resultado.recebe != null && resultado.modo === "single" && (
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/70 shadow-sm overflow-hidden">
                  <div className="flex min-h-0 border-l-[3px] border-l-emerald-500 dark:border-l-emerald-400">
                    <div className="min-w-0 flex-1 px-4 py-4 sm:px-5">
                      <div className="flex justify-between items-center gap-3 sm:gap-4">
                        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 leading-snug min-w-0">
                          Você recebe{" "}
                          <span className="text-[10px] font-normal text-neutral-400 dark:text-neutral-500">(estimado)</span>
                        </span>
                        <span className="text-2xl sm:text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300 leading-none tracking-tight shrink-0">
                          {BRL.format(resultado.recebe)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {resultado.modo === "todos" && resultado.porMarketplace.length > 0 && (
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm overflow-x-auto">
                <div className="px-4 py-3 flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-700/60">
                  <h4 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Preços por marketplace</h4>
                </div>
                <table className="w-full text-sm min-w-[280px]">
                  <thead>
                    <tr className="bg-neutral-100 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 text-xs uppercase tracking-wide">
                      <th className="text-left px-3 py-2 font-medium min-w-[96px]">Marketplace</th>
                      <th className="text-right px-3 py-2 font-medium min-w-[88px]">Preço</th>
                      <th className="text-right px-3 py-2 font-medium min-w-[112px]">Margem</th>
                      <th className="text-right px-3 py-2 font-medium min-w-[100px] text-emerald-700/90 dark:text-emerald-300/90">Recebe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.porMarketplace.map((mp) => (
                        <tr key={mp.nome} className="border-t border-neutral-200/60 dark:border-neutral-700/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                          <td className="px-3 py-2.5 text-neutral-900 dark:text-neutral-100 font-medium align-top">
                            {mp.nome}
                            {badgeSeuCanal(mp.nome) && (
                              <span className="block text-[10px] uppercase text-amber-600 dark:text-amber-400 mt-0.5">seu canal</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-neutral-900 dark:text-neutral-100 tabular-nums align-top">
                            {mp.semOperacional || mp.precoVenda == null ? (
                              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400 block max-w-[130px] ml-auto leading-snug">Preencha o operacional</span>
                            ) : (
                              BRL.format(mp.precoVenda)
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right align-top">
                            {mp.semOperacional || mp.valorLucro == null || mp.precoVenda == null ? (
                              <span className="text-xs text-neutral-500">—</span>
                            ) : (
                              <div className="flex flex-row flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0 tabular-nums text-right">
                                <span className="text-emerald-700 dark:text-emerald-300 font-semibold">{BRL.format(mp.valorLucro)}</span>
                                <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium whitespace-nowrap">
                                  {mp.precoVenda > 0 ? `· ${((mp.valorLucro / mp.precoVenda) * 100).toFixed(1)}% margem` : ""}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right align-top tabular-nums text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                            {mp.recebe == null || mp.semOperacional ? "—" : BRL.format(mp.recebe)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              )}
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/55 overflow-hidden shadow-sm">
                <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 px-3 py-2.5 border-b border-neutral-200/80 dark:border-neutral-700/70 uppercase tracking-wider">
                  Composição de custos
                </div>
                <div className="divide-y divide-neutral-200 dark:divide-neutral-800/60">
                  <Linha
                    label="Custos fixos"
                    sublabel={perdaTipo === "brl" && resultado.valorPerda > 0 ? "produto + embalagem + operacional + perdas" : "produto + embalagem + operacional"}
                    valor={resultado.custosFixos}
                    red
                  />
                  <Linha label="Comissão" valor={resultado.valorComissao} red />
                  <Linha label="Imposto" valor={resultado.valorImposto} red />
                  {resultado.valorAds > 0 && (
                    <Linha label="ADS/TACOS" valor={resultado.valorAds} red />
                  )}
                  {resultado.valorPerda > 0 && perdaTipo === "pct" && (
                    <Linha label="Perdas/Devoluções" sublabel="%" valor={resultado.valorPerda} red />
                  )}
                  {resultado.valorExtrasPct > 0 && (
                    <Linha label="Outros" sublabel="%" valor={resultado.valorExtrasPct} red />
                  )}
                  {resultado.efeitoCupom &&
                    (resultado.efeitoCupom.cupomPct > 0 || resultado.efeitoCupom.reducaoPreco > 0) && (
                    <div className="px-3 py-2.5 bg-neutral-100/80 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-700/80">
                      <p className="text-[11px] text-neutral-700 dark:text-neutral-300 mb-2 leading-snug">
                        <strong className="text-neutral-900 dark:text-neutral-100">Cupom:</strong> não entra como custo acima; reduz os % usados na fórmula (margem, imposto, ADS/TACOS, perdas, extras). Abaixo, o efeito no preço final.
                      </p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="text-neutral-700 dark:text-neutral-300">Cupom (menos % na conta)</span>
                          <span className="tabular-nums font-medium text-neutral-900 dark:text-neutral-100">
                            {resultado.efeitoCupom.cupomPct > 0 ? `−${resultado.efeitoCupom.cupomPct.toFixed(1).replace(/\.0$/, "")}%` : "0%"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 text-xs text-neutral-600 dark:text-neutral-400 pt-1 border-t border-neutral-200/90 dark:border-neutral-600/50">
                          <span>Preço de referência (sem cupom)</span>
                          <span className="tabular-nums font-medium">{BRL.format(resultado.efeitoCupom.precoSemCupom)}</span>
                        </div>
                        <div className="flex justify-between gap-2 pt-1">
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200">Redução no preço final (efeito cupom)</span>
                          <span className="tabular-nums font-bold text-neutral-900 dark:text-neutral-100">
                            {resultado.efeitoCupom.reducaoPreco > 0
                              ? `−${BRL.format(resultado.efeitoCupom.reducaoPreco)}`
                              : "R$ 0,00"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500 text-center leading-relaxed px-2 pt-2 border-t border-neutral-200/50 dark:border-neutral-700/40 mt-1">
                Preço = Custos fixos ÷ (1 − percentuais totais)
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm p-4 min-h-[120px] flex items-center justify-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center">Clique em Calcular para ver o resultado.</p>
          </div>
        )}
        </div>
        </div>
      </div>
      <SellerNav active="calculadora" calcOnly={calcOnly} />
    </div>
  );
}

function Row({
  label,
  children,
  unit,
}: {
  label: ReactNode;
  children: React.ReactNode;
  unit?: string;
}) {
  return (
    <div className="px-4 py-3 sm:py-2.5 border-b border-neutral-200/70 dark:border-[var(--card-border)]/70">
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(140px,34%)_1fr_52px] sm:items-center sm:gap-x-3 sm:gap-y-0">
        {/* overflow-visible: tooltips (?) no label não podem usar sm:truncate no pai — overflow:hidden recorta o painel */}
        <label className="text-sm font-medium text-neutral-600 dark:text-neutral-400 shrink-0 flex items-center gap-1.5 min-w-0 overflow-visible">
          {label}
        </label>
        {/* Mobile: input + R$/% na mesma linha; sm+: contents para encaixar na grid de 3 colunas */}
        <div className="flex flex-row items-center gap-2 min-w-0 sm:contents">
          <div className="min-w-0 flex-1 w-full sm:min-w-0">{children}</div>
          {unit ? (
            <div className="flex items-center justify-end sm:justify-start shrink-0">
              <span className={unitBadge}>{unit}</span>
            </div>
          ) : (
            <div className="hidden sm:flex sm:w-[52px] sm:shrink-0 sm:items-center" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}

function Linha({
  label,
  sublabel,
  valor,
  red,
}: {
  label: string;
  sublabel?: string;
  valor: number;
  red?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="flex flex-col gap-0.5 min-w-0 pr-2">
        <span className="text-sm text-neutral-600 dark:text-neutral-300 leading-snug">{label}</span>
        {sublabel && <span className="text-xs text-neutral-500 dark:text-neutral-600 leading-snug">{sublabel}</span>}
      </div>
      <span
        className={`text-sm tabular-nums shrink-0 text-right pt-0.5 ${
          red
            ? "font-semibold text-red-700 dark:text-red-400"
            : "font-medium text-neutral-700 dark:text-neutral-300"
        }`}
      >
        {BRL.format(valor)}
      </span>
    </div>
  );
}
