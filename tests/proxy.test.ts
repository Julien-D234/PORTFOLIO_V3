import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3000${path}`, { headers });

describe("proxy", () => {
  it("redirige / vers la langue négociée", () => {
    const res = proxy(req("/", { "accept-language": "en-GB,en;q=0.8" }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/en");
  });
  it("conserve le chemin lors de la redirection", () => {
    const res = proxy(req("/projects"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/fr/projects");
  });
  it("pose une CSP avec nonce différent à chaque requête", () => {
    const a = proxy(req("/fr")).headers.get("content-security-policy")!;
    const b = proxy(req("/fr")).headers.get("content-security-policy")!;
    expect(a).toMatch(/nonce-/);
    expect(a).not.toBe(b);
  });
});
