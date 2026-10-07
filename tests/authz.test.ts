import { describe, expect, it } from "vitest";
import { authorize, hasRole, isBanned, type AuthUser } from "@/server/auth/authz";

const u = (o: Partial<AuthUser> = {}): AuthUser => ({
  id: "1", email: "a@b.c", name: "A", role: "user", banned: false, mustChangePassword: false, ...o,
});

describe("authorize", () => {
  it("anonyme → unauthenticated", () => expect(authorize(null)).toEqual({ ok: false, reason: "unauthenticated" }));
  it("user sur route user → ok", () => expect(authorize(u()).ok).toBe(true));
  it("user sur route admin → forbidden", () =>
    expect(authorize(u(), { role: "admin" })).toEqual({ ok: false, reason: "forbidden" }));
  it("admin sur route admin → ok", () => expect(authorize(u({ role: "admin" }), { role: "admin" }).ok).toBe(true));
  it("banni → banned, même admin", () =>
    expect(authorize(u({ role: "admin", banned: true }), { role: "admin" })).toEqual({ ok: false, reason: "banned" }));
  it("ban expiré → autorisé", () =>
    expect(isBanned({ banned: true, banExpires: new Date(Date.now() - 1000) })).toBe(false));
  it("changement de mot de passe obligatoire → bloque sauf exception", () => {
    expect(authorize(u({ mustChangePassword: true }))).toEqual({ ok: false, reason: "must-change-password" });
    expect(authorize(u({ mustChangePassword: true }), { allowMustChangePassword: true }).ok).toBe(true);
  });
  it("rôle comparé strictement (pas de sous-chaîne)", () => {
    expect(hasRole({ role: "superadmin" }, "admin")).toBe(false);
    expect(hasRole({ role: "user,admin" }, "admin")).toBe(true);
  });
});
