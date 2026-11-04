"use client";

import { useCallback, useEffect, useRef } from "react";

/** Permite rolar um `overflow-x-auto` segurando e arrastando com o mouse (não é nativo do
 * browser — só funciona com trackpad/touch por padrão). Usado na faixa de abas de Pedidos
 * (fornecedor/seller/admin): sem isso, arrastar pra rolar virava clique na aba onde o mouse
 * soltava, trocando de aba sem querer ("elas saem do lugar", achado 2026-11-03). Suprime o
 * clique quando o gesto foi arrasto, não clique de verdade.
 *
 * Usa listener em `window` (não `setPointerCapture`) pra continuar seguindo o arrasto mesmo
 * se o cursor sair do elemento — `setPointerCapture` parecia a escolha óbvia, mas retargeta
 * o `click` nativo pro elemento capturado em vez do botão clicado de verdade, quebrando o
 * clique normal (achado ao testar de verdade, não só ler a spec).
 *
 * Trava vertical (2ª rodada): `preventDefault` no wheel funciona pro gesto ativo, mas a fase
 * de "momentum"/inércia do trackpad do Mac manda eventos de wheel NÃO cancelável (limitação
 * conhecida do Chrome/WebKit) — a página ainda descia uns 20-40px bem no meio do arrasto,
 * confirmado analisando frame a frame de um vídeo real. Em vez de brigar com esse evento,
 * trava a posição vertical da PÁGINA (não da faixa) sempre que o usuário está interagindo
 * com a faixa + ~500ms depois (absorve a cauda da inércia).
 *
 * Ref callback, não `useRef`+`useEffect` (3ª rodada): com `useEffect(() => {...}, [])`, o
 * listener de wheel só anexava se `ref.current` já estivesse setado no exato instante em que
 * o efeito rodava — em dev (React Strict Mode remonta componente pra testar efeito puro) isso
 * ficou às vezes `null`, listener nunca anexava, bug "voltava sozinho" sem eu mudar nada.
 * Ref callback é chamado pelo React exatamente quando o nó monta/desmonta, sem essa corrida. */
export function useDragScroll<T extends HTMLElement>() {
  const elRef = useRef<T | null>(null);
  const estado = useRef({ arrastando: false, moveu: false, startX: 0, startScrollLeft: 0 });
  const travaY = useRef<number | null>(null);
  const travaTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const travarVertical = useCallback(() => {
    if (travaY.current == null) travaY.current = window.scrollY;
    if (travaTimeout.current != null) clearTimeout(travaTimeout.current);
  }, []);

  const agendarDestrava = useCallback(() => {
    if (travaTimeout.current != null) clearTimeout(travaTimeout.current);
    travaTimeout.current = setTimeout(() => {
      travaY.current = null;
      travaTimeout.current = null;
    }, 500);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (travaY.current != null && window.scrollY !== travaY.current) {
        window.scrollTo(window.scrollX, travaY.current);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onMove = useCallback((e: PointerEvent) => {
    const el = elRef.current;
    if (!el || !estado.current.arrastando) return;
    const dx = e.clientX - estado.current.startX;
    if (Math.abs(dx) > 3) estado.current.moveu = true;
    el.scrollLeft = estado.current.startScrollLeft - dx;
  }, []);

  const onUp = useCallback(() => {
    estado.current.arrastando = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    agendarDestrava();
  }, [onMove, agendarDestrava]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<T>) => {
      const el = elRef.current;
      if (!el) return;
      estado.current.arrastando = true;
      estado.current.moveu = false;
      estado.current.startX = e.clientX;
      estado.current.startScrollLeft = el.scrollLeft;
      travarVertical();
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onMove, onUp, travarVertical]
  );

  // Trackpad do Mac manda `wheel` com deltaX E deltaY juntos quando o gesto não é 100%
  // reto — sem isso, a parte vertical "vaza" pra rolagem da página mesmo arrastando a
  // faixa, que só anda pro lado. Converte o gesto inteiro em scroll horizontal da faixa,
  // nunca deixa a página se mexer enquanto o mouse estiver em cima dela. `touch-action:
  // pan-x` (CSS) cobre o caso de toque real (celular); isso aqui cobre trackpad/mouse.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      const el = elRef.current;
      if (!el || (e.deltaX === 0 && e.deltaY === 0)) return;
      travarVertical();
      el.scrollLeft += e.deltaX + e.deltaY;
      e.preventDefault();
      agendarDestrava();
    },
    [travarVertical, agendarDestrava]
  );

  const ref = useCallback(
    (node: T | null) => {
      if (elRef.current) elRef.current.removeEventListener("wheel", onWheel);
      elRef.current = node;
      if (node) node.addEventListener("wheel", onWheel, { passive: false });
    },
    [onWheel]
  );

  const onClickCapture = useCallback((e: React.MouseEvent<T>) => {
    if (estado.current.moveu) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Sem isso, um clique normal sem arrasto algum tempo depois de um arrasto real ficava
    // preso suprimido — o estado "foi arrasto" só pode valer pro primeiro clique seguinte.
    estado.current.moveu = false;
  }, []);

  return { ref, onPointerDown, onClickCapture };
}
