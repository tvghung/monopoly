-- v4 removes the legacy mortgage and public listing state from v3 snapshots.
-- The update is deliberately scoped to rows still at v3 so already-upgraded
-- rooms are never rewritten by a repeated migration run.
CREATE TEMP TABLE migrated_v4_rooms (
  room_id UUID PRIMARY KEY
) ON COMMIT DROP;

DO $$
DECLARE
  room_row RECORD;
  property_row RECORD;
  board_state JSONB;
  owned_props JSONB;
  private_state JSONB;
  game_state JSONB;
  next_action_at_value TIMESTAMPTZ;
BEGIN
  FOR room_row IN
    SELECT id, game_snapshot, expires_at
    FROM rooms
    WHERE snapshot_schema_version = 3
    FOR UPDATE
  LOOP
    owned_props := '{}'::JSONB;
    FOR property_row IN
      SELECT key, value
      FROM JSONB_EACH(
        COALESCE(room_row.game_snapshot->'gameState'->'boardState'->'ownedProps', '{}'::JSONB)
      )
    LOOP
      owned_props := owned_props || JSONB_BUILD_OBJECT(property_row.key, property_row.value - 'mortgaged');
    END LOOP;

    board_state := room_row.game_snapshot->'gameState'->'boardState';
    board_state := (board_state - 'openMarket')
      || JSONB_BUILD_OBJECT('ownedProps', owned_props);

    private_state := COALESCE(room_row.game_snapshot->'gameState'->'privateState', '{}'::JSONB);
    private_state := (private_state - 'forcedSaleProposal')
      || JSONB_BUILD_OBJECT('forcedSaleProposal', NULL);
    game_state := room_row.game_snapshot->'gameState'
      || JSONB_BUILD_OBJECT('boardState', board_state, 'privateState', private_state);

    SELECT MIN(deadline)
    INTO next_action_at_value
    FROM (
      VALUES
        (room_row.expires_at),
        ((board_state->'turnRecovery'->>'deadlineAt')::TIMESTAMPTZ),
        ((board_state->'paymentQueue'->>'actionDeadlineAt')::TIMESTAMPTZ)
    ) AS deadlines(deadline);

    UPDATE rooms
    SET game_snapshot = room_row.game_snapshot
          || JSONB_BUILD_OBJECT('gameState', game_state),
        snapshot_schema_version = 4,
        aggregate_version = aggregate_version + 1,
        next_action_at = next_action_at_value,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = room_row.id;

    INSERT INTO migrated_v4_rooms (room_id) VALUES (room_row.id);
  END LOOP;
END $$;

UPDATE trade_offers
SET status = 'CANCELLED', resolved_at = CURRENT_TIMESTAMP
WHERE status = 'PENDING'
  AND room_id IN (SELECT room_id FROM migrated_v4_rooms);
