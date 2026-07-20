import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { getSiteUrl } from "@/lib/siteUrl";

const site = getSiteUrl();

const LANDING_TITLE = "DropCore — Venda no marketplace sem se preocupar com estoque";
const LANDING_DESCRIPTION =
  "Plataforma para sellers: catálogo, pedidos, saldo PIX e integração ERP em um painel refinado. Drop shipping com operação organizada.";

export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  alternates: { canonical: site },
  openGraph: {
    url: site,
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
  },
};

export default function Home() {
  return <LandingPage />;
}
