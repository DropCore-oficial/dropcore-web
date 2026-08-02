/** Usado no rodapé geral do site (SiteFooter.tsx) e também no rodapé próprio da landing. */
export const LANDING_SALES_EMAIL = "contato@dropcore.com.br";

export const LANDING_FOOTER_LINKS = [
  { label: "Sobre", href: "/sobre" },
  { label: "Termos de Uso", href: "/termos-de-uso" },
  { label: "Política de Privacidade", href: "/privacidade" },
  { label: "Central de Ajuda", href: "/central-de-ajuda" },
] as const;

export const LANDING_SALES_WHATSAPP_NUMBER = "5562991739631";
export const LANDING_SALES_WHATSAPP_DISPLAY = "(62) 99173-9631";
const LANDING_WHATSAPP_DEFAULT_MESSAGE = "Olá! Quero saber mais sobre virar seller na DropCore.";

export const LANDING_CTA_HEADER_LABEL = "Quero entrar";
export const LANDING_CTA_HERO_LABEL = "Quero vender assim";
export const LANDING_CTA_FINAL_LABEL = "Vamos conversar";
export const LANDING_CTA_SECONDARY_LABEL = "Acessar painel";

export const LANDING_INTEGRATIONS_BAR = {
  label: "Integra com",
  items: ["Olist", "Bling", "Mercado Pago"],
} as const;

export const LANDING_HERO = {
  eyebrow: "Pra seller que quer vender, não virar operador de logística",
  title: "Você vende.",
  titleAccent: "A gente cuida do resto.",
  subtitle:
    "Estoque, fornecedor, postagem e financeiro rodam sozinhos no DropCore. Você anuncia, atende o cliente e foca no que faz o negócio crescer.",
} as const;

export const LANDING_HERO_PROOF = [
  { value: "Estoque", label: "gerido pelo fornecedor parceiro", detail: "Você nunca compra nem armazena nada" },
  { value: "Postagem e SLA", label: "monitorados automaticamente", detail: "Atraso aparece sinalizado, sem você cobrar" },
  { value: "1 painel", label: "saldo, pedido e repasse", detail: "Sem planilha paralela" },
] as const;

export const LANDING_HERO_ORDER_TRACKER = {
  title: "Acompanhamento de pedido",
  orderLabel: "#DJU100047",
  steps: [
    { label: "Recebido", detail: "Pedido do marketplace importado automaticamente" },
    { label: "Postado", detail: "Fornecedor parceiro embalou e postou dentro do SLA" },
    { label: "Entregue", detail: "Confirmado pelo marketplace" },
    { label: "Repasse liberado", detail: "Valor disponível no seu painel" },
  ],
  footnote: "Do pedido ao repasse, sem você tocar em planilha.",
} as const;

export const LANDING_INLINE_CTA = {
  title: "Já deu pra ver a diferença?",
  subtitle: "Sem planilha, sem cobrar fornecedor — só o catálogo, o pedido e o repasse rodando sozinhos.",
  label: "Chega de operar sozinho",
  whatsappMessage: "Olá! Vi a comparação de como funciona o DropCore e quero saber mais.",
} as const;

export const LANDING_COMPARISON = [
  {
    before: "Você negocia, cobra e reconcilia fornecedor sozinho",
    after: "O fornecedor parceiro já está integrado e monitorado por SLA.",
  },
  {
    before: "Você compra, estoca e embala o produto",
    after: "O parceiro estoca, embala e posta — você só acompanha.",
  },
  {
    before: "Você concilia saldo, PIX e repasse na mão",
    after: "Saldo, crédito e repasse automáticos num painel só.",
  },
] as const;

export const LANDING_STEPS = [
  {
    step: "1",
    title: "Escolha o catálogo pronto",
    body: "Produtos com SKU e estoque real do fornecedor parceiro — sem negociar nada.",
  },
  {
    step: "2",
    title: "Anuncie e venda",
    body: "Publica no marketplace e atende o cliente. O resto é com a gente.",
  },
  {
    step: "3",
    title: "A gente cuida do resto",
    body: "Estoque reserva, fornecedor posta, você acompanha até o repasse.",
  },
] as const;

