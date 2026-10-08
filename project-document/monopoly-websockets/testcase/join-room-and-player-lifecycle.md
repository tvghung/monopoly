# Checklist — join, session, reconnect, host và leave

## Automated evidence

- `[AUTO]` Token storage parse/save/clear: `apps/client/src/playerSessionStorage.test.ts`.
- `[AUTO]` Newest-wins/generation registry: `apps/server/src/services/connectionRegistry.test.ts`.
- `[CLIENT]` App/lobby assertions: `apps/client/src/App.test.tsx`, `components/Lobby.test.tsx`.
- `[SOCKET-INTEGRATION]` `apps/server/src/socket.integration.test.ts` covers protocol,
  two-step stable admission, unknown-token rejection without Seat binding, reconnect,
  newest-wins, host/ready start, disconnect preservation, queued stale generation,
  deterministic host leave, forced-liquidation forfeit, Player/spectator same-socket
  leave-and-rejoin and spectator/reclaim within one running host.
- `[PACKAGED][RAM]` `apps/desktop/src/phase72HostProof.ts` restarts the packaged helper
  and verifies that the former room and reconnect token are rejected.

## Checklist

- [ ] First `join room` returns pending token but creates no Seat/host/color.
- [ ] Token hash is 32 bytes in RAM; raw token is absent from logs/public state.
- [ ] `resume session` activates exactly one stable UUID Seat; lost ACK is resumable.
- [ ] Newest valid socket wins; old receives `session replaced`; stale disconnect no-ops.
- [ ] Refresh/network reconnect/new socket keeps Player ID, Seat, ready, money and assets.
- [ ] Protocol/snapshot V9 (2v2 teams included) identity-preserving reset keeps room/code, stable Player
  IDs, join order/name/color/ready, host, `IN_PROGRESS` status and active reconnect
  token hashes while preserving the current appearance fields and gameplay state.
- [ ] Existing tokens reclaim the same Seats after in-process Play Again; pending old-game offers are cancelled.
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
- [ ] An all-offline room survives while the host process runs; explicit empty lobby cleanup follows policy.

## Phase 7.2 evidence

- `[AUTO][PASS]` Client reconnect storage uses V3 records scoped by canonical
  HTTP(S) authority and room code; a selected-room mismatch or legacy unscoped
  V1/V2 record cannot resume the wrong room.
- `[AUTO][PASS]` Clearing a V2 record preserves remaining entries as
  `authority -> token` strings, and V3 writes refresh an existing authority's
  insertion order before the maximum eight-entry retention limit is applied.
- `[AUTO][PASS]` Desktop terminal resume failure clears the scoped session and
  returns to the LAN launcher; it does not silently fall back to a fresh join.
- `[AUTO][PASS]` `removed from room` (host `kick player`) ends the session like a revoked one (`App.test.tsx`, "App 2v2 lobby commands" →
  "being removed by the host"): failure screen "Bạn đã được mời ra khỏi phòng" with the event's message, the stored session cleared, a later
  reconnect does not resume the revoked token, "Quay về màn hình vào phòng" leads to the join form, desktop returns to the launcher ("Về trang chủ"),
  and the listener is removed on unmount. The server side (revocation, channel removal, event delivery) is in
  [team-play.md](./team-play.md) / `socket.lobbySeats.integration.test.ts`.
- `[AUTO][PASS]` Desktop leave clears the scoped client session, disconnects, and
  returns to the launcher without stopping the app-owned Host runtime.
- `[SOCKET][PASS]` Desktop loopback remains the only unused-code creator; remote
  LAN admission policy rejects an unknown room with `NOT_FOUND` and creates no
  replacement room or pending session.
- `[SOCKET][PACKAGED][PASS-WINDOWS]` Four real clients enter one room under a
  stable first host; a fifth is rejected; reconnect retains PlayerId/room; the
  newest authenticated connection replaces the old one; helper restart rejects the old session and room.
- `[BROWSER][PASS]` Mobile Chromium/WebKit cover invitation prefill without
  auto-submit, two-client admission, lobby/start, reload resume, background/network
  recovery, and mobile layout boundaries.
- `[MANUAL DEFERRED / NOT RUN]` Physical Windows/macOS host/join, real mobile
  browsers, firewall/client isolation, sleep/Wi-Fi/IP changes, and host loss remain
  unclaimed.

## Restart evidence boundary

The packaged host proof restarts the helper and checks that its former room and token are gone.
A full Electron exit/relaunch and a remote browser reload on a separate device remain manual E2E checks.

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
  a malformed endpoint) shows its agreed plain-language localized line; the invitation-link field appears only after a failure (not
  after `NO_NETWORK`) and enters the room it names without searching; a result that arrives after "Quay lại" or
  after unmount is dropped; the configured-server mode is unchanged.
