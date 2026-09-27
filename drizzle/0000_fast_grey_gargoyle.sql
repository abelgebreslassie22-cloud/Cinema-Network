CREATE TABLE "ad_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"description" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text,
	"password" text,
	"password_hash" text,
	"salt" text,
	"is_default_password" boolean,
	"login_history" jsonb
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"type" text,
	"target_url" text,
	"image_url" text,
	"script_content" text,
	"start_date" text,
	"end_date" text,
	"active" boolean DEFAULT true,
	"weight" integer DEFAULT 1,
	"locations" jsonb,
	"stats" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "analytics_downloads" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text,
	"timestamp" timestamp DEFAULT now(),
	"user_id" text,
	"session_id" text,
	"category" text,
	"title" text
);
--> statement-breakpoint
CREATE TABLE "analytics_views" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text,
	"timestamp" timestamp DEFAULT now(),
	"user_id" text,
	"session_id" text,
	"category" text,
	"title" text
);
--> statement-breakpoint
CREATE TABLE "content" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"original_title" text,
	"name" text,
	"original_name" text,
	"year" integer,
	"rating" real,
	"votes" integer,
	"duration" text,
	"category" text,
	"genres" jsonb,
	"description" text,
	"poster_url" text,
	"backdrop_url" text,
	"director" text,
	"cast" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"language" text,
	"country" text,
	"is_indian" boolean DEFAULT false,
	"franchise_id" text,
	"franchise_order" integer,
	"franchise_name" text,
	"franchise" text,
	"franchise_description" text,
	"trailer_url" text,
	"network" text,
	"actors_data" jsonb,
	"studios_data" jsonb,
	"male_actors" jsonb,
	"female_actors" jsonb,
	"director_photo_url" text,
	"season_data" jsonb,
	"qualities" jsonb,
	"release_date" text,
	"status" text,
	"format" text,
	"tmdb_id" integer,
	"overview" text,
	"budget" integer,
	"revenue" integer,
	"seasons" integer,
	"episodes" integer,
	"creator" text,
	"networks" jsonb,
	"platforms" jsonb,
	"nominations" integer,
	"awards_won" integer,
	"rating_checked_at" timestamp,
	"metadata_checked_at" timestamp,
	"search_text" text
);
--> statement-breakpoint
CREATE TABLE "franchise_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"description" text,
	"movie_count" integer,
	"average_rating" real,
	"year_range" text,
	"poster_url" text,
	"backdrop_url" text,
	"category" text,
	"associated_ids" jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "homepage_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb,
	"version" integer DEFAULT 1,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leaderboard_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"period" text,
	"category" text,
	"items" jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"year" text,
	"type" text,
	"tmdb_id" integer,
	"status" text DEFAULT 'pending',
	"requested_by" text,
	"requested_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_type" text,
	"entity_type" text,
	"entity_id" text,
	"target_database" text,
	"payload" jsonb,
	"status" text DEFAULT 'pending',
	"retry_count" integer DEFAULT 0,
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"content_id" text,
	"list_type" text,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"content_id" text,
	"rating" real,
	"rated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"password_hash" text,
	"providers" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "idx_downloads_content_time" ON "analytics_downloads" USING btree ("content_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_content_franchise" ON "content" USING btree ("franchise");--> statement-breakpoint
CREATE INDEX "idx_content_tmdb_id" ON "content" USING btree ("tmdb_id");--> statement-breakpoint
CREATE INDEX "idx_content_category" ON "content" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_user_lists_user_type" ON "user_lists" USING btree ("user_id","list_type");--> statement-breakpoint
CREATE INDEX "idx_ratings_content_id" ON "user_ratings" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_ratings_user_content" ON "user_ratings" USING btree ("user_id","content_id");