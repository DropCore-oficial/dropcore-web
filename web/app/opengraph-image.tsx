import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export const alt = "DropCore — hub de gestão para sellers e fornecedores";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logoPath = path.join(process.cwd(), "public", "logo-horizontal.png");
  const buf = await readFile(logoPath);
  const src = `data:image/png;base64,${buf.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(165deg, #f8fafc 0%, #e2e8f0 55%, #cbd5e1 100%)",
        }}
      >
        <img
          src={src}
          alt=""
          width={520}
          height={140}
          style={{ objectFit: "contain" }}
        />
        <p
          style={{
            marginTop: 28,
            fontSize: 28,
            fontWeight: 500,
            color: "#475569",
            letterSpacing: "-0.02em",
          }}
        >
          Hub de gestão para sellers e fornecedores
        </p>
      </div>
    ),
    { ...size }
  );
}
