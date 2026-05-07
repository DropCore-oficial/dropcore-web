"use client";

/** Se `cor` tiver vários valores numa string (dados antigos com vírgulas), mostra em chips em vez de um bloco único. */
export function CorCelulaProduto({ cor }: { cor: string | null }) {
  const raw = (cor ?? "").trim();
  if (!raw) return <>—</>;
  const parts = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return <span className="break-words">{raw}</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((p, i) => (
        <span
          key={`${i}-${p}`}
          className="inline-flex max-w-full rounded-md bg-[var(--muted)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--foreground)]"
        >
          {p}
        </span>
      ))}
    </span>
  );
}
