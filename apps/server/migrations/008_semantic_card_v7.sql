-- V7 adds bounded authoritative semantic event lanes and the durable card
-- interaction contract. Existing rooms receive empty reconnect baselines;
-- historical logs and state diffs are intentionally not reconstructed.
DO $$
DECLARE
  room_row RECORD;
  board_state JSONB;
  private_state JSONB;
  game_state JSONB;
BEGIN
  FOR room_row IN
    SELECT id, game_snapshot
    FROM rooms
    WHERE snapshot_schema_version = 6
    FOR UPDATE
  LOOP
    board_state := (((room_row.game_snapshot->'gameState'->'boardState') - 'gameplayEvents'::TEXT)
      || JSONB_BUILD_OBJECT('gameplayEvents', JSONB_BUILD_OBJECT('sequence', 0, 'events', JSONB_BUILD_ARRAY())));
    private_state := ((((room_row.game_snapshot->'gameState'->'privateState') - 'privateGameplayEventsByPlayer'::TEXT) - 'completedCardOperations'::TEXT)
      || JSONB_BUILD_OBJECT(
        'privateGameplayEventsByPlayer', JSONB_BUILD_OBJECT(),
        'completedCardOperations', JSONB_BUILD_ARRAY()
      ));
    game_state := ((((room_row.game_snapshot->'gameState') - 'boardState'::TEXT) - 'privateState'::TEXT)
      || JSONB_BUILD_OBJECT('boardState', board_state, 'privateState', private_state));

    UPDATE rooms
    SET game_snapshot = (((room_row.game_snapshot) - 'gameState'::TEXT)
          || JSONB_BUILD_OBJECT('gameState', game_state)),
        snapshot_schema_version = 7,
        aggregate_version = aggregate_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = room_row.id;
  END LOOP;
END $$;
