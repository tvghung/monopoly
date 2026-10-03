# Checklist — join, session, reconnect, host và leave

## Automated evidence

- `[AUTO]` Token storage parse/save/clear: `apps/client/src/playerSessionStorage.test.ts`.
- `[AUTO]` Newest-wins/generation registry: `apps/server/src/services/connectionRegistry.test.ts`.
- `[CLIENT]` App/lobby assertions: `apps/client/src/App.test.tsx`, `components/Lobby.test.tsx`.
- `[SOCKET-INTEGRATION]` `apps/server/src/socket.integration.test.ts` covers protocol,
  two-step stable admission, unknown-token rejection without Seat binding, reconnect,
  newest-wins, host/ready start, disconnect preservation, queued stale generation,
  deterministic host leave, forced-liquidation forfeit, Player/spectator same-socket
  leave-and-rejoin, spectator/reclaim and server recreation over the same test store.
- `[PG-INTEGRATION][SOCKET-INTEGRATION]` Its conditional PostgreSQL case recreates
  pools/persistence/server, then resumes both stable Players and persisted game state.

## Checklist

- [ ] First `join room` returns pending token but creates no Seat/host/color.
- [ ] Token hash is 32 bytes in DB; raw token is absent from DB/log/public state.
- [ ] `resume session` activates exactly one stable UUID Seat; lost ACK is resumable.
- [ ] Newest valid socket wins; old receives `session replaced`; stale disconnect no-ops.
- [ ] Refresh/network reconnect/new socket keeps Player ID, Seat, ready, money and assets.
- [ ] Protocol/snapshot V8 identity-preserving reset keeps room/code, stable Player
  IDs, join order/name/color/ready, host, `IN_PROGRESS` status and active reconnect
  token hashes while preserving the current appearance fields and gameplay state.
- [ ] Existing tokens reclaim the same Seats after reset; pending old-game offers are
  cancelled and no room delete cascades session rows.
- [ ] Invalid/revoked/expired token is rejected, not spectator/new Player.
- [ ] First activated Seat is host; concurrent first joins produce one host/join order.
- [ ] Lobby capacity and start boundaries are 2–4; all connected/ready; host only.
- [ ] Start rolls/tie-breaks first Player server-side, persists order once and accepts
  no client dice/order.
- [ ] Host temporary disconnect does not transfer; explicit leave transfers deterministically.
- [ ] Disconnect preserves Seat/property/payment/session and does not delete room.
- [ ] Lobby leave removes Seat/revokes token; in-game leave is confirmed atomic forfeit.
- [ ] Active debtor forfeit auto-liquidates to Bank before creditor payment; other
  leavers return assets unowned while history reason remains `LEFT`.
- [ ] Successful Player/spectator leave may start a fresh admission on the same socket.
- [x] `[AUTO][CLIENT]` `App.test.tsx` (V1.1): a confirmed forfeit emits `leave room`, then `join room` on the same socket, and the
  "Bạn đã bỏ cuộc" alertdialog offers "Xem tiếp" (stays a spectator, dialog closes) and "Rời phòng" (back to the launcher while the
  host runtime keeps running); a failed re-join leaves for good with a toast.
- [ ] `[MANUAL-E2E]` V1.1: forfeit in a real 3-player LAN game: the forfeiter keeps watching, the others are unaffected, a reload lands
  on the start screen (the token is revoked).
- [ ] Join after start without token is spectator; valid existing token reclaims Player.
- [ ] Public/private Socket.IO rooms isolate room updates and private session/offer data.
- [ ] All-offline room survives; explicit empty lobby/retention cleanup follows policy.

## Phase 7.2 evidence

- `[AUTO][PASS]` Client reconnect storage uses V3 records scoped by canonical
  HTTP(S) authority and room code; a selected-room mismatch or legacy unscoped
  V1/V2 record cannot resume the wrong room.
- `[AUTO][PASS]` Clearing a V2 record preserves remaining entries as
  `authority -> token` strings, and V3 writes refresh an existing authority's
  insertion order before the maximum eight-entry retention limit is applied.
- `[AUTO][PASS]` Desktop terminal resume failure clears the scoped session and
  returns to the LAN launcher; it does not silently fall back to a fresh join.
- `[AUTO][PASS]` Desktop leave clears the scoped client session, disconnects, and
  returns to the launcher without stopping the app-owned Host runtime.
- `[SOCKET][PASS]` Desktop loopback remains the only unused-code creator; remote
  LAN admission policy rejects an unknown room with `NOT_FOUND` and creates no
  replacement room or pending session.
- `[SOCKET][PACKAGED][PASS-WINDOWS]` Four real clients enter one room under a
  stable first host; a fifth is rejected; reconnect retains PlayerId/room; the
  newest authenticated connection replaces the old one; helper and PostgreSQL
  restart retain the session.
- `[BROWSER][PASS]` Mobile Chromium/WebKit cover invitation prefill without
  auto-submit, two-client admission, lobby/start, reload resume, background/network
  recovery, and mobile layout boundaries.
- `[MANUAL DEFERRED / NOT RUN]` Physical Windows/macOS host/join, real mobile
  browsers, firewall/client isolation, sleep/Wi-Fi/IP changes, and host loss remain
  unclaimed.

