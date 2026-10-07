import "server-only";
import type { Locale } from "./config";
import type fr from "../../messages/fr.json";

// fr.json fait référence pour la forme ; en.json doit avoir exactement la même structure.
export type Dictionary = typeof fr;

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  fr: () => import("../../messages/fr.json").then((m) => m.default),
  en: () => import("../../messages/en.json").then((m) => m.default),
};

export const getDictionary = (locale: Locale): Promise<Dictionary> => dictionaries[locale]();
