import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { authorize, type AuthUser } from "@/server/auth/authz";

const ROOT = join(__dirname, "..", "src", "app");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(ROOT).map((p) => relative(ROOT, p).replaceAll("\\", "/"));
const src = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("matrice d'accès : toute page/endpoint d'administration est gardé côté serveur", () => {
  const adminPages = files.filter((f) => /^\[lang\]\/admin\/.*page\.tsx$/.test(f));
  const adminRoutes = files.filter((f) => /^api\/admin\/.*route\.ts$/.test(f));

  it("détecte bien les pages et routes admin", () => {
    expect(adminPages.length).toBeGreaterThanOrEqual(5);
    expect(adminRoutes.length).toBeGreaterThanOrEqual(3);
  });
  it("chaque page admin appelle requireAdmin", () => {
    for (const f of adminPages) expect(src(f), f).toMatch(/await requireAdmin\(/);
  });
  it("le layout admin appelle requireAdmin", () => {
    expect(src("[lang]/admin/layout.tsx")).toMatch(/await requireAdmin\(/);
  });
  it("chaque route admin : requireApi(\"admin\") avant tout accès aux données, et contrôle d'origine sur les POST", () => {
    for (const f of adminRoutes) {
      const s = src(f);
      expect(s, f).toMatch(/requireApi\("admin"\)/);
      if (/export async function POST/.test(s)) expect(s, f).toMatch(/isSameOrigin\(req\)/);
      expect(s.indexOf("requireApi"), f).toBeLessThan(s.indexOf("getDb()"));
    }
  });
  it("aucune route admin n'expose de méthode autre que POST/GET", () => {
    for (const f of adminRoutes) expect(src(f), f).not.toMatch(/export async function (PUT|PATCH|DELETE)/);
  });
});

describe("authorize : anonyme / utilisateur / admin", () => {
  const base = { id: "u", role: "user", banned: false, banExpires: null, mustChangePassword: false } as unknown as AuthUser;
  const asRole = (role: string, extra: Partial<AuthUser> = {}) => ({ ...base, role, ...extra }) as AuthUser;
  it("anonyme → unauthenticated", () => {
    expect(authorize(null, { role: "admin" })).toMatchObject({ ok: false, reason: "unauthenticated" });
  });
  it("user → forbidden sur admin, ok sur user", () => {
    expect(authorize(asRole("user"), { role: "admin" })).toMatchObject({ ok: false, reason: "forbidden" });
    expect(authorize(asRole("user"), {})).toMatchObject({ ok: true });
  });
  it("admin → ok", () => {
    expect(authorize(asRole("admin"), { role: "admin" })).toMatchObject({ ok: true });
  });
  it("admin banni ou à mot de passe provisoire → refusé", () => {
    expect(authorize(asRole("admin", { banned: true }), { role: "admin" }).ok).toBe(false);
    expect(authorize(asRole("admin", { mustChangePassword: true }), { role: "admin" })).toMatchObject({ ok: false, reason: "must-change-password" });
  });
});
