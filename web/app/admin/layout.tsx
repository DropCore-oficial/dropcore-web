"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AdminNav } from "@/components/AdminNav";
import { AdminMobileBottomNav } from "@/components/AdminMobileBottomNav";
import { AppVersionUpdateBanner } from "@/components/AppVersionUpdateBanner";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) router.replace("/login");
        return;
      }

      const res = await fetch("/api/org/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();

      if (cancelled) return;
      if (!res.ok) {
        router.replace("/login");
        return;
      }

      if (json.fornecedor_id) {
        router.replace("/fornecedor/dashboard");
        return;
      }

      if (json.seller_id) {
        router.replace("/seller/dashboard");
        return;
      }

      if (!json?.org_id) {
        router.replace("/login");
        return;
      }

      const role = json.role_base;
      if (role !== "owner" && role !== "admin") {
        router.replace("/login");
        return;
      }

      setChecking(false);
    }

    check();
    return () => { cancelled = true; };
  }, [router, pathname]);

  if (checking) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        Verificando permissão...
      </div>
    );
  }

  return (
    <>
      <AppVersionUpdateBanner surface="admin" requireAuth />
      <AdminNav />
      <div className="pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 min-h-0 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-0">{children}</div>
      <AdminMobileBottomNav />
    </>
  );
}
