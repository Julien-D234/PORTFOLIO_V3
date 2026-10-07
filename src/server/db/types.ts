import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Type commun à node-postgres (prod) et PGlite (tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
