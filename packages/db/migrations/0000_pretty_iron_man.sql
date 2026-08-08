CREATE TABLE "song_edits" (
	"id" serial PRIMARY KEY NOT NULL,
	"song_id" integer NOT NULL,
	"kind" varchar(30) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_lyrics" (
	"song_id" integer NOT NULL,
	"measure" integer NOT NULL,
	"beat" numeric(6, 3) NOT NULL,
	"text" varchar(40) NOT NULL,
	CONSTRAINT "song_lyrics_song_id_measure_beat_pk" PRIMARY KEY("song_id","measure","beat")
);
--> statement-breakpoint
CREATE TABLE "song_measures" (
	"song_id" integer NOT NULL,
	"measure" integer NOT NULL,
	"page_no" integer NOT NULL,
	"system_idx" integer NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"w" integer NOT NULL,
	"h" integer NOT NULL,
	CONSTRAINT "song_measures_song_id_measure_pk" PRIMARY KEY("song_id","measure")
);
--> statement-breakpoint
CREATE TABLE "song_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"song_id" integer NOT NULL,
	"page_no" integer NOT NULL,
	"image_key" varchar(500) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	CONSTRAINT "song_pages_song_page_uq" UNIQUE("song_id","page_no")
);
--> statement-breakpoint
CREATE TABLE "song_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"song_id" integer NOT NULL,
	"part" varchar(10) NOT NULL,
	"notes" jsonb NOT NULL,
	"rests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note_count" integer DEFAULT 0 NOT NULL,
	"pitch_min" integer,
	"pitch_max" integer,
	CONSTRAINT "song_parts_song_part_uq" UNIQUE("song_id","part")
);
--> statement-breakpoint
CREATE TABLE "song_warnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"song_id" integer NOT NULL,
	"code" varchar(40) NOT NULL,
	"severity" varchar(10) NOT NULL,
	"message" text NOT NULL,
	"measures" jsonb,
	"part" varchar(10),
	"detail" jsonb,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"composer" varchar(200),
	"arranger" varchar(200),
	"file_name" varchar(300) NOT NULL,
	"file_key" varchar(500) NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"file_kind" varchar(16) NOT NULL,
	"source" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"layout" varchar(24),
	"key_fifths" integer,
	"time_num" integer,
	"time_den" integer,
	"tempo_bpm" integer,
	"measure_count" integer DEFAULT 0 NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"elapsed_ms" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "song_edits" ADD CONSTRAINT "song_edits_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_lyrics" ADD CONSTRAINT "song_lyrics_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_measures" ADD CONSTRAINT "song_measures_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_pages" ADD CONSTRAINT "song_pages_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_parts" ADD CONSTRAINT "song_parts_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_warnings" ADD CONSTRAINT "song_warnings_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "song_warnings_song_idx" ON "song_warnings" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "songs_created_idx" ON "songs" USING btree ("created_at" DESC NULLS LAST);