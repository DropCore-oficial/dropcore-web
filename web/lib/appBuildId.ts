/** Identificador do deploy/build — muda a cada deploy na Vercel. */
export function getAppBuildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (sha) return sha.slice(0, 12);

  const deployment = process.env.VERCEL_DEPLOYMENT_ID?.trim();
  if (deployment) return deployment;

  const pub = process.env.NEXT_PUBLIC_BUILD_ID?.trim();
  if (pub) return pub;

  if (process.env.NODE_ENV === "development") return "dev";

  return "local";
}
