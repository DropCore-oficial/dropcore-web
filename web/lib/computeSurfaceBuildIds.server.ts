import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type { AppSurface } from "./appSurfaceVersion";

const SURFACE_ROOTS: Record<AppSurface, string[]> = {
  seller: ["app/seller", "app/api/seller", "components/seller"],
  fornecedor: ["app/fornecedor", "app/api/fornecedor", "components/fornecedor"],
  admin: ["app/admin", "app/api/admin"],
  org: ["app/org", "app/api/org"],
};

const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;

function walkSourceFiles(rootDir: string, relDir: string, out: string[]): void {
  const abs = path.join(rootDir, relDir);
  if (!fs.existsSync(abs)) return;
  for (const name of fs.readdirSync(abs)) {
    if (name.startsWith(".")) continue;
    const rel = path.join(relDir, name);
    const full = path.join(rootDir, rel);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkSourceFiles(rootDir, rel, out);
    else if (SOURCE_EXT.test(name)) out.push(rel.replace(/\\/g, "/"));
  }
}

/** Hash estável por portal — muda só quando arquivos daquela área mudam no deploy. Só Node (build). */
export function computeSurfaceBuildIds(webRoot: string): Record<AppSurface, string> {
  const out = {} as Record<AppSurface, string>;
  for (const surface of Object.keys(SURFACE_ROOTS) as AppSurface[]) {
    const files = [
      ...new Set(
        SURFACE_ROOTS[surface].flatMap((dir) => {
          const acc: string[] = [];
          walkSourceFiles(webRoot, dir, acc);
          return acc;
        })
      ),
    ].sort();
    const hash = createHash("sha256");
    for (const rel of files) {
      hash.update(rel);
      try {
        hash.update(fs.readFileSync(path.join(webRoot, rel)));
      } catch {
        /* ignore missing */
      }
    }
    out[surface] = files.length > 0 ? hash.digest("hex").slice(0, 12) : "empty";
  }
  return out;
}
