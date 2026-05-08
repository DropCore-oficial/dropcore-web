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
import {
  AMBER_PREMIUM_LINK,
  AMBER_PREMIUM_SHELL,
  AMBER_PREMIUM_TEXT_BODY,
  AMBER_PREMIUM_TEXT_PRIMARY,
  AMBER_PREMIUM_TEXT_SOFT,
} from "@/lib/amberPremium";
import { cn } from "@/lib/utils";
import { CalculadoraAssinaturaRegrasInfo } from "@/components/calculadora/CalculadoraAssinaturaRegrasInfo";
import { isCalculadoraAssinaturaExpiradaLegacy403 } from "@/lib/calculadoraAssinaturaExpired";
import {
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_SOFT,
} from "@/lib/semanticPremium";
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MARGEM_MINIMA = 5;

// Visual base — cards neutros e polidos
const cardClass = "rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm";
/** Inputs base igual ao Dashboard — mobile um pouco mais baixo para reduzir “scroll infinito” */
const inputLight =
  "w-full rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 px-3 py-2.5 text-neutral-900 dark:text-neutral-100 text-base md:text-sm focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-500 placeholder-neutral-400 dark:placeholder-neutral-500";
/** Só Perdas — destaque escuro para chamar atenção */
const inputPerdas =
  "w-full rounded-xl bg-neutral-900 dark:bg-neutral-950 border border-neutral-900 dark:border-neutral-700 px-3 py-2.5 text-white text-base md:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-neutral-500/40 placeholder-neutral-300";
const btnSecondaryClass =
  "rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors";
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
  /** Com cupom: preço de etiqueta na vitrine (maior que a receita com cupom). Sem cupom: omitido ou igual ao preço efetivo. */
  precoSemCupom?: number;
  valorLucro: number;
  valorComissao: number;
  valorImposto: number;
  valorAfiliado: number;
  custosFixos: number;
  recebe: number;
  operacionalBruto?: number;
  /** Valor devolvido pelo ML (estorno de tarifa) — soma ao bolso, não é “menos” */
  rebateAplicado?: number;
  /** Lucro na margem + rebate devolvido (referência de “ganho” em duas partes) */
  lucroMaisRebate?: number;
};

/** Cupom = desconto % para o comprador sobre a etiqueta: receita efetiva = etiqueta × (1 − cupom/100); % e comissão incidem sobre a receita efetiva. */
type EfeitoCupom = {
  cupomPct: number;
  descontoPct: number;
  /** Etiqueta (vitrine) quando há cupom; igual à receita efetiva se cupom 0 */
  precoSemCupom: number;
  /** Etiqueta − receita com cupom (valor do desconto na simulação) */
  reducaoPreco: number;
};

type CalcAccess = "loading" | "seller" | "calc_only" | "calc_only_locked" | "denied";

