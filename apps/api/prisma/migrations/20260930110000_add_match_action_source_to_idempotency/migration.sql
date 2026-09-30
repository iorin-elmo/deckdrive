DROP INDEX "match_actions_match_id_player_id_request_id_key";

CREATE UNIQUE INDEX "match_actions_match_id_player_id_request_id_source_key"
ON "match_actions"("match_id", "player_id", "request_id", "source");
