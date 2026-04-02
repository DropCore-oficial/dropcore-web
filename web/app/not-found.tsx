import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Página não encontrada</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Erro 404</p>
      <Link
        href="/"
        className="mt-6 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
