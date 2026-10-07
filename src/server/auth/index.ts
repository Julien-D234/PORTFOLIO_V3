import "server-only";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "../db";
import { env } from "../env";
import { createAuth, type Auth } from "./create-auth";

let instance: Auth | undefined;

/** Instance unique, créée au premier usage (pas au build). */
export function getAuth(): Auth {
  if (!instance) {
    const e = env();
    instance = createAuth(getDb(), {
      secret: e.BETTER_AUTH_SECRET,
      baseURL: e.BETTER_AUTH_URL,
      production: e.NODE_ENV === "production",
      extraPlugins: [nextCookies()], // doit rester le dernier plugin
    });
  }
  return instance;
}
