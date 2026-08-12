/** Usado no rodapé geral do site (SiteFooter.tsx). */
export const LANDING_SALES_EMAIL = "contato@dropcore.com.br";

export const LANDING_SALES_WHATSAPP_NUMBER = "5562991739631";
export const LANDING_SALES_WHATSAPP_DISPLAY = "(62) 99173-9631";
const LANDING_WHATSAPP_DEFAULT_MESSAGE = "Olá! Quero saber mais sobre virar seller na DropCore.";

/** Topo (1º contato, quem só chegou): pedido mais frio, por isso separado de "Entrar"
 * (login de quem já é seller) que fica ao lado — os dois eram quase homônimos ("Entrar" /
 * "Quero entrar") e confundiam visitante novo com seller já cadastrado. */
export const LANDING_CTA_HEADER_LABEL = "Solicitar acesso";

/** Hero: ecoa a chamada falada no vídeo do hero ("cadastre-se agora e comece a vender") sem
 * prometer autoatendimento — o acesso continua sendo por convite (ver FAQ), o WhatsApp é quem
 * de fato inicia isso. */
export const LANDING_CTA_HERO_LABEL = "Comece a vender agora";

/** Final: quem rolou a página inteira e já entendeu a mecânica de convite (ver FAQ). Volta pro
 * mesmo verbo do resto da página ("vender") em vez de "acesso" — a página inteira treina o
 * visitante em "Você vende" / "Comece a vender agora", trocar o verbo bem no último botão
 * quebrava essa régua. Todos os CTAs de venda da página (header, hero, CTA intermediário e
 * este) apontam pra essa mesma mensagem — um único destino de conversão, não um por botão. */
export const LANDING_CTA_FINAL_LABEL = "Quero começar a vender";
export const LANDING_CTA_FINAL_MESSAGE = "Olá! Terminei de ver a DropCore e quero começar a vender.";

/** "Parceiros", não "Integra com" — Olist e Bling têm integração operacional real (sync de
 * estoque/pedido). Mercado Pago saiu daqui: é só a conta de pagamento usada pro PIX, não uma
 * integração operacional como as outras duas, misturar os três dava a entender uma paridade
 * que não existe. Logos oficiais em `public/brand/partners/`. */
export const LANDING_INTEGRATIONS_BAR = {
  label: "Parceiros do DropCore",
  items: [
    { name: "Olist", logo: "/brand/partners/olist.svg" },
    { name: "Bling", logo: "/brand/partners/bling.svg" },
  ],
} as const;

/** Só os 4 marketplaces que a calculadora (`web/app/seller/calculadora/page.tsx`) de fato
 * suporta hoje — não é uma lista aspiracional/genérica, é o que o produto atende. Logos
 * oficiais em `public/brand/marketplaces/`. */
export const LANDING_MARKETPLACES_BAR = {
  label: "Marketplaces atendidos",
  items: [
    { name: "Mercado Livre", logo: "/brand/marketplaces/mercado-livre.svg" },
    { name: "Shopee", logo: "/brand/marketplaces/shopee.svg" },
    { name: "Shein", logo: "/brand/marketplaces/shein.svg" },
    { name: "TikTok Shop", logo: "/brand/marketplaces/tiktok-shop.png" },
  ],
} as const;

export const LANDING_HERO = {
  title: "Você vende.",
  titleAccent: "A gente cuida do resto.",
  subtitle: "Estoque, fornecedor e financeiro rodam sozinhos.",
  subtitleHighlight: "Você só foca em vender e ganhar dinheiro.",
} as const;

/** Primeiro item é prova social real (volume processado), não descrição de feature como os
 * outros três — de propósito na frente, é o número mais concreto que a página tem. Ajustar
 * o valor aqui conforme atualizar. */
export const LANDING_HERO_PROOF = [
  { value: "50 mil+", label: "Pedidos já enviados", detail: "Volume real processado na plataforma" },
  { value: "Estoque", label: "Gerido pelo fornecedor parceiro", detail: "Você nunca compra nem armazena nada" },
  { value: "Postagem e SLA", label: "Monitorados automaticamente", detail: "Atraso aparece sinalizado, sem você cobrar" },
] as const;

/** Vídeo curto explicando o que o DropCore faz — substitui o mock estático do painel de
 * pedido no hero. Auto-hospedado no bucket `landing-assets` (Supabase Storage), não YouTube
 * — sem casca de player de terceiro, só o vídeo com a legenda já queimada nele. Poster
 * (thumbnail) + `preload="none"` no `<video>` evitam baixar o arquivo antes do clique, ver
 * `HeroVideoPanel`. 16:9 único pra qualquer largura — sem corte mobile separado nem modal
 * (já teve as duas coisas; simplificado de volta porque o vídeo agora é conteúdo inline no
 * fluxo da página, não um "visual de destaque" que precisasse de tela cheia). */
const LANDING_ASSETS_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/landing-assets`;
export const LANDING_HERO_VIDEO = {
  src: `${LANDING_ASSETS_BASE}/hero.mp4`,
  poster: `${LANDING_ASSETS_BASE}/hero-poster.jpg`,
  title: "Como funciona o DropCore",
} as const;

export const LANDING_INLINE_CTA = {
  title: "Já deu pra ver a diferença?",
  subtitle: "Sem planilha, sem cobrar fornecedor — só o catálogo, o pedido e o repasse rodando sozinhos.",
  label: "Chega de operar sozinho",
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
  },
  steps: {
    title: "Como o DropCore entra na sua rotina",
  },
  flow: {
    title: "O que acontece a cada pedido",
    subtitle: "Do clique do cliente ao dinheiro no seu saldo — automático, sem você tocar em nada.",
  },
  fit: {
    /** Espaço fixo (não quebra linha) entre "não" e "é)" — sem isso, no mobile a quebra caía
     * bem no meio, deixando um "é)" sozinho e torto na 2ª linha. */
    title: "Pra quem é (e pra quem não é)",
  },
  faq: {
    title: "Perguntas de quem vai soltar a mão da operação",
  },
} as const;

/** `recap`: reforço rápido bem em cima do botão — quem chegou até aqui já leu tudo isso lá em
 * cima, mas pode não lembrar mais depois de rolar a página inteira; não é claim nova, só
 * repete o que já foi provado antes (hero e comparação). `reassurance`: reduz a hesitação de
 * abrir uma conversa de WhatsApp com empresa desconhecida — deixa claro que é só isso, sem
 * compromisso nenhum em clicar. */
export const LANDING_FINAL_CTA = {
  title: "Pare de operar. Comece a vender.",
  subtitle: "Comece agora e deixe ",
  subtitleHighlight: "estoque, postagem e financeiro com a gente.",
  recap: ["50 mil+ pedidos enviados", "Postagem e SLA monitorados", "Repasse automático no saldo"],
  reassurance: "Sem compromisso — ",
  reassuranceHighlight: "é só uma conversa no WhatsApp.",
} as const;

export function landingSalesWhatsapp(message = LANDING_WHATSAPP_DEFAULT_MESSAGE): string {
  return `https://wa.me/${LANDING_SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
