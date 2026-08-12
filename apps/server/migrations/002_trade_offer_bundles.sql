ALTER TABLE trade_offers
  ADD COLUMN proposer_player_id UUID,
  ADD COLUMN recipient_player_id UUID,
  ADD COLUMN offered_bundle JSONB,
  ADD COLUMN requested_bundle JSONB;

UPDATE trade_offers
SET
  proposer_player_id = buyer_player_id,
  recipient_player_id = owner_player_id,
  offered_bundle = JSONB_BUILD_OBJECT(
    'cash', price,
    'propertyIds', JSONB_BUILD_ARRAY(),
    'jailFreeCardIds', JSONB_BUILD_ARRAY()
  ),
  requested_bundle = JSONB_BUILD_OBJECT(
    'cash', 0,
    'propertyIds', JSONB_BUILD_ARRAY(tile_id),
    'jailFreeCardIds', JSONB_BUILD_ARRAY()
  );

ALTER TABLE trade_offers
  ALTER COLUMN proposer_player_id SET NOT NULL,
  ALTER COLUMN recipient_player_id SET NOT NULL,
  ALTER COLUMN offered_bundle SET NOT NULL,
  ALTER COLUMN requested_bundle SET NOT NULL;

DROP INDEX trade_offers_player_pending_idx;

ALTER TABLE trade_offers
  DROP CONSTRAINT trade_offers_distinct_players,
  DROP CONSTRAINT trade_offers_tile_nonnegative,
  DROP CONSTRAINT trade_offers_price_positive,
  DROP COLUMN buyer_player_id,
  DROP COLUMN owner_player_id,
  DROP COLUMN tile_id,
  DROP COLUMN price,
  ADD CONSTRAINT trade_offers_distinct_players CHECK (
    proposer_player_id <> recipient_player_id
  ),
  ADD CONSTRAINT trade_offers_offered_bundle_object CHECK (
    JSONB_TYPEOF(offered_bundle) = 'object'
  ),
  ADD CONSTRAINT trade_offers_requested_bundle_object CHECK (
    JSONB_TYPEOF(requested_bundle) = 'object'
  );

CREATE INDEX trade_offers_player_pending_idx
  ON trade_offers (room_id, recipient_player_id, proposer_player_id)
  WHERE status = 'PENDING';
