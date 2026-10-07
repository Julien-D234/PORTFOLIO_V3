import { describe, expect, it } from "vitest";
import { negotiateLocale, isLocale } from "@/i18n/config";
import fr from "../messages/fr.json";
import en from "../messages/en.json";

const keys = (o: object, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v, `${p}${k}.`) : [`${p}${k}`],
  );

describe("negotiateLocale", () => {
  it("priorise un cookie valide", () => expect(negotiateLocale("en", "fr-FR")).toBe("en"));
  it("ignore un cookie invalide", () => expect(negotiateLocale("xx", "en-US")).toBe("en"));
  it("respecte les poids q", () =>
    expect(negotiateLocale(undefined, "de;q=0.9,en;q=0.8,fr;q=0.1")).toBe("en"));
  it("retombe sur le défaut", () => expect(negotiateLocale(undefined, "de,es")).toBe("fr"));
  it("tolère un en-tête malformé", () =>
    expect(negotiateLocale(undefined, ";;q=abc,,")).toBe("fr"));
  it("isLocale rejette les valeurs hors liste", () => {
    expect(isLocale("__proto__")).toBe(false);
    expect(isLocale("fr")).toBe(true);
  });
});

describe("messages", () => {
  it("fr et en ont exactement les mêmes clés", () =>
    expect(keys(en).sort()).toEqual(keys(fr).sort()));
});
