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
| Logo | `LOGO_GREEN_HEX` (`#22C55E`) — `dropcorePalette.ts` / `DropCoreLogo.tsx` | Exclusivo do logo — nunca em badge, link ou KPI. **Exceção (2026-07-22, pedido explícito):** rodapé do sistema (`web/components/SiteFooter.tsx`) usa `LOGO_GREEN_HEX` só como acento no texto "Romanos 11:36" — é a única exceção, não abrir precedente pra usar em mais lugares sem confirmar antes. Fundo do rodapé em si é fixo `#000000` (mesmo preto do `--background` do tema escuro, sempre, nos dois temas), não é cor do logo. |
| Azul de ação (CTA/links de sistema) | `PRIMARY_ACTION_BLUE_HEX` em `dropcorePalette.ts` + `--primary-blue` | Não usar `blue-600`/`blue-700` cru; não confundir com emerald de sucesso. |
| Âmbar (alerta/atenção) | `web/lib/amberPremium.ts` (`AMBER_PREMIUM_*`) | Nunca emerald para esse papel. Import `AMBER_PREMIUM_SURFACE_TRANSPARENT` etc. em vez de escrever `border-*`/`dark:border-*` na mão. KPI de alerta usa `amberPremiumWarningMainTextClass(value)`, não lógica duplicada na página. |
| Sucesso / erro / info (sistema) | `web/lib/semanticPremium.ts` (`SUCCESS_*`, `DANGER_*`, `INFO_*`) | Não misturar com a escala emerald de produto. Preferir componentes `Alert`/`Badge` já ligados a esses tokens. |
| Vermelho/perigo | `DANGER_HEX` / `var(--danger)` (`#EF4444`) | Steps `red-*` permitidos: `300,400,500,600,950`. Proibido `rose-*`, `pink-*`, `#991b1b`, `#dc2626` soltos. Botão perigo genérico: `bg-[var(--danger)]` + `hover:opacity-90`. |

Cor nova só depois de atualizar `dropcorePalette.ts` + Supabase `dropcore_design_tokens` (+ `ALLOWED_EMERALD_OPACITIES`/`ui_blue`/`ui_danger`/`globals.css` conforme o papel) — nunca só na página.

**Nunca usar `bg-[var(--background)]` num botão/chip/badge/campo dentro de um card.** No
tema escuro `--background` é `#000000` puro, igual ao fundo da própria página — um
elemento com esse fundo fica sem contraste nenhum (mancha preta lisa, não parece
elemento clicável). Superfície de botão/input/badge é sempre `bg-[var(--card)]`;
`--background` é só pro `<div>` raiz da página (canvas por trás de tudo).

### Botão de tema (sol/lua) — REGRA TRAVADA, todo o sistema, sem exceção

Fonte única: `web/components/ThemeToggle.tsx` (componente compartilhado, usado em toda
área — admin/fornecedor/seller/auth). Corrigir só ali corrige o sistema inteiro.

- **Tema escuro ativo** → ícone de **sol preenchido/aceso**, cor âmbar
  (`AMBER_PREMIUM_TEXT_PRIMARY` + leve `drop-shadow` âmbar simulando brilho).
- **Tema claro ativo** → ícone de **lua**, cor padrão do botão (`currentColor`/
  `text-[var(--chrome-icon)]`), sem nenhum tingimento especial.

Não inverter (sol no claro, lua no escuro) nem colorir a lua — só o sol no escuro ganha
cor/brilho.

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
| Secundário compacto | `rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10` |
| Primário compacto | `rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700` |
| Perigo compacto (ex.: recarregar saldo crítico) | `rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90 dark:bg-red-500 dark:hover:bg-red-400 dark:ring-1 dark:ring-inset dark:ring-white/20` |

**Correção 2026-07-21: usar `bg-[var(--card)]`, nunca `bg-[var(--background)]`.** No tema
escuro `--background` é `#000000` puro — igual ao fundo da própria página — então um botão
com `bg-[var(--background)]` fica sem nenhum contraste (parece uma mancha preta lisa, sem
cara de botão) em vez de destacar como superfície elevada. Bug estava na fonte original
(`FornecedorImportEstoquePanel.tsx`) e se replicou em todo lugar que copiou o token; já
corrigido nessas páginas — não reintroduzir `bg-[var(--background)]` num botão novo.

