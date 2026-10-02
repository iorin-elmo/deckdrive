CREATE TABLE "ranked_enqueue_rate_limits" (
    "player_id" UUID NOT NULL,
    "attempted_at" TIMESTAMPTZ(6)[] NOT NULL,
    CONSTRAINT "ranked_enqueue_rate_limits_pkey" PRIMARY KEY ("player_id"),
    CONSTRAINT "ranked_enqueue_rate_limits_attempts_check" CHECK (
      cardinality("attempted_at") BETWEEN 1 AND 10
    )
);

ALTER TABLE "ranked_enqueue_rate_limits" ADD CONSTRAINT "ranked_enqueue_rate_limits_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
