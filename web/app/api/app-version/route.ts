import { NextResponse } from "next/server";
import { getAppBuildId } from "@/lib/appBuildId";
import { getServerSurfaceBuildId, parseAppSurface } from "@/lib/appSurfaceVersion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const surface = parseAppSurface(searchParams.get("surface"));
  const buildId = surface ? getServerSurfaceBuildId(surface) : getAppBuildId();

  return NextResponse.json(
    { buildId, surface: surface ?? null },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    },
  );
}
