"use client";

import { useParams } from "next/navigation";
import { SellerDetailContent } from "../SellerDetailContent";

export default function AdminSellerDetailPage() {
  const params = useParams();
  const raw = params?.id;
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  if (!id) return null;
  return <SellerDetailContent sellerId={id} />;
}
