import { NextResponse } from "next/server";
import { getAppBuildId } from "@/lib/appBuildId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { buildId: getAppBuildId() },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    },
  );
}