Fonte original: `web/components/fornecedor/FornecedorImportEstoquePanel.tsx`. Aplicado
página inteira (incluindo modais) em: `web/app/admin/pedidos/page.tsx`,
`web/app/fornecedor/pedidos/page.tsx`, `web/app/seller/pedidos/page.tsx`,
`web/app/seller/dashboard/page.tsx` (extrato, depósitos, modal de recarga PIX, modal de
mensalidade, modal "Escolha seu plano" — exceto os cards de escolha de plano em si, que
são "Botão/card clicável secundário", não CTA).

**REGRA TRAVADA (2026-07-21): não é mais experimento nem opcional.** Botão compacto, chip
de filtro (ver abaixo), badge de status (ver abaixo) e largura de shell (ver "Largura do
shell" abaixo) são o **padrão obrigatório em toda tela do sistema** — admin, fornecedor e
seller, dashboards e páginas internas — não só nas páginas já citadas como fonte. Não
esperar pedido explícito nem "perguntar antes de aplicar em tela nova": ao criar ou tocar
em qualquer tela com botão de ação, chip de filtro, badge de status, alerta (sucesso/erro)
ou largura de shell, aplicar direto essas classes exatas, igual às páginas-fonte. Se uma
tela do sistema estiver com botão/filtro/alerta/largura diferente disso, é bug de
inconsistência a corrigir, não uma variação válida — não deixar pra depois nem perguntar
se pode mexer.

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

Padrão obrigatório em **todo** o admin/fornecedor/seller, não só nas páginas-fonte acima —
ver "REGRA TRAVADA" logo acima.

### Botão compacto tem versão mobile e versão desktop — não precisam ser o mesmo DOM

O botão/filtro compacto **tem que parecer idêntico** (mesmas classes exatas da tabela
acima) em qualquer largura, mas isso não significa que é sempre o mesmo elemento HTML nas
duas telas — em mobile e desktop pode (e às vezes precisa) ser duas instâncias diferentes,
cada uma só visível na sua faixa (`sm:hidden` numa, `hidden sm:inline-flex`/`sm:block` na
outra), controlando o mesmo estado.

**Atualização (2026-08-01): `web/app/seller/pedidos/page.tsx` não usa mais duas instâncias
(`titleExtra` mobile + `right` desktop).** O filtro "Todos" saiu do `SellerPageHeader` e
virou uma barra própria abaixo do header (`Filtro` + `Atualizar Pedidos`), **uma única
instância** responsiva via `flex-col sm:flex-row` — mesmo padrão de
`web/app/fornecedor/pedidos/page.tsx`. Ou seja: as duas telas de pedidos (seller e
fornecedor) agora têm a mesma estrutura — header só com título/subtítulo, barra de
filtro+atualizar logo abaixo, paginação (números de página + anterior/próxima +
`20/50/100/300 por página`) no fim da lista. Duas instâncias por breakpoint (a técnica
descrita acima) continua válida como padrão pra quando o layout realmente exigir DOM
diferente por largura — só não é mais o caso dessa tela específica.

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
atual, igual um botão normal. Exemplo real: filtro "Todos"/"Filtro" em
`web/app/seller/pedidos/page.tsx` e `web/app/fornecedor/pedidos/page.tsx` (barra abaixo
do header).

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
pendente", depósitos). Mesmo status do botão compacto acima: padrão obrigatório em
**todo** o sistema, não só nessas páginas — ver "REGRA TRAVADA" na seção do botão compacto.

### Alerta / callout (sucesso, erro, atenção) — mesma caixa em toda tela

Não é só a cor do texto que tem que vir de `semanticPremium.ts`/`amberPremium.ts` (ver
seção 1) — a **caixa inteira** (borda + fundo + anel) também, usando os tokens de
`*_PREMIUM_SHELL`/`*_PREMIUM_SURFACE` prontos, nunca montando `border-red-200 bg-red-100`
(ou equivalente) na mão numa página e o token pronto em outra. Erro real corrigido em
`web/app/seller/produtos/page.tsx`: a caixa de erro usava `red-100/200/900` direto
(inclusive steps fora da escala permitida da seção 1) enquanto a caixa de sucesso logo
abaixo, na mesma tela, já usava `SUCCESS_PREMIUM_SHELL` — as duas precisam vir do mesmo
lugar (`DANGER_PREMIUM_SHELL`/`SUCCESS_PREMIUM_SHELL` + `*_TEXT_PRIMARY`), sempre em
`cn(...)`, nunca uma tokenizada e a outra hardcoded. Vale pra qualquer par
sucesso/erro/atenção que aparecer na mesma tela ou entre telas diferentes.

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
- Essa página já usa `dropcore-shell-6xl` (padrão único do sistema, ver "Largura do shell"
  abaixo) — o grid de 2 colunas do `dl` faz melhor uso do espaço largo.

**Largura do shell — REGRA TRAVADA (2026-07-21): `dropcore-shell-6xl` é o padrão único do
sistema inteiro, sem exceção por área.** Admin já usa `6xl`. Fornecedor e seller: `6xl` é
o alvo pra **toda** página, não só as que já foram citadas como "migradas" (`dashboard`,
`pedidos`) — `dropcore-shell-4xl` não é mais um padrão válido pra página nova nem pra
página existente, é dívida a corrigir sempre que a tela for tocada. **O menu (`SellerNav`)
tem que bater com a largura da página que ele está em cima** — não é só o conteúdo que
muda, o menu desktop também, senão o menu fica desalinhado com os cards mais largos
embaixo. `web/app/seller/SellerNav.tsx` tem a prop `wide?: boolean` pra isso:
`<SellerNav active="..." wide />` é obrigatório em toda página do seller (não só
`dashboard`/`pedidos`). Ao tocar numa página do seller ainda em `4xl`, trocar pra `6xl` +
adicionar `wide` no mesmo commit — esquecer isso é o mesmo tipo de erro (padrão
inconsistente entre menu e página).

**Única diferença intencional** entre admin e fornecedor/seller (não é exceção ao sistema,
é decisão de produto — não "consertar"): composição do lado esquerdo do header — admin usa
seta+breadcrumb ("Operação" etc.), fornecedor/seller usam avatar/logo grande
(`h-[5.25rem] w-[5.25rem] sm:h-[5.5rem] sm:w-[5.5rem]`).

Fora essas duas coisas, cor, raio de borda, sombra, badge, botão e modal são o **mesmo
componente** — se uma tela nova em qualquer área não bate com essas classes, ela está
destoando do padrão, não criando um estilo novo válido.

### Distância entre o último card e o rodapé — REGRA TRAVADA, todo o sistema

**REGRA TRAVADA (2026-07-25): todo página com `SiteFooter` (ou seja, quase toda página do
sistema — ver exceção de login abaixo) tem que fechar com exatamente `pb-5 md:pb-7` de
respiro antes do rodapé, medido a partir do fim do último card visível.** Isso normalmente
fica dividido em duas camadas (não é sempre um `pb-*` só):

1. **Wrapper mais externo da página** (`app-bg` + `pt-[...]`): fecha com `pb-5` (flat, sem
   variante `md:`) — é o padrão já usado em toda página de fornecedor/seller
   (`web/app/seller/dashboard/page.tsx` etc.).
2. **Shell/`<main>` interno** (`dropcore-shell-6xl`, ou `dropcore-shell-4xl`/`PageLayout`
   nas exceções que ainda usam largura menor): fecha com `pb-5 md:pb-7` — **não** usar só
   `py-*` uniforme (isso empurra o mesmo valor pro topo também); separar em `pt-*`
   (mantém o valor de topo que a página já tinha) + `pb-5 md:pb-7` (bottom padronizado).

Total visível: **40px no mobile, 48px no desktop** — sempre, em qualquer área (admin,
fornecedor, seller). Página de admin usa um wrapper próprio sem pb (`web/app/admin/layout.tsx`
tem `pb-0` de propósito), então lá o `pb-5 md:pb-7` do shell interno já é a conta inteira
sozinho — não duplicar com outro wrapper. `web/components/ui/PageLayout.tsx` (usado por
`admin/empresas`, `admin/sellers`, `admin/catalogo`, `app/catalogo`, `app/platform`) já
está ajustado (`pb-10 sm:pb-12`, breakpoint `sm` em vez de `md` porque é o breakpoint que
esse componente específico já usava — mesmo total final).

**Exceção:** telas de **login** (`/login`, `/seller/login`, `/fornecedor/login`,
`/calculadora/login`) não mostram `SiteFooter` (ver `web/components/ConditionalFooter.tsx`)
— tela de auth enxuta, sem o bloco institucional embaixo. Essa regra de espaçamento não
se aplica a elas porque não há rodapé pra medir distância.

**Why:** achado em `web/app/seller/pedidos/page.tsx` — a página usava um `<main>` com
padding só no topo (sem `pb-*` nenhum), enquanto toda outra página do sistema tinha um
respiro extra embutido no shell interno além do wrapper externo. O card final ficava mais
perto do rodapé ali do que em qualquer outra tela, e o Sr Stark notou comparando lado a
lado (`dashboard` vs `pedidos`). Auditoria seguinte encontrou o mesmo tipo de divergência
em ~15 páginas (admin com `py` uniforme, `style={{paddingBottom:24}}` inline, ou faltando
o `pb` de fora inteiro) — todas alinhadas nessa mesma passada.

**How to apply:** ao criar página nova (ou tocar numa existente) que renderiza embaixo de
tudo e termina em `SiteFooter`, conferir que o fim do conteúdo bate com esse total (40/48px)
— não copiar um `py-*` genérico de outra tela sem separar top/bottom primeiro. Se a tela
for de login, não se aplica (ver exceção acima).

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
- **Fornecedor:** ainda **sem** componente — `cadastro`, `pedidos` e `produtos` copiavam o
  mesmo bloco manualmente (seta "Voltar" + eyebrow maiúsculo, mesmas classes do
  `AdminPageHeader`). **Migração em andamento (2026-07-31):** o alvo agora é o padrão do
  seller (`SellerPageHeader` `surface="hero"`), não mais o do admin — ver
  `web/app/fornecedor/produtos/page.tsx`, `web/app/fornecedor/pedidos/page.tsx`,
  `web/app/fornecedor/integracoes-erp/page.tsx` e `web/app/fornecedor/cadastro/page.tsx`
  como fontes já convertidas: sem seta "Voltar" (a página já tem `FornecedorNav` cobrindo
  navegação) e **sem** eyebrow maiúsculo acima do `<h1>` — só título + barra degradê (ver
  seção seguinte) + parágrafo (com destaque quando existir frase importante pra marcar —
  `pedidos` e `cadastro` não tinham nenhuma frase que valesse destaque, então o subtítulo
  ficou sem `<span>` de destaque; `integracoes-erp` já tinha destaque bom no subtítulo, só
  manteve; não forçar um destaque artificial só pra ter).
  Nessa mesma passada em `cadastro` também saíram dois bugs reais: as caixas de
  erro/sucesso usavam `red-50`/`emerald-50` direto em vez de
  `DANGER_PREMIUM_SURFACE_TRANSPARENT`/`SUCCESS_PREMIUM_SURFACE_TRANSPARENT`
  (`lib/semanticPremium.ts`), e os botões "Buscar CNPJ"/"Enviar imagem"/"Remover" (logo)
  estavam em `rounded-lg`/`rounded-xl` + `text-sm` em vez da escala compacta
  (`rounded-md px-2.5 py-1.5 text-[11px] font-semibold`) — corrigido pro mesmo padrão do
  resto do sistema.
  **Não remover a seta "Voltar"** em `fornecedor/pedidos/[id]/etiqueta`,
  `fornecedor/produtos/editar/[grupoKey]` e `fornecedor/produtos/criar-unico` — essas três
  não renderizam `FornecedorNav`, a seta é a única forma de sair da página.
  Se for tocar em mais de uma página do fornecedor na mesma tarefa, considerar extrair um
  `FornecedorPageHeader` (mesmo molde do `SellerPageHeader`) em vez de copiar de novo —
  perguntar antes, já que mexe em fornecedor (área com regra própria, ver `CLAUDE.md`).

### Barra degradê + destaque embutido no subtítulo — REGRA TRAVADA, todo header, todo o sistema

**REGRA TRAVADA (2026-07-21): obrigatório em toda página interna do sistema — admin,
fornecedor e seller —, sem precisar perguntar antes.** As duas coisas do
`SellerPageHeader` (`surface="hero"`) abaixo são o padrão de **qualquer** header de página
que não seja a dashboard raiz. **Exceção única e permanente: as 3 dashboards raiz**
(`web/app/dashboard`, `web/app/fornecedor/dashboard`, `web/app/seller/dashboard`) —
essas continuam só com o card padrão da seção 2, **nunca** levam a barra degradê nem o
destaque de subtítulo. Fora as 3 dashboards, toda página (inclusive admin/fornecedor que
hoje não têm componente de header próprio ainda — ver seção acima) precisa ter:

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
essas páginas já tinham a barra via `surface="hero"`). Aplicar direto em admin/fornecedor
ao tocar numa página deles também (criar o header próprio se ainda não existir, ver seção
"Header de página interna" acima) — não é mais experimento isolado do seller.