export const LANDING_FLOW = [
  { icon: "cart", title: "Cliente compra", detail: "Pedido cai automático do marketplace no seu painel, sem você digitar nada." },
  { icon: "package", title: "Fornecedor separa e posta", detail: "Estoque, embalagem e postagem com o parceiro, dentro do SLA combinado." },
  { icon: "truck", title: "Pedido é entregue", detail: "Confirmado pelo marketplace — você acompanha, não precisa cobrar ninguém." },
  { icon: "wallet", title: "Repasse no seu saldo", detail: "Valor liberado automaticamente no painel, pronto pra você usar." },
] as const;

export const LANDING_FOR_WHOM = {
  yes: [
    "Seller que quer focar 100% em vender e anunciar",
    "Quem não quer virar operador de estoque e logística",
    "Quem quer previsibilidade sem planilha paralela",
  ],
  no: [
    "Quem quer controlar e negociar cada etapa da operação na mão",
    "Quem prefere fornecedor próprio fora de um fluxo integrado",
    "Quem não vende em marketplace nem usa ERP",
  ],
} as const;

export const LANDING_FAQ = [
  {
    q: "Preciso manter estoque próprio?",
    a: "Não. Você vende a partir do catálogo do armazém parceiro. Estoque físico, separação e envio são responsabilidade do parceiro logístico.",
  },
  {
    q: "Existe SLA de postagem, e se o pedido atrasar ou travar?",
    a: "Sim. Cada fornecedor parceiro tem um SLA de postagem definido; pedidos que passam do prazo ou travam por outro motivo (aguardando estoque, bloqueado etc.) aparecem sinalizados no seu painel — você vê onde está o problema em vez de esperar o cliente reclamar ou precisar cobrar manualmente.",
  },
  {
    q: "Como funciona o saldo?",
    a: "Cada pedido debita do saldo conforme o custo DropCore. Recarregue via PIX no painel.",
  },
  {
    q: "Como obtenho acesso?",
    a: "O acesso é por convite. Após cadastro, você já opera com catálogo e painel de seller.",
  },
  {
    q: "Há integração com ERP?",
    a: "Sim. Olist/Tiny e Bling com fluxo operacional organizado.",
  },
  {
    q: "Posso trocar de fornecedor depois?",
    a: "Sim, com um período mínimo de vínculo (normalmente 3 meses) antes da troca livre — protege a estabilidade do seu catálogo contra trocas por impulso.",
  },
] as const;

export const LANDING_SECTIONS = {
  comparison: {
    title: "O que trava o seller antes de vender",
    subtitle: "Sem estrutura, você vira operador de estoque e financeiro em vez de vendedor.",
  },
  steps: {
    title: "Como o DropCore entra na sua rotina",
    subtitle: "3 etapas pra você só vender — o resto roda sozinho.",
  },
  flow: {
    title: "O que acontece a cada pedido",
    subtitle: "Do clique do cliente ao dinheiro no seu saldo — automático, sem você tocar em nada.",
  },
  fit: {
    title: "Pra quem é (e pra quem não é)",
    subtitle: "Melhor alinhar expectativa antes de começar.",
  },
  faq: {
    title: "Perguntas de quem vai soltar a mão da operação",
    subtitle: "As dúvidas que aparecem antes de confiar o operacional pra gente.",
  },
} as const;

export const LANDING_FINAL_CTA = {
  title: "Pare de operar. Comece a vender.",
  subtitle: "Solicite o convite e deixe estoque, postagem e financeiro com a gente.",
  riskNote: "O único compromisso mínimo é com o fornecedor escolhido (normalmente 3 meses) — depois disso, troca livre.",
} as const;

export function landingSalesWhatsapp(message = LANDING_WHATSAPP_DEFAULT_MESSAGE): string {
  return `https://wa.me/${LANDING_SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
