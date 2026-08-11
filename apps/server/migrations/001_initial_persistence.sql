CREATE TABLE rooms (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  host_player_id UUID,
  aggregate_version BIGINT NOT NULL DEFAULT 1,
  snapshot_schema_version INTEGER NOT NULL,
  game_snapshot JSONB NOT NULL,
  next_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  CONSTRAINT rooms_code_normalized CHECK (
    code = UPPER(BTRIM(code)) AND LENGTH(code) BETWEEN 1 AND 64
  ),
  CONSTRAINT rooms_status_valid CHECK (
    status IN ('LOBBY', 'IN_PROGRESS', 'FINISHED')
  ),
  CONSTRAINT rooms_aggregate_version_positive CHECK (aggregate_version > 0),
  CONSTRAINT rooms_snapshot_schema_version_positive CHECK (
    snapshot_schema_version > 0
  ),
  CONSTRAINT rooms_snapshot_is_object CHECK (
    JSONB_TYPEOF(game_snapshot) = 'object'
  )
);

CREATE INDEX rooms_next_action_at_idx
  ON rooms (next_action_at)
  WHERE next_action_at IS NOT NULL;

CREATE INDEX rooms_expires_at_idx
  ON rooms (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE player_sessions (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL,
  token_hash BYTEA NOT NULL UNIQUE,
  requested_room_code TEXT,
  requested_name TEXT,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT player_sessions_status_valid CHECK (
    status IN ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED')
  ),
  CONSTRAINT player_sessions_token_hash_length CHECK (
    OCTET_LENGTH(token_hash) = 32
  ),
  CONSTRAINT player_sessions_shape_valid CHECK (
    (
      status = 'PENDING'
      AND requested_room_code IS NOT NULL
      AND requested_name IS NOT NULL
      AND room_id IS NULL
      AND player_id IS NULL
      AND expires_at IS NOT NULL
      AND revoked_at IS NULL
    )
    OR
    (
      status = 'ACTIVE'
      AND requested_room_code IS NULL
      AND requested_name IS NULL
      AND room_id IS NOT NULL
      AND player_id IS NOT NULL
      AND expires_at IS NULL
      AND revoked_at IS NULL
    )
    OR status IN ('REVOKED', 'EXPIRED')
  )
);

CREATE UNIQUE INDEX player_sessions_active_player_idx
  ON player_sessions (room_id, player_id)
  WHERE status = 'ACTIVE';

CREATE INDEX player_sessions_pending_expiry_idx
  ON player_sessions (expires_at)
  WHERE status = 'PENDING';

CREATE INDEX player_sessions_expired_cleanup_idx
  ON player_sessions (expires_at)
  WHERE status = 'EXPIRED';

CREATE INDEX player_sessions_revoked_cleanup_idx
  ON player_sessions (revoked_at)
  WHERE status = 'REVOKED';

CREATE TABLE trade_offers (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  buyer_player_id UUID NOT NULL,
  owner_player_id UUID NOT NULL,
  tile_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  CONSTRAINT trade_offers_distinct_players CHECK (
    buyer_player_id <> owner_player_id
  ),
  CONSTRAINT trade_offers_tile_nonnegative CHECK (tile_id >= 0),
  CONSTRAINT trade_offers_price_positive CHECK (price > 0),
  CONSTRAINT trade_offers_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT trade_offers_status_valid CHECK (
    status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED')
  ),
  CONSTRAINT trade_offers_resolution_valid CHECK (
    (status = 'PENDING' AND resolved_at IS NULL)
    OR (status <> 'PENDING' AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX trade_offers_player_pending_idx
  ON trade_offers (room_id, owner_player_id, buyer_player_id)
  WHERE status = 'PENDING';

CREATE INDEX trade_offers_expiry_idx
  ON trade_offers (expires_at)
  WHERE status = 'PENDING';
