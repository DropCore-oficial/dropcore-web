---
name: dropcore-gestores-ia
description: Padrão de UX/estrutura dos Gestores de IA do DropCore (Diogo, Andrey, Amanda, Ulisses, Laura, Tiago Silva) — hierarquia de cor por card, estrutura hub/página-por-gestor, fonte única de perfil. Use SEMPRE que for tocar em qualquer painel de gestor de IA, criar um gestor novo, ou adicionar sinal/badge/aviso a um resultado de gestor — antes de escrever código.
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

**Ao construir um gestor novo (Amanda/Ulisses/Laura/Tiago Silva ou outro futuro):**
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

## 3. Nomes — pessoa, não o ID técnico

Nomes de produto (Diogo, Andrey, Amanda, Ulisses, Laura, Tiago Silva) só existem no
front/UI e em `gestorPerfis.ts`. `seller_ai_runs.gestor`/`seller_ai_acoes.gestor` continuam
com o ID técnico (`estoque_fulfillment`, `anuncios_seo`, ...) — nunca renomear a coluna/
constraint do banco pro nome de pessoa, é só rótulo de UI.

**How to apply:** antes de tocar em painel de gestor, ler as seções 1 e 2 inteiras — não só
"o que o Sr Stark pediu agora", porque toda mudança de sinal/cor tende a se replicar pros
outros gestores na mesma conversa (é assim que esse SKILL nasceu).
