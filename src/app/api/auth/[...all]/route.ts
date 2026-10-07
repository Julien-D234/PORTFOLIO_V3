import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

const handlers = (): ReturnType<typeof toNextJsHandler> => toNextJsHandler(getAuth());

export const GET = (req: Request) => handlers().GET(req);
export const POST = (req: Request) => handlers().POST(req);
