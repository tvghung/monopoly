# V1.1 — Owner feedback after the V1 release

**Status: RELEASED as `v1.1.0` on 2026-10-03** (tag on `65d4855`; record in [V1_RELEASE_CONTRACT.md](../ui-ux-overhaul/V1_RELEASE_CONTRACT.md#v110-release-decision)). Branch `overhaul/v1-1-feedback`, merged to `main`. Manual rows stay open.

The product owner tested the released V1 (`v1.0.0`, 2026-10-02) and sent a numbered list of problems and wishes. The list
arrived in two parts: items 5 (end) to 12 first, items 1 to 5 (start) a few hours later, once the first part was already
implemented (2026-10-03). This folder is the
single place that tracks the list: what was asked, what the investigation found, what was decided, and what is done. Every
item changes code, module docs and `testcase/` checklists in the same change (the project rule), and a manual check is never
relabelled as automated.

Language rule (unchanged): this plan is English, every player-facing string stays Vietnamese and non-technical. The owner's
principle for this round: players do not read or understand technical text, so screens show only what a player needs.

## 1. Register

| # | Screen | What the owner asked (translated; the Vietnamese original is in §4) | Kind | Status |
| --- | --- | --- | --- | --- |
| 1 | Board, a player with little cash rolls onto rent or tax | The "sell your property" debt modal must open only after the animations are done (mascot hopping across tiles, coins, the plus/minus figures between players), when the cash has run down to 0 and a debt remains | Change (client presentation) | **Implemented** (d0c2a42); manual rows open |
| 2 | Victory summary | After a match, "Rời phòng" could fail with "ván đã kết thúc; không thể rời phòng lưu trữ" and trap the player on that screen; leaving must work, or another button must lead back to join/create | Server bug | **Fixed with item 7** (e412840) |
| 3 | In-app join screen (name + room code, shared-room switch) | The player had already typed the room before, must type again, and is stuck when the room code is not valid or the room cannot be joined: add a way back to the "Chơi qua mạng LAN" start screen (create here or join) | Change | **Implemented** (see §2 items 3 and 4); manual rows open |
| 4 | "Chơi qua mạng LAN" start screen | Strip the helper texts: just "Tạo phòng" and "Tham gia phòng"; add "Thoát" (quit the game) and "Cài đặt" (open settings); buttons toward the left of the window over a background image whose artwork sits mostly on the right, like a main screen | Change (UI) | **Implemented** (see §2 items 3 and 4); manual rows open |
| 5 | Join a LAN room | Only name and room code; the host address is found from the room code (the game is LAN-only); drop technical helper text | Feature | **Implemented** (4002631); manual rows open |
| 6 | Host a room ("Tạo phòng trên máy này") | Remove the "network to share" dropdown (use the network the device is on); drop the technical helper texts | Change | **Implemented** (4002631); manual rows open |
| 7 | Victory summary | Add a button back to the home screen ("Chơi qua mạng LAN") | Change + server bug | **Implemented** (e412840) |
| 8 | All screens | An info button that opens a how-to-play modal: basics, rent, building, buying, the Chance and Khí Vận lists (collapsed) | Feature | **Implemented** (4002631); manual rows open |
| 9 | Sell offer modal | The seller types the price the buyer must pay, like a buy offer | Feature | **Implemented** (14f4eb4) |
| 10 | Debt (forced-sale) modal | Buy offers that arrive while the player is in debt must be visible and answerable in or beside the modal | Bug + rule change | **Implemented** (14f4eb4) |
| 11 | Board, after "Bỏ cuộc" | A modal offers "keep watching" or "leave the room" instead of throwing the player out | Change | **Implemented** (e412840) |
| 12 | Board, graphics quality | Switching quality levels must be smooth; today the board and the player stations can vanish | Bug | **Fixed** (28f6867); browser regression spec passed (ffd1e86) |

## 2. Findings per item

### 1 — Debt window waits for the animations

- Root cause: `DebtPanel` (in `BottomDock`) rendered as soon as the room state with `paymentShortfall` reached the client, while the
  presentation queue was still playing the hop, the tile impact and the rent/tax coins, so the modal covered the board.
- Design (client only, no protocol change): `useDebtPresentationHold` (`components/dashboard/`). The window, and the status strip the
  other players see, stay hidden while the queue is not `idle`, the debtor token has not settled on its tile, or the debtor or a
  player creditor does not yet display the cash the room state holds (authoritative values are compared with displayed ones, so
  nothing flashes in the render where the state arrives). Once released, a debt (by `paymentOperationId`) stays visible until it is
  paid, so the coins of a sale do not hide the dialog. A reconnect or snapshot has nothing to play and shows at once; a queue that
  never goes idle is overruled after 12 s (`DEBT_HOLD_FALLBACK_MS`), the same safety net as the victory screen (8 s).
- The server deadline is absolute and keeps running while the hold is active, so the debtor has about the full time left. This
  is intentional: the deadline is an authoritative fact and the hold must never change it.

### 3 and 4 — Start screen as a main menu, a way back from the join screen

- Today (after items 5/6): the launcher choice screen is a centred card with two cards and a help key; the in-app join form has no
  way back, so an unknown room code, a full room or a failed join leaves the player on the form.
- Design: the launcher becomes a full-window main menu: the buttons "Tạo phòng", "Tham gia phòng", "Cài đặt", "Thoát" stacked toward
  the left over one background whose artwork (the eight mascots on the mini board, landmarks) sits on the right; no description
  under any button. "Thoát" is a typed, sender-checked, whitelisted IPC call that quits through the same path as closing the
  window (a running LAN host stops as it does today; a confirmation shows only when a host is running). "Cài đặt" opens the
  existing settings dialog at the launcher, so the launcher needs a settings scope outside the game providers. The join form (and
  every desktop screen where a player can get stuck) gets "Quay lại" to the launcher choice screen through the existing
  `onExitToLauncher` path; disconnect only changes presence, only an explicit leave revokes a session.

### 5 and 6 — Launcher, discovery, interface choice

- Today (`DesktopMultiplayerLauncher.tsx`): the host form has name plus a network `<select>` plus two technical hints; the join
  form asks for "Địa chỉ Host" (IPv4:port) and the room code; the header subtitle and a footer line are technical. The lobby
  invite card (`HostLanSharing.tsx`) also shows the raw URL, a second network select and a "Làm mới mạng" button.
- UDP broadcast discovery was built in Phase 7.1 (`lanDiscovery.ts`) and removed in Phase 7.2 as a scope decision, not for a
  failure; the docs therefore say "no UDP/mDNS discovery". This item reverses that scope decision on the owner's request.
- Design (request/response, room aware):
  - The server helper (desktop only) answers a broadcast `find-room` for a room code it holds, on UDP port 41234, with its
    TCP port; the requester takes the host IP from the packet source. Nothing else is sent: no token, hash, name or player
    list. The room code appears only in the request and is not a credential.
  - The Electron main process sends the request on every usable interface (directed broadcast plus 255.255.255.255, a few
    times within about 3 s), accepts a reply only with the matching nonce, source port and a usable IPv4, verifies it with
    `GET /healthz`, and returns an endpoint or a reason (`NOT_FOUND`, `UNREACHABLE`, `NO_NETWORK`, `UNAVAILABLE`) over a new
    typed IPC channel `ownTheBlock:lan:find-room` (sender-checked, strict payload, preload whitelist).
  - The join form shows name and room code only. After a failure it offers one extra field, "Dán liên kết mời" (the invite
    link), parsed by the inverse of `buildLanJoinUrl`, for networks that block broadcast (guest Wi-Fi, client isolation).
  - Interface choice without a dropdown: keep the API; improve `resolveNetworkInterfaces` (drop /32 masks, rank
    virtual/VPN/hypervisor adapters last, prefer the default-route interface, tie-break by RFC1918 then numerically). The lobby
    card keeps the QR and the copy button, hides the raw URL, and shows the network select only when two or more candidates
    rank equally well.
- Risks: Windows/macOS firewall behaviour for UDP is unverified (the helper already listens on TCP 0.0.0.0, so the prompt
  should already have been shown); macOS 15 Local Network permission; broadcast blocked on some networks (hence the
  fallback); fixed UDP port conflicts disable discovery quietly (hosting keeps working); CI UDP tests must use loopback unicast.

### 7 — Victory screen, "Về trang chủ"

- The victory dialog (`WinnerBanner.tsx`) has "Chơi lại" (host) and "Rời phòng" (everyone). There is no "Tiếp tục" text.
- Root cause of the owner's experience: `apps/server/src/socket/lobby.ts:317-319` rejects `leave room` from any player once the
  room is `FINISHED` ("Ván đã kết thúc; không thể rời phòng lưu trữ."), introduced by commit `3de3027`. The docs
  (`Api/socket-lobby.instruction.md`) say the opposite and the FINISHED branch below the guard is dead code.
- Design: the secondary button becomes "Về trang chủ" (home icon, no confirmation) and always works. Server: remove the
  guard and implement the documented FINISHED leave (revoke the session, mark the member `LEFT`, elect the lowest join-order
  non-`LEFT` member as host if the host leaves, delete the room when everybody left). Do not call `removePlayerFromGame` for
  the winner (it zeroes cash and returns properties, which would collapse the victory stats); relax the `rooms.ts`
  invariant so a `LEFT` member may still be the winner of a `FINISHED` room. Client: `leaveRoom` already returns to the
  launcher (desktop) or the join form (web) for every role; a `CONFLICT` from an old 1.0.0 host means "go home locally".

### 8 — How to play

- Screens without chrome today: launcher, join form, loading and error screens; the lobby has a header actions area; the game
  has `.room-toolbar` (top right, the only free HUD slot) and spectator banners that reserve the toolbar width.
- Design: one provider-free `HowToPlayProvider` around the app owns a single modal; a `HowToPlayButton` (`help` icon,
  accessible name "Hướng dẫn chơi", 44 px target) sits in each screen's own chrome (first toolbar slot, lobby header, join
  form, launcher card header; loading and error screens get a fixed top-right button). Nothing is fixed over the game HUD.
  The toolbar is tagged `data-hud-region="toolbar"` and the spectator banner reserve is widened.
- Content: one collapsed `<details>` per topic; the model is built from shared data (`tileState`, `colorGroups`,
  `chanceCards`, `chestCards`, `BAIL_AMOUNT`), and the rules that only live in code move to a new
  `packages/shared/src/rules.ts` so the modal and the server read the same numbers.
- Doc/code disagreements found while reading the rules, to fix in the same change: tax tiles (docs say no-op, code charges
  200 and 100), Thuế Xa Xỉ 75 vs 100, and a comment that says a monopoly doubles rent (it does not).

### 9 and 10 — Seller price, offers while in debt

- The only "sell to another player" flow is the debtor's forced-sale proposal inside `DebtPanel`; its price is computed by the
  server (70% of price plus houses) and is not on the wire.
- 9: add an optional `price` to the forced-sale proposal request (`price?` keeps protocol 9 and snapshot 8; no migration);
  the server uses `price ?? bank formula`, checks that the buyer can pay it, and the snapshot validator accepts any positive
  integer; the panel gets a number input defaulting to the bank price. Open decision: a price floor (any positive integer vs
  at least the bank price).
- 10: the server rejects creating and accepting ordinary offers while any payment shortfall exists, and the client hides
  incoming offers under the debt dialog (same z-index, later mount wins). Design: during a shortfall allow `make offer` and
  `accept offer` only when the recipient is the active debtor, the proposer is not, `offered` is cash only, and `requested` is
  one or more of the debtor's properties with no cash or cards; accept also requires the shortfall deadline not passed and no
  open forced-sale proposal, and runs `progressPaymentQueue` and `resumePaymentContinuation` afterwards. Client: an inline
  "Đề nghị mua {tài sản} của {người chơi}" section with Chấp nhận / Từ chối inside `DebtPanel`, a text toast, and
  `IncomingOffers` suppressed while the debt dialog is open. No new event, so no protocol or snapshot change.

### 11 — After "Bỏ cuộc"

- The server revokes the forfeiter's session and returns their assets to the Bank; the socket becomes unauthenticated. A
  same-socket `join room` then admits an anonymous spectator (existing behaviour, tested), so no server change is needed.
- Design: `forfeitAndWatch()` in `App.tsx` keeps the room on screen, re-joins as spectator quietly, and opens
  `ForfeitChoiceDialog` ("Bạn đã bỏ cuộc": **Xem tiếp** primary, **Rời phòng**). If the game already finished (the last two
  players) the spectator victory dialog is the choice. A reload lands on the launcher or join form (the token is revoked).

### 12 — Graphics quality switch

- Reproduced deterministically in the Phase 4 UAT harness (`stations-4`, SwiftShader): the first switch (balanced → low) leaves a
  bare table and switching back does not recover. Cause: R3F rewrites an orthographic camera to ±size/2 pixels whenever the size or
  the pixel ratio changes; a tier changes the pixel ratio and `FixedBoardCamera` only re-applied the board frustum on a size change,
  so the board shrank to a few dozen pixels (the HUD, being DOM, stayed). Fix: the Canvas camera is `manual`. See §5.

## 3. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Release as `1.1.0` (new features), not `1.0.1` | Items 5, 8, 9, 10 and 11 add behaviour |
| D2 | Keep `SOCKET_PROTOCOL_VERSION = 9` and snapshot schema 8 | The only wire change is an optional field; no new event |
| D3 | Reverse the "no UDP discovery" scope decision for the desktop app only | The owner asked for it (item 5); the cloud server is untouched |
| D4 | A hidden "paste the invite link" fallback appears only after discovery fails | Guest Wi-Fi and client isolation are common at schools |
| D5 | The lobby invite card keeps QR and copy, hides raw URL; network select only if ambiguous | Same principle as item 6 |

## 4. Owner's wording (Vietnamese, typos fixed)

- 1: "khi player nhấn đổ xúc xắc và đang có ít tiền, khi vào trúng property của người khác hoặc thuế, game ngay lập tức hiển thị modal
  bán tài sản ngay sau khi nhấn đổ xúc xắc; mong muốn: modal bán tài sản đang nợ chỉ hiển thị sau khi các animation đã chạy xong,
  gồm animation mascot nhảy qua các tiles, animation của coins và tiền cộng trừ giữa các players; khi nào xuống còn 0 tiền và vẫn
  còn nợ thì modal mới hiển thị lên."
- 2: "khi xong trận đấu, có trường hợp nhấn rời phòng thì bị báo lỗi ván đã kết thúc, không thể rời phòng lưu trữ, khiến người chơi
  bị mắc kẹt tại màn hình đó; mong muốn: có thể rời phòng dù đã bị lưu trữ, hoặc có thêm button thao tác khác để quay lại màn hình
  join phòng / tạo phòng."
- 3: "tại màn hình nhập id phòng và username để join phòng: đã phải nhập id phòng và địa chỉ LAN ở màn hình trước nhưng vẫn phải nhập
  lại id phòng và username; và bị kẹt khi không có id phòng hợp lệ, không join được phòng (có switch phòng chung và mã phòng);
  mong muốn: có nút quay lại màn hình Chơi qua mạng LAN, màn hình chọn tạo phòng trên máy này hoặc tham gia phòng LAN."
- 4: "màn hình Chơi qua mạng LAN, màn hình bắt đầu trò chơi: đơn giản hóa, xóa bớt các text helper giải thích, chỉ cần ghi Tạo phòng,
  Tham gia phòng vì các helper text này quá kỹ thuật, người chơi không đọc và hiểu; thêm button Thoát để người chơi chủ động tắt
  game, và button Cài đặt để mở modal cài đặt; các nút đặt hơi hướng bên trái màn hình, trên một hình background với các artwork tập
  trung về phía bên phải, tạo cảm giác giống màn hình chính hơn."
- 5: "chỉ cần nhập tên và mã phòng là được; không cần địa chỉ host, địa chỉ host sẽ tự lấy thông qua mã phòng vì game của chúng ta
  mặc định chỉ chơi qua mạng LAN; và xóa bớt những helper text kỹ thuật vì người chơi không đọc và hiểu những cái này."
- 6: "bỏ dropdown mạng dùng để chia sẻ vì mặc định sẽ dùng mạng đang kết nối với thiết bị; bỏ bớt các helper text như 'Một máy Host
  giữ phòng; các thiết bị cùng Wi-Fi hoặc Ethernet tham gia bằng địa chỉ LAN', 'Cổng được hệ điều hành chọn an toàn và sẽ hiện
  trong liên kết mời', 'Liên kết mời chỉ chứa địa chỉ LAN và mã phòng; không chứa phiên kết nối hay thông tin cơ sở dữ liệu'."
- 7: "màn hình tổng kết trận đấu, sau khi có người thắng: có thêm button về trang chủ, để quay lại màn hình Chơi qua mạng LAN ban
  đầu khi mới mở game."
- 8: "tại tất cả các màn hình: thêm một nút có icon dấu ! hoặc ? hoặc icon nào đó thể hiện đây là nút thông tin; khi click thì mở modal
  hướng dẫn chơi: một vài logic cơ bản của game, logic thu tiền của các tiles, logic xây nhà, logic mua đất, danh sách các thẻ
  Cơ Hội và Khí Vận; khi click xem thì mới xổ ra danh sách; bạn sẽ là người soạn nội dung."
- 9: "người chơi đề nghị bán cho người chơi khác có thể nhập giá tiền mong muốn để người được đề nghị phải trả số tiền đó, giống
  chức năng đề nghị mua."
- 10: "khi có đề nghị mua đến từ người chơi khác lúc người này đang bị nợ và mắc kẹt ở modal bán tài sản, hệ thống pop lên 'Đề nghị
  mua [tên property] của [tên người chơi]'; khi click vào thông báo thì người chơi xác nhận hoặc từ chối ngay cạnh modal bán tài
  sản, hoặc game thể hiện bằng một cách nào đó để người chơi hiểu mình có thể đồng ý bán hoặc từ chối ngay tại modal bán tài sản."
- 11: "khi người chơi bỏ cuộc, người chơi sẽ gặp một modal hiển thị lựa chọn xem tiếp hoặc rời phòng; xem tiếp thì ở lại xem, rời
  phòng thì mở màn hình Chơi qua mạng LAN, màn hình chính của game lúc mới bật."
- 12: "khi chuyển giữa các mức đồ họa, có lúc bị bug UI và không thấy board đâu hết, cũng không thấy các player station đâu; mong
  muốn chuyển qua chuyển lại mượt mà giữa các mức đồ họa."

## 5. Diagnosis log

### 12 — Graphics quality switch (2026-10-03)

Probe (temporary Playwright specs, not committed): harness `?phase4-uat=1&scenario=stations-4&quality=balanced`, then the harness
"Chất lượng đồ họa (UAT)" select. After the switch to `low`: the scene's `data-graphics-tier` is `low` and the canvas was resized
from 1567×867 to 1254×694 (pixel ratio 1.25 → 1), the same WebGL context stays alive, no console or page error, but the renderer
diagnostics (`window.__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__`) keep `qualityTier: "balanced"`, `frameSequence: 20`, and no new
`[own-the-block-renderer]` line appears: the renderer stopped drawing after the reconfiguration, so the resized (cleared)
drawing buffer shows only the page background. 

What the probes showed after the switch: the scene graph was intact (142 visible meshes, none hidden, the same WebGL context, no GL
error, no console error), `renderer.info` counted 142 draw calls and 66,928 triangles every frame, and the only thing that had
changed was the camera: R3F's `updateCamera` had overwritten the frustum with ±size/2 pixels on the pixel-ratio change. Going the
other way (low → balanced) from a fresh load also changes the pixel ratio, so every tier change broke it on a screen where the tiers'
ratios differ (device ratio 1: low 1, balanced and high 1.25; 1.25: all equal, so nothing happened there, which is why the owner saw
it "sometimes").

Fixed in commit 28f6867: `BOARD_CANVAS_CAMERA.manual = true`; verified by screenshots over low, balanced, high, low, balanced, low.
Also fixed on the same path: the key light's shadow map was never reallocated when its size changed (balanced ↔ high left
mis-scaled shadows, visible as dark wedges on the table), the tabletop kept a disposed roughness texture, and a failed optional
layer stayed failed across tier changes. The permanent regression is `e2e/visual/graphicsTierSwitch.visual.ts`.

## 6. Open questions for the owner

1. ~~Items 1–4 and the first lines of item 5 did not arrive.~~ Answered: they arrived on 2026-10-03 and are items 1–4 above (the head of
   item 5, the current join screen, only describes today's behaviour).
2. Item 9: may the seller ask any positive price, or at least the bank price?

## 7. Gates (before the 1.1.0 release)

`pnpm db:status`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; PostgreSQL integration and the restart scenario
(CI, `TEST_DATABASE_URL`) because items 7, 9 and 10 touch snapshot invariants and payment/transfer; the desktop checks
(`pnpm --filter @monopoly/desktop typecheck`, `test`, `pnpm desktop:package`, packaged proofs). Manual rows stay unchecked until a
person observes them.
