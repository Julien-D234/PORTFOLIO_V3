import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";

describe("buildCsp", () => {
  const prod = buildCsp("abc", false);
  it("utilise le nonce et strict-dynamic", () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
  });
  it("n'autorise ni unsafe-eval ni unsafe-inline en production", () => {
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).not.toContain("unsafe-inline");
  });
  it("interdit framing, objets et base-uri externes", () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
  });
  it("autorise unsafe-eval seulement en dev", () => {
    expect(buildCsp("abc", true)).toContain("'unsafe-eval'");
  });
});
