-- V10 adds the 2v2 lobby seats. Every live player receives a seat inside their team (the next free one, in join order, never above
-- seat 1) and every room starts with no open seat-swap request. Nothing about a game that is already running changes: seats only
-- matter in a lobby, where the 2v2 start orders the match by them.
DO $$
DECLARE
  room_row RECORD;
  entry RECORD;
  member_rows JSONB;
  live_players JSONB;
  next_slot_by_team JSONB;
  team_key TEXT;
  next_slot INTEGER;
  board_state JSONB;
  game_state JSONB;
BEGIN
  FOR room_row IN
    SELECT id, game_snapshot
    FROM rooms
    WHERE snapshot_schema_version = 9
    FOR UPDATE
  LOOP
    member_rows := COALESCE(room_row.game_snapshot->'members', '{}'::JSONB);
    live_players := '{}'::JSONB;
    next_slot_by_team := '{}'::JSONB;
    FOR entry IN
      SELECT key, value
      FROM JSONB_EACH(COALESCE(room_row.game_snapshot->'gameState'->'players', '{}'::JSONB))
      ORDER BY COALESCE((member_rows->key->>'joinOrder')::INTEGER, 0), key
    LOOP
      team_key := entry.value->>'teamId';
      next_slot := COALESCE((next_slot_by_team->>team_key)::INTEGER, 0);
      next_slot_by_team := next_slot_by_team || JSONB_BUILD_OBJECT(team_key, next_slot + 1);
      live_players := live_players || JSONB_BUILD_OBJECT(
        entry.key,
        entry.value || JSONB_BUILD_OBJECT('teamSlot', LEAST(next_slot, 1))
      );
    END LOOP;

    board_state := ((room_row.game_snapshot->'gameState'->'boardState') - 'seatSwapRequests'::TEXT)
      || JSONB_BUILD_OBJECT('seatSwapRequests', JSONB_BUILD_ARRAY());
    game_state := ((((room_row.game_snapshot->'gameState') - 'players'::TEXT) - 'boardState'::TEXT)
      || JSONB_BUILD_OBJECT('players', live_players, 'boardState', board_state));

    UPDATE rooms
    SET game_snapshot = (((room_row.game_snapshot) - 'gameState'::TEXT)
          || JSONB_BUILD_OBJECT('gameState', game_state)),
        snapshot_schema_version = 10,
        aggregate_version = aggregate_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = room_row.id;
  END LOOP;
END $$;
