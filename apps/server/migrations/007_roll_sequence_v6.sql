-- v6 adds the durable public identity for accepted gameplay dice rolls.
-- Existing V5 rooms intentionally start at zero; historical roll counts are
-- not reconstructible from the stored dice, turn, logs, or aggregate version.
DO $$
DECLARE
  room_row RECORD;
  board_state JSONB;
  game_state JSONB;
BEGIN
  FOR room_row IN
    SELECT id, game_snapshot
    FROM rooms
    WHERE snapshot_schema_version = 5
    FOR UPDATE
  LOOP
    board_state := ((room_row.game_snapshot->'gameState'->'boardState') - 'rollSequence'::TEXT)
      || JSONB_BUILD_OBJECT('rollSequence', 0);
    game_state := ((room_row.game_snapshot->'gameState') - 'boardState'::TEXT)
      || JSONB_BUILD_OBJECT('boardState', board_state);

    UPDATE rooms
    SET game_snapshot = ((room_row.game_snapshot) - 'gameState'::TEXT)
          || JSONB_BUILD_OBJECT('gameState', game_state),
        snapshot_schema_version = 6,
        aggregate_version = aggregate_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = room_row.id;
  END LOOP;
END $$;
