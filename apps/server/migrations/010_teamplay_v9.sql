-- V9 adds the 2v2 team state. Every existing room becomes a Solo game with the default team settings: players and finished
-- players receive a team by alternating through the room's members in join order (so an upgraded lobby is balanced and a
-- later switch to 2v2 starts from a sensible split), there is no match-level team state, and payment queues gain their
-- (empty) rescue slot. Nothing about an existing Solo game changes.
DO $$
DECLARE
  room_row RECORD;
  member_row RECORD;
  entry RECORD;
  member_index INTEGER;
  team_by_player JSONB;
  live_players JSONB;
  finished_players JSONB;
  winner_json JSONB;
  payment_queue JSONB;
  board_state JSONB;
  game_state JSONB;
BEGIN
  FOR room_row IN
    SELECT id, game_snapshot
    FROM rooms
    WHERE snapshot_schema_version = 8
    FOR UPDATE
  LOOP
    team_by_player := '{}'::JSONB;
    member_index := 0;
    FOR member_row IN
      SELECT key, value
      FROM JSONB_EACH(COALESCE(room_row.game_snapshot->'members', '{}'::JSONB))
      ORDER BY (value->>'joinOrder')::INTEGER, key
    LOOP
      team_by_player := team_by_player || JSONB_BUILD_OBJECT(
        member_row.key,
        CASE WHEN member_index % 2 = 0 THEN 'TEAM_1' ELSE 'TEAM_2' END
      );
      member_index := member_index + 1;
    END LOOP;

    live_players := '{}'::JSONB;
    FOR entry IN
      SELECT key, value
      FROM JSONB_EACH(COALESCE(room_row.game_snapshot->'gameState'->'players', '{}'::JSONB))
    LOOP
      live_players := live_players || JSONB_BUILD_OBJECT(
        entry.key,
        entry.value || JSONB_BUILD_OBJECT('teamId', COALESCE(team_by_player->>entry.key, 'TEAM_1'))
      );
    END LOOP;

    finished_players := '{}'::JSONB;
    FOR entry IN
      SELECT key, value
      FROM JSONB_EACH(COALESCE(room_row.game_snapshot->'gameState'->'boardState'->'finishedPlayers', '{}'::JSONB))
    LOOP
      finished_players := finished_players || JSONB_BUILD_OBJECT(
        entry.key,
        entry.value || JSONB_BUILD_OBJECT('teamId', COALESCE(team_by_player->>entry.key, 'TEAM_1'))
      );
    END LOOP;

    board_state := room_row.game_snapshot->'gameState'->'boardState';
    winner_json := board_state->'winner';
    IF winner_json IS NOT NULL AND JSONB_TYPEOF(winner_json) = 'object' THEN
      winner_json := winner_json || JSONB_BUILD_OBJECT(
        'teamId',
        COALESCE(team_by_player->>(winner_json->>'playerId'), 'TEAM_1')
      );
    END IF;
    payment_queue := board_state->'paymentQueue';
    IF payment_queue IS NOT NULL AND JSONB_TYPEOF(payment_queue) = 'object' THEN
      payment_queue := payment_queue || JSONB_BUILD_OBJECT('rescue', NULL);
    END IF;

    board_state := ((((board_state - 'finishedPlayers'::TEXT) - 'winner'::TEXT) - 'paymentQueue'::TEXT)
      || JSONB_BUILD_OBJECT(
        'finishedPlayers', finished_players,
        'winner', winner_json,
        'paymentQueue', payment_queue,
        'gameMode', 'SOLO',
        'teams', JSONB_BUILD_OBJECT(
          'TEAM_1', JSONB_BUILD_OBJECT('name', 'Team 1', 'color', 'red'),
          'TEAM_2', JSONB_BUILD_OBJECT('name', 'Team 2', 'color', 'blue')
        ),
        'teamPlay', JSONB_BUILD_OBJECT(
          'slotOrder', JSONB_BUILD_ARRAY(),
          'revivedPlayerIds', JSONB_BUILD_ARRAY(),
          'reviveWindows', JSONB_BUILD_ARRAY()
        ),
        'winningTeamId', NULL
      ));
    game_state := ((((room_row.game_snapshot->'gameState') - 'players'::TEXT) - 'boardState'::TEXT)
      || JSONB_BUILD_OBJECT('players', live_players, 'boardState', board_state));

    UPDATE rooms
    SET game_snapshot = (((room_row.game_snapshot) - 'gameState'::TEXT)
          || JSONB_BUILD_OBJECT('gameState', game_state)),
        snapshot_schema_version = 9,
        aggregate_version = aggregate_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = room_row.id;
  END LOOP;
END $$;