- [x] `[AUTO][CLIENT]` `DesktopMultiplayerLauncher.test.tsx`: the host form has a name field only (no network select, no port or
  address hint, no subtitle or footer), calls `start()` without options, and says "Máy này chưa kết nối mạng. …" when no
  network exists; no launcher text contains an address, port or database wording.
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

## V1.1 Start screen as a main menu, and a way back from the join screen (owner feedback 4 and 3)

The owner's rule again: players do not read technical text, so the start screen is buttons only. Design:
[Client/join-room.instruction.md](../Client/join-room.instruction.md) ("Launcher desktop = màn hình chính" and "Đường quay lại
launcher"); quit channel: [Api/http-runtime.instruction.md](../Api/http-runtime.instruction.md#desktop-quit-channel-v11).

- [x] `[AUTO][CLIENT]` `DesktopMultiplayerLauncher.test.tsx`: the menu holds buttons only ("Tạo phòng", "Tham gia phòng", "Máy chủ
  riêng" when configured, "Vào lại phòng đang mở" and "Đóng phòng" while a Host runs, "Cài đặt", "Thoát") with no sentence under
  any of them and no technical wording; every button is a focusable design-system button of at least 44 px (the shared focus
  ring is asserted in `Button.css`); the how-to-play key is last in the tab order and opens the guide; the picture is decoration
  only (hidden, empty alt, no title, no text, eight mascots and five landmark postcards); the menu sits on the start side and the
  art end-aligned, every animation is behind the reduced-motion guard and none loops.
- [x] `[AUTO][CLIENT]` `DesktopMultiplayerLauncher.test.tsx`, `AppBootstrap.test.tsx`, `settings/selectors.test.tsx`: "Cài đặt" is absent
  without a settings provider, opens the existing dialog on the saved values, writes a change to the storage the game reads
  (`readGameSettings` returns it before `bootstrap()` runs), and starts no audio.
- [x] `[AUTO][CLIENT]` `DesktopMultiplayerLauncher.test.tsx`: "Thoát" is absent when the bridge has no `quit.exitApp`, quits at once
  when no room is open (idle or failed runtime), asks "Đóng phòng và thoát game?" first when a room is open (`HOSTING`, `READY`,
  `STARTING_SERVER`) and calls `exitApp` once only on "Đóng phòng và thoát", stays on "Ở lại" with focus back on the button, shows
  "Chưa thoát được game. Hãy thử lại." on an IPC failure and gives the button back after 10 seconds.
- [x] `[AUTO][CLIENT]` `JoinForm.test.tsx`: "Quay lại" exists only with a way back (not in a plain browser), is the first control of the page (top left, before the
  title, outside the card) as a ghost button, calls the exit once without submitting, stays usable while joining, and the form opens with the name and room
  code already typed (`initialName`, `initialRoomCode`).
- [x] `[AUTO][CLIENT]` `App.test.tsx`: a failed desktop join shows the form again with the typed name and code and a way back that
  disconnects, emits no `leave room` and keeps a session saved for another room; "Quay lại" also works from "Phòng chung" and
  while the join answer is pending (a late answer changes nothing); no button in a plain browser or without an exit; a failure
  screen that is not already a way home gets "Về trang chủ" beside "Thử lại"; a replaced session is no longer a dead end on
  desktop; `ErrorScreen.test.tsx` covers the second action.
- [x] `[AUTO][CLIENT]` `design-lab/surfaces/entrySurfaces.test.tsx`, `surfaceCaptures.test.ts`: the launcher surfaces show every menu
  button (the lab supplies the settings and how-to-play providers), `launcher-running` shows "Vào lại phòng đang mở" and
  "Đóng phòng", and the new `landing-desktop-failed` (name and code kept, "Quay lại") renders and is in the capture manifest.
- [x] `[AUTO]` The desktop side of "Thoát" (channel, sender check, shutdown through the coordinator, preload whitelist) is in
  [http-runtime-and-deployment.md](./http-runtime-and-deployment.md#v11-lan-room-lookup-owner-feedback-5-and-6).
- [ ] `[MANUAL-E2E]` Look at the start screen and its forms (`launcher`, `launcher-running`, `launcher-host`, `launcher-join`,
  `launcher-join-failed`) and the join form with its "Quay lại" (`landing-desktop-failed`) at 1280×720, 1920×1080, 2560×1440 and
  812×375 landscape: buttons on the left, art on the right, nothing overlaps or scrolls off, text readable over the background,
  no motion under reduced motion. _(Captures not run by the author; the 812×375 form fit was measured in the Design Lab only.)_
- [ ] `[MANUAL-E2E]` Packaged app: see [V1 final manual acceptance](../../ui-ux-overhaul/V1_FINAL_MANUAL_ACCEPTANCE.md#main-menu-and-way-back-v11)
  for the real "Thoát", settings kept after a restart and the real way back from a failed join.

