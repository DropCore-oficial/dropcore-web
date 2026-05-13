import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICIAL_PROJECT = "dropcore-web";
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..");

const linkPath = [join(repoRoot, ".vercel", "project.json"), join(webRoot, ".vercel", "project.json")].find(
  (path) => existsSync(path),
);

if (!linkPath) {
  console.error(
    `[deploy] Link Vercel ausente. Na raiz do repo: npx vercel link e escolha "${OFFICIAL_PROJECT}" (não crie "web").`,
  );
  process.exit(1);
}

let link;
try {
  link = JSON.parse(readFileSync(linkPath, "utf8"));
} catch {
  console.error(`[deploy] ${linkPath} inválido.`);
  process.exit(1);
}

if (link.projectName !== OFFICIAL_PROJECT) {
  console.error(
    `[deploy] CLI ligado ao projeto "${link.projectName}". Produção do DropCore é só "${OFFICIAL_PROJECT}". Rode: npx vercel link na raiz do repo.`,
  );
  process.exit(1);
}