export default function SellerCalculadoraPage() {
  const router = useRouter();
  const [calcAccess, setCalcAccess] = useState<CalcAccess>("loading");
  const [calcValidoAte, setCalcValidoAte] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  /** Renovação PIX na página (plano calculadora avulso bloqueado) */
  const [renoMeta, setRenoMeta] = useState<{ valor: number | null; configurado: boolean } | null>(null);
  const [renoPixLoading, setRenoPixLoading] = useState(false);
  const [renoPixErr, setRenoPixErr] = useState<string | null>(null);
  const [renoPixData, setRenoPixData] = useState<{
    qr_code_base64: string;
    qr_code: string;
    expira_em: string;
    valor: number;
  } | null>(null);
  const [renoPixCopiado, setRenoPixCopiado] = useState(false);
  /** Segundos até expira_em do PIX gerado (cronômetro regressivo). */
  const [renoPixCountdownSec, setRenoPixCountdownSec] = useState<number | null>(null);
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
  /** null = catálogo ainda não carregado ou erro; true = sem armazém em Produtos (não mostrar seletor de fornecedor). */
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
  /** % afiliados — só entra nas contas de TikTok, Shopee e Mercado Livre (Shein e linhas comparativo Shein = 0) */
  const [afiliado, setAfiliado] = useState("");
  /** Painel de ajuda (?): rebate | ads | cupom (todos) | cupomUnico | afiliado */
  const [helpOpen, setHelpOpen] = useState<
    | null
    | "rebate"
    | "ads"
    | "cupom"
    | "cupomUnico"
    | "afiliado"
    | "tiktokOpGratis"
    | "marketplacePreset"
    | "resultadoLegenda"
  >(null);

  /** Composição de custos: no &lt; md fica em &lt;details&gt; fechado por padrão; desktop sempre aberto. */
  const [composicaoDesktopAberta, setComposicaoDesktopAberta] = useState(false);

  const [resultado, setResultado] = useState<{
    modo: "single" | "dual_shein" | "dual_meli" | "todos";
    precoVenda: number;
    valorLucro: number;
    custosFixos: number;
    valorComissao: number;
    valorImposto: number;
    valorAds: number;
    valorAfiliado: number;
    valorPerda: number;
    valorExtrasPct: number;
    percTotal: number;
    variantes?: ResultadoVariante[];
    porMarketplace: {
      nome: string;
      precoVenda: number | null;
      /** Lista/vitrine (etiqueta) quando há cupom no canal — maior que a receita com cupom aplicado */
      precoSemCupom?: number | null;
      valorLucro: number | null;
      recebe?: number | null;
      semOperacional?: boolean;
    }[];
    operacionalMeliBruto?: number;
    rebate?: number;
    recebe?: number;
    efeitoCupom?: EfeitoCupom | null;
  } | null>(null);

  const refreshCalcAccess = useCallback(async () => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      router.replace("/calculadora/login");
      return;
    }
    const res = await fetch(`/api/calculadora/me?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 503) {
      setAccessError(
        typeof j?.error === "string"
          ? j.error
          : "Base de assinatura da calculadora não configurada. Execute create-calculadora-assinantes.sql no Supabase.",
      );
      setCalcAccess("denied");
      return;
    }
    if (isCalculadoraAssinaturaExpiradaLegacy403(res.status, j)) {
      setCalcAccess("calc_only_locked");
      setCalcValidoAte(typeof j.valido_ate === "string" ? j.valido_ate : null);
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
    } else if (j.access === "calc_only_locked") {
      setCalcAccess("calc_only_locked");
      setCalcValidoAte(typeof j.valido_ate === "string" ? j.valido_ate : null);
    } else {
      setCalcAccess("denied");
    }
  }, [router]);

  useEffect(() => {
    void refreshCalcAccess();
  }, [refreshCalcAccess]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setComposicaoDesktopAberta(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (calcAccess !== "calc_only_locked") return;
    let cancelled = false;
    fetch("/api/calculadora/renovacao-pix")
      .then((r) => r.json())
      .then((j: { valor?: number | null; configurado?: boolean }) => {
        if (cancelled) return;
        setRenoMeta({
          valor: typeof j.valor === "number" ? j.valor : null,
          configurado: Boolean(j.configurado),
        });
      })
      .catch(() => {
        if (!cancelled) setRenoMeta({ valor: null, configurado: false });
      });
    return () => {
      cancelled = true;
    };
  }, [calcAccess]);

  useEffect(() => {
    if (calcAccess === "calc_only") {
      setRenoPixData(null);
      setRenoPixErr(null);
      setRenoPixCountdownSec(null);
    }
  }, [calcAccess]);

  useEffect(() => {
    const exp = renoPixData?.expira_em;
    if (!exp) {
      setRenoPixCountdownSec(null);
      return;
    }
    const end = new Date(exp).getTime();
    if (Number.isNaN(end)) {
      setRenoPixCountdownSec(null);
      return;
    }
    const tick = () => {
      setRenoPixCountdownSec(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [renoPixData?.expira_em]);

  useEffect(() => {
    if (!renoPixData || calcAccess !== "calc_only_locked") return;
    const id = setInterval(async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      try {
        await fetch("/api/calculadora/renovacao-pix/sync", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        await refreshCalcAccess();
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [renoPixData, calcAccess, refreshCalcAccess]);

  const gerarPixRenovacao = useCallback(async () => {
    setRenoPixLoading(true);
    setRenoPixErr(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/calculadora/renovacao-pix", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof j?.error === "string" ? j.error : "Erro ao gerar PIX.");
      }
      setRenoPixData({
        qr_code_base64: String(j.qr_code_base64 ?? ""),
        qr_code: String(j.qr_code ?? ""),
        expira_em: String(j.expira_em ?? ""),
        valor: Number(j.valor ?? 0),
      });
    } catch (e: unknown) {
      setRenoPixErr(e instanceof Error ? e.message : "Erro ao gerar PIX.");
    } finally {
      setRenoPixLoading(false);
    }
  }, []);

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
      /** Não pré-selecionar pelo vínculo: o seller escolhe o armazém; «ligado ao perfil» = armazém gravado em Produtos. */
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
    const affGlobal = parseNum(afiliado);

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

    /**
     * Modelo alinhado ao uso usual: etiqueta na vitrine (P); com cupom o comprador paga R = P×(1−cupom%).
     * Margem, imposto, ADS, afiliados, perdas (%), outros (%) e comissão incidem sobre R (valor que efetivamente movimenta a venda na simulação).
     */
    const computeLinha = (
      comissao: number,
      freteEfetivo: number,
      isSheinChannel: boolean,
      cupomPct: number,
      afiliadoLinhaPct: number,
    ) => {
      const { extraBrl, extraPct } = extrasTotais(isSheinChannel);
      const adsPct = isSheinChannel ? 0 : adsVal;
      const affPct = Math.max(0, isSheinChannel ? 0 : afiliadoLinhaPct);
      const brutoPct = marg + imp + adsPct + affPct + perdaPct + extraPct;
      const percTotalLinha = brutoPct + comissao;
      if (percTotalLinha >= 100) return null;
      const baseFixos = custo + emb + freteEfetivo + extraBrl + perdaBrl;
      /** Recebimento bruto quando o cliente paga já com cupom aplicado sobre a etiqueta (base dos % na simulação). */
      const receitaCupom = baseFixos / (1 - percTotalLinha / 100);
      const cupomFrac = Math.max(0, Math.min(cupomPct, 99.99));
      const precoLista = cupomFrac > 0.000001 ? receitaCupom / (1 - cupomFrac / 100) : receitaCupom;
      /** `precoVenda` canonical = receita efetiva (com cupom na compra), não a etiqueta. */
      const precoVenda = receitaCupom;
      const valorLucro = receitaCupom * (marg / 100);
      const valorComissao = receitaCupom * (comissao / 100);
      const valorImposto = receitaCupom * (imp / 100);
      const valorAds = receitaCupom * (adsPct / 100);
      const valorAfiliado = receitaCupom * (affPct / 100);
      const valorPerda = perdaTipo === "pct" ? receitaCupom * (perdaPct / 100) : perdaBrl;
      const valorExtrasPct = receitaCupom * (extraPct / 100);
      const reducaoPreco = cupomFrac > 0.000001 ? Math.max(0, precoLista - receitaCupom) : 0;
      const efeitoCupom: EfeitoCupom = {
        cupomPct,
        descontoPct: cupomFrac,
        precoSemCupom: cupomFrac > 0.000001 ? precoLista : receitaCupom,
        reducaoPreco,
      };
      return {
        precoVenda,
        valorLucro,
        custosFixos: baseFixos,
        valorComissao,
        valorImposto,
        valorAds,
        valorAfiliado,
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
        afiliadoLinhaPct: number;
      }[] = [
        { nome: "ML Clássico", comissao: COMISSOES.meli_classico, opStr: opMeli, rebate: true, cupom: cMl, shein: false, afiliadoLinhaPct: affGlobal },
        { nome: "ML Premium", comissao: COMISSOES.meli_premium, opStr: opMeli, rebate: true, cupom: cMl, shein: false, afiliadoLinhaPct: affGlobal },
        { nome: "TikTok Shop", comissao: COMISSOES.tiktok, opStr: opTiktok, rebate: false, cupom: cTk, shein: false, afiliadoLinhaPct: affGlobal },
        { nome: "Shopee", comissao: COMISSOES.shopee, opStr: opShopee, rebate: false, cupom: cSp, shein: false, afiliadoLinhaPct: affGlobal },
        { nome: "Shein masc.", comissao: COMISSOES.shein_masc, opStr: opShein, rebate: false, cupom: cSh, shein: true, afiliadoLinhaPct: 0 },
        { nome: "Shein fem.", comissao: COMISSOES.shein_fem, opStr: opShein, rebate: false, cupom: cSh, shein: true, afiliadoLinhaPct: 0 },
      ];

      const porMarketplace = linhasTodos.map((row) => {
        if (!operacionalPreenchido(row.opStr)) {
          return {
            nome: row.nome,
            precoVenda: null,
            precoSemCupom: null,
            valorLucro: null,
            recebe: null,
            semOperacional: true,
          };
        }
        const opBruto = parseNum(row.opStr);
        const freteEf = row.rebate ? Math.max(0, opBruto - rebateVal) : opBruto;
        const out = computeLinha(row.comissao, freteEf, row.shein, row.cupom, row.afiliadoLinhaPct);
        if (!out) {
          return {
            nome: row.nome,
            precoVenda: 0,
            precoSemCupom: null,
            valorLucro: 0,
            recebe: 0,
            semOperacional: false,
          };
        }
        let recebeLinha: number;
        if (row.nome.startsWith("ML")) {
          recebeLinha = out.precoVenda - out.valorComissao - opBruto + rebateVal;
        } else {
          recebeLinha = out.precoVenda - out.valorComissao - out.valorAfiliado - freteEf;
        }
        return {
          nome: row.nome,
          precoVenda: out.precoVenda,
          precoSemCupom: row.cupom > 0 ? out.efeitoCupom.precoSemCupom : null,
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
        valorAfiliado: number;
        valorPerda: number;
        valorExtrasPct: number;
        percTotal: number;
        efeitoCupom: EfeitoCupom;
      } | null = null;
      if (idxResumo >= 0) {
        const row = linhasTodos[idxResumo];
        const opBruto = parseNum(row.opStr);
        const freteEf = row.rebate ? Math.max(0, opBruto - rebateVal) : opBruto;
        resumo = computeLinha(row.comissao, freteEf, row.shein, row.cupom, row.afiliadoLinhaPct);
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
          valorAfiliado: 0,
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
        valorAfiliado: resumo.valorAfiliado,
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
      const vMasc = computeLinha(COMISSOES.shein_masc, freteEf, true, cupomU, 0);
      const vFem = computeLinha(COMISSOES.shein_fem, freteEf, true, cupomU, 0);
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
          precoSemCupom:
            cupomU > 0 && vMasc.efeitoCupom.reducaoPreco > 0 ? vMasc.efeitoCupom.precoSemCupom : undefined,
          recebe: vMasc.precoVenda - vMasc.valorComissao - freteEf,
        },
        {
          key: "shein_fem",
          label: "Shein feminino (20%)",
          comissao: COMISSOES.shein_fem,
          ...coreFem,
          precoSemCupom:
            cupomU > 0 && vFem.efeitoCupom.reducaoPreco > 0 ? vFem.efeitoCupom.precoSemCupom : undefined,
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
        valorAfiliado: vMasc.valorAfiliado,
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
      const vCl = computeLinha(COMISSOES.meli_classico, freteEf, false, cupomU, affGlobal);
      const vPr = computeLinha(COMISSOES.meli_premium, freteEf, false, cupomU, affGlobal);
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
          precoSemCupom:
            cupomU > 0 && vCl.efeitoCupom.reducaoPreco > 0 ? vCl.efeitoCupom.precoSemCupom : undefined,
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
          precoSemCupom:
            cupomU > 0 && vPr.efeitoCupom.reducaoPreco > 0 ? vPr.efeitoCupom.precoSemCupom : undefined,
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
        valorAfiliado: vCl.valorAfiliado,
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
    const out = computeLinha(com, freteEfetivo, false, cupomU, affGlobal);
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
      valorAfiliado,
      valorPerda,
      valorExtrasPct,
      percTotal,
      efeitoCupom,
    } = out;

    /** Próximo ao “valor a liquidar” do app: pedido − comissão − afiliados − operacional (imposto/ADS/lucro são outra camada). */
    const recebeSingle =
      preset === "tiktok"
        ? precoVenda - valorComissao - valorAfiliado - opTikNum
        : preset === "shopee"
          ? precoVenda - valorComissao - valorAfiliado - opShopNum
          : precoVenda - valorComissao;

    setResultado({
      modo: "single",
      precoVenda,
      valorLucro,
      custosFixos: baseFixos,
      valorComissao,
      valorImposto,
      valorAds,
      valorAfiliado,
      valorPerda,
      valorExtrasPct,
      percTotal,
      recebe: recebeSingle,
      porMarketplace: [],
      efeitoCupom,
    });
  }, [
    custoProduto, embFul, margem, comissao, imposto, ads, afiliado, perda, perdaTipo, preset, extras,
    opMeli, opTiktok, opShopee, opShein, rebateML, parseNum,
    cupomUnico, cupomMl, cupomShopee, cupomTiktok, cupomShein,
  ]);

  // Recalcula quando qualquer dependência de `calcular` mudar (incl. cupom, margem, operacional...)
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
    setAfiliado("");
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
    const affMin =
      preset === "tiktok" || preset === "shopee" || preset === "meli" ? parseNum(afiliado) : 0;
    const cupomMin = Math.max(0, Math.min(parseNum(cupomUnico), 99.99));
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
    const brutoPct = MARGEM_MINIMA + imp + adsPreco + affMin + perdaPctMin + extraPct;
    const percSemMargem = brutoPct + com;
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
    const receitaMin = custosFixos / (1 - percSemMargem / 100);
    return cupomMin > 0.000001 ? receitaMin / (1 - cupomMin / 100) : receitaMin;
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
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Carregando calculadora...</p>
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
            Se o teste grátis terminou ou a assinatura venceu, fale com o suporte para renovar o acesso. No plano pago, prevalece
            um dia fixo de renovação no mês, sem juros; quem ficar sem pagar pode ficar sem acesso até regularizar.
          </p>
          <a href="/calculadora/login" className="text-sm text-emerald-600 dark:text-emerald-400 underline">
            Voltar ao login
          </a>
        </div>
      </div>
    );
  }

  const calcOnlyLite = calcAccess === "calc_only" || calcAccess === "calc_only_locked";
  const usoBloqueadoCalc = calcAccess === "calc_only_locked";

  return (
    <div
      className={
        calcOnlyLite
          ? "min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-8"
          : "min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8"
      }
    >
      <div className="dropcore-shell-4xl py-4 sm:py-6 lg:py-8">
        <div className="grid w-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] gap-x-5 gap-y-5">
          <div className="col-span-full">
            <SellerPageHeader
              surface="hero"
              className="mb-0 sm:mb-0"
              title="Calculadora de preço"
              subtitle="Preencha custos e operacionais por marketplace para gerar preço e margem."
            />
          </div>
          {calcAccess === "calc_only" && calcValidoAte && (
            <div
              className="col-span-full rounded-xl border border-neutral-200 dark:border-neutral-700/80 border-l-[3px] border-l-emerald-500 dark:border-l-emerald-400 bg-white dark:bg-neutral-900/60 px-3 py-2.5 sm:px-4 sm:py-3 text-[13px] sm:text-sm leading-snug text-emerald-900 dark:text-emerald-300 shadow-sm dark:shadow-none"
              role="status"
            >
              <div className="flex gap-2.5 items-start">
                <span className="text-lg leading-none shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" aria-hidden>
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <p>
                    <strong className="font-semibold text-emerald-900 dark:text-emerald-300">Calculadora de preço:</strong>{" "}
                    <span className="text-emerald-700 dark:text-emerald-400/95">
                      válido até{" "}
                      {new Date(calcValidoAte).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    .
                  </p>
                  <CalculadoraAssinaturaRegrasInfo variant="embedded" />
                </div>
              </div>
            </div>
          )}
          <div
            className={cn(
              "col-span-full grid w-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] gap-x-5 gap-y-5 isolate",
              usoBloqueadoCalc && "relative min-h-[min(72vh,560px)]",
            )}
          >
        <div className="min-w-0 space-y-4">
        {!calcOnlyLite && (
          <div className="block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                <span className={AMBER_PREMIUM_TEXT_SOFT}>Regra:</span> margem mínima de {MARGEM_MINIMA}%
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                O preço mínimo deve garantir pelo menos {MARGEM_MINIMA}% de margem de lucro.
              </p>
            </div>
            <span className={cn("shrink-0 text-3xl leading-none", AMBER_PREMIUM_TEXT_PRIMARY)}>
              ⚠️
            </span>
          </div>
        )}
        {!calcOnlyLite && semArmazemCatalogo === true && (
          <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-700/70 bg-white dark:bg-neutral-900/70 shadow-sm overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-600 sm:hidden" aria-hidden />
            <div className="flex flex-col sm:flex-row sm:items-stretch">
              <div
                className="hidden sm:block w-1 shrink-0 self-stretch min-h-[4.5rem] bg-gradient-to-b from-emerald-500 to-teal-600"
                aria-hidden
              />
              <div className="flex flex-1 flex-col sm:flex-row sm:items-center gap-4 px-4 py-4 sm:px-5 sm:py-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-300/80 dark:ring-emerald-900/50">
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
                    Sem vínculo em <strong className="text-neutral-800 dark:text-neutral-200">Produtos</strong>, o catálogo da API não aparece aqui — evita misturar com vitrines de outros armazéns. Use <strong className="text-neutral-800 dark:text-neutral-200">custo manual</strong> abaixo ou vincule o armazém primeiro.
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

          {!calcOnlyLite && semArmazemCatalogo !== true && fornecedores.length > 0 && (
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
                    className={`${inputLight} min-w-0 w-full`}
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

          <Row
            label={
              <>
                <span className="truncate">Marketplace (predefinido)</span>
                <HelpBubble
                  open={helpOpen === "marketplacePreset"}
                  onOpen={() => setHelpOpen("marketplacePreset")}
                  onClose={() => setHelpOpen(null)}
                  ariaLabel="Operacional por marketplace"
                  side="above"
                >
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1.5">Operacional por marketplace</p>
                  <p className="text-sm leading-relaxed">
                    Informe o <strong>operacional (R$)</strong> de cada marketplace — não usamos valores automáticos. Na tabela de preços só aparece o canal em que você preencheu o operacional.
                  </p>
                </HelpBubble>
              </>
            }
          >
            <select
              value={preset}
              onChange={(e) => handlePresetChange(e.target.value)}
              title="TikTok 6%, Shopee ~18%, SHEIN masc./fem., ML Clássico 14% + Premium 19%, ou comparar todos"
              className={`${inputLight} w-full min-w-0 max-w-full`}
            >
              <option value="">Marketplace (selecionar)</option>
              <option value="tiktok">TikTok Shop (6%)</option>
              <option value="shopee">Shopee (~18%)</option>
              <option value="shein">SHEIN 18% + 20% (juntos)</option>
              <option value="meli">Mercado Livre 14% + 19%</option>
              <option value="todos">Todos (comparar)</option>
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

          <div className="px-4 py-2 border-b border-neutral-200/70 dark:border-neutral-700/60 bg-neutral-100 dark:bg-neutral-900/50">
            <p className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-widest">
              Operacional por marketplace (R$)
              {preset === "todos" && (
                <span className="block font-normal normal-case text-xs mt-1 text-neutral-500 leading-snug">
                  Preencha cada canal que quiser ver na tabela de comparativo.
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
            <div className="border-b border-neutral-200/70 dark:border-[var(--card-border)]/70 px-4 py-3 sm:py-2.5">
              <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(140px,34%)_1fr_52px] sm:items-center sm:gap-x-3 sm:gap-y-0">
                {/* Mesmo encaixe do <Row /> (unit): sm:contents distribui input+zerar na coluna 2 e R$ na 3 */}
                <label className="text-sm font-medium text-neutral-600 dark:text-neutral-400 shrink-0 flex items-center gap-1.5 min-w-0 overflow-visible">
                  <span className="truncate">TikTok Shop</span>
                  <HelpBubble
                    open={helpOpen === "tiktokOpGratis"}
                    onOpen={() => setHelpOpen("tiktokOpGratis")}
                    onClose={() => setHelpOpen(null)}
                    ariaLabel="Operacional TikTok e período grátis"
                    side="above"
                  >
                    <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1.5">Operacional no TikTok Shop</p>
                    <p className="mb-2">
                      Em muitos casos o TikTok oferece <strong>período com operacional em R$ 0</strong> (costuma ser algo como{" "}
                      <strong>3 meses grátis</strong> para novos sellers), cobrando só a <strong>comissão %</strong> sobre a venda — confira
                      sempre as regras atuais no app.
                    </p>
                    <p className="text-[13px] text-neutral-700 dark:text-neutral-300 pt-2 border-t border-neutral-200/80 dark:border-neutral-600/60">
                      Use <strong>Zerar</strong> ao lado do <strong>R$</strong> para colocar o operacional em <strong>R$ 0</strong> (simula período grátis no app).
                    </p>
                  </HelpBubble>
                </label>
                <div className="flex flex-row items-center gap-2 min-w-0 sm:contents">
                  <div className="min-w-0 flex-1 w-full sm:min-w-0">
                    <div className="flex flex-row items-center gap-2 w-full min-w-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={opTiktok}
                        onChange={(e) => setOpTiktok(sanitizeNumInput(e.target.value))}
                        placeholder="0,00"
                        className={cn(
                          inputLight,
                          /* mesma linha que o zerar; flex-1 alinha ao padrão do card (inputs full-bleed à esquerda) */
                          "min-h-0 min-w-0 flex-1 shrink tabular-nums",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setOpTiktok("0")}
                        title="Zerar operacional (R$ 0) — período grátis TikTok"
                        aria-label="Zerar operacional TikTok — coloca valor em zero reais (período grátis)"
                        className={cn(
                          "inline-flex h-[42px] min-w-[4.25rem] shrink-0 touch-manipulation items-center justify-center rounded-xl px-2.5",
                          "border border-neutral-200 bg-neutral-100 text-neutral-800 text-[11px] font-semibold leading-tight whitespace-nowrap shadow-sm sm:text-xs",
                          "transition-colors dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100",
                          "hover:bg-neutral-200/90 hover:text-neutral-950 dark:hover:bg-neutral-700 dark:hover:text-white",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] dark:focus-visible:ring-neutral-500",
                        )}
                      >
                        Zerar
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-end sm:justify-start shrink-0">
                    <span className={unitBadge}>R$</span>
                  </div>
                </div>
              </div>
            </div>
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
                <p className={cn("text-[11px] leading-snug font-medium mt-2", AMBER_PREMIUM_TEXT_SOFT)}>
                  Só entra nas linhas Mercado Livre do comparativo — TikTok, Shopee e Shein não usam.
                </p>
              )}
            </div>
          )}

          {isModoTodos && (
            <div className="px-4 py-3.5 border-b border-neutral-200/70 dark:border-neutral-700/60 bg-[var(--card)]">
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-[var(--card)] shadow-sm p-4 space-y-3 overflow-visible">
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
                    <p className="mb-2">
                      Cada canal tem o próprio %. O cupom simula um <strong>desconto % para o cliente em cima da etiqueta</strong>: o que aparece maior é a <strong>etiqueta (vitrine)</strong>; o menor é quanto ele <strong>paga ao aplicar cupom</strong>. Comissão e os % margem / imposto / ADS etc. são calculados <strong>sobre o valor pago com cupom</strong>, como costuma ser no fluxo de venda.
                    </p>
                    <p className="mt-2 pt-2 border-t border-neutral-200/80 dark:border-neutral-600/60 text-[13px]">
                      Na tabela de comparativo cada linha usa o cupom do marketplace correspondente (ML, Shopee, TikTok, Shein).
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
                    <div key={nome} className="rounded-lg border border-neutral-200/80 dark:border-neutral-700/70 bg-[var(--card)] px-3 py-2.5">
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
                      Use o % de desconto que o comprador aplica com cupom. Com isso, a calculadora mostra a <strong>etiqueta</strong> (valor maior) e o <strong>valor com cupom</strong> (menor), e projeta margem e comissão em cima do que entra com o cupom ativo.
                    </p>
                  </HelpBubble>
                </span>
              }
              unit="%"
            >
              <input type="text" inputMode="decimal" value={cupomUnico} onChange={(e) => setCupomUnico(sanitizeNumInput(e.target.value))} placeholder="0" className={inputLight} />
            </Row>
          )}

          {preset && (isModoTodos || preset === "tiktok" || preset === "shopee" || preset === "meli") ? (
            <Row
              label={
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="truncate">Afiliado</span>
                  <HelpBubble
                    open={helpOpen === "afiliado"}
                    onOpen={() => setHelpOpen("afiliado")}
                    onClose={() => setHelpOpen(null)}
                    ariaLabel="Afiliados no comparativo da calculadora"
                    side="above"
                  >
                    <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1.5">Afiliado (%)</p>
                    <p className="mb-2">
                      Este percentual entra na conta apenas para <strong>Mercado Livre</strong>, <strong>TikTok Shop</strong> e <strong>Shopee</strong>. É somado aos outros custos sobre o preço na simulação (como parte da fatia % da fórmula).
                    </p>
                    <p className="text-[13px] text-neutral-700 dark:text-neutral-300 mt-2 pt-2 border-t border-neutral-200/80 dark:border-neutral-600/60">
                      No modo <strong>Todos os marketplaces</strong>, o mesmo valor vale para ML, TikTok e Shopee nas linhas do comparativo. As linhas da <strong>Shein ignoram este campo.</strong>
                    </p>
                  </HelpBubble>
                </span>
              }
              unit="%"
            >
              <input
                type="text"
                inputMode="decimal"
                value={afiliado}
                onChange={(e) => setAfiliado(sanitizeNumInput(e.target.value))}
                placeholder="0"
                className={inputLight}
              />
            </Row>
          ) : null}

          <Row label="Margem de lucro" unit="%">
            <input type="text" inputMode="decimal" value={margem}
              onChange={(e) => setMargem(sanitizeNumInput(e.target.value))} placeholder="15" className={inputLight} />
          </Row>

          {(preset === "shein" || preset === "todos" || preset === "meli") ? (
            <Row label="Comissão (Marketplace)">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-snug pr-1">
                {preset === "shein" && (
                  <>
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">18% masc.</span> e{" "}
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">20% fem.</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-1">Dois cards de resultado.</span>
                  </>
                )}
                {preset === "meli" && (
                  <>
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">14% Clássico</span> e{" "}
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">19% Premium</span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-1">Dois cards de resultado.</span>
                  </>
                )}
                {preset === "todos" && "Definida por linha na tabela de comparativo."}
              </p>
            </Row>
          ) : (
            <Row label="Comissão (Marketplace)" unit="%">
              <input type="text" inputMode="decimal" value={comissao}
                onChange={(e) => setComissao(sanitizeNumInput(e.target.value))} placeholder="0" className={inputLight} />
            </Row>
          )}

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
                <p className={cn("text-[11px] leading-snug font-medium mt-2", AMBER_PREMIUM_TEXT_SOFT)}>
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
          <div className="px-4 border-b border-[var(--card-border)]/80 py-3">
            <div className="flex items-center justify-between gap-3 min-h-[44px]">
              <span className="text-sm font-semibold text-[var(--foreground)] shrink-0">Outros (opcional)</span>
              <button
                type="button"
                onClick={addExtra}
                className="shrink-0 inline-flex items-center justify-center rounded-xl border border-[var(--primary-blue)] bg-[var(--primary-blue)] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                + Adicionar
              </button>
            </div>
            {extras.length > 0 && (
              <div className="mt-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-2.5 sm:p-3">
                <p className="mb-2 text-[11px] font-medium text-[var(--muted)]">Exemplo: etiqueta, taxa fixa, embalagem extra.</p>
                <div className="space-y-2">
                {extras.map((x) => (
                  <div key={x.id} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-2.5 sm:p-2">
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_72px_64px_40px] gap-2 items-center">
                    <input type="text" placeholder="Nome" value={x.nome}
                      onChange={(e) => updateExtra(x.id, "nome", e.target.value)}
                      onBlur={() => updateExtra(x.id, "nome", toTitleCase(x.nome))}
                      autoComplete="off" className={`${inputLight} min-w-0`} />
                    <div className="grid grid-cols-[minmax(0,1fr)_64px] gap-2 sm:contents">
                      <input type="text" inputMode="decimal" placeholder="0" value={x.valorStr}
                        onChange={(e) => updateExtra(x.id, "valorStr", sanitizeNumInput(e.target.value))}
                        autoComplete="off" className={`${inputLight} w-full min-w-0`} />
                      <select value={x.tipo}
                        onChange={(e) => updateExtra(x.id, "tipo", e.target.value as "brl" | "pct")}
                        className={`${inputLight} w-full min-w-0 px-2`}>
                        <option value="brl">R$</option>
                        <option value="pct">%</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExtra(x.id)}
                      className={cn(
                        DANGER_PREMIUM_SURFACE_TRANSPARENT,
                        DANGER_PREMIUM_TEXT_SOFT,
                        "shrink-0 w-full sm:w-10 h-10 rounded-xl bg-[var(--danger)]/8 hover:bg-[var(--danger)]/14 dark:bg-[var(--danger)]/12 dark:hover:bg-[var(--danger)]/20 text-sm font-bold flex items-center justify-center transition-colors",
                      )}
                    >
                      <span className="sm:hidden">Remover</span>
                      <span className="hidden sm:inline">×</span>
                    </button>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex gap-2 px-3 sm:px-4 py-3 sm:py-4 items-center bg-white dark:bg-neutral-900/50 border-t border-neutral-200/60 dark:border-neutral-700/60">
            <button
              type="button"
              onClick={calcular}
              className="flex-1 rounded-xl bg-emerald-600 text-white font-semibold py-3.5 sm:py-2.5 text-base sm:text-sm hover:bg-emerald-700 transition-colors touch-manipulation min-h-[48px] sm:min-h-0"
            >
              Calcular
            </button>
            <button
              type="button"
              onClick={limpar}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 px-4 py-3.5 sm:py-2.5 text-base sm:text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors shrink-0 touch-manipulation min-h-[48px] sm:min-h-0 min-w-[5.5rem]"
            >
              Limpar
            </button>
          </div>
        </div>
        </div>

        {/* Coluna direita: resultado */}
        <div className="w-full min-w-0 space-y-3 self-start">
        {!calcOnlyLite && precoMinimo != null && custoProduto && parseNum(custoProduto) > 0 ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm px-4 py-3.5">
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
              {parseNum(cupomUnico) > 0.0001
                ? `Etiqueta mínima na vitrine (${MARGEM_MINIMA}% margem sobre receita com cupom)`
                : `Preço mínimo (${MARGEM_MINIMA}% margem)`}
            </div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{BRL.format(precoMinimo)}</div>
          </div>
        ) : !calcOnlyLite ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm p-4 min-h-[68px] flex items-center justify-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center">Preencha o custo e clique em Calcular.</p>
          </div>
        ) : !resultado ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm p-4 min-h-[68px] flex items-center justify-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center">Preencha o custo e clique em Calcular.</p>
          </div>
        ) : null}

        {resultado ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-neutral-200 dark:border-[var(--card-border)] flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 shrink-0">Resultado</h3>
              {preset ? (
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {PRESET_TO_MARKETPLACE_NOME[preset] ?? (preset === "todos" ? "Comparativo" : "Canal")}
                </span>
              ) : null}
              <HelpBubble
                open={helpOpen === "resultadoLegenda"}
                onOpen={() => setHelpOpen("resultadoLegenda")}
                onClose={() => setHelpOpen(null)}
                ariaLabel="O que significa cada valor no resultado"
                side="above"
              >
                <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1.5">Leitura rápida</p>
                <ul className="list-disc pl-4 space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                  <li>
                    <strong>Pedido / valor do pedido</strong> — quanto entra na compra com cupom (base da margem % e da composição em %).
                  </li>
                  <li>
                    <strong>Vitrine</strong> — preço para anunciar antes do desconto do cupom.
                  </li>
                  <li>
                    <strong>Lucro</strong> — margem sobre o valor do pedido, não é o líquido no banco.
                  </li>
                  <li>
                    <strong>Você recebe</strong> — estimativa após comissão, afiliados e operacional em R$ (TikTok/Shopee); no ML entra rebate conforme a simulação. Não substitui o extrato do app.
                  </li>
                </ul>
              </HelpBubble>
            </div>
            <div className="p-4 space-y-3">
              {!calcOnlyLite && abaixoMinimo && (
                <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-100 dark:bg-red-950/40 p-3 text-sm text-red-800 dark:text-red-200">
                  ⚠️ Margem abaixo do mínimo! Você está vendendo com menos de {MARGEM_MINIMA}% de lucro.
                </div>
              )}
              {resultado.variantes && resultado.variantes.length > 0 ? (
                <div
                  className={
                    resultado.variantes.length > 1
                      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2 gap-3 md:gap-4"
                      : "grid grid-cols-1 gap-3 w-full max-w-md lg:max-w-none mx-auto lg:mx-0"
                  }
                >
                  {resultado.variantes.map((v) => (
                    <div
                      key={v.key}
                      className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm px-4 py-3.5 space-y-2.5"
                    >
                      <p className={cn("text-[13px] font-semibold uppercase tracking-wide leading-snug", AMBER_PREMIUM_TEXT_BODY)}>{v.label}</p>
                      {/* KPI limpo: barra + fundo neutro (evita “bloco verde” pesado no escuro) */}
                      <div className="flex min-h-0 overflow-hidden rounded-xl border border-neutral-200/95 dark:border-neutral-700/90 bg-white dark:bg-neutral-950/70 shadow-sm">
                        <div className="w-1.5 shrink-0 bg-emerald-500 dark:bg-emerald-500" aria-hidden />
                        <div className="min-w-0 flex-1 px-3 py-2.5">
                          <PrecoVendaComCupomBlock
                            precoComCampoCupom={v.precoVenda}
                            precoReferenciaCupomZero={v.precoSemCupom}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-baseline gap-2 text-sm flex-wrap">
                        <span className="text-neutral-600 dark:text-neutral-300 shrink-0">Lucro na margem</span>
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
                            <span className="text-neutral-600 dark:text-neutral-300">Rebate devolvido (ML)</span>
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
                      <div className="flex min-h-0 overflow-hidden rounded-xl border border-neutral-200/95 dark:border-neutral-700/90 bg-white dark:bg-neutral-950/70 shadow-sm">
                        <div className="w-1.5 shrink-0 bg-emerald-400 dark:bg-emerald-400" aria-hidden />
                        <div className="min-w-0 flex-1 px-3 py-2.5">
                          <div className="flex justify-between items-center gap-3">
                            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 leading-snug">
                              Você recebe{" "}
                              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">(estimado)</span>
                            </span>
                            <span className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300 leading-none shrink-0">
                              {BRL.format(v.recebe)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {v.operacionalBruto != null && (
                        <div className="space-y-0.5 border-t border-neutral-200/80 pt-1 text-xs text-neutral-500 dark:border-neutral-700/80 dark:text-neutral-400">
                          <div className="flex justify-between items-baseline gap-2 min-w-0">
                            <span className="shrink-0">Operacional (pago)</span>
                            <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-100 text-right shrink-0">
                              {BRL.format(v.operacionalBruto)}
                            </span>
                          </div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2 gap-3 md:gap-4">
                  <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm overflow-hidden">
                    <div className="m-3 mb-2 flex min-h-0 overflow-hidden rounded-xl border border-neutral-200/95 dark:border-neutral-700/90 bg-white dark:bg-neutral-950/70 shadow-sm">
                      <div className="w-1.5 shrink-0 bg-emerald-500 dark:bg-emerald-500" aria-hidden />
                      <div className="min-w-0 flex-1 px-3 py-2.5">
                        <PrecoVendaComCupomBlock
                          precoComCampoCupom={resultado.precoVenda}
                          precoReferenciaCupomZero={resultado.efeitoCupom?.precoSemCupom}
                        />
                      </div>
                    </div>
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
                    <div className="min-w-0 flex-1 px-4 py-4 sm:px-5 space-y-1.5">
                      <div className="flex justify-between items-center gap-3 sm:gap-4">
                        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 leading-snug min-w-0">
                          Você recebe{" "}
                          <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">(estimado)</span>
                        </span>
                        <span className="text-2xl sm:text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300 leading-none tracking-tight shrink-0">
                          {BRL.format(resultado.recebe)}
                        </span>
                      </div>
                      {(preset === "tiktok" || preset === "shopee") && (
                        <p className="text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                          Após taxas do canal no pedido (não inclui custo do produto).
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {resultado.modo === "todos" && resultado.porMarketplace.length > 0 && (
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-700/60">
                  <h4 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                    Por marketplace (pedido = o que entra com cupom)
                  </h4>
                </div>
                <table className="w-full table-fixed text-sm lg:text-[13px]">
                  <thead>
                    <tr className="bg-neutral-100 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 text-xs uppercase tracking-wide">
                      <th className="w-[30%] text-left px-2 py-2 font-medium">Marketplace</th>
                      <th className="w-[20%] text-right px-2 py-2 font-medium">Pedido</th>
                      <th className="w-[25%] text-right px-3 py-2 font-medium">Margem</th>
                      <th className="w-[25%] text-right px-3 py-2 font-medium text-emerald-700/90 dark:text-emerald-300/90">Recebe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.porMarketplace.map((mp) => (
                        <tr key={mp.nome} className="border-t border-neutral-200/60 dark:border-neutral-700/60 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-colors">
                          <td className="px-2 py-2.5 text-neutral-900 dark:text-neutral-100 font-medium align-top">
                            <span className="block truncate">{mp.nome}</span>
                            {badgeSeuCanal(mp.nome) && (
                              <span className={cn("block text-xs uppercase mt-0.5", AMBER_PREMIUM_LINK)}>seu canal</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right text-neutral-900 dark:text-neutral-100 tabular-nums align-top">
                            {mp.semOperacional || mp.precoVenda == null ? (
                              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400 block max-w-[130px] ml-auto leading-snug">
                                Preencha o operacional
                              </span>
                            ) : mp.precoSemCupom != null && mp.precoSemCupom > (mp.precoVenda ?? 0) + 0.005 ? (
                              <div className="flex flex-col items-end gap-0.5 leading-tight">
                                <span className="text-sm font-semibold whitespace-nowrap text-emerald-700 dark:text-emerald-300">
                                  Pedido {BRL.format(mp.precoVenda ?? 0)}
                                </span>
                                <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                                  Vitrine {BRL.format(mp.precoSemCupom)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm font-semibold whitespace-nowrap">
                                {BRL.format(mp.precoVenda)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right align-top">
                            {mp.semOperacional || mp.valorLucro == null || mp.precoVenda == null ? (
                              <span className="text-xs text-neutral-500">—</span>
                            ) : (
                              <div className="flex flex-col items-end gap-0.5 tabular-nums text-right leading-tight">
                                <span className="text-emerald-700 dark:text-emerald-300 font-semibold whitespace-nowrap">{BRL.format(mp.valorLucro)}</span>
                                <span className="text-xs font-medium text-emerald-600/95 dark:text-emerald-400/95 whitespace-nowrap">
                                  {mp.precoVenda > 0 ? `${((mp.valorLucro / mp.precoVenda) * 100).toFixed(1)}% margem` : ""}
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
                <details {...(composicaoDesktopAberta ? { open: true } : {})}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-neutral-200/80 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-700/70 dark:text-neutral-400 min-h-[44px] touch-manipulation select-none [&::-webkit-details-marker]:hidden md:min-h-0 md:cursor-default">
                    <span>Composição de custos</span>
                    <span className="shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-medium normal-case text-[var(--primary-blue)] dark:border-neutral-600 dark:bg-neutral-800/80 md:hidden">
                      Ver detalhes
                    </span>
                  </summary>
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
                  {resultado.valorAfiliado > 0 && (
                    <Linha label="Afiliados" sublabel="% do pedido (valor em R$)" valor={resultado.valorAfiliado} red />
                  )}
                  {resultado.valorPerda > 0 && perdaTipo === "pct" && (
                    <Linha label="Perdas/Devoluções" sublabel="%" valor={resultado.valorPerda} red />
                  )}
                  {resultado.valorExtrasPct > 0 && (
                    <Linha label="Outros" sublabel="%" valor={resultado.valorExtrasPct} red />
                  )}
                  {resultado.efeitoCupom &&
                    (resultado.efeitoCupom.cupomPct > 0 || resultado.efeitoCupom.reducaoPreco > 0) && (
                      <div className="border-t border-neutral-200 dark:border-neutral-700/80 px-3 py-2.5">
                        <div className="flex justify-between gap-2 border-b border-dashed border-neutral-200/90 dark:border-neutral-600/50 pb-2 mb-2">
                          <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Cupom na simulação</span>
                          <span className="tabular-nums text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                            {resultado.efeitoCupom.cupomPct > 0 ? `${resultado.efeitoCupom.cupomPct.toFixed(1).replace(/\.0$/, "")}% no canal (resumo)` : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 text-sm font-semibold">
                          <span className="text-emerald-700 dark:text-emerald-300">Pedido entra (com cupom)</span>
                          <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
                            {resultado.precoVenda > 0 ? BRL.format(resultado.precoVenda) : "—"}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 rounded-lg border border-emerald-300/75 dark:border-emerald-700/45 bg-emerald-50/90 dark:bg-emerald-950/35 px-2.5 py-2 mt-1">
                          <span className="text-[13px] sm:text-sm font-semibold text-neutral-800 dark:text-neutral-100 leading-snug">
                            Você deve anunciar na vitrine por:
                          </span>
                          <span className="tabular-nums text-lg sm:text-xl font-bold text-emerald-700 dark:text-emerald-300 shrink-0 text-right">
                            {BRL.format(resultado.efeitoCupom.precoSemCupom)}
                          </span>
                        </div>
                        {resultado.efeitoCupom.reducaoPreco > 0.009 ? (
                          <div className="flex justify-between gap-2 pt-2 mt-2 border-t border-neutral-200/80 dark:border-neutral-700/60 text-xs text-neutral-500 dark:text-neutral-400">
                            <span>Vitrine fica acima (diferença)</span>
                            <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
                              +{BRL.format(resultado.efeitoCupom.reducaoPreco)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}
                </div>
                <details className="border-t border-neutral-200 dark:border-neutral-700/80 bg-neutral-50/90 dark:bg-neutral-900/40 px-3 py-2.5 group">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-[var(--primary-blue)] touch-manipulation select-none [&::-webkit-details-marker]:hidden md:min-h-0">
                    <span className="inline-block text-neutral-400 transition-transform group-open:rotate-90" aria-hidden>
                      ▸
                    </span>
                    Ver texto e fórmulas da conta
                  </summary>
                  <div className="mt-2 pb-1 space-y-2 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    <p>
                      {resultado.efeitoCupom && resultado.efeitoCupom.cupomPct > 0 ? (
                        <>
                          Com cupom, <strong>pedido</strong> é o que o cliente paga; <strong>vitrine</strong> é o anúncio antes do desconto. A composição e a margem % usam o pedido. No comparativo, cada linha usa só o cupom daquele canal.
                        </>
                      ) : (
                        <>
                          O valor principal da simulação é o <strong>pedido</strong> (base da margem e da composição). A <strong>vitrine</strong> só entra quando há cupom no canal (preço cheio antes do desconto).
                        </>
                      )}
                    </p>
                    {resultado.efeitoCupom && resultado.efeitoCupom.cupomPct > 0 ? (
                      <div className="space-y-1.5 border-t border-neutral-200/80 pt-2 font-mono text-xs leading-snug text-neutral-500 dark:border-neutral-700/60 dark:text-neutral-500">
                        <p>
                          receita (pedido c/ cupom) = custos fixos ÷ (1 − (margem + imposto + ADS + afiliados + perdas% + outros% + comissão) ÷ 100)
                        </p>
                        <p>etiqueta vitrine = receita ÷ (1 − cupom% ÷ 100) — ex.: 5% → ÷ 0,95</p>
                      </div>
                    ) : (
                      <p className="border-t border-neutral-200/80 pt-2 font-mono text-xs leading-snug text-neutral-500 dark:border-neutral-700/60 dark:text-neutral-500">
                        receita = custos fixos ÷ (1 − percentuais totais ÷ 100)
                      </p>
                    )}
                  </div>
                </details>
                </details>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm p-4 min-h-[120px] flex items-center justify-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center">Clique em Calcular para ver o resultado.</p>
          </div>
        )}
        </div>

        {usoBloqueadoCalc ? (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto p-4 sm:p-6 bg-black/45 dark:bg-black/60 backdrop-blur-[3px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bloqueio-calc-titulo"
          >
            <div className="relative w-full max-w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100dvh-8rem)] overflow-x-hidden overflow-y-auto rounded-xl border border-emerald-300/60 dark:border-emerald-500/40 bg-white dark:bg-neutral-900 px-4 py-4 shadow-xl ring-1 ring-emerald-500/10 dark:ring-emerald-400/20">
              <div className="absolute inset-x-0 top-0 h-0.5 sm:h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600" aria-hidden />
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300",
                  )}
                  aria-hidden
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="14" x="3" y="7" rx="2" ry="2" />
                    <path d="M8 7V5a4 4 0 0 1 8 0v2" />
                    <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 id="bloqueio-calc-titulo" className="text-base font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
                    Renovar acesso da calculadora
                  </h2>
                  {calcValidoAte ? (
                    <p className="text-xs sm:text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                      Vencido em{" "}
                      <span className="tabular-nums font-medium text-neutral-700 dark:text-neutral-300">
                        {new Date(calcValidoAte).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                Pague o PIX para liberar o acesso. A confirmação é automática em poucos segundos.
              </p>
              {renoMeta && !renoMeta.configurado ? (
                <p
                  className={cn(
                    "mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
                    DANGER_PREMIUM_SURFACE_TRANSPARENT,
                    DANGER_PREMIUM_TEXT_SOFT,
                  )}
                >
                  O valor da renovação ainda não está configurado no servidor (variável{" "}
                  <span className="font-mono text-[11px]">CALCULADORA_RENOVACAO_VALOR</span>). Peça à equipe técnica para
                  configurar antes de gerar o PIX.
                </p>
              ) : null}
              {renoMeta?.configurado && typeof renoMeta.valor === "number" && !renoPixData ? (
                <p className="mt-2 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {BRL.format(renoMeta.valor)} · ciclo mensal
                </p>
              ) : null}
              {renoPixErr ? (
                <p
                  className={cn(
                    "mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
                    DANGER_PREMIUM_SURFACE_TRANSPARENT,
                    DANGER_PREMIUM_TEXT_SOFT,
                  )}
                >
                  {renoPixErr}
                </p>
              ) : null}
              {!renoPixData ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => void gerarPixRenovacao()}
                    disabled={renoPixLoading || (renoMeta !== null && !renoMeta.configurado)}
                    className="w-full sm:w-auto rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                  >
                    {renoPixLoading ? "Gerando PIX…" : "Gerar PIX da renovação"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await supabaseBrowser.auth.signOut();
                      router.replace("/calculadora/login");
                    }}
                    className="w-full sm:w-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:opacity-90 transition-opacity"
                  >
                    Sair da conta
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {BRL.format(renoPixData.valor)}
                    </span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">App do banco</span>
                  </div>
                  {renoPixCountdownSec !== null ? (
                    <div
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-center text-[11px] font-medium tabular-nums border",
                        renoPixCountdownSec <= 60
                          ? cn(AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_SOFT)
                          : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400",
                      )}
                    >
                      {renoPixCountdownSec <= 0 ? (
                        <>QR expirado — toque em &quot;Gerar novo PIX&quot;</>
                      ) : (
                        <>
                          QR válido por{" "}
                          <span className={renoPixCountdownSec <= 60 ? "tabular-nums" : ""}>
                            {Math.floor(renoPixCountdownSec / 60)}:{(renoPixCountdownSec % 60).toString().padStart(2, "0")}
                          </span>
                        </>
                      )}
                    </div>
                  ) : null}
                  <div className="flex justify-center rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-950">
                    {renoPixData.qr_code_base64 ? (
                      <img
                        src={`data:image/png;base64,${renoPixData.qr_code_base64}`}
                        alt="QR Code PIX"
                        className="h-[7.75rem] w-[7.75rem] sm:h-32 sm:w-32 object-contain"
                      />
                    ) : (
                      <p className="text-xs text-neutral-500 px-2">QR indisponível — copie e cole.</p>
                    )}
                  </div>
                  {renoPixData.qr_code ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(renoPixData.qr_code);
                        setRenoPixCopiado(true);
                        window.setTimeout(() => setRenoPixCopiado(false), 2500);
                      }}
                      className="w-full rounded-xl border border-emerald-600 bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors touch-manipulation"
                    >
                      {renoPixCopiado ? "Copiado!" : "Copiar código PIX"}
                    </button>
                  ) : null}
                  <p className="text-center text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                    Após o pagamento, esta página atualiza sozinha.
                  </p>
                  <div className="flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => void gerarPixRenovacao()}
                      disabled={renoPixLoading}
                      className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:opacity-90 disabled:opacity-50"
                    >
                      {renoPixLoading ? "Gerando…" : "Gerar novo PIX"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await supabaseBrowser.auth.signOut();
                        router.replace("/calculadora/login");
                      }}
                      className="rounded-xl border border-[var(--card-border)] px-3 py-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      Sair da conta
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
          </div>
        </div>
      </div>
      <SellerNav active="calculadora" calcOnly={calcOnlyLite} />
    </div>
  );
}

/**
 * `precoComCampoCupom` = valor que o pedido entra com cupom (base da simulação).
 * `precoReferenciaCupomZero` = preço de anúncio na vitrine (antes do cupom).
 */
function PrecoVendaComCupomBlock({
  precoComCampoCupom,
  precoReferenciaCupomZero,
}: {
  precoComCampoCupom: number;
  precoReferenciaCupomZero?: number | null;
}) {
  const temComparativo =
    precoReferenciaCupomZero != null &&
    precoComCampoCupom > 0 &&
    precoReferenciaCupomZero > precoComCampoCupom + 0.005;
  if (!temComparativo) {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Valor do pedido
        </p>
        <p className="mt-0.5 text-2xl sm:text-[1.65rem] font-bold tabular-nums leading-tight text-neutral-900 dark:text-neutral-50 tracking-tight">
          {precoComCampoCupom > 0 ? BRL.format(precoComCampoCupom) : "—"}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">
          Base para lucro e custos % na simulação.
        </p>
      </>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        Pedido entra com cupom
      </p>
      <p className="text-2xl sm:text-[1.65rem] font-bold tabular-nums leading-tight text-emerald-700 dark:text-emerald-300 tracking-tight">
        {BRL.format(precoComCampoCupom)}
      </p>
      <div className="mt-2 rounded-xl border border-emerald-300/80 dark:border-emerald-600/45 bg-emerald-50 dark:bg-emerald-950/45 px-3 py-2.5 sm:px-3.5 sm:py-3 shadow-sm shadow-emerald-900/[0.06] dark:shadow-none ring-1 ring-emerald-600/10 dark:ring-emerald-400/15">
        <p className="text-[13px] sm:text-sm font-semibold text-neutral-800 dark:text-neutral-100 leading-snug">
          Você deve anunciar na vitrine por:
        </p>
        <p className="mt-1.5 text-[1.35rem] sm:text-2xl font-bold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300">
          {BRL.format(precoReferenciaCupomZero)}
        </p>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 leading-snug border-t border-emerald-300/60 dark:border-emerald-900/50 pt-2">
          Valor do anúncio antes do desconto; o pedido paga o valor em destaque acima.
        </p>
      </div>
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
        {unit ? (
          <>
            {/* Mobile: input + R$/% na mesma linha; sm+: contents para encaixar na grid de 3 colunas */}
            <div className="flex flex-row items-center gap-2 min-w-0 sm:contents">
              <div className="min-w-0 flex-1 w-full sm:min-w-0">{children}</div>
              <div className="flex items-center justify-end sm:justify-start shrink-0">
                <span className={unitBadge}>{unit}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="min-w-0 w-full sm:col-span-2">{children}</div>
        )}
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
        {sublabel && <span className="text-[13px] leading-snug text-neutral-500 dark:text-neutral-500">{sublabel}</span>}
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
