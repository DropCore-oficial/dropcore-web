"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Redirecionamento no cliente para o dashboard.
 * A raiz / precisa devolver HTML 200 com meta Open Graph (WhatsApp/Facebook);
 * redirect() no servidor quebrava a pré-visualização do link.
 */
export default function HomeEntry() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">A abrir o painel...</p>
      <Link
        href="/dashboard"
        className="text-sm font-medium text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
      >
        Ir para o dashboard
      </Link>
    </div>
  );
}
