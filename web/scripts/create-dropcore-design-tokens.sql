-- Paleta oficial DropCore — verdes UI (escala emerald Tailwind) + verde logo isolado + alertas âmbar (referência em código).
-- Execute no SQL Editor do Supabase (service role). Idempotente.

CREATE TABLE IF NOT EXISTS public.dropcore_design_tokens (
  id text PRIMARY KEY DEFAULT 'v1',
  descricao text NOT NULL DEFAULT 'Paleta UI DropCore',
  tokens jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dropcore_design_tokens IS
  'Tokens de cor da marca: verde UI = escala emerald; verde #22C55E só no DropCoreLogo; alertas = âmbar; azul CTA = #0078D4; perigo = #EF4444 (--danger) em globals.css / dropcorePalette.ts / semanticPremium.ts';

INSERT INTO public.dropcore_design_tokens (id, descricao, tokens)
VALUES (
  'v1',
  'DropCore — verdes sistema + logo + âmbar + azul CTA + perigo',
  '{
    "versao": 1,
    "logo": {
      "hex": "#22C55E",
      "tailwind_approx": "green-500",
      "uso": "Somente DropCoreLogo.tsx — não usar em botões, KPIs nem outros componentes."
    },
    "ui_green": {
      "familia": "tailwind_emerald",
      "nota": "Padronizar novos componentes com estes steps; fundos podem usar opacidade (/10, /40) sobre o mesmo tom.",
      "escala": {
        "50": "#ecfdf5",
        "100": "#d1fae5",
        "300": "#6ee7b7",
        "400": "#34d399",
        "500": "#10b981",
        "600": "#059669",
        "700": "#047857",
        "900": "#064e3b",
        "950": "#022c22"
      },
      "opacidades_permitidas_sufixo": ["5","10","15","20","25","30","35","40","45","50","55","60","65","70","75","80","85","90","95"]
    },
    "alertas": {
      "familia": "amber_premium",
      "fonte_codigo": "web/lib/amberPremium.ts",
      "componentes": ["Alert variant=warning", "AmberPremiumCallout"],
      "nota": "Avisos e pendências — não misturar com a escala emerald de ação/positivo.",
      "hierarquia_texto_kpi_aviso": {
        "funcao": "amberPremiumWarningMainTextClass(value)",
        "regra": "Valor principal em cartão/KPI no tom warning: SOFT para métricas e estados genéricos; PRIMARY só para o texto literal Pendente (após trim). Subtítulo: AMBER_PREMIUM_TEXT_SECONDARY."
      }
    },
    "ui_blue": {
      "primaria_acao": {
        "hex": "#0078D4",
        "hover_hex": "#106ebe",
        "css_vars": ["--primary-blue", "--primary-blue-hover"],
        "fonte_codigo": "web/lib/dropcorePalette.ts (PRIMARY_ACTION_BLUE_HEX)",
        "nota": "CTAs azuis e focos que substituem o Tailwind blue-600; não confundir com emerald de produto."
      }
    },
    "ui_danger": {
      "base": {
        "hex": "#EF4444",
        "tailwind_approx": "red-500",
        "css_var": "--danger",
        "fonte_codigo": "web/lib/dropcorePalette.ts (DANGER_HEX), web/lib/semanticPremium.ts (DANGER_PREMIUM_*)",
        "nota": "Erro, perigo, valores negativos de KPI quando o papel é alerta — superfícies com opacidade sobre var(--danger); texto via DANGER_PREMIUM_TEXT_*; não espalhar #991b1b nem rose-* para o mesmo papel."
      },
      "tailwind_red_steps_ui": ["300", "400", "500", "600", "950"],
      "seller_dashboard_saldo_critico": {
        "fonte_codigo": "web/lib/dangerSellerSaldoCriticoUi.ts",
        "sem_rosa_rose": true,
        "claro": {
          "cartao": "border-[var(--danger)]/55 bg-transparent shadow-sm shadow-red-500/10",
          "barra_lateral": "from-[var(--danger)] to-red-600 opacity-95",
          "icone_moldura": "border-[var(--danger)]/35 bg-[var(--danger)]/10",
          "icone_traco": "text-[var(--danger)]",
          "titulo": "text-[var(--danger)]",
          "cta": "bg-[var(--danger)] hover:opacity-90"
        },
        "escuro": {
          "cartao": "dark:border-red-400/55 dark:bg-transparent dark:shadow-none",
          "barra_lateral": "dark:from-red-400 dark:to-red-500 dark:opacity-100",
          "icone_moldura": "dark:border-red-400/55 dark:bg-transparent",
          "icone_traco": "dark:text-red-300",
          "titulo": "dark:text-red-300",
          "corpo": "text-neutral-600 dark:text-neutral-300",
          "cta": "dark:bg-red-500 dark:hover:bg-red-400 dark:shadow-sm dark:shadow-red-950/50 dark:ring-inset dark:ring-white/20"
        },
        "opacidades_var_danger": ["/55", "/35", "/10"],
        "opacidades_red_tailwind": ["/55", "/50", "/10"]
      }
    }
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  tokens = EXCLUDED.tokens,
  atualizado_em = now();

ALTER TABLE public.dropcore_design_tokens ENABLE ROW LEVEL SECURITY;

-- Leitura pública: paleta não é dado sensível (só referência)
DROP POLICY IF EXISTS "dropcore_design_tokens_select_all" ON public.dropcore_design_tokens;
CREATE POLICY "dropcore_design_tokens_select_all"
  ON public.dropcore_design_tokens
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Sem política de INSERT/UPDATE para roles — manutenção via SQL Editor / service role