**Primeira página do fornecedor migrada: `web/app/fornecedor/produtos/page.tsx`
(2026-07-31).** Nessa leva também saiu o eyebrow maiúsculo ("Catálogo") que ficava acima
do `<h1>` — o padrão novo do fornecedor não leva eyebrow, só título + barra + subtítulo
com destaque, igual ao `SellerPageHeader`. Destaque usado: "Cadastre produtos, fotos e
estoque do seu catálogo. **Alterações entram em análise da DropCore antes de valer pro
seller.**" — reaproveita a mesma explicação que já existe no `HelpBubble` de "Produtos do
armazém" na mesma página, não é informação nova inventada só pro subtítulo.

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

## 5. Skeleton screens — loading, nunca spinner genérico

Fonte única: `web/components/ui/Skeleton.tsx`. Peça base é `<Skeleton className="..." />`
(`animate-pulse rounded-md bg-[var(--muted)]/15`) — todo esqueleto é montado combinando
esse bloco no **formato real do conteúdo** (mesma grade/cartão/altura que o dado vai
ocupar quando chegar), nunca um spinner solto — é isso que evita "pulo" de layout na hora
que o dado substitui o esqueleto.

Variantes prontas — usar em vez de montar um novo esqueleto do zero se o formato já existe:

| Componente | Formato | Usado em |
|---|---|---|
| `DashboardSkeleton` | Header avatar/logo + grade de 4 KPI + 2 blocos de conteúdo — formato genérico das 3 dashboards | `dashboard`, `fornecedor/dashboard`, `seller/dashboard` |
| `PedidoCardSkeleton` | Mesmo `<article>` + `dl` de 2 colunas de "Lista de pedidos em cards" (seção 2); prop `withCheckbox` pras telas com seleção em lote | `seller/pedidos`, `fornecedor/pedidos` |
| `ProdutoGridSkeleton` | Grade de miniatura quadrada + 2 linhas de texto | grade de catálogo |
| `ProdutoRowSkeleton` | Linha (miniatura 56px + 2 linhas de texto + toggle à direita) | `seller/produtos`, `fornecedor/produtos` |
| `ProdutoLinhaSkeleton` | Mesma grade em carrossel horizontal, 3 cards visíveis | vitrine combinada de fornecedores no catálogo do seller |
| `FormRowsSkeleton` | N linhas de label + campo (`rows` configurável) | `cadastro`, `plano`, `editar/[grupoKey]` |

