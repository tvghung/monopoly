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
- Presence: bot luôn "có mặt" (`apps/server/src/services/presence.ts`): không chặn start, không bật `turnRecovery`. Room expiry và quyết định
  đóng phòng chỉ đếm người.

## Lệnh sảnh

- `add bot {requestId, seat?}`: host, `LOBBY`; `ROOM_FULL` khi đủ 4 ghế; cùng `requestId` (LRU runtime 64 id/phòng, 10 phút)
  trả lại bot cũ, không thêm bot thứ hai. 2v2: `seat` là ghế trống host bấm, ghế đã có người thì về ghế mặc định.
- `remove bot {playerId}`: host, `LOBBY`, chỉ ghế BOT; `NOT_FOUND` khi đã bị xóa. `kick player` từ chối bot.
- `set bot difficulty {difficulty}` — CURRENT DEVELOPMENT (vNext, unreleased, protocol 13; không có trong v1.7.0): host, `LOBBY`; một mức cho mọi bot (Cực dễ, Dễ, Trung bình, Khó, Cực khó)
  lưu ở `boardState.botDifficulty` (thiếu = MEDIUM, `play again` giữ nguyên). Client chỉ hiện dropdown khi có ít nhất một bot;
  khách thấy mức hiện tại nhưng không đổi được. Lệnh thuộc protocol 13 (snapshot vẫn 11): app 1.7.0 bị từ chối ở bắt tay
  (`UPGRADE_REQUIRED`), nên không có host 1.7.0 nào nhận lệnh này; chi tiết ở
  [Version history](../Shared/socket-and-state-contracts.instruction.md#version-history).
  Profile trong `DIFFICULTY_PROFILES` (`apps/server/src/bots/policy.ts`); MEDIUM = Balanced policy đã phát hành ở v1.7.0, không đổi:

  | Mức | `reserveFactor` | `blunder` | `offerGain` | `setHandoverGain` | `boardAware` |
  | --- | ---: | ---: | ---: | ---: | --- |
  | `VERY_EASY` | 1.5 | 0.4 | 0.9 | 1 | false |
  | `EASY` | 1.25 | 0.2 | 1 | 1.5 | true |
  | `MEDIUM` | 1 | 0 | 1.15 | 2 | true |
  | `HARD` | 0.85 | 0 | 1.3 | 2.5 | true |
  | `VERY_HARD` | 0.7 | 0 | 1.5 | 3 | true |

  `reserveFactor` nhân tiền đệm (cao hơn = mua/xây ít hơn), `blunder` = xác suất cố tình quyết định sai khi mua/xây,
  `offerGain` = offer phải cho hơn bao nhiêu lần phần lấy đi, `setHandoverGain` = ngưỡng khi trade trao cho đối thủ đủ khu màu,
  `boardAware` chỉ bật giảm ngưỡng mua khi đủ/chặn khu và kiểm tra nguy hiểm khi chờ trong tù (`apps/server/src/bots/policy.ts`);
  định giá khu màu và kiểm tra trao đủ khu cho đối thủ áp dụng ở mọi mức.
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
  fallback luôn hợp lệ. Bot không gọi `make offer`, `propose forced sale`, `sell house` (kể cả khi nợ: bot gửi `sell property to bank`), chat hay leave.
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
CURRENT DEVELOPMENT (difficulty): `apps/server/src/bots/policy.test.ts`, `apps/server/src/socket.bots.integration.test.ts`,
`apps/client/src/components/Lobby.test.tsx` (các describe/it có "difficulty"); chưa có manual full-game theo từng mức.
Checklist: [testcase/bot-players.md](../testcase/bot-players.md).
