/**
 * Termômetro de reputação — réplica fiel do próprio Mercado Livre
 * (vendedores.mercadolivre.com.br/reputacao), cores extraídas via DevTools 2026-10-07
 * (cada segmento é um `path` SVG com `fill` + `fill-opacity: 0.2` nos inativos, `1` no
 * ativo). **Exceção deliberada** à paleta travada do DropCore (`dropcorePalette.ts`): aqui a
 * cor não é decisão de UI nossa, é a identidade visual do próprio ML — pedido explícito do
 * Sr Stark pra bater exato, não aproximar com emerald/âmbar/vermelho. Usado no hub
 * (`SellerGestorReputacaoAtendimentoPanel.tsx`) e no avulso
 * (`app/seller/gestores-ia-avulso/amanda/page.tsx`).
 */
const ML_REPUTACAO_CORES = ["#F23D4F", "#FFB657", "#FEF211", "#AEEF1B", "#00A650"] as const;

/** `nivel` vem cru da API do ML (`level_id`), formato `"5_green"`/`"3_yellow"`/etc — só o
 * dígito importa pra saber qual dos 5 segmentos fica ativo. */
function nivelParaIndice(nivel: string | null): number | null {
  if (!nivel) return null;
  const m = nivel.match(/^(\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 5 ? n : null;
}

export function ReputacaoTermometro({ nivel }: { nivel: string | null }) {
  const ativo = nivelParaIndice(nivel);
  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={ativo ? `Nível de reputação ${ativo} de 5` : "Nível de reputação ainda não calculado"}
    >
      {ML_REPUTACAO_CORES.map((cor, i) => (
        <span
          key={cor}
          className="h-2.5 w-7 shrink-0 rounded-full sm:w-9"
          style={{ backgroundColor: cor, opacity: ativo === i + 1 ? 1 : 0.2 }}
          aria-hidden
        />
      ))}
    </div>
  );
}
