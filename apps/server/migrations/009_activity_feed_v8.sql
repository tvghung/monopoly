-- V8 adds a bounded, typed public activity tail. Historical logs are not
-- reinterpreted as structured events.
DO $$
DECLARE
  room_row RECORD;
  board_state JSONB;
  game_state JSONB;
BEGIN
  FOR room_row IN
    SELECT id, game_snapshot
    FROM rooms
    WHERE snapshot_schema_version = 7
    FOR UPDATE
  LOOP
    board_state := (((room_row.game_snapshot->'gameState'->'boardState') - 'activityFeed'::TEXT)
      || JSONB_BUILD_OBJECT(
        'activityFeed', JSONB_BUILD_OBJECT('sequence', 0, 'events', JSONB_BUILD_ARRAY())
      ));
    game_state := ((((room_row.game_snapshot->'gameState') - 'boardState'::TEXT)
      || JSONB_BUILD_OBJECT('boardState', board_state)));

    UPDATE rooms
    SET game_snapshot = (((room_row.game_snapshot) - 'gameState'::TEXT)
          || JSONB_BUILD_OBJECT('gameState', game_state)),
        snapshot_schema_version = 8,
        aggregate_version = aggregate_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = room_row.id;
  END LOOP;
END $$;