## Restart evidence boundary

The executable PostgreSQL Socket suite must prove fresh pool/persistence/server
recovery with both tokens and exact v8 game state, plus historical snapshot migration
identity preservation, when `TEST_DATABASE_URL` is set. A real process-manager/container kill
and browser reload remains a separate deployment E2E.

## Pre-game screens (visual overhaul V2, plan 04)

- [x] `[AUTO][CLIENT]` `JoinForm.test.tsx`: the "Loại phòng" toggle ("Có mã phòng" default, "Phòng chung" joins `LOBBY`), a
  written reason while the name is empty, `initialRoomCode` prefill (`?room=` is covered in `App.test.tsx`).
- [x] `[AUTO][CLIENT]` `DesktopMultiplayerLauncher.test.tsx`, `AppBootstrap.test.tsx`: launcher card names, unchanged form ids
  and validation copy, focus returns to the card that opened a form, field border and hero motion CSS contracts.
- [x] `[AUTO][CLIENT]` `Lobby.test.tsx`, `startReadiness.test.ts`, `MascotPicker.test.tsx`, `HostLanSharing.test.tsx`: four seat
  cards, a disabled "Bắt đầu" always has a written reason (first applicable wins), copy room code feedback, the picker follows
  the effective reduced-motion setting, no visible mascot names.
- [x] `[AUTO][CLIENT]` `LoadingScreen.test.tsx`, `ErrorScreen.test.tsx`, `ConnectionOverlay.test.tsx`, `SpectatorBanner.test.tsx`:
  one loading screen for bootstrap and restoring (real stage text only), failure screens alert with their text (main landmark
  kept), the connection overlay is a status, the spectator pill has a working "Rời phòng".
- [x] `[BROWSER]` `pnpm test:e2e:mobile` (`e2e/mobile-host.spec.ts`, Chromium + WebKit): join with an invitation, lobby at
  360×800 and 667×375 (touch targets ≥ 44 px, the host scrolls to "Bắt đầu"), settings fit/scroll/44 px.
- [ ] `[MANUAL-E2E]` G4: landing, launcher (web preview and packaged app), lobby with four players, loading and failure screens
  at the standard viewports in Chromium and WebKit.

## V1.1 Join by room code, host without a network choice (owner feedback 5 and 6)

The owner's rule for this round: players do not read technical text. Design: [Client/join-room.instruction.md](../Client/join-room.instruction.md),
lookup contract: [Api/http-runtime.instruction.md](../Api/http-runtime.instruction.md#lan-room-lookup-desktop-host-profile-only).

- [x] `[AUTO][CLIENT]` `DesktopMultiplayerLauncher.test.tsx`, `AppBootstrap.test.tsx`: the join form asks for a name and a room
  code only; a search shows "Đang tìm phòng…" with read-only fields; the gameplay socket is created only after the lookup
  returns; each of `NOT_FOUND`, `UNREACHABLE`, `NO_NETWORK`, `UNAVAILABLE` (and a bridge without the lookup, a failed IPC call,
  a malformed endpoint) shows its agreed plain-Vietnamese line; the invitation-link field appears only after a failure (not
  after `NO_NETWORK`) and enters the room it names without searching; a result that arrives after "Chọn lại chế độ" or
  after unmount is dropped; the configured-server mode is unchanged.
- [x] `[AUTO][CLIENT]` `DesktopMultiplayerLauncher.test.tsx`: the host form has a name field only (no network select, no port or
  address hint, no subtitle or footer), calls `start()` without options, and says "Máy này chưa kết nối mạng. …" when no
  network exists; no launcher card text contains an address, port or database wording.
- [x] `[AUTO][CLIENT]` `runtime/lanSharing.test.ts`: `parseLanJoinUrl` is the inverse of `buildLanJoinUrl` and refuses credentials,
  non-http, hosts that are not usable IPv4, missing port, missing or invalid room and other paths.
- [x] `[AUTO][CLIENT]` `HostLanSharing.test.tsx`, `Lobby.test.tsx`: the invitation card shows the QR code and a copy button but
  never the link; "Mạng chia sẻ" and "Làm mới mạng" appear only when two or more networks tie for the best rank; plain
  no-network and copy-failure lines.
- [x] `[AUTO][CLIENT]` `App.test.tsx`: a desktop connect failure says "Không vào được phòng. Hãy kiểm tra Wi-Fi rồi thử lại." with
  no firewall, VPN, guest-network or address wording.
- [x] `[AUTO][CLIENT]` `design-lab/surfaces/entrySurfaces.test.tsx`, `surfaceCaptures.test.ts`: the launcher surfaces, including
  the new `launcher-join-failed`, render and are listed in the capture manifest.
- [ ] `[MANUAL-E2E]` G4 re-capture of `launcher`, `launcher-running`, `launcher-host`, `launcher-join`, `launcher-join-failed` and
  `lobby-lan` at the standard viewports (the form fits 375 px landscape with the extra field). _(Captures not run by the author.)_
- [ ] `[MANUAL-E2E]` Packaged app on two PCs: see [V1 final manual acceptance](../../ui-ux-overhaul/V1_FINAL_MANUAL_ACCEPTANCE.md#lan-room-lookup-v11).
