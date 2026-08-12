-- Snapshot v2 introduces private deck order, durable waits, doubles and card
-- ownership. Legacy in-progress gameplay cannot be resumed safely, so reset the
-- game data in place while preserving room/member/player/session identities.
DO $$
DECLARE
  room_row RECORD;
  member_row RECORD;
  player_id_text TEXT;
  old_player JSONB;
  active_ids TEXT[];
  rotated_ids TEXT[];
  contenders TEXT[];
  tied_ids TEXT[];
  starter_id TEXT;
  winner_id TEXT;
  highest_roll INTEGER;
  total_roll INTEGER;
  start_index INTEGER;
  live_players JSONB;
  finished_players JSONB;
  winner JSONB;
  chance_pile JSONB;
  chest_pile JSONB;
  board_state JSONB;
  new_game_state JSONB;
BEGIN
  FOR room_row IN
    SELECT id, status, game_snapshot
    FROM rooms
    WHERE snapshot_schema_version = 1
    FOR UPDATE
  LOOP
    active_ids := ARRAY[]::TEXT[];
    live_players := '{}'::JSONB;
    finished_players := '{}'::JSONB;

    FOR member_row IN
      SELECT key AS player_id, value AS member
      FROM JSONB_EACH(room_row.game_snapshot->'members')
      ORDER BY (value->>'joinOrder')::INTEGER
    LOOP
      player_id_text := member_row.player_id;
      old_player := COALESCE(
        room_row.game_snapshot->'gameState'->'players'->player_id_text,
        room_row.game_snapshot->'gameState'->'boardState'->'finishedPlayers'->player_id_text,
        '{}'::JSONB
      );

      IF member_row.member->>'membershipStatus' = 'ACTIVE' THEN
        active_ids := ARRAY_APPEND(active_ids, player_id_text);
        live_players := live_players || JSONB_BUILD_OBJECT(
          player_id_text,
          JSONB_BUILD_OBJECT(
            'name', COALESCE(old_player->>'name', 'Người chơi'),
            'currentTile', 0,
            'color', COALESCE(old_player->>'color', 'white'),
            'accountBalance', 1500,
            'isJail', FALSE,
            'jailRounds', 0,
            'heldJailFreeCardIds', '[]'::JSONB
          )
        );
      ELSE
        finished_players := finished_players || JSONB_BUILD_OBJECT(
          player_id_text,
          JSONB_BUILD_OBJECT(
            'name', COALESCE(old_player->>'name', 'Người chơi'),
            'color', COALESCE(old_player->>'color', 'white'),
            'reason', CASE
              WHEN member_row.member->>'membershipStatus' = 'LEFT' THEN 'LEFT'
              ELSE 'BANKRUPT'
            END
          )
        );
      END IF;
    END LOOP;

    starter_id := NULL;
    rotated_ids := active_ids;
    IF room_row.status = 'IN_PROGRESS' AND COALESCE(ARRAY_LENGTH(active_ids, 1), 0) > 0 THEN
      contenders := active_ids;
      WHILE ARRAY_LENGTH(contenders, 1) > 1 LOOP
        highest_roll := -1;
        tied_ids := ARRAY[]::TEXT[];
        FOREACH player_id_text IN ARRAY contenders LOOP
          total_roll := FLOOR(RANDOM() * 6 + 1)::INTEGER + FLOOR(RANDOM() * 6 + 1)::INTEGER;
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
      rotated_ids := active_ids[start_index:ARRAY_LENGTH(active_ids, 1)] || active_ids[1:start_index - 1];
    ELSIF COALESCE(ARRAY_LENGTH(active_ids, 1), 0) > 0 THEN
      starter_id := active_ids[1];
    END IF;

    SELECT JSONB_AGG(value ORDER BY RANDOM()) INTO chance_pile
    FROM JSONB_ARRAY_ELEMENTS(
      '["chance-advance-start","chance-advance-landmark-81","chance-advance-da-nang","chance-trip-ga-ha-noi","chance-back-three","chance-go-to-jail","chance-property-repairs","chance-traffic-fine","chance-community-event","chance-loan-matures","chance-dividend","chance-administrative-fee","chance-jail-free"]'::JSONB
    );
    SELECT JSONB_AGG(value ORDER BY RANDOM()) INTO chest_pile
    FROM JSONB_ARRAY_ELEMENTS(
      '["chest-advance-start","chest-bank-adjustment","chest-medical-fee","chest-investment-return","chest-go-to-jail","chest-tet-bonus","chest-tax-refund","chest-birthday","chest-insurance","chest-hospital-fee","chest-tuition-fee","chest-consulting-fee","chest-lucky-prize","chest-inheritance","chest-jail-free"]'::JSONB
    );

    winner := NULL;
    IF room_row.status = 'FINISHED' THEN
      winner_id := COALESCE(
        room_row.game_snapshot->'gameState'->'boardState'->'winner'->>'playerId',
        active_ids[1]
      );
      old_player := live_players->winner_id;
      winner := JSONB_BUILD_OBJECT(
        'playerId', winner_id,
        'name', COALESCE(old_player->>'name', 'Người chơi'),
        'color', COALESCE(old_player->>'color', 'white')
      );
    END IF;

    board_state := JSONB_BUILD_OBJECT(
      'gameStarted', room_row.status <> 'LOBBY',
      'players', TO_JSONB(COALESCE(rotated_ids, ARRAY[]::TEXT[])),
      'finishedPlayers', finished_players,
      'currentPlayer', JSONB_BUILD_OBJECT(
        'id', CASE WHEN room_row.status = 'LOBBY' THEN '' ELSE COALESCE(starter_id, winner_id, '') END,
        'hasMoved', FALSE,
        'doublesStreak', 0
      ),
      'turnNumber', CASE WHEN room_row.status = 'LOBBY' THEN 0 ELSE 1 END,
      'turnRecovery', NULL,
      'logs', JSONB_BUILD_ARRAY(
        'Hệ thống: Ván cũ không tương thích snapshot v2 và đã được khởi tạo lại.'
      ),
      'diceValue', JSONB_BUILD_OBJECT('dice1', 0, 'dice2', 0),
      'ownedProps', '{}'::JSONB,
      'openMarket', '{}'::JSONB,
      'winner', winner,
      'auction', NULL,
      'buildingContention', NULL,
      'paymentQueue', NULL,
      'bankPropertyAuctionQueue', NULL
    );
    new_game_state := JSONB_BUILD_OBJECT(
      'boardState', board_state,
      'players', live_players,
      'turnInfo', '{}'::JSONB,
      'privateState', JSONB_BUILD_OBJECT(
        'decks', JSONB_BUILD_OBJECT(
          'chance', JSONB_BUILD_OBJECT('drawPile', chance_pile),
          'chest', JSONB_BUILD_OBJECT('drawPile', chest_pile)
        )
      )
    );

    UPDATE rooms
    SET
      game_snapshot = JSONB_BUILD_OBJECT(
        'members', room_row.game_snapshot->'members',
        'nextJoinOrder', room_row.game_snapshot->'nextJoinOrder',
        'gameState', new_game_state
      ),
      snapshot_schema_version = 2,
      aggregate_version = aggregate_version + 1,
      next_action_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = room_row.id;
  END LOOP;
END $$;

UPDATE trade_offers
SET status = 'CANCELLED', resolved_at = CURRENT_TIMESTAMP
WHERE status = 'PENDING';
