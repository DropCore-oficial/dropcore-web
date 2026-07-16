---
name: dropcore-layout
description: Padrão visual/layout do DropCore — paleta de cores travada (emerald, âmbar, sucesso/erro/info, perigo), modal sempre centralizado e mobile obrigatório. Use SEMPRE antes de criar ou alterar qualquer UI neste repo — página, componente, modal, card, badge, cor, tabela — para seguir o mesmo padrão em vez de estilizar de memória ou inventar classes ad hoc.
---

# Layout DropCore

Este projeto já tem um design system travado. As fontes de verdade abaixo (`web/lib/*.ts`)
não são sugestão — são regra. **Nunca** hardcodar HEX, criar combinação de cor nova ad hoc
numa página, ou copiar padrão de outro projeto/framework. Se a cor/padrão que você precisa
não existir nesses arquivos, pare e pergunte antes de inventar.

Detalhe completo de cada regra (com exemplos e o que é proibido) está em
`.cursor/rules/*.mdc` na raiz do repo — este SKILL é o resumo acionável; em caso de dúvida
fina (step exato, opacidade permitida), abra o `.mdc` correspondente ou o arquivo `web/lib/`.

## 1. Cores — fonte única, nunca ad hoc

| Papel | Fonte única | Regra rápida |
|---|---|---|
| Verde da marca (UI) | `web/lib/dropcorePalette.ts` (`EMERALD_SCALE`) | Só steps `50,100,300,400,500,600,700,900,950`. Proibido `emerald-200`, `emerald-800`, `green-*`, `lime-*`, `teal-*`, hex verde solto. Opacidade só as listadas em `ALLOWED_EMERALD_OPACITIES` (de `/5` a `/95`). |
| Logo | `LOGO_GREEN_HEX` (`#22C55E`) / `DropCoreLogo.tsx` | Exclusivo do logo — nunca em badge, link ou KPI. |
| Azul de ação (CTA/links de sistema) | `PRIMARY_ACTION_BLUE_HEX` em `dropcorePalette.ts` + `--primary-blue` | Não usar `blue-600`/`blue-700` cru; não confundir com emerald de sucesso. |
| Âmbar (alerta/atenção) | `web/lib/amberPremium.ts` (`AMBER_PREMIUM_*`) | Nunca emerald para esse papel. Import `AMBER_PREMIUM_SURFACE_TRANSPARENT` etc. em vez de escrever `border-*`/`dark:border-*` na mão. KPI de alerta usa `amberPremiumWarningMainTextClass(value)`, não lógica duplicada na página. |
| Sucesso / erro / info (sistema) | `web/lib/semanticPremium.ts` (`SUCCESS_*`, `DANGER_*`, `INFO_*`) | Não misturar com a escala emerald de produto. Preferir componentes `Alert`/`Badge` já ligados a esses tokens. |
| Vermelho/perigo | `DANGER_HEX` / `var(--danger)` (`#EF4444`) | Steps `red-*` permitidos: `300,400,500,600,950`. Proibido `rose-*`, `pink-*`, `#991b1b`, `#dc2626` soltos. Botão perigo genérico: `bg-[var(--danger)]` + `hover:opacity-90`. |

Cor nova só depois de atualizar `dropcorePalette.ts` + Supabase `dropcore_design_tokens` (+ `ALLOWED_EMERALD_OPACITIES`/`ui_blue`/`ui_danger`/`globals.css` conforme o papel) — nunca só na página.

## 2. Componentes — mesma forma nas 3 áreas (admin / fornecedor / seller)

