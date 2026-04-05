import { NextResponse } from "next/server";
import { resolveOrgMe } from "@/lib/orgMeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const r = await resolveOrgMe(req);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.httpStatus });
  }
  return NextResponse.json(
    {
      ok: true,
      user_id: r.user_id,
      org_id: r.org_id,
      role_base: r.role_base,
      pode_ver_dinheiro: r.pode_ver_dinheiro,
      plano: r.plano,
    },
    { status: 200 },
  );
}
