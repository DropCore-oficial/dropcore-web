import { describe, expect, it } from "vitest";
import path from "path";
import { computeSurfaceBuildIds } from "./appSurfaceVersion";

describe("computeSurfaceBuildIds", () => {
  it("gera ids distintos por portal quando as pastas existem", () => {
    const webRoot = path.join(process.cwd());
    const ids = computeSurfaceBuildIds(webRoot);
    expect(ids.seller).toMatch(/^[a-f0-9]{12}$/);
    expect(ids.fornecedor).toMatch(/^[a-f0-9]{12}$/);
    expect(ids.admin).toMatch(/^[a-f0-9]{12}$/);
    expect(ids.org).toMatch(/^[a-f0-9]{12}$/);
  });

  it("seller e fornecedor podem divergir (áreas diferentes)", () => {
    const webRoot = path.join(process.cwd());
    const ids = computeSurfaceBuildIds(webRoot);
    expect(ids.seller).not.toBe(ids.fornecedor);
  });
});
