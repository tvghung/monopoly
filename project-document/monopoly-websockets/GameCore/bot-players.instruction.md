# Bot players (current protocol 14, snapshot 11; bot seats introduced in v1.7.0)

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
- `set bot difficulty {difficulty}` — RELEASED v1.8.0 (protocol 13; release v1.10.0 dùng protocol 14): host, `LOBBY`; một mức
  cho mọi bot (Cực dễ, Dễ, Trung bình, Khó, Cực khó), lưu ở `boardState.botDifficulty` (thiếu = MEDIUM, `play again` giữ nguyên).
  Client chỉ hiện dropdown khi có ít nhất một bot; khách thấy mức nhưng không đổi được. Protocol bump 12 → 13 ở v1.8.0 đã
  xử lý R-1: app v1.7.0 bị strict handshake từ chối bằng `UPGRADE_REQUIRED`. Bot v1.7.0 chỉ có một Balanced policy.
  Version history: [socket-and-state-contracts](../Shared/socket-and-state-contracts.instruction.md#version-history).
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
- `bots/driver.ts`: một timer/phòng, key = danh tính công khai của việc đang chờ (có `matchId`); khi timer chạy, driver
  dựng lại view/task hiện tại, gọi policy và kiểm tra lại key trong room queue; task/key đã đổi thì no-op. Lần thử đầu dùng
  `decision.action`. Sau khi command bị từ chối, retry kế tiếp dùng `decision.fallback` từ lần policy hiện tại, không dùng primary
  action mới. Có tối đa 2 retry (2 s, 8 s); hết lượt thì task turn-bound (đổ, mua, xây, thẻ) giao cho turn recovery của
  server (deadline ngay, trong room queue, chỉ khi phòng còn chờ đúng task đó), còn task có deadline riêng (nợ, cứu trợ,
  bán bắt buộc, đề nghị) để deadline xử lý; sau đó park với một dòng log rõ ràng.
  Unit tests chứng minh đường fallback, số lần thử bị giới hạn, recovery và stale-task guard; chúng không chứng minh rằng
  retry chọn primary action mới từ view mới. Đây là giới hạn của test claim, không phải khẳng định policy không được gọi lại.
  Không có người thật kết nối → bot chờ. Delay chỉ để trình bày (`BOT_ACTION_DELAY_SCALE`): sau khi đổ, bot chờ ước lượng trình bày
  ở tốc độ thường (`packages/shared/src/botPacing.ts`) + 0,9 s suy nghĩ; logic không chờ animation client, client giữ cờ sở hữu tới
  khi hàng đợi trình bày tới bước chuyển nhượng. Với task `CARD`, bot chờ thêm tối thiểu 3 giây để con người đọc thẻ; server
  command vẫn kiểm tra thời gian đóng.
## Mất kết nối của người

Không bao giờ có bot thay người. Grace 60 s: hết giờ thì mua bị bỏ qua, phát triển bỏ qua, lượt bị bỏ, và (từ protocol 12)
thẻ đã lật được áp dụng như khi bấm "Đóng" thay vì treo ván.

## Tests

`apps/server/src/socket.bots.integration.test.ts`, `socket.botDriver.integration.test.ts`, `bots/policy.test.ts`,
`bots/driver.test.ts`, client `components/Lobby.test.tsx` ("Lobby bot seats"), `game/ui/hud/PlayerCardList.test.tsx`.
Difficulty coverage: `apps/server/src/bots/policy.test.ts`, `apps/server/src/socket.bots.integration.test.ts`,
`apps/client/src/components/Lobby.test.tsx` (các describe/it có "difficulty"). Manual full-game theo từng mức NOT RUN.
Checklist: [testcase/bot-players.md](../testcase/bot-players.md).

## CURRENT DEVELOPMENT — 08B Power-up decisions

Before rolling, the bot policy may activate an eligible owned A01/A02/A03/A05/A07/A08/A09/A10 or D04 using its own private projection and public targets. The driver invokes the same `activatePowerUpCommand` as a human and retains the roll fallback. It does not arm ordinary task retries while a human Reaction/consent is pending. Bot reactions retain the existing authoritative automatic-pass policy. This is a bounded legal-use heuristic, not a complete strategic policy for all 30 cards. Tests: `apps/server/src/bots/driver.test.ts`, `apps/server/src/game/powerUps/endurance.test.ts`.
