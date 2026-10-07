// Postgres en mémoire (PGlite) exposé sur 127.0.0.1:5432 : développement sans Docker.
//   npm run dev:db   puis   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
// Les données sont perdues à l'arrêt (ou stockées dans PGLITE_DIR si défini).
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.PORT ?? 5432);
const db = await PGlite.create(process.env.PGLITE_DIR);
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
await server.start();
console.log(`PGlite prêt sur 127.0.0.1:${port}`);
