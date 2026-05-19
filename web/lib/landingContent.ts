import {
  VALOR_DEFAULT_MENSALIDADE_SELLER,
  VALOR_DEFAULT_MENSALIDADE_SELLER_PRO,
} from "@/lib/sellerPlanoPrecos";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const LANDING_SALES_EMAIL = "contato@dropcore.com.br";

export const LANDING_CTA_PRIMARY_LABEL = "Começar com R$ 500";
export const LANDING_CTA_SECONDARY_LABEL = "Acessar painel";
export const LANDING_CTA_MAIL_SUBJECT = "Convite seller — DropCore";

export const LANDING_HERO = {
  eyebrow: "Para seller de marketplace que quer escalar sem travar caixa",
  title: "Pare de enterrar dinheiro em estoque.",
  titleAccent: "Comece com capital enxuto e venda de forma profissional.",
  subtitle:
    "No DropCore, você não precisa de lote grande para entrar no jogo. Opera com saldo inicial, catálogo habilitado e fluxo previsível para escalar com menos risco.",
} as const;

export const LANDING_HERO_PROOF = [
  { value: "Capital de entrada", label: "a partir de R$ 500", detail: "Em vez de lote alto no início" },
  { value: "Fluxo único", label: "pedido + saldo + operação", detail: "Sem controle disperso" },
  { value: "Escala mais segura", label: "com menos exposição de caixa", detail: "Você cresce sem imobilizar tanto" },
] as const;

export const LANDING_HERO_IMPACT = {
  title: "Sem DropCore, você paga essa conta todo dia:",
  items: [
    {
      label: "Capital travado em estoque grande antes da primeira escala",
      detail: "Dinheiro parado e risco alto de giro lento",
    },
    {
      label: "Pouca verba para operação e anúncio",
      detail: "Você compra produto, mas não sobra caixa para acelerar venda",
    },
    {
      label: "Crescimento limitado pelo caixa imobilizado",
      detail: "Escala depende de estoque, não de estratégia",
    },
  ],
  footnote: "Estoque pesado no início costuma matar o caixa antes da escala.",
} as const;

export const LANDING_HERO_SIMULATION = {
  title: "Simulação de entrada",
  leftTitle: "Modelo tradicional",
  leftItems: [
    "Compra lote inicial alto",
    "Caixa travado antes de validar oferta",
    "Menos margem para mídia e operação",
  ],
  rightTitle: "Modelo com DropCore",
  rightItems: [
    "Entrada com saldo inicial enxuto",
    "Mais caixa para vender e girar operação",
    "Escala conforme a demanda responde",
  ],
  footnote:
    "*Exemplo de posicionamento comercial. O valor inicial pode variar conforme operação e estratégia do seller.",
} as const;

export const LANDING_ENTRY_CAPITAL = {
  badge: "Entrada enxuta",
  title: "Você não precisa de estoque pesado para começar",
  highlight: "A partir de R$ 500 de saldo inicial",
  subtitle:
    "Menos dinheiro parado em produto, mais fôlego para validar oferta e acelerar venda.",
  points: [
    "Menos capital imobilizado no início",
    "Mais caixa para operação e mídia",
    "Mais velocidade para testar e ajustar",
  ],
} as const;

export const LANDING_COMPARISON = [
  {
    before: "Você compra estoque alto para começar",
    after: "Você entra com saldo inicial e valida antes de expandir.",
  },
  {
    before: "Seu caixa fica preso em produto parado",
    after: "Seu caixa fica livre para operação e crescimento.",
  },
  {
    before: "Você assume risco alto antes de provar demanda",
    after: "Você reduz risco e escala com previsibilidade.",
  },
] as const;

export const LANDING_PAIN_SIGNALS = [
  {
    title: "Você vende, mas o caixa não acompanha",
    body: "Cada expansão depende de nova compra de estoque.",
  },
  {
    title: "Você decide no escuro",
    body: "Sem fluxo centralizado, você não sabe quando acelerar.",
  },
  {
    title: "Seu risco cresce antes da sua margem",
    body: "Você investe antes de validar uma rotina de escala.",
  },
] as const;

export const LANDING_STEPS = [
  {
    step: "1",
    title: "Entre com capital enxuto",
    body: "Comece com saldo inicial e evite travar caixa em estoque.",
  },
  {
    step: "2",
    title: "Venda e gire com controle",
    body: "Pedido, saldo e operação no mesmo fluxo.",
  },
  {
    step: "3",
    title: "Escalone sem prender capital",
    body: "Com demanda validada, você cresce com menos exposição.",
  },
] as const;

