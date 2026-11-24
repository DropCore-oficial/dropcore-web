"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Hook compartilhado pelas 4 telas de produto do fornecedor
 * (`app/fornecedor/produtos/{page,criar-unico,criar-variantes,editar/[grupoKey]}`) pra
 * aceitar também o ADMIN usando a mesma tela em nome de um fornecedor escolhido (achado
 * 2026-11-24, Sr Stark: admin precisa da mesma tela completa que o fornecedor usa, não só
 * campos soltos — ver `docs/SCHEMA.md`).
 *
 * Em vez de editar cada uma das dezenas de chamadas `fetch(` de cada página uma a uma pra
 * mandar o fornecedor escolhido, intercepta `window.fetch` só enquanto a página está montada
 * e só pra chamadas de `/api/fornecedor/produtos*` — injeta o header `x-fornecedor-id` que
 * `resolverFornecedorContexto` (`lib/fornecedorAuth.ts`) já sabe ler no backend. `org_id`
 * nunca é mandado pelo cliente — o backend sempre deriva da própria sessão do admin.
 *
 * Ativa quando a URL tem `?fornecedor_id=...` (as telas /admin/produtos/* abrem assim).
 * Sem esse param, comportamento 100% igual a antes (fornecedor logado normal).
 */
export function useFornecedorAdminContexto(): { modoAdmin: boolean; fornecedorIdAdmin: string | null } {
  const searchParams = useSearchParams();
  const fornecedorIdAdmin = searchParams.get("fornecedor_id");
  const modoAdmin = Boolean(fornecedorIdAdmin);

  useEffect(() => {
    if (!fornecedorIdAdmin) return;
    const original = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("/api/fornecedor/produtos")) return original(input, init);
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("x-fornecedor-id", fornecedorIdAdmin);
      return original(input, { ...init, headers });
    };
    return () => {
      window.fetch = original;
    };
  }, [fornecedorIdAdmin]);

  return { modoAdmin, fornecedorIdAdmin };
}
