---
name: dropcore-gestores-ia
description: Padrão de UX/estrutura dos Gestores de IA do DropCore (Estoque, Anúncio, SAC, ADS, Design, Gestor) — hierarquia de cor por card, estrutura hub/página-por-gestor, fonte única de perfil. Use SEMPRE que for tocar em qualquer painel de gestor de IA, criar um gestor novo, ou adicionar sinal/badge/aviso a um resultado de gestor — antes de escrever código.
---

# Gestores de IA — padrão de produto e UI

Complementa `dropcore-layout` (que já cobre cor/badge/botão/modal em geral) — este SKILL é
específico da área `/seller/gestores-ia`. Ler os dois antes de mexer num painel de gestor.

## 1. Estrutura de página — hub + 1 página por gestor (2026-08-25)

- `/seller/gestores-ia` (hub) mostra **só** a maquete 3D (`SellerGestoresIaEscritorio3D`) +
  um grid de cards, 1 por gestor, vindos de `web/lib/ai/gestorPerfis.ts` (`GESTORES_PERFIS`).
  Não renderiza painel de resultado nenhum diretamente.
- `/seller/gestores-ia/[gestor]/page.tsx` é quem renderiza o painel de verdade (ex.
  `SellerGestorEstoqueFulfillmentPanel`, `SellerGestorAnunciosSeoPanel`), a partir do slug
  na URL. Motivo de ser página separada, não acordeão/expand na mesma tela: o Canvas 3D do
  hub é pesado (React Three Fiber) e fica rodando o tempo todo se tudo ficasse numa página
  só — como página própria, o Canvas desmonta quando o seller entra no gestor.
- `web/lib/ai/gestorPerfis.ts` (`GESTORES_PERFIS`, `buscarGestorPerfil`) é a **fonte única**
  de slug/nome/função/`gestorId`(DB)/`ativo` dos 6 gestores — nunca duplicar essa lista em
  outro arquivo. Gestor sem painel construído ainda (`ativo: false`) cai automaticamente na
  tela "em construção" da página de detalhe, sem precisar de código extra por gestor.

**Ao construir um gestor novo (SAC/ADS/Design/Gestor ou outro futuro):**
1. Criar `SellerGestor<Nome>Panel.tsx` seguindo o padrão de `SellerGestorRunShell` (mesmos
   estados: upsell Pro, sem rodada ainda, processando, erro — só o "resultado ok" muda).
2. Adicionar o branch de render em `[gestor]/page.tsx` (`perfil.slug === "..."`).
3. Virar `ativo: true` em `gestorPerfis.ts` só quando o painel estiver de verdade pronto.

## 2. Hierarquia de cor — 1 sinal forte por card, resto é texto (2026-08-25)

**Regra travada:** cada card de gestor tem **um único** elemento com cor forte — o badge de
veredito principal (`DiagnosticoBadge` no Andrey, `RiscoBadge` no Diogo). Tudo mais no card
é neutro. Concretamente:

- **Borda do card é sempre neutra** (`border-[var(--card-border)]`) — **nunca** repetir a
  cor do badge na borda do `<article>`. Achado real: o `SkuCard` do Diogo tinha borda
  vermelha/âmbar conforme o risco (duplicando o que o `RiscoBadge` já dizia) enquanto o
  `GrupoCard` do Andrey já usava borda neutra + só o badge colorido — os dois foram
  igualados pra borda neutra (ver commit da limpeza 2026-08-25).
- **Sinal secundário (não é o veredito principal) nunca vira caixa própria** com
  `border-*-200 bg-*-50 rounded-lg p-2.5` — isso empilha cor demais e cada card vira um
  mosaico. Sinal secundário é **linha de texto simples**, no máximo com 1 ícone/emoji na
  frente, cor só no texto quando for alerta de verdade (`text-[var(--danger)]`) ou neutro
  (`text-[var(--muted)]`) quando for só informação. Exemplo real corrigido: os avisos de
  "categoria provavelmente errada" e "resultado da ação anterior" no Andrey nasceram como
  caixa com borda+fundo (padrão de alerta cheio) e foram simplificados pra `<p>` de uma
  linha — ver `CategoriaErradaAviso`/`ResultadoAcaoAnteriorBloco` em
  `web/components/seller/SellerGestorAnunciosSeoPanel.tsx`.
