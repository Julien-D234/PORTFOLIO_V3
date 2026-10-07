import { and, count, desc, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";
import { auditLog, session, user } from "../db/schema";
import type { Db } from "../db/types";

/**
 * Lectures réservées à l'administration. À n'appeler QUE depuis des pages ou
 * handlers protégés par requireAdmin / requireApi("admin") : ces fonctions ne
 * vérifient pas les droits. Les colonnes sont énumérées explicitement : ni hash
 * de mot de passe (table account), ni jeton de session (session.token) ne sont
 * jamais sélectionnés.
 */

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
const MAX_QUERY_LENGTH = 100;

export type UserStatus = "active" | "banned" | "locked";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  failedLoginCount: number;
  locale: string;
  createdAt: Date;
  /** Statut dérivé (voir deriveStatus). */
  status: UserStatus;
}

export interface AdminSessionRow {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** Statut affiché : un ban expiré ne compte plus, un verrouillage non échu oui. */
export function deriveStatus(
  u: { banned: boolean; banExpires: Date | null; lockedUntil: Date | null },
  now = new Date(),
): UserStatus {
  if (u.banned && (!u.banExpires || u.banExpires > now)) return "banned";
  if (u.lockedUntil && u.lockedUntil > now) return "locked";
  return "active";
}

/** Normalise page/taille issues de l'URL (entrées non fiables). */
export function normalizePaging(
  input: { page?: unknown; pageSize?: unknown } = {},
): { page: number; pageSize: number } {
  const toInt = (v: unknown, d: number) => {
    const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
    return Number.isInteger(n) && n > 0 ? n : d;
  };
  return {
    page: Math.min(toInt(input.page, 1), 1_000_000),
    pageSize: Math.min(toInt(input.pageSize, PAGE_SIZE), MAX_PAGE_SIZE),
  };
}

/** Échappe %, _ et \ pour un LIKE : la recherche est littérale. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

const userColumns = {
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  banned: user.banned,
  banReason: user.banReason,
  banExpires: user.banExpires,
  mustChangePassword: user.mustChangePassword,
  lockedUntil: user.lockedUntil,
  failedLoginCount: user.failedLoginCount,
  locale: user.locale,
  createdAt: user.createdAt,
} as const;

const withStatus = (r: Omit<AdminUserRow, "status">): AdminUserRow => ({ ...r, status: deriveStatus(r) });

export async function listUsers(
  db: Db,
  opts: { q?: string; page?: unknown; pageSize?: unknown } = {},
): Promise<Page<AdminUserRow>> {
  const { page, pageSize } = normalizePaging(opts);
  const q = (opts.q ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const where = q
    ? or(
        ilike(user.email, `%${escapeLike(q)}%`),
        ilike(user.name, `%${escapeLike(q)}%`),
      )
    : undefined;

  const [{ total }] = await db.select({ total: count() }).from(user).where(where);
  const rows = await db
    .select(userColumns)
    .from(user)
    .where(where)
    .orderBy(desc(user.createdAt), user.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return toPage(rows.map(withStatus), total, page, pageSize);
}

export async function getUser(
  db: Db,
  id: string,
  now = new Date(),
): Promise<{ user: AdminUserRow; sessions: AdminSessionRow[] } | null> {
  const [u] = await db.select(userColumns).from(user).where(eq(user.id, id)).limit(1);
  if (!u) return null;
  const sessions = await db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(and(eq(session.userId, id), gt(session.expiresAt, now)))
    .orderBy(desc(session.createdAt));
  return { user: withStatus(u), sessions };
}

export interface AuditRow {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetId: string | null;
  targetEmail: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: Date;
}

function parseMeta(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v: unknown = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function listAudit(
  db: Db,
  opts: { action?: string; target?: string; page?: unknown; pageSize?: unknown } = {},
): Promise<Page<AuditRow>> {
  const { page, pageSize } = normalizePaging(opts);
  const action = (opts.action ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const target = (opts.target ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  const conds: SQL[] = [];
  if (action) conds.push(eq(auditLog.action, action));
  if (target) conds.push(eq(auditLog.targetId, target));
  const where = conds.length ? and(...conds) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(auditLog).where(where);
  const actor = db.$with("actor").as(db.select({ id: user.id, email: user.email }).from(user));
  const tgt = db.$with("tgt").as(db.select({ id: user.id, email: user.email }).from(user));
  const rows = await db
    .with(actor, tgt)
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorEmail: sql<string | null>`${actor.email}`,
      action: auditLog.action,
      targetId: auditLog.targetId,
      targetEmail: sql<string | null>`${tgt.email}`,
      metadata: auditLog.metadata,
      ip: auditLog.ip,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorId))
    .leftJoin(tgt, eq(tgt.id, auditLog.targetId))
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return toPage(
    rows.map((r) => ({ ...r, metadata: parseMeta(r.metadata) })),
    total,
    page,
    pageSize,
  );
}

/** Actions distinctes présentes dans le journal (pour le filtre). */
export async function listAuditActions(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ action: auditLog.action }).from(auditLog).orderBy(auditLog.action);
  return rows.map((r) => r.action);
}