Se a tela não bate com nenhuma variante pronta, montar combinando `<Skeleton>` solto no
grid/flex real da tela (ex.: `seller/integracoes-erp` faz isso pro card de cada conexão
ERP) — não forçar uma variante pronta que não bate com o layout real só pra reaproveitar.

Três formas de ligar ao estado de `loading`, dependendo do tipo de tela (ainda não é uma
escolha travada única — seguir o padrão mais parecido com o tipo de tela que você está
mexendo, perguntar se ficar em dúvida entre dois):

1. **Página inteira troca pelo esqueleto** — `if (loading) return <wrapper>...</wrapper>`,
   com o mesmo wrapper `app-bg`/`dropcore-shell-6xl` da tela carregada por fora e o
   conteúdo interno virando esqueleto. Usado nas 3 dashboards e em telas de formulário
   (`seller/cadastro`, `seller/plano`, `fornecedor/cadastro`).
2. **Só o conteúdo troca, resto da tela sempre visível** — `{loading && <XSkeleton />}`
   dentro do JSX que já renderiza sempre (nav, header, filtros ficam no lugar). Usado em
   listas (`seller/pedidos`, `fornecedor/pedidos`, `seller/produtos`).
3. **Overlay num card que recarrega sozinho** — `<Skeleton>` dentro de
   `absolute inset-0 z-10 ... role="status" aria-live="polite"` cobrindo só aquele card
   (o resto da tela continua interativo). Usado em `seller/integracoes-erp` pro card de
   conexão ERP, que pode recarregar independente do resto da página. Manter
   `role="status" aria-live="polite"` no container do overlay — é o que avisa leitor de
   tela que aquele trecho está carregando.

