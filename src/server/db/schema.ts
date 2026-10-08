import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Tables gérées par Better Auth (noms et colonnes imposés par la lib) */
/* ------------------------------------------------------------------ */

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // plugin admin
    role: text("role").notNull().default("user"),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires"),
    // champs métier
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    locale: text("locale").notNull().default("fr"),
    // verrouillage temporaire anti brute-force (voir authz.ts)
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until"),
  },
  (t) => [uniqueIndex("user_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Rate limiting persistant (anti brute-force), géré par Better Auth. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Tables métier                                                       */
/* ------------------------------------------------------------------ */

/** Journal d'audit des actions sensibles (append-only par convention). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    // Pas de FK : on conserve la trace même si l'utilisateur est supprimé.
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetId: text("target_id"),
    metadata: text("metadata"), // JSON sérialisé, sans secret
    ip: text("ip"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

/**
 * Invitations de première connexion / réinitialisation : lien à usage unique.
 * Seul le hash SHA-256 du jeton est stocké (jamais le jeton).
 */
export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by"), // pas de FK : trace conservée si l'admin est supprimé
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("invitation_user_id_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Projets (portfolio)                                                 */
/* ------------------------------------------------------------------ */

/** Fichier image uploadé (stocké sur disque hors public/, servi par /media/[id]). */
export const mediaFile = pgTable("media_file", {
  id: text("id").primaryKey(), // aléatoire, non devinable
  mime: text("mime").notNull(), // toujours image/webp après recompression
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bytes: integer("bytes").notNull(),
  createdBy: text("created_by"), // pas de FK : trace conservée
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("draft"), // draft | published
    position: integer("position").notNull().default(0),
    repoUrl: text("repo_url"),
    liveUrl: text("live_url"),
    startedAt: date("started_at", { mode: "string" }),
    coverImageId: text("cover_image_id").references(() => mediaFile.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("project_status_check", sql`${t.status} in ('draft', 'published')`),
    check("project_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${t.slug}) <= 80`),
    index("project_status_position_idx").on(t.status, t.position),
  ],
);

export const projectTranslation = pgTable(
  "project_translation",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    lang: text("lang").notNull(),
    title: text("title").notNull().default(""),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""), // texte brut
    coverAlt: text("cover_alt").notNull().default(""),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.lang] }),
    check("project_translation_summary_check", sql`char_length(${t.summary}) <= 200`),
  ],
);

/** Galerie de la page détail (l'image de la liste est project.coverImageId). */
export const projectImage = pgTable(
  "project_image",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => mediaFile.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
    altFr: text("alt_fr").notNull().default(""),
    altEn: text("alt_en").notNull().default(""),
    captionFr: text("caption_fr").notNull().default(""),
    captionEn: text("caption_en").notNull().default(""),
  },
  (t) => [index("project_image_project_idx").on(t.projectId, t.position)],
);

export const tag = pgTable(
  "tag",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("tag_name_lower_idx").on(sql`lower(${t.name})`)],
);

export const projectTag = pgTable(
  "project_tag",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.tagId] }), index("project_tag_tag_idx").on(t.tagId)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export type DbSchema = {
  user: typeof user;
  session: typeof session;
  account: typeof account;
  verification: typeof verification;
  rateLimit: typeof rateLimit;
  auditLog: typeof auditLog;
  invitation: typeof invitation;
  mediaFile: typeof mediaFile;
  project: typeof project;
  projectTranslation: typeof projectTranslation;
  projectImage: typeof projectImage;
  tag: typeof tag;
  projectTag: typeof projectTag;
};

export type ProjectTranslationInsert = typeof projectTranslation.$inferInsert;
