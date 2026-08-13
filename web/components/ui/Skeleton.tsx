import { cn } from "@/lib/utils";

/** Bloco cinza pulsante — peça básica pra montar skeleton screen (formato do conteúdo real
 * em vez de spinner genérico, deixa a espera parecer mais rápida e sem "pulo" de layout
 * quando o dado chega). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-[var(--muted)]/15", className)} />;
}

/**
 * Formato genérico das 3 dashboards (admin/org, fornecedor, seller) — cabeçalho com
 * avatar/logo + grade de KPI + blocos de conteúdo. As três já usam o mesmo cartão/grid
 * (ver skill dropcore-layout), então um único esqueleto serve as três sem replicar pixel
 * a pixel cada seção condicional (repasse, calculadora, etc. — isso mudaria toda hora e
 * quebraria o esqueleto; a forma genérica já resolve a percepção de espera).
 */
export function DashboardSkeleton() {
  return (
    <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-2xl sm:h-[5.5rem] sm:w-[5.5rem]" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Mesmo formato do `<article>` de pedido usado em admin/fornecedor/seller (header com
 * título/data + pill de status, `dl` em grade 2 colunas) — ver skill dropcore-layout,
 * "Lista de pedidos em cards". `withCheckbox`: telas com seleção em lote (fornecedor)
 * mostram o quadradinho do checkbox; seller/admin não selecionam em lote.
 */
export function PedidoCardSkeleton({ withCheckbox = false, fields = 6 }: { withCheckbox?: boolean; fields?: number }) {
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {withCheckbox && <Skeleton className="mt-1 h-4 w-4 shrink-0 rounded" />}
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-5 w-28 shrink-0 rounded-md" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </article>
  );
}

/** Grade de miniatura + linhas de texto — catálogo de produto (fornecedor/seller), N células. */
export function ProdutoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Linha de produto em lista (miniatura + 2 linhas de texto + ação à direita) — catálogo do
 * seller (`SellerListaGrupoArmazem`) e listas equivalentes por linha em vez de grade. */
export function ProdutoRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="divide-y divide-[var(--card-border)]">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Linhas de formulário/config (label + campo) — telas de cadastro, plano, integração. */
export function FormRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}