**Detalhe observado, não regra:** nas 3 dashboards e em `fornecedor/produtos` o nav
(`SellerNav`/`FornecedorNav`) some durante o loading (só volta quando os dados chegam),
enquanto `seller/cadastro`/`seller/plano` mantêm o nav visível mesmo no esqueleto — isso
ainda varia por página, não uniformizar sozinho sem avisar antes.

## 6. Checklist antes de terminar uma tela/componente

- [ ] Toda cor usada vem de um token (`dropcorePalette.ts`, `amberPremium.ts`, `semanticPremium.ts`) — nenhum HEX ou classe Tailwind de cor solta reinventando um papel que já existe?
- [ ] Tela com estado de loading usa um esqueleto no formato real do conteúdo (`web/components/ui/Skeleton.tsx`), não spinner genérico nem tela em branco?
- [ ] Header, card de seção, ícone, badge e botão batem com as classes exatas da seção 2 (não um formato inventado)?
- [ ] Botão de ação usa a escala compacta exata (seção 2) — nenhum botão em `rounded-lg`/`rounded-xl`, `text-sm`/padding antigo sobrando?
- [ ] Chip de filtro é `rounded-full` + `py-1.5 text-[11px] font-medium`, sem largura fixa forçada — igual em todos os grupos de chip da tela?
- [ ] Alerta de sucesso/erro/atenção usa `*_PREMIUM_SHELL`/`*_PREMIUM_SURFACE` (nunca cor hardcoded numa caixa e token pronto na caixa vizinha)?
- [ ] Shell da página é `dropcore-shell-6xl` e (se for seller) `SellerNav` tem `wide` — bateu com o padrão do resto do sistema, não ficou em `4xl`?
- [ ] Header não-dashboard tem a barra degradê ao lado do título e, se houver frase importante no subtítulo, o destaque em `<span className="font-medium text-[var(--foreground)]">`?
- [ ] Badge de status não tem `border`/`font-semibold` de botão (ver "Badge de status" acima) — dá pra distinguir etiqueta de ação só olhando?
- [ ] Se tem modal: centralizado, sem bottom sheet, mesmo padrão da seção 3?
- [ ] Funciona em mobile (~390px) sem estourar, colar texto ou cortar botão?
- [ ] Se é tela do fornecedor: não vaza `valor_dropcore`/`valor_total` (ver regra de privacidade no `CLAUDE.md`)?
