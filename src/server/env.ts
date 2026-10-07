import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET: 32 caractères minimum"),
  BETTER_AUTH_URL: z.url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

let cached: z.infer<typeof schema> | undefined;

/** Validation paresseuse : échoue au premier usage, pas pendant le build. */
export function env() {
  cached ??= schema.parse(process.env);
  return cached;
}
