-- v5 adds durable character identity and narrows player colours to the shared
-- ten-colour palette. V4 rooms are upgraded in place without resetting game
-- state; old players intentionally receive no invented mascot.
DO $$
DECLARE
  room_row RECORD;
  entry RECORD;
  player_json JSONB;
  finished_json JSONB;
  winner_json JSONB;
  property_json JSONB;
  board_state JSONB;
  game_state JSONB;
  live_players JSONB;
  finished_players JSONB;
  owned_props JSONB;
  owner_color TEXT;
BEGIN
  FOR room_row IN
    SELECT id, game_snapshot
    FROM rooms
    WHERE snapshot_schema_version = 4
    FOR UPDATE
  LOOP
    live_players := '{}'::JSONB;
    FOR entry IN
      SELECT key, value
      FROM JSONB_EACH(COALESCE(room_row.game_snapshot->'gameState'->'players', '{}'::JSONB))
    LOOP
      player_json := entry.value;
      player_json := (player_json - 'characterId' - 'color')
        || JSONB_BUILD_OBJECT(
          'characterId', NULL,
          'color', CASE LOWER(COALESCE(entry.value->>'color', 'charcoal'))
            WHEN 'yellow' THEN 'yellow'
            WHEN 'green' THEN 'green'
            WHEN 'blue' THEN 'blue'
            WHEN 'red' THEN 'red'
            WHEN 'orange' THEN 'orange'
            WHEN 'white' THEN 'cyan'
            WHEN 'black' THEN 'charcoal'
            WHEN 'purple' THEN 'purple'
            WHEN 'pink' THEN 'pink'
            WHEN 'cyan' THEN 'cyan'
            WHEN 'lime' THEN 'lime'
            WHEN 'charcoal' THEN 'charcoal'
            ELSE 'charcoal'
          END
        );
      live_players := live_players || JSONB_BUILD_OBJECT(entry.key, player_json);
    END LOOP;

    finished_players := '{}'::JSONB;
    FOR entry IN
      SELECT key, value
      FROM JSONB_EACH(COALESCE(room_row.game_snapshot->'gameState'->'boardState'->'finishedPlayers', '{}'::JSONB))
    LOOP
      finished_json := (entry.value - 'characterId' - 'color')
        || JSONB_BUILD_OBJECT(
          'characterId', NULL,
          'color', CASE LOWER(COALESCE(entry.value->>'color', 'charcoal'))
            WHEN 'yellow' THEN 'yellow'
            WHEN 'green' THEN 'green'
            WHEN 'blue' THEN 'blue'
            WHEN 'red' THEN 'red'
            WHEN 'orange' THEN 'orange'
            WHEN 'white' THEN 'cyan'
            WHEN 'black' THEN 'charcoal'
            WHEN 'purple' THEN 'purple'
            WHEN 'pink' THEN 'pink'
            WHEN 'cyan' THEN 'cyan'
            WHEN 'lime' THEN 'lime'
            WHEN 'charcoal' THEN 'charcoal'
            ELSE 'charcoal'
          END
        );
      finished_players := finished_players || JSONB_BUILD_OBJECT(entry.key, finished_json);
    END LOOP;

    owned_props := '{}'::JSONB;
    FOR entry IN
      SELECT key, value
      FROM JSONB_EACH(COALESCE(room_row.game_snapshot->'gameState'->'boardState'->'ownedProps', '{}'::JSONB))
    LOOP
      owner_color := COALESCE(
        live_players->(entry.value->>'id')->>'color',
        entry.value->>'color',
        'charcoal'
      );
      owner_color := CASE LOWER(owner_color)
        WHEN 'white' THEN 'cyan'
        WHEN 'black' THEN 'charcoal'
        WHEN 'yellow' THEN 'yellow'
        WHEN 'green' THEN 'green'
        WHEN 'blue' THEN 'blue'
        WHEN 'red' THEN 'red'
        WHEN 'orange' THEN 'orange'
        WHEN 'purple' THEN 'purple'
        WHEN 'pink' THEN 'pink'
        WHEN 'cyan' THEN 'cyan'
        WHEN 'lime' THEN 'lime'
        WHEN 'charcoal' THEN 'charcoal'
        ELSE 'charcoal'
      END;
      property_json := (entry.value - 'color')
        || JSONB_BUILD_OBJECT('color', owner_color);
      owned_props := owned_props || JSONB_BUILD_OBJECT(entry.key, property_json);
    END LOOP;

    board_state := room_row.game_snapshot->'gameState'->'boardState';
    winner_json := board_state->'winner';
    IF winner_json IS NOT NULL AND JSONB_TYPEOF(winner_json) = 'object' THEN
      winner_json := (winner_json - 'characterId' - 'color')
        || JSONB_BUILD_OBJECT(
          'characterId', NULL,
          'color', CASE LOWER(COALESCE(winner_json->>'color', 'charcoal'))
            WHEN 'white' THEN 'cyan'
            WHEN 'black' THEN 'charcoal'
            WHEN 'yellow' THEN 'yellow'
            WHEN 'green' THEN 'green'
            WHEN 'blue' THEN 'blue'
            WHEN 'red' THEN 'red'
            WHEN 'orange' THEN 'orange'
            WHEN 'purple' THEN 'purple'
            WHEN 'pink' THEN 'pink'
            WHEN 'cyan' THEN 'cyan'
            WHEN 'lime' THEN 'lime'
            WHEN 'charcoal' THEN 'charcoal'
            ELSE 'charcoal'
          END
        );
    ELSE
      winner_json := NULL;
    END IF;

    board_state := (board_state - 'finishedPlayers' - 'ownedProps' - 'winner')
      || JSONB_BUILD_OBJECT(
        'finishedPlayers', finished_players,
        'ownedProps', owned_props,
        'winner', winner_json
      );
    game_state := ((room_row.game_snapshot->'gameState')::JSONB - 'players'::TEXT - 'boardState'::TEXT)
      || JSONB_BUILD_OBJECT('players', live_players, 'boardState', board_state);

    UPDATE rooms
    SET game_snapshot = ((room_row.game_snapshot)::JSONB - 'gameState'::TEXT)
          || JSONB_BUILD_OBJECT('gameState', game_state),
        snapshot_schema_version = 5,
        aggregate_version = aggregate_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = room_row.id;
  END LOOP;
END $$;
