# Bot players (protocol 12, snapshot 11)

Bot là một ghế do chính host process chơi. Luật game không đổi vì bot; bot chỉ được làm đúng những gì một người ngồi ở
ghế đó được làm. Thiết kế đầy đủ và quyết định: [BOT_SYSTEM_SPEC](../../own-the-block-vnext/BOT_SYSTEM_SPEC.md),
[IMPLEMENTATION_PLAN](../../own-the-block-vnext/IMPLEMENTATION_PLAN.md) (D1–D15).

## Danh tính và ghế

- `RoomMember.kind = 'BOT'` (thiếu `kind` = HUMAN), `PlayerId` là `randomUUID()`. Bot không có session, token, socket,
  `ConnectionRegistry` entry hay Socket.IO room.
- Tên `Bot N` với N nhỏ nhất còn trống (1–3); mascot+màu tự chọn không trùng (`chooseBotCharacter`), 2v2 mặc màu đội.
- `normalizeLobbyBots` chạy sau mọi lệnh trong `commitRoomCommand`: bot ở sảnh luôn Ready và luôn có tổ hợp mascot hợp lệ;
  khi trùng thì bot nhường, lựa chọn của người không bao giờ bị đổi vì bot.
- Invariant (`assertSupportedRoomSnapshot`): host không phải bot, tối đa `MAX_BOTS_PER_ROOM = 3` bot, bot không LEFT,
  bot ở `LOBBY` phải Ready.
- Presence: bot luôn "có mặt" (`services/presence.ts`): không chặn start, không bật `turnRecovery`. Room expiry và quyết định
  đóng phòng chỉ đếm người.

## Lệnh sảnh

- `add bot {requestId, seat?}`: host, `LOBBY`; `ROOM_FULL` khi đủ 4 ghế; cùng `requestId` (LRU runtime 64 id/phòng, 10 phút)
  trả lại bot cũ, không thêm bot thứ hai. 2v2: `seat` là ghế trống host bấm, ghế đã có người thì về ghế mặc định.
- `remove bot {playerId}`: host, `LOBBY`, chỉ ghế BOT; `NOT_FOUND` khi đã bị xóa. `kick player` từ chối bot.
- `request seat swap` tới bot: đổi chỗ ngay (bot luôn đồng ý). Bot không bao giờ xin đổi chỗ.
- `start game`: 2–4 ghế, ít nhất 1 người, mọi người Ready + connected. `boardState.matchId = randomUUID()`.
- `play again`: giữ `kind`; bot Ready lại ngay, người phải Ready lại; `matchId` về null tới lần start sau.
- Leave: host chuyển cho người kế tiếp (không bao giờ cho bot); người thật cuối cùng rời (LOBBY, IN_PROGRESS hoặc FINISHED)
  thì phòng bị xóa trong cùng transaction.

## Quyết định trong ván

- Mọi lệnh gameplay (roll, mua, phát triển, tù, thẻ, bán cho Bank, trả lời forced sale/rescue/offer, hồi sinh) sống ở
  `apps/server/src/commands/gameplay.ts`; socket handler và bot driver gọi cùng `runGameCommand`.
- `bots/view.ts`: bot chỉ thấy `projectPublicRoomState`, `projectPrivatePlayerState(bot)` và offer gửi cho bot.
- `bots/policy.ts`: `botTaskOf` tìm việc đang chờ bot; `decideBotAction` (Balanced, offline, tie-break seeded) trả lệnh +
  fallback luôn hợp lệ. Bot không gọi `make offer`, `propose forced sale`, `sell house` (ngoài luồng nợ), chat hay leave.
- `bots/driver.ts`: một timer/phòng, key = danh tính công khai của việc đang chờ (có `matchId`); guard trong room queue tính
  lại task, lệch key = no-op. Phục hồi có giới hạn: lỗi lần 1 → fallback; rồi tối đa 2 lần quyết định lại (2 s, 8 s); hết
  lượt thì việc gắn với lượt (đổ, mua, xây, thẻ) giao cho turn recovery của server (deadline ngay, trong room queue, chỉ khi
  phòng còn chờ đúng task đó), việc có deadline riêng (nợ, cứu trợ, bán bắt buộc, đề nghị) để deadline đó xử lý; sau đó park
  với một dòng log rõ ràng. Không có người thật kết nối → bot chờ. Delay chỉ để trình bày (`BOT_ACTION_DELAY_SCALE`): sau
  khi đổ, bot chờ ước lượng trình bày ở tốc độ thường (`packages/shared/src/botPacing.ts`) + 0,9 s suy nghĩ; logic không chờ
  animation client, client giữ cờ sở hữu tới khi hàng đợi trình bày tới bước chuyển nhượng.

## Mất kết nối của người

Không bao giờ có bot thay người. Grace 60 s: hết giờ thì mua bị bỏ qua, phát triển bỏ qua, lượt bị bỏ, và (từ protocol 12)
thẻ đã lật được áp dụng như khi bấm "Đóng" thay vì treo ván.

## Tests

`apps/server/src/socket.bots.integration.test.ts`, `socket.botDriver.integration.test.ts`, `bots/policy.test.ts`,
`bots/driver.test.ts`, client `components/Lobby.test.tsx` ("Lobby bot seats"), `game/ui/hud/PlayerCardList.test.tsx`.
Checklist: [testcase/bot-players.md](../testcase/bot-players.md).
