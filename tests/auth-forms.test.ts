import { describe, expect, it } from "vitest";
import { changePasswordSchema, loginErrorKey, loginSchema, safeRedirect } from "@/lib/auth-forms";

describe("safeRedirect", () => {
  it("accepte les chemins internes en liste blanche dans la même langue", () => {
    expect(safeRedirect("/fr/profile", "fr")).toBe("/fr/profile");
    expect(safeRedirect("/en/admin/users?page=2", "en")).toBe("/en/admin/users?page=2");
    expect(safeRedirect("/fr", "fr")).toBe("/fr");
  });
  it.each([
    "//evil.com", "/\\evil.com", "\\\\evil.com", "https://evil.com", "http://evil.com/fr",
    "javascript:alert(1)", "/fr/../../etc", "/en/profile", "/fr/api/auth/sign-out", "/fr/login",
    "/fr/%2e%2e/x", "/fr/profile\r\nSet-Cookie:a=b", "  /fr/profile", "fr/profile", "", "/\t/evil.com",
  ])("rejette %j", (bad) => {
    expect(safeRedirect(bad, "fr")).toBe("/fr");
  });
  it("gère les types inattendus et une langue invalide", () => {
    expect(safeRedirect(undefined, "fr")).toBe("/fr");
    expect(safeRedirect(["/fr/profile"], "fr")).toBe("/fr");
    expect(safeRedirect("/fr/profile", "xx")).toBe("/fr/profile");
  });
});

describe("schémas", () => {
  it("login", () => {
    expect(loginSchema.safeParse({ email: " a@b.co ", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "pas-un-mail", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
  it("changement de mot de passe", () => {
    const ok = { currentPassword: "ancien", newPassword: "nouveau-mdp-12", confirmPassword: "nouveau-mdp-12" };
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: "court", confirmPassword: "court" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, confirmPassword: "autre-mdp-1234" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, currentPassword: ok.newPassword }).success).toBe(false);
  });
});

describe("loginErrorKey", () => {
  it("mappe les statuts", () => {
    expect(loginErrorKey(401)).toBe("invalid");
    expect(loginErrorKey(429)).toBe("rateLimited");
    expect(loginErrorKey(403)).toBe("unavailable");
    expect(loginErrorKey(500)).toBe("network");
  });
});
