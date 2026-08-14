-- v3 simplified-rules migration.  Migrations 001-003 are historical and are
-- intentionally immutable.  This migration is idempotent because the runner
-- records its version transactionally and the predicate below only selects v2
-- snapshots.  Offer cancellation is scoped to the room rows actually migrated
-- by this file, so a pre-existing v3 room is never touched accidentally.
CREATE TEMP TABLE migrated_v3_rooms (
  room_id UUID PRIMARY KEY
) ON COMMIT DROP;

DO $$
DECLARE
  room_row RECORD;
  member_row RECORD;
  player_id_text TEXT;
  old_player JSONB;
  live_players JSONB;
  finished_players JSONB;
  active_ids TEXT[];
  rotated_ids TEXT[];
  contenders TEXT[];
  tied_ids TEXT[];
  starter_id TEXT;
  winner_id TEXT;
  highest_roll INTEGER;
  total_roll INTEGER;
  start_index INTEGER;
  target_status TEXT;
  board_state JSONB;
  game_state JSONB;
  chance_pile JSONB;
  chest_pile JSONB;
BEGIN
  FOR room_row IN
    SELECT id, status, game_snapshot
    FROM rooms
    WHERE snapshot_schema_version = 2
    FOR UPDATE
  LOOP
    live_players := '{}'::JSONB;
    finished_players := COALESCE(room_row.game_snapshot->'gameState'->'boardState'->'finishedPlayers', '{}'::JSONB);
    active_ids := ARRAY[]::TEXT[];

    FOR member_row IN
      SELECT key AS player_id, value AS member
      FROM JSONB_EACH(room_row.game_snapshot->'members')
      ORDER BY (value->>'joinOrder')::INTEGER
    LOOP
      player_id_text := member_row.player_id;
      old_player := COALESCE(
        room_row.game_snapshot->'gameState'->'players'->player_id_text,
        '{}'::JSONB
      );
      IF member_row.member->>'membershipStatus' = 'ACTIVE' THEN
        active_ids := ARRAY_APPEND(active_ids, player_id_text);
        IF room_row.status IN ('IN_PROGRESS', 'LOBBY') THEN
          live_players := live_players || JSONB_BUILD_OBJECT(
            player_id_text,
            JSONB_BUILD_OBJECT(
              'name', COALESCE(old_player->>'name', 'Người chơi'),
              'currentTile', 0,
              'color', COALESCE(old_player->>'color', 'white'),
              'accountBalance', 1500,
              'isJail', FALSE,
              'jailOpponentRoundsElapsed', 0,
              'heldJailFreeCardIds', '[]'::JSONB
            )
          );
        ELSE
          live_players := live_players || JSONB_BUILD_OBJECT(
            player_id_text,
            (old_player - 'jailRounds' - 'jailOpponentRoundsElapsed')
              || JSONB_BUILD_OBJECT(
                'jailOpponentRoundsElapsed', COALESCE(old_player->'jailOpponentRoundsElapsed', 0),
                'heldJailFreeCardIds', COALESCE(old_player->'heldJailFreeCardIds', '[]'::JSONB)
              )
          );
        END IF;
      END IF;
    END LOOP;

    IF room_row.status IN ('IN_PROGRESS', 'FINISHED')
      AND COALESCE(ARRAY_LENGTH(active_ids, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Cannot migrate terminal room % without an active player', room_row.id;
    END IF;

    target_status := room_row.status;
    starter_id := NULL;
    winner_id := NULL;
    rotated_ids := active_ids;
    IF room_row.status = 'IN_PROGRESS' THEN
      IF ARRAY_LENGTH(active_ids, 1) = 1 THEN
        -- A valid one-seat game is already terminal after migration.
        target_status := 'FINISHED';
        starter_id := active_ids[1];
        winner_id := active_ids[1];
      ELSE
        -- Keep the same starting-player competition used by a newly started
        -- room: tied highest rolls are rerolled until one player remains.
        contenders := active_ids;
        WHILE ARRAY_LENGTH(contenders, 1) > 1 LOOP
          highest_roll := -1;
          tied_ids := ARRAY[]::TEXT[];
          FOREACH player_id_text IN ARRAY contenders LOOP
            total_roll := FLOOR(RANDOM() * 6 + 1)::INTEGER
              + FLOOR(RANDOM() * 6 + 1)::INTEGER;
            IF total_roll > highest_roll THEN
              highest_roll := total_roll;
              tied_ids := ARRAY[player_id_text];
            ELSIF total_roll = highest_roll THEN
              tied_ids := ARRAY_APPEND(tied_ids, player_id_text);
            END IF;
          END LOOP;
          contenders := tied_ids;
        END LOOP;
        starter_id := contenders[1];
        start_index := ARRAY_POSITION(active_ids, starter_id);
        rotated_ids := active_ids[start_index:ARRAY_LENGTH(active_ids, 1)]
          || active_ids[1:start_index - 1];
      END IF;
    ELSIF room_row.status = 'FINISHED' THEN
      winner_id := room_row.game_snapshot->'gameState'->'boardState'->'winner'->>'playerId';
      IF winner_id IS NULL OR NOT (winner_id = ANY(active_ids)) THEN
        winner_id := active_ids[1];
      END IF;
      starter_id := winner_id;
    END IF;

    board_state := room_row.game_snapshot->'gameState'->'boardState';
    IF room_row.status = 'IN_PROGRESS' THEN
      -- A v2 in-progress match is reset, including private deck order.  Keep
      -- the same canonical identities as a new room, but randomize each pile
      -- inside the migration transaction so no v2 draw order survives.
      SELECT JSONB_AGG(value ORDER BY RANDOM()) INTO chance_pile
      FROM JSONB_ARRAY_ELEMENTS(
        '["chance-advance-start","chance-advance-landmark-81","chance-advance-da-nang","chance-trip-ga-ha-noi","chance-back-three","chance-go-to-jail","chance-property-repairs","chance-traffic-fine","chance-community-event","chance-loan-matures","chance-dividend","chance-administrative-fee","chance-jail-free"]'::JSONB
      );
      SELECT JSONB_AGG(value ORDER BY RANDOM()) INTO chest_pile
      FROM JSONB_ARRAY_ELEMENTS(
        '["chest-advance-start","chest-bank-adjustment","chest-medical-fee","chest-investment-return","chest-go-to-jail","chest-tet-bonus","chest-tax-refund","chest-birthday","chest-insurance","chest-hospital-fee","chest-tuition-fee","chest-consulting-fee","chest-lucky-prize","chest-inheritance","chest-jail-free"]'::JSONB
      );
    ELSE
      chance_pile := room_row.game_snapshot->'gameState'->'privateState'->'decks'->'chance'->'drawPile';
      chest_pile := room_row.game_snapshot->'gameState'->'privateState'->'decks'->'chest'->'drawPile';
    END IF;
    IF room_row.status = 'IN_PROGRESS' AND target_status = 'IN_PROGRESS' THEN
      board_state := (board_state
        - 'auction'
        - 'buildingContention'
        - 'bankPropertyAuctionQueue')
        || JSONB_BUILD_OBJECT(
          'gameStarted', TRUE,
          'players', TO_JSONB(rotated_ids),
          'finishedPlayers', finished_players,
          'currentPlayer', JSONB_BUILD_OBJECT(
            'id', COALESCE(starter_id, ''),
            'hasMoved', FALSE
          ),
          'turnNumber', 1,
          'turnRecovery', NULL,
          'logs', JSONB_BUILD_ARRAY('Hệ thống: đã khởi tạo lại ván chơi theo luật v3.'),
          'diceValue', JSONB_BUILD_OBJECT('dice1', 0, 'dice2', 0),
          'ownedProps', '{}'::JSONB,
          'openMarket', '{}'::JSONB,
          'winner', NULL,
          'paymentQueue', NULL
        );
    ELSIF room_row.status = 'IN_PROGRESS' AND target_status = 'FINISHED' THEN
      board_state := (board_state
        - 'auction'
        - 'buildingContention'
        - 'bankPropertyAuctionQueue')
        || JSONB_BUILD_OBJECT(
          'gameStarted', TRUE,
          'players', TO_JSONB(active_ids),
          'finishedPlayers', finished_players,
          'currentPlayer', JSONB_BUILD_OBJECT(
            'id', COALESCE(winner_id, ''),
            'hasMoved', FALSE
          ),
          'turnNumber', 1,
          'turnRecovery', NULL,
          'logs', JSONB_BUILD_ARRAY('Hệ thống: ván chỉ còn một người chơi và được kết thúc khi chuyển sang luật v3.'),
          'diceValue', JSONB_BUILD_OBJECT('dice1', 0, 'dice2', 0),
          'ownedProps', '{}'::JSONB,
          'openMarket', '{}'::JSONB,
          'winner', JSONB_BUILD_OBJECT(
            'playerId', winner_id,
            'name', COALESCE(live_players->winner_id->>'name', 'Người chơi'),
            'color', COALESCE(live_players->winner_id->>'color', 'white')
          ),
          'paymentQueue', NULL
        );
    ELSIF room_row.status = 'FINISHED' THEN
      board_state := (board_state
        - 'auction'
        - 'buildingContention'
        - 'bankPropertyAuctionQueue')
        || JSONB_BUILD_OBJECT(
          'gameStarted', TRUE,
          'players', TO_JSONB(active_ids),
          'currentPlayer', JSONB_BUILD_OBJECT('id', COALESCE(winner_id, ''), 'hasMoved', FALSE),
          'turnNumber', 1,
          'turnRecovery', NULL,
          'logs', JSONB_BUILD_ARRAY('System: room retained as FINISHED during v3 migration.'),
          'diceValue', JSONB_BUILD_OBJECT('dice1', 0, 'dice2', 0),
          'ownedProps', COALESCE(board_state->'ownedProps', '{}'::JSONB),
          'openMarket', '{}'::JSONB,
          'paymentQueue', NULL,
          'winner', JSONB_BUILD_OBJECT(
            'playerId', winner_id,
            'name', COALESCE(live_players->winner_id->>'name', 'Player'),
            'color', COALESCE(live_players->winner_id->>'color', 'white')
          )
        );
    ELSE
      board_state := (board_state
        - 'auction'
        - 'buildingContention'
        - 'bankPropertyAuctionQueue')
        || JSONB_BUILD_OBJECT(
          'gameStarted', FALSE,
          'players', TO_JSONB(active_ids),
          'currentPlayer', JSONB_BUILD_OBJECT('id', '', 'hasMoved', FALSE),
          'turnNumber', 0,
          'turnRecovery', NULL,
          'logs', '[]'::JSONB,
          'diceValue', JSONB_BUILD_OBJECT('dice1', 0, 'dice2', 0),
          'ownedProps', '{}'::JSONB,
          'openMarket', '{}'::JSONB,
          'winner', NULL,
          'paymentQueue', NULL
        );
    END IF;

    game_state := JSONB_BUILD_OBJECT(
      'boardState', board_state,
      'players', live_players,
      'turnInfo', '{}'::JSONB,
      'privateState', (
        JSONB_BUILD_OBJECT(
          'decks', JSONB_BUILD_OBJECT(
            'chance', JSONB_BUILD_OBJECT('drawPile', chance_pile),
            'chest', JSONB_BUILD_OBJECT('drawPile', chest_pile)
          )
        )
        || JSONB_BUILD_OBJECT('forcedSaleProposal', NULL)
      )
    );

    UPDATE rooms
    SET game_snapshot = JSONB_BUILD_OBJECT(
          'members', room_row.game_snapshot->'members',
          'nextJoinOrder', room_row.game_snapshot->'nextJoinOrder',
          'gameState', game_state
        ),
        status = target_status,
        snapshot_schema_version = 3,
        aggregate_version = aggregate_version + 1,
        next_action_at = expires_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = room_row.id;

    INSERT INTO migrated_v3_rooms (room_id) VALUES (room_row.id);
  END LOOP;
END $$;

UPDATE trade_offers
SET status = 'CANCELLED', resolved_at = CURRENT_TIMESTAMP
WHERE status = 'PENDING'
  AND room_id IN (SELECT room_id FROM migrated_v3_rooms);
