import { describe, expect, it } from "vitest";
import { isDropcoreLoginPath, isPortalPublicPath } from "./portalPublicPaths";

describe("isDropcoreLoginPath", () => {
  it("reconhece todos os logins do produto", () => {
    expect(isDropcoreLoginPath("/login")).toBe(true);
    expect(isDropcoreLoginPath("/seller/login")).toBe(true);
    expect(isDropcoreLoginPath("/fornecedor/login")).toBe(true);
    expect(isDropcoreLoginPath("/calculadora/login")).toBe(true);
  });

  it("não confunde dashboard com login", () => {
    expect(isDropcoreLoginPath("/seller/dashboard")).toBe(false);
    expect(isDropcoreLoginPath("/login-extra")).toBe(false);
  });
});

describe("isPortalPublicPath", () => {
  it("trata qualquer login como público em qualquer surface", () => {
    expect(isPortalPublicPath("/seller/login", "seller")).toBe(true);
    expect(isPortalPublicPath("/login", "admin")).toBe(true);
  });
});
