import { pgTable, text, timestamp, integer, real, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const content = pgTable("content", {
  id: text("id").primaryKey(),
  title: text("title"),
  originalTitle: text("original_title"),
  name: text("name"),
  originalName: text("original_name"),
  year: integer("year"),
  rating: real("rating"),
  votes: integer("votes"),
  duration: text("duration"),
  category: text("category"),
  genres: jsonb("genres"),
  description: text("description"),
  posterUrl: text("poster_url"),
  backdropUrl: text("backdrop_url"),
  director: text("director"),
  cast: jsonb("cast"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  language: text("language"),
  country: text("country"),
  isIndian: boolean("is_indian").default(false),
  franchiseId: text("franchise_id"),
  franchiseOrder: integer("franchise_order"),
  franchiseName: text("franchise_name"),
  franchise: text("franchise"),
  franchiseDescription: text("franchise_description"),
  trailerUrl: text("trailer_url"),
  network: text("network"),
  actorsData: jsonb("actors_data"),
  studiosData: jsonb("studios_data"),
  maleActors: jsonb("male_actors"),
  femaleActors: jsonb("female_actors"),
  directorPhotoUrl: text("director_photo_url"),
  seasonData: jsonb("season_data"),
  qualities: jsonb("qualities"),
  releaseDate: text("release_date"),
  status: text("status"),
  format: text("format"),
  tmdbId: integer("tmdb_id"),
  overview: text("overview"),
  budget: integer("budget"),
  revenue: integer("revenue"),
  seasons: integer("seasons"),
  episodes: integer("episodes"),
  creator: text("creator"),
  networks: jsonb("networks"),
  platforms: jsonb("platforms"),
  nominations: integer("nominations"),
  awardsWon: integer("awards_won"),
  ratingCheckedAt: timestamp("rating_checked_at"),
  metadataCheckedAt: timestamp("metadata_checked_at"),
  searchText: text("search_text"),
}, (table) => [
  index("idx_content_franchise").on(table.franchise),
  index("idx_content_tmdb_id").on(table.tmdbId),
  index("idx_content_category").on(table.category),
  index("idx_content_search_text").using("gin", sql`to_tsvector('english', ${table.searchText})`),
  index("idx_content_title_trgm").using("gin", sql`${table.title} gin_trgm_ops`)
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  displayName: text("display_name"),
  name: text("name"),
  username: text("username"),
  plainPassword: text("plain_password"),
  passwordHash: text("password_hash"),
  providers: jsonb("providers"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const syncOperations = pgTable("sync_operations", {
  id: text("id").primaryKey(),
  operationType: text("operation_type"), 
  entityType: text("entity_type"), 
  entityId: text("entity_id"),
  targetDatabase: text("target_database"), 
  payload: jsonb("payload"),
  status: text("status").default("pending"), 
  retryCount: integer("retry_count").default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const requests = pgTable("requests", {
  id: text("id").primaryKey(),
  title: text("title"),
  year: text("year"),
  type: text("type"),
  tmdbId: integer("tmdb_id"),
  status: text("status").default("pending"),
  requestedBy: text("requested_by"),
  requestedAt: timestamp("requested_at").defaultNow(),
});

export const ads = pgTable("ads", {
  id: text("id").primaryKey(),
  title: text("title"),
  type: text("type"),
  targetUrl: text("target_url"),
  imageUrl: text("image_url"),
  scriptContent: text("script_content"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  active: boolean("active").default(true),
  weight: integer("weight").default(1),
  locations: jsonb("locations"),
  stats: jsonb("stats"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adSlots = pgTable("ad_slots", {
  id: text("id").primaryKey(),
  name: text("name"),
  description: text("description"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const analyticsDownloads = pgTable("analytics_downloads", {
  id: text("id").primaryKey(),
  contentId: text("content_id"),
  timestamp: timestamp("timestamp").defaultNow(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  category: text("category"),
  title: text("title"),
}, (table) => [
  index("idx_downloads_content_time").on(table.contentId, table.timestamp)
]);

export const analyticsViews = pgTable("analytics_views", {
  id: text("id").primaryKey(),
  contentId: text("content_id"),
  timestamp: timestamp("timestamp").defaultNow(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  category: text("category"),
  title: text("title"),
});

export const adminSettings = pgTable("admin_settings", {
  id: text("id").primaryKey(),
  username: text("username"),
  password: text("password"),
  passwordHash: text("password_hash"),
  salt: text("salt"),
  isDefaultPassword: boolean("is_default_password"),
  loginHistory: jsonb("login_history"),
});

export const userLists = pgTable("user_lists", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  contentId: text("content_id"),
  listType: text("list_type"), // e.g. "watchlist", "favorites", "watched"
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => [
  index("idx_user_lists_user_type").on(table.userId, table.listType)
]);

export const userRatings = pgTable("user_ratings", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  contentId: text("content_id"),
  rating: real("rating"),
  ratedAt: timestamp("rated_at").defaultNow(),
}, (table) => [
  index("idx_ratings_content_id").on(table.contentId),
  index("idx_ratings_user_content").on(table.userId, table.contentId)
]);

export const homepageCache = pgTable("homepage_cache", {
  key: text("key").primaryKey(),
  data: jsonb("data"),
  version: integer("version").default(1),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const leaderboardCache = pgTable("leaderboard_cache", {
  id: text("id").primaryKey(),
  period: text("period"),
  category: text("category"),
  items: jsonb("items"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const franchiseCache = pgTable("franchise_cache", {
  id: text("id").primaryKey(),
  name: text("name"),
  description: text("description"),
  movieCount: integer("movie_count"),
  averageRating: real("average_rating"),
  yearRange: text("year_range"),
  posterUrl: text("poster_url"),
  backdropUrl: text("backdrop_url"),
  category: text("category"),
  associatedIds: jsonb("associated_ids"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
