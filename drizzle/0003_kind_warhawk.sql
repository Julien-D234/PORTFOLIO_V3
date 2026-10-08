CREATE TABLE "media_file" (
	"id" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"repo_url" text,
	"live_url" text,
	"started_at" date,
	"cover_image_id" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_slug_unique" UNIQUE("slug"),
	CONSTRAINT "project_status_check" CHECK ("project"."status" in ('draft', 'published')),
	CONSTRAINT "project_slug_check" CHECK ("project"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("project"."slug") <= 80)
);
--> statement-breakpoint
CREATE TABLE "project_image" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"file_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"alt_fr" text DEFAULT '' NOT NULL,
	"alt_en" text DEFAULT '' NOT NULL,
	"caption_fr" text DEFAULT '' NOT NULL,
	"caption_en" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tag" (
	"project_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "project_tag_project_id_tag_id_pk" PRIMARY KEY("project_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "project_translation" (
	"project_id" text NOT NULL,
	"lang" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cover_alt" text DEFAULT '' NOT NULL,
	CONSTRAINT "project_translation_project_id_lang_pk" PRIMARY KEY("project_id","lang"),
	CONSTRAINT "project_translation_summary_check" CHECK (char_length("project_translation"."summary") <= 200)
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_cover_image_id_media_file_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_image" ADD CONSTRAINT "project_image_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_image" ADD CONSTRAINT "project_image_file_id_media_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tag" ADD CONSTRAINT "project_tag_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tag" ADD CONSTRAINT "project_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation" ADD CONSTRAINT "project_translation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_status_position_idx" ON "project" USING btree ("status","position");--> statement-breakpoint
CREATE INDEX "project_image_project_idx" ON "project_image" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "project_tag_tag_idx" ON "project_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_name_lower_idx" ON "tag" USING btree (lower("name"));