- Badge de status (veredito principal, "poucas fotos", "zero visitas" etc.) continua
  seguindo o padrão geral do `dropcore-layout` (bolinha `bg-current`, sem `border`,
  `font-medium`, nunca `font-semibold`) — isso não muda, é regra do sistema inteiro.

**Ao adicionar um sinal/badge/aviso novo a QUALQUER gestor:** perguntar "isso é o veredito
principal do card (já tem seu badge) ou é informação a mais?" — se for informação a mais,
vira linha de texto, não caixa. E aplicar a mesma decisão visual nos outros gestores ativos
na mesma passada (não deixar um gestor com o padrão novo e o outro com o antigo — foi
exatamente o que aconteceu entre Andrey e Diogo antes dessa correção).

## 3. Nomes — título genérico, e desde 2026-10-17 isso é também o slug/rota de verdade

**Decisão 2026-10-11: os gestores trocaram de nome de pessoa pra título genérico de
função** — Diogo→Estoque, Andrey→Anúncio, Amanda→SAC, Ulisses→ADS, Laura→Design, Tiago
Silva→Gestor. ("Gestor" sozinho colide em soletração com o nome do produto "Gestores de
IA" — decisão explícita do Sr Stark mesmo depois de eu avisar, manter.)

**Atualização 2026-10-17 — a decisão de "não renomear rota/arquivo" foi revertida.** Na
época (2026-10-11) só a UI mudou, pra evitar o custo/risco do rename; o Sr Stark pediu
depois pra fazer o rename de verdade também. Hoje:
- `slug` em `gestorPerfis.ts` já é o nome novo: `estoque`, `anuncio`, `sac`, `ads`,
  `design`, `gestor` (não mais `diogo`/`andrey`/`amanda`/`ulisses`/`laura`/`tiago-silva`).
- Rota do avulso também: `/seller/gestores-ia-avulso/anuncio` etc. (pasta renomeada com
  `git mv`, histórico preservado).
- Arquivo `gestorAvulso<Nome>Rodar.ts` também: `gestorAvulsoAnuncioRodar.ts`,
  `gestorAvulsoSacRodar.ts`, `gestorAvulsoAdsRodar.ts` (nome de *função* interna dentro
  desses arquivos não foi tocado, só o nome do arquivo).
- Cron job em produção também (pg_cron não tem rename direto — foi `unschedule`+`schedule`
  com nome/URL novos, ver `web/scripts/rename-cron-gestores-ia-avulso-rotas.sql` e a seção
  "Rotas dos Gestores de IA" em `docs/SCHEMA.md`).
- `NomeGestor` dentro de `SellerGestoresIaEscritorio3D.tsx` também usa o nome novo como
  string interna, não só como label (`nomeExibicao`).

**O que continua com nome antigo, de propósito** (não é esquecimento, é fora do escopo do
rename): rota de *ação* dentro de um gestor, não a identidade dele — ex.
`/api/seller/gestores-ia/ulisses-preferencias`, `/api/seller/gestores-ia/ulisses-aplicar-*`.
`seller_ai_runs.gestor`/`seller_ai_acoes.gestor` continuam com o ID técnico
(`estoque_fulfillment`, `anuncios_seo`, `reputacao`, `ads`...) — nunca foram nome de pessoa,
não precisaram mudar.

**Ao criar algo novo pra um gestor:** usar sempre o slug/nome novo (`estoque`, `anuncio`,
`sac`, `ads`, `gestor`) — nunca reintroduzir `diogo`/`andrey`/`amanda`/`ulisses`/
`tiago-silva` em código novo, rota nova ou nome de arquivo novo.

**How to apply:** antes de tocar em painel de gestor, ler as seções 1 e 2 inteiras — não só
"o que o Sr Stark pediu agora", porque toda mudança de sinal/cor tende a se replicar pros
outros gestores na mesma conversa (é assim que esse SKILL nasceu).