export const LANDING_FEATURES = [
  {
    title: "Entrada de baixo atrito",
    body: "Você começa com estrutura sem compra massiva no dia zero.",
  },
  {
    title: "Fluxo financeiro previsível",
    body: "Saldo e débito por pedido para visibilidade real de caixa.",
  },
  {
    title: "Pedido rastreável",
    body: "Menos improviso e retrabalho na operação.",
  },
  {
    title: "Integração com seu stack",
    body: "Olist/Tiny e Bling ligados ao fluxo para reduzir ruído.",
  },
] as const;

export const LANDING_FOCUS = [
  "Menos dinheiro parado em estoque",
  "Mais capacidade de testar oferta e escalar",
  "Mais previsibilidade de caixa na operação",
  "Mais controle para crescer com consistência",
] as const;

export const LANDING_FIRST_30_DAYS = [
  "Semana 1: entrada com saldo inicial e setup de operação",
  "Semana 2: pedido centralizado e rotina executável",
  "Semana 3: leitura de caixa e ritmo de giro",
  "Semana 4: base pronta para escalar com menos exposição",
] as const;

export const LANDING_FOR_WHOM = {
  yes: [
    "Seller que quer começar sem lote alto de estoque",
    "Operação que precisa preservar caixa para crescer",
    "Time que quer rotina de escala com processo",
  ],
  no: [
    "Quem prefere crescer só com compra massiva de estoque",
    "Quem não quer controle operacional e financeiro",
    "Quem está confortável em operar no improviso",
  ],
} as const;

export const LANDING_PLANS = [
  {
    id: "start",
    name: "Start",
    badge: "Para começar",
    priceLabel: BRL.format(VALOR_DEFAULT_MENSALIDADE_SELLER),
    period: "por mês",
    description: "Para validar operação e começar com controle.",
    features: [
      "Até 15 combinações produto + cor",
      "Saldo, extrato e recarga PIX",
      "Pedidos com SKU do catálogo",
      "Painel financeiro e de pedidos",
    ],
    highlighted: false,
    cta: "Solicitar Start",
  },
  {
    id: "pro",
    name: "Pro",
    badge: "Recomendado",
    priceLabel: BRL.format(VALOR_DEFAULT_MENSALIDADE_SELLER_PRO),
    period: "por mês",
    description: "Para sellers em escala com foco em margem e volume.",
    features: [
      "Tudo do plano Start",
      "Receita, custo e margem no painel",
      "Analytics ampliados",
      "Mais catálogo habilitado",
    ],
    highlighted: true,
    cta: "Solicitar Pro",
  },
] as const;

export const LANDING_FAQ = [
  {
    q: "Preciso manter estoque próprio?",
    a: "Não. Você vende a partir do catálogo do armazém parceiro. Estoque físico, separação e envio são responsabilidade do parceiro logístico.",
  },
  {
    q: "Como obtenho acesso?",
    a: "O acesso é por convite. Após cadastro, você já opera com catálogo e painel de seller.",
  },
  {
    q: "Como funciona o saldo?",
    a: "Cada pedido debita do saldo conforme o custo DropCore. Recarregue via PIX no painel.",
  },
  {
    q: "Há integração com ERP?",
    a: "Sim. Olist/Tiny e Bling com fluxo operacional organizado.",
  },
  {
    q: "Qual plano escolher?",
    a: "O Start atende quem está estruturando a operação. O Pro é indicado para quem já vende em volume e precisa de analytics e mais catálogo.",
  },
] as const;

export const LANDING_SECTIONS = {
  comparison: {
    title: "A conta que o seller paga antes de vender",
    subtitle: "Sem estrutura, o caixa sofre antes da receita maturar.",
  },
  steps: {
    title: "Como o DropCore entra na sua rotina",
    subtitle: "3 etapas para começar enxuto e escalar com controle.",
  },
  features: {
    title: "O que torna isso indispensável",
    subtitle: "Sem essa base, sua operação cresce frágil.",
  },
  focus: {
    title: "O que muda na prática",
    subtitle: "Você sai do improviso e ganha controle de caixa e execução.",
  },
  plans: {
    title: "Planos para estágio de operação",
    subtitle: "Entre com estrutura sem depender de estoque alto.",
  },
  faq: {
    title: "Perguntas estratégicas de seller",
    subtitle: "As dúvidas que travam a decisão.",
  },
} as const;

export const LANDING_FINAL_CTA = {
  title: "Comece com pouco caixa. Escale com estrutura.",
  subtitle:
    "Solicite o convite e veja o DropCore em ação na sua operação.",
} as const;

export function landingSalesMailto(subject = LANDING_CTA_MAIL_SUBJECT): string {
  return `mailto:${LANDING_SALES_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