As três dashboards (`web/app/dashboard/page.tsx`, `web/app/fornecedor/dashboard/page.tsx`,
`web/app/seller/dashboard/page.tsx`) usam **literalmente as mesmas classes** pra cada peça —
isso é intencional (o próprio código do seller tem o comentário "mesmo cartão do painel
fornecedor"), não coincidência. Reutilizar essas strings ao criar componente novo em
qualquer área, em vez de desenhar um formato próprio:

| Peça | Classes exatas |
|---|---|
| Header (card do topo) | `rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5 shadow-sm overflow-visible` |
| Card de seção | `rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden` |
| Ícone circular/quadrado (dentro de card) | `flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400` |
| Badge/pill de destaque | `rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white` |
| Botão primário | `rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-semibold shadow-sm shadow-emerald-600/20 transition-colors` |
| Botão/card clicável secundário (quick access) | `rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md group` |
| Modal (overlay + painel) | ver seção 3 — mesmo padrão nas três |

### Botão compacto — novo padrão de botão (substitui o "Botão primário" da seção 2)

Escala única pra **qualquer** botão de ação — toolbar, CTA principal, submit de modal,
CTA de card de alerta. Não é mais só "pra toolbar": nas páginas migradas (ver fonte
abaixo) ela substituiu completamente o "Botão primário" `rounded-xl px-4 py-2.5 text-sm`
da seção 2, inclusive em botão de destaque tipo "Recarregar créditos" ou confirmar PIX.

| Papel | Classes exatas |
|---|---|
| Secundário compacto | `rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10` |
| Primário compacto | `rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700` |
| Perigo compacto (ex.: recarregar saldo crítico) | `rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90 dark:bg-red-500 dark:hover:bg-red-400 dark:ring-1 dark:ring-inset dark:ring-white/20` |

Fonte original: `web/components/fornecedor/FornecedorImportEstoquePanel.tsx`. Aplicado
página inteira (incluindo modais) em: `web/app/admin/pedidos/page.tsx`,
`web/app/fornecedor/pedidos/page.tsx`, `web/app/seller/pedidos/page.tsx`,
`web/app/seller/dashboard/page.tsx` (extrato, depósitos, modal de recarga PIX, modal de
mensalidade, modal "Escolha seu plano" — exceto os cards de escolha de plano em si, que
são "Botão/card clicável secundário", não CTA).

**O que fica de fora** (não é "botão de ação", é outro papel):
- Card clicável grande (quick access, plano, atalho) — continua no padrão da seção 2.
- Chip de filtro/segmented control — **sempre `rounded-full`** (nunca `rounded-md`/
  `rounded-lg`, que é raio de botão de ação), e **sempre `py-1.5 text-[11px] font-medium`**
  (a mesma "altura"/padding vertical da escala compacta) em **todos** os grupos de chip da
  mesma tela — largura sempre livre (auto, do tamanho do texto de cada um; nunca forçar
  `w-*` fixo num chip, isso é só pra badge/etiqueta em coluna, ver seção seguinte). Cobre:
  toggle "Todos/Pedidos", período "7d/14d/30d", abas tipo "Extrato/Recargas PIX", chips de
  status "Todos/Aguardando envio/...". Foi corrigido em `web/app/seller/dashboard/page.tsx`:
  as abas "Extrato/Recargas PIX" e os chips "7d/14d..." estavam em `rounded-md`, e os chips
  de status ("Todos/Aguardando envio/...") estavam em `py-2 text-xs` (mais alto) — os três
  grupos agora usam exatamente `rounded-full px-2.5–3.5 py-1.5 text-[11px] font-medium`.
- Botão ícone-only de fechar modal (`×`) — não tem escala de padding pra compactar.

Ainda não copiado pro resto do admin/fornecedor/seller fora dessas páginas — perguntar
antes de aplicar em tela nova, mas já não é mais "experimento", é o padrão vigente nas
páginas acima.

### Botão compacto tem versão mobile e versão desktop — não precisam ser o mesmo DOM

O botão/filtro compacto **tem que parecer idêntico** (mesmas classes exatas da tabela
acima) em qualquer largura, mas isso não significa que é sempre o mesmo elemento HTML nas
duas telas — em mobile e desktop pode (e às vezes precisa) ser duas instâncias diferentes,
cada uma só visível na sua faixa (`sm:hidden` numa, `hidden sm:inline-flex`/`sm:block` na
outra), controlando o mesmo estado. Exemplo: filtro de status em
`web/app/seller/pedidos/page.tsx` — versão mobile fica em `titleExtra` (ao lado da barra
degradê, ver seção de header abaixo), versão desktop fica em `right` (extremo direito do
card); as duas chamam o mesmo `setStatusFilter`, só a posição/DOM muda.

**Select que precisa ficar do tamanho exato de um botão (sem sobra lateral):** um
`<select>` nativo com `width: auto` é dimensionado pelo navegador pela **opção mais
longa da lista**, não pelo valor selecionado — por isso um `<select>` mostrando "Todos"
fica largo demais se a lista tem "Aguardando postagem" como opção. Forçar `width` fixo
em pixel/rem é frágil (quebra sozinho quando o texto/fonte muda um pouco, causando corte
ou sobra). A solução correta: renderizar um `<div aria-hidden>` com as classes exatas do
botão compacto (mesmo padding, mesma fonte, **sem `border`** pra bater a altura exata de
um botão sem borda) mostrando só o rótulo atual + ícone, e sobrepor um `<select>` de
verdade `absolute inset-0 h-full w-full cursor-pointer opacity-0` por cima — clicável e
acessível (`aria-label`), mas o tamanho visual passa a ser 100% controlado pelo texto
atual, igual um botão normal. Exemplo real: filtro "Todos" em
`web/app/seller/pedidos/page.tsx` (`titleExtra`, versão mobile).

### Badge de status (etiqueta, não botão)

Badge de status é **informação**, não ação — não pode carregar a mesma "assinatura
visual" do botão acima (`border` + `font-semibold`), senão parece clicável. Formato:

- Container: `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1
  text-[11px] font-medium` + cor por status (fundo suave + texto — reaproveitar a família
  de cor já usada pro status, ex. `bg-red-100 text-red-800 dark:bg-red-950/40
  dark:text-red-300`), **sem `border`**.
- Bolinha antes do texto: `<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />`
  — herda a cor do texto via `bg-current`, não precisa de token de cor separado pra bolinha.
- `font-medium`, nunca `font-semibold` (isso é peso de botão, não de etiqueta).
- **Largura fixa igual pra todo o grupo de badges da mesma coluna/lista** (ex.: `w-36`),
  dimensionada pelo rótulo mais longo do conjunto — nunca truncar texto pra caber; se o
  rótulo mais curto sobrar espaço à direita, é esperado, é isso que alinha a coluna. Vale
  também fora de tabela — ex. badge de status em cada linha do extrato do seller, cada um
  com largura diferente antes, todos em `w-36` agora.

Fonte/aplicado: `web/app/admin/pedidos/page.tsx` (coluna Status), `web/app/fornecedor/pedidos/page.tsx`,
`web/app/seller/pedidos/page.tsx`, `web/app/seller/dashboard/page.tsx` (extrato, "Plano
pendente", depósitos). Mesmo status do botão compacto acima — já não é mais experimento
isolado, mas ainda não espalhado pro resto do admin/fornecedor/seller.

### Lista de pedidos em cards (article + dt/dd), sem tabela — em teste

Pra tela que lista registros tipo "pedido" (produto, seller, valor, status, ações),
preferir esse formato de card em vez de `<table>` — **vale pra qualquer largura de tela,
sem split mobile/desktop separado**:

- Cada registro é um `<article className="rounded-2xl border border-[var(--card-border)]
  bg-[var(--card)] p-4">`; lista deles em `space-y-3` — nunca embrulhados numa `<section>`
  com borda própria por fora (isso duplica borda).
- Cabeçalho do card: título (ex. nome do produto) + data embaixo, à esquerda; badge de
  status (padrão "Badge de status" acima — bolinha, sem borda) encostado à direita,
  `shrink-0`.
- Detalhes em `<dl className="mt-4 grid grid-cols-2 gap-3 text-sm">`, pares `dt` (rótulo,
  `text-neutral-500`) + `dd` (valor, `font-medium` no dado principal). **Sempre mostrar o
  par, com fallback `"—"`** — nunca esconder o campo só porque o dado está vazio (o campo
  sumindo é pior que mostrar "—").
- Ações no fim do card: `flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end` +
  cada botão `w-full sm:w-auto` (classes do "Botão de ação compacto" acima). **Nunca**
  deixar o botão só `w-full` sem breakpoint — vira uma barra esticada absurda em tela
  larga quando o mesmo card roda em desktop.
- Fonte/teste: `web/app/fornecedor/pedidos/page.tsx` — inspirado na estrutura de
  `web/app/seller/pedidos/page.tsx` (mesma ideia de `article` + `dl`), mas com o badge de
  status no padrão novo (bolinha, sem borda) em vez do pill com contorno que o seller usa.
- Essa página também passou a usar `dropcore-shell-6xl` em vez do `4xl` padrão de
  fornecedor/seller (ver exceção na lista de larguras abaixo) — o grid de 2 colunas do
  `dl` faz melhor uso do espaço largo.

**Únicas diferenças intencionais** entre admin e fornecedor/seller (não são exceção ao
sistema, são decisão de produto — não "consertar"):
- Largura do shell: admin usa `dropcore-shell-6xl`, fornecedor/seller usam
  `dropcore-shell-4xl` — **exceção**: páginas migradas pro padrão compacto (lista de
  pedidos em card, `seller/dashboard`) usam `6xl` mesmo em fornecedor/seller. Ainda é
  `4xl` nas páginas de fornecedor/seller que não passaram por essa migração.
  **O menu (`SellerNav`) tem que bater com a largura da página que ele está em cima** —
  não é só o conteúdo que muda, o menu desktop também, senão o menu fica desalinhado com
  os cards mais largos embaixo. `web/app/seller/SellerNav.tsx` tem a prop `wide?: boolean`
  pra isso: `<SellerNav active="..." wide />` nas páginas em `6xl` (hoje `dashboard` e
  `pedidos`), sem a prop (padrão `4xl`) nas que ainda não migraram. Ao migrar uma página
  do seller pra `6xl`, sempre adicionar `wide` no `SellerNav` dela no mesmo commit —
  esquecer isso é o mesmo tipo de erro (padrão inconsistente entre menu e página).
- Composição do lado esquerdo do header: admin usa seta+breadcrumb ("Operação" etc.),
  fornecedor/seller usam avatar/logo grande (`h-[5.25rem] w-[5.25rem] sm:h-[5.5rem] sm:w-[5.5rem]`).

Fora essas duas coisas, cor, raio de borda, sombra, badge, botão e modal são o **mesmo
componente** — se uma tela nova em qualquer área não bate com essas classes, ela está
destoando do padrão, não criando um estilo novo válido.

### Header de página interna (não a dashboard) — usar componente, nunca copiar/colar

Cada área deveria ter **um** componente de header pra suas páginas internas (não a
dashboard raiz, que já tem o header próprio da seção 2). Estado atual:

- **Admin:** `web/components/admin/AdminPageHeader.tsx` — usar sempre em `/admin/*`
  (props: `eyebrow`, `title`, `titleExtra`, `subtitle`, `backHref`, `right`). Mesmas
  classes do header da dashboard (`rounded-2xl border ... p-4 shadow-sm sm:p-5`).
- **Seller:** `web/components/seller/SellerPageHeader.tsx` (`surface="hero"`) — usado em
  **7 páginas** (`cadastro`, `calculadora`, `integracoes-erp` + sub-rotas, `plano`,
  `produtos`). É o padrão real do seller, mas é **visualmente diferente** do card padrão
  da seção 2: sem `shadow-sm`, `rounded-3xl` no `sm+` (não `rounded-2xl`), padding maior
  (`px-7`/`px-8`), barra degradê decorativa ao lado do título, sem label maiúsculo acima
  do título. Ao mexer em página do seller, replicar **esse** componente — não o card da
  seção 2, não o `AdminPageHeader`. Tem `titleExtra` (igual o `AdminPageHeader`) pra
  colocar algo ao lado da barra degradê, na linha do título — quando usado, a linha vira
  `flex-nowrap` (título ganha `truncate` como válvula de segurança) em vez de
  `flex-wrap`, pra não empurrar o `titleExtra` pra baixo do título em mobile.
- **Fornecedor:** ainda **sem** componente — `cadastro`, `pedidos` e `produtos` copiam o
  mesmo bloco manualmente (mesmas classes do `AdminPageHeader`, mas sem componente).
  Se for tocar em mais de uma dessas páginas na mesma tarefa, considerar extrair um
  `FornecedorPageHeader` (mesmo molde do `AdminPageHeader`) em vez de copiar de novo —
  perguntar antes, já que mexe em fornecedor (área com regra própria, ver `CLAUDE.md`).

### Barra degradê + destaque embutido no subtítulo — regra geral, todo header — em teste

Duas coisas do `SellerPageHeader` (`surface="hero"`) viram regra pra **qualquer** header
de página do DropCore — admin, fornecedor e seller, não só seller — **exceto as
dashboards raiz** (`web/app/dashboard`, `web/app/fornecedor/dashboard`,
`web/app/seller/dashboard` continuam só com o card padrão da seção 2, sem essas duas
coisas):

1. **Barra degradê ao lado do título** — `h-1 w-14 sm:w-20 rounded-full bg-gradient-to-r
   from-emerald-500 via-emerald-400 to-emerald-300/70` (classe exata já em
   `SellerPageHeader.tsx`, função `accentClass`). Fica ao lado do `<h1>`, não embaixo.
2. **Destaque embutido no subtítulo** — em vez de um parágrafo neutro inteiro, envolver só
   o trecho mais importante (o que evita erro/confusão comum) em
   `<span className="font-medium text-[var(--foreground)]">...</span>` no meio da frase.
   Exemplo real: `web/app/seller/plano/page.tsx` — "...referência da tabela financeira.
   **Não credita saldo, só libera recursos do plano após confirmação no Mercado Pago.**
   A cobrança...". Não inventar destaque em subtítulo que não existe — só aplicar quando
   já tem uma frase pra destacar.

Fonte: `web/app/seller/produtos/page.tsx` (original) + já aplicado em
`web/app/seller/cadastro/page.tsx` e `web/app/seller/plano/page.tsx` (só o destaque —
essas páginas já tinham a barra via `surface="hero"`). Ainda não aplicado em
admin/fornecedor (que não têm a barra hoje) — pedir confirmação de quais páginas antes de
espalhar, testando algumas primeiro.

**Isso não mexe em nada do que já existe** — botão compacto, badge de status, largura de
shell (`6xl` nas páginas migradas) continuam valendo exatamente como documentado acima;
essa regra é só sobre acrescentar a barra + destaque no header dessas páginas.

## 3. Modal — sempre centralizado

- Fonte única: `web/lib/modalOverlay.ts` (`MODAL_OVERLAY_CLASS`, `MODAL_PANEL_CLASS`, `MODAL_PANEL_BODY_CLASS`) ou componente `web/components/ui/ModalOverlay.tsx`.
- Backdrop: `flex items-center justify-center` (nunca `items-end`, nunca "bottom sheet" pra formulário/PIX/confirmação).
- Painel alto: `max-h-[min(90dvh,calc(100vh-2rem))]` + corpo `overflow-y-auto`.
- Exceção só pra lightbox de foto em tela cheia — com comentário no código explicando.
- **`cn()` (`web/lib/utils.ts`) é só um `join` — não faz merge tipo `tailwind-merge`.**
  `cn(MODAL_OVERLAY_CLASS, "z-[100]")` deixa `z-50` (do token) **e** `z-[100]` os dois na
  classe final; quem vence depende da ordem no CSS gerado, não é confiável. Pra sobrescrever
  uma propriedade que o token já define (`z-*`, `bg-black/*`, etc.), não dá pra usar o
  token + override — ou o modal aceita o valor padrão do token, ou usa as classes por
  extenso na mão (como o modal "Escolha seu plano" do `seller/dashboard`, que precisa de
  `z-[100]` pra ficar acima dos outros modais). Isso não vale pra propriedades que o token
  **não** define (`max-w-lg` em cima de `MODAL_PANEL_CLASS`, por exemplo, funciona liso,
  já usado em vários lugares — só cuidado quando é a *mesma* propriedade.

## 4. Mobile — obrigatório, não opcional

Toda tela/componente novo ou alterado precisa ficar harmônico em telas estreitas (~360–390px),
não só desktop:

- Nada de tabela larga estourando a viewport sem alternativa — usar cards empilhados
  (`hidden sm:block` pra tabela + `sm:hidden` pra cards, como em `web/app/admin/a-pagar-fornecedores/page.tsx`),
  scroll horizontal com affordance visível, ou (pra lista tipo "pedido") o card único em
  todas as larguras da seção "Lista de pedidos em cards" acima — não precisa de split
  quando o card já funciona bem em qualquer tamanho de tela.
- Nada de texto colado sem quebra/espaçamento (cuidado com `flex justify-content:space-between`
  sem `flex-wrap`/`flex-col` em containers estreitos).
- Nada de botão cortado ou fora da viewport.
- Testar mentalmente o layout em ~390px antes de considerar a tela pronta.

## 5. Checklist antes de terminar uma tela/componente

- [ ] Toda cor usada vem de um token (`dropcorePalette.ts`, `amberPremium.ts`, `semanticPremium.ts`) — nenhum HEX ou classe Tailwind de cor solta reinventando um papel que já existe?
- [ ] Header, card de seção, ícone, badge e botão batem com as classes exatas da seção 2 (não um formato inventado)?
- [ ] Badge de status não tem `border`/`font-semibold` de botão (ver "Badge de status" acima) — dá pra distinguir etiqueta de ação só olhando?
- [ ] Se tem modal: centralizado, sem bottom sheet, mesmo padrão da seção 3?
- [ ] Funciona em mobile (~390px) sem estourar, colar texto ou cortar botão?
- [ ] Se é tela do fornecedor: não vaza `valor_dropcore`/`valor_total` (ver regra de privacidade no `CLAUDE.md`)?
