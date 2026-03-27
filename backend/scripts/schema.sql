CREATE TABLE IF NOT EXISTS "books" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
	"external_key" text CONSTRAINT "books_external_key_key" UNIQUE,
	"cover_id" integer,
	"title" text NOT NULL,
	"authors" text[] DEFAULT '{}' NOT NULL,
	"genres" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"year" integer,
	"pages" integer,
	"language" text DEFAULT 'id',
	"avg_rating" numeric(3, 2) DEFAULT '0.00',
	"rating_count" integer DEFAULT 0,
	"total_stock" integer DEFAULT 5,
	"available" integer DEFAULT 5,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"cover_url" text
);
CREATE TABLE IF NOT EXISTS "follows" (
	"follower_id" uuid,
	"following_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "follows_pkey" PRIMARY KEY("follower_id","following_id"),
	CONSTRAINT "follows_check" CHECK ((follower_id <> following_id))
);
CREATE TABLE IF NOT EXISTS "loans" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"borrowed_at" timestamp with time zone DEFAULT now(),
	"due_at" timestamp with time zone DEFAULT (now() + '7 days'::interval),
	"returned_at" timestamp with time zone,
	"extended" boolean DEFAULT false,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "loans_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'returned'::text, 'overdue'::text, 'extended'::text])))
);
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"book_id" uuid,
	"actor_id" uuid,
	"read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "notifications_type_check" CHECK ((type = ANY (ARRAY['borrow'::text, 'due'::text, 'like'::text, 'follow'::text, 'review'::text, 'system'::text, 'queue'::text])))
);
CREATE TABLE IF NOT EXISTS "queue" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
	"user_id" uuid NOT NULL UNIQUE,
	"book_id" uuid NOT NULL UNIQUE,
	"position" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now(),
	"notified" boolean DEFAULT false,
	CONSTRAINT "queue_user_id_book_id_key" UNIQUE("user_id","book_id")
);
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
	"user_id" uuid NOT NULL UNIQUE,
	"book_id" uuid NOT NULL UNIQUE,
	"rating" smallint NOT NULL,
	"body" text,
	"likes" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "reviews_user_id_book_id_key" UNIQUE("user_id","book_id"),
	CONSTRAINT "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5)))
);
CREATE TABLE IF NOT EXISTS "user_book_scores" (
	"user_id" uuid,
	"book_id" uuid,
	"score" numeric(8, 3) DEFAULT '0' NOT NULL,
	"views" integer DEFAULT 0,
	"reads" integer DEFAULT 0,
	"likes" integer DEFAULT 0,
	"bookmarks" integer DEFAULT 0,
	"shares" integer DEFAULT 0,
	"review_cnt" integer DEFAULT 0,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_book_scores_pkey" PRIMARY KEY("user_id","book_id")
);
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
	"firebase_uid" text NOT NULL CONSTRAINT "users_firebase_uid_key" UNIQUE,
	"username" text NOT NULL CONSTRAINT "users_username_key" UNIQUE,
	"display_name" text,
	"email" text NOT NULL CONSTRAINT "users_email_key" UNIQUE,
	"avatar_url" text,
	"bio" text,
	"preferred_genres" text[] DEFAULT '{}',
	"reading_streak" integer DEFAULT 0,
	"total_read" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "usersurvey" (
	"id" serial PRIMARY KEY,
	"userid" uuid NOT NULL,
	"favoritegenre" text,
	"age" text,
	"gender" text,
	"createdat" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updatedat" timestamp DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "wishlist" (
	"user_id" uuid,
	"book_id" uuid,
	"added_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wishlist_pkey" PRIMARY KEY("user_id","book_id")
);
CREATE INDEX IF NOT EXISTS "idx_books_authors" ON "books" USING gin ("authors");
CREATE INDEX IF NOT EXISTS "idx_books_genres" ON "books" USING gin ("genres");
CREATE INDEX IF NOT EXISTS "idx_follows_follower" ON "follows" ("follower_id");
CREATE INDEX IF NOT EXISTS "idx_follows_following" ON "follows" ("following_id");
CREATE INDEX IF NOT EXISTS "idx_loans_book_id" ON "loans" ("book_id");
CREATE INDEX IF NOT EXISTS "idx_loans_status" ON "loans" ("status");
CREATE INDEX IF NOT EXISTS "idx_loans_user_id" ON "loans" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_notif_created_at" ON "notifications" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_notif_read" ON "notifications" ("user_id","read");
CREATE INDEX IF NOT EXISTS "idx_notif_user_id" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_queue_book_id" ON "queue" ("book_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_book_id" ON "reviews" ("book_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_user_id" ON "reviews" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_ubs_book_id" ON "user_book_scores" ("book_id");
CREATE INDEX IF NOT EXISTS "idx_ubs_score" ON "user_book_scores" ("score");
CREATE INDEX IF NOT EXISTS "idx_ubs_user_id" ON "user_book_scores" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_users_firebase_uid" ON "users" ("firebase_uid");
CREATE INDEX IF NOT EXISTS "idx_users_username" ON "users" ("username");
CREATE INDEX IF NOT EXISTS "idx_survey_userid" ON "usersurvey" ("userid");
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "loans" ADD CONSTRAINT "loans_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE SET NULL;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "queue" ADD CONSTRAINT "queue_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
ALTER TABLE "queue" ADD CONSTRAINT "queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "user_book_scores" ADD CONSTRAINT "user_book_scores_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
ALTER TABLE "user_book_scores" ADD CONSTRAINT "user_book_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "usersurvey" ADD CONSTRAINT "fk_user" FOREIGN KEY ("userid") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
