"use client";

import { useEffect, useRef } from "react";

/**
 * setInterval que pausa com a aba em background e reexecuta ao voltar (menos carga no servidor).
 */
export function useVisibilityAwareInterval(
  fn: () => void,
  intervalMs: number,
  disabled = false
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (disabled) return;

    const run = () => void fnRef.current();
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id) clearInterval(id);
      id = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        run();
        start();
      } else {
        stop();
      }
    };

    run();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, disabled]);
}
