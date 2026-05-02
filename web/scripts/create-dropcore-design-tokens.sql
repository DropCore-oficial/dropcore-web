-- Paleta oficial DropCore — verdes UI (escala emerald Tailwind) + verde logo isolado + alertas âmbar (referência em código).
-- Execute no SQL Editor do Supabase (service role). Idempotente.

CREATE TABLE IF NOT EXISTS public.dropcore_design_tokens (
  id text PRIMARY KEY DEFAULT 'v1',
  descricao text NOT NULL DEFAULT 'Paleta UI DropCore',
  tokens jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dropcore_design_tokens IS
  'Tokens de cor da marca: verde UI = escala emerald; verde #22C55E só no componente DropCoreLogo; alertas = âmbar; azul CTA = #0078D4 em globals.css / dropcorePalette.ts';

INSERT INTO public.dropcore_design_tokens (id, descricao, tokens)
VALUES (
  'v1',
  'DropCore — verdes sistema + logo + âmbar + azul CTA',
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
      "nota": "Avisos e pendências — não misturar com a escala emerald de ação/positivo."
    },
    "ui_blue": {
      "primaria_acao": {
        "hex": "#0078D4",
        "hover_hex": "#106ebe",
        "css_vars": ["--primary-blue", "--primary-blue-hover"],
        "fonte_codigo": "web/lib/dropcorePalette.ts (PRIMARY_ACTION_BLUE_HEX)",
        "nota": "CTAs azuis e focos que substituem o Tailwind blue-600; não confundir com emerald de produto."
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
