# Activity log và chat

## Định danh màn hình

| Thuộc tính | Giá trị AS-IS |
|---|---|
| Menu | Không có |
| List route | Không có |
| Detail route | Không có |
| Vị trí UI | Ngăn kéo cạnh phải của Board tại entry `/` (trong `GameHud`) |
| Permission key | Không có |

## Code và component path

- Log/chat UI: `apps/client/src/components/Log.tsx`; V8 typed Activity Feed is the
  single modern source rendered by this surface.
- Board composition: `apps/client/src/components/Board.tsx`.
- Socket wrapper: `apps/client/src/App.tsx`.
- Log/chat style: `apps/client/src/components/style/Log.css`.
- Server chat handler liên quan: `apps/server/src/socket/chat.ts`.
- Escape/sanitize và append log: `apps/server/src/game/text.ts`.
- State/event contract: `packages/shared/src/types.ts`, `packages/shared/src/events.ts`.
  `BoardState.activityFeed` is server-authored, bounded and public-safe; it is not
  reconstructed from `boardState.logs`.

## Service, state, context và socket

- `Log` đọc `state.boardState.activityFeed` and `socketFunctions` from
  `stateContext`; migrated historical snapshots may retain a plain-text legacy
  prefix before the new typed tail. A fresh V8 snapshot with typed activity does
  not render its duplicate legacy strings.
- Local state `chat` giữ nội dung input; `scrollRef` trỏ tới vùng log.
- `getActivitySignature()` uses typed tail length/sequence/last event identity plus
  the legacy log signature. A new array with equivalent content is not new activity.
- Log là ngăn kéo cạnh phải (Visual Overhaul V2 plan 03): **mặc định đóng**, tab dọc (icon, nhãn "Nhật ký",
  badge chưa đọc) luôn hiện; mở ra là panel giấy đặc, rộng `min(360px, 40vw)` (điện thoại `min(92vw, 360px)`).
  Không còn idle fade: `LOG_IDLE_TIMEOUT_MS`, `data-idle` và opacity `0.2` đã bị xóa.
- Trạng thái mở/đóng dùng chung qua `HudDrawerProvider` (`game/ui/hud/hudDrawer.tsx`) và được nhớ theo người xem
  trong `localStorage` khóa `own-the-block.hud.drawer.v1` (`open`/`closed`, bọc try/catch; mặc định đóng).
- A11y: tab là `button[aria-expanded][aria-controls="board-log-panel"]`; mở ngăn thì focus chuyển vào panel;
  `Escape` đóng và trả focus về tab, trừ khi đang có dialog (`role=dialog|alertdialog`).
- `ActivityTicker` (dòng gameplay mới nhất, không phải chat/dice, 4000 ms / speed, ẩn khi ngăn mở, bấm để mở,
  `aria-hidden`) và bong bóng chat trên card người gửi (tin của người khác, tối đa 80 ký tự, 4000 ms / speed, chỉ
  render text, không hiện khi ngăn mở và bị xóa khi ngăn mở) không bao giờ replay lịch sử; cursor nhảy tới mới nhất
  khi mount, khi `presentationResetEpoch` đổi hoặc khi sequence lùi. Câu chữ dùng chung ở `game/ui/hud/activityText.ts`.
- **Chat không bị gate bởi presentation queue**: bong bóng đọc `boardState.activityFeed.events` (authoritative) và
  Log ghép chat authoritative với các dòng gameplay đã được gate (`mergeUngatedChat`, theo sequence), nên tin chat và
  badge chưa đọc hiện ngay cả khi người chơi khác còn đang quyết định mua; ticker và nhật ký gameplay vẫn theo
  `displayActivity`/`displayLogs`.
- Badge chưa đọc được mô tả cho trình đọc màn hình qua `aria-describedby` của tab ("N tin nhắn chưa đọc").
  Đóng ngăn kéo xóa tin đang gõ dở để mở lại không gửi nhầm nội dung không còn thấy.
- Log đọc presentation qua `usePresentationSelector` (chỉ `displayActivity`, `displayLogs`, `presentationResetEpoch`)
  nên không render lại mỗi tick của store.
- Submit có nội dung truthy emit `send chat(message)`, sau đó reset local state và form.
- `send chat` có request-scoped ACK. Server appends both the compatibility string log
  and a typed `CHAT` event in one room command, then emits the committed `update`.
- Server giới hạn một chat attempt mỗi socket trong 750 ms và chỉ giữ 500 log entries
  mới nhất trong room snapshot trên RAM của host (mất khi host process thoát).
- Effect theo dõi activity signature và cuộn vùng log xuống `scrollHeight` sau mỗi
  log signature mới. Vùng log vẫn `overflow-y:auto` nhưng ẩn scrollbar ở Firefox và
  Chromium/WebKit.
- Không có chat service, pagination, persistence phía client hoặc channel riêng ngoài room hiện tại.

## Phạm vi UI

- Danh sách activity/game log của room trong cùng `Log` surface.
- Dòng chat typed nằm chung với gameplay entries nhưng có visual treatment riêng.
- Input/nút/chat role/loading/empty state and structured activity use the selected VI/EN locale (Vietnamese default).
- Player names, team names, and chat remain exactly as entered; legacy freeform log strings remain compatibility-only.
- Game amounts use the VNĐ formatter in both locales; no `$` or `$M` conversion.
- Gameplay display entries follow the existing PresentationQueue gate; reconnect and
  replay hydrate the current tail without replaying it. Reduced motion keeps the
  existing snap behavior.

## Luồng hiện tại

1. Khi state chưa loaded, vùng log hiển thị `Loading...`.
2. Khi loaded, component render legacy compatibility context as plain-text `<p>`
   entries followed by typed `activityFeed.events`; it never parses the legacy
   strings as HTML.
3. Activity signature mới auto-scroll xuống cuối khi ngăn đang mở; khi đóng, tin chat của người khác tăng badge chưa đọc.
4. Người dùng mở ngăn (tab hoặc bấm ticker), nhập chat và submit.
6. Nếu chuỗi local `chat` truthy, client emit `send chat` nguyên giá trị đang có.
7. Client xóa input sau emit; ACK failure được App hiển thị qua toast và không tự retry message.
8. Server records typed chat data and an escaped compatibility log, commits and emits
   `update` cho room.
9. Client renders typed text (never HTML interpolation) and auto-scrolls.

## Rule và caveat

- Client UI validation không phải safety boundary. Runtime schema server từ chối chuỗi rỗng/chỉ khoảng trắng và message trên 500 ký tự.
- Chat gửi nhanh hơn 750 ms bị ACK failure; giới hạn log 500 dòng có nghĩa các dòng
  cũ nhất bị loại khi server append dòng mới.
- Modern Activity Feed render bằng React text/typed fields, không dùng
  `dangerouslySetInnerHTML` và không parse HTML logs để phân loại gameplay. Legacy
  string logs are displayed only as a safe historical prefix/context before typed
  entries.
- Server hiện escape chat text và sanitize player name; nếu đổi format/nguồn log phải kiểm tra lại boundary này trước khi render HTML.
- Typed activity entries use server UUID event IDs as React keys; the compatibility
  prefix retains index keys only for the legacy string array.
- Disconnected client khóa form; failure ACK không tạo phantom log entry dù input local đã được xóa.
- Tin chat của người khác chỉ hiện ở bong bóng khi ngăn đóng; người gửi không tự thấy bong bóng của mình.
- Actor là stable authenticated Player hoặc explicit spectator label, không lấy từ client payload/socket ID.
- Active player, finished player và socket khác có thể nhận nhãn người gửi khác nhau từ server; client không tự xác định role đó.
- Không có route detail, permission key, message edit/delete hoặc history pagination.
- Các action game khác cũng append vào cùng log; thay schema log ảnh hưởng nhiều GameCore module.
- Card/turn/payment/bankruptcy log giữ deterministic order từ committed
  `PaymentQueue`/continuation; Client không tự dựng translated gameplay result.
- Card activity appears only after the authoritative card reveal; public activity
  never contains deck order, hidden card identity, private offers or continuation data.

## Tài liệu liên quan

- Rule nền Client: [`../monopoly.client.instructions.md`](../monopoly.client.instructions.md)
- Rule nền API: [`../monopoly.api.instructions.md`](../monopoly.api.instructions.md)
- Contract state/event: [`../monopoly.contracts.instructions.md`](../monopoly.contracts.instructions.md), [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md)
- Socket chat: [`../Api/socket-chat.instruction.md`](../Api/socket-chat.instruction.md)
- Room lifecycle/log actor: [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md)
- Gameplay log nguồn: [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md), [`../GameCore/property-economy.instruction.md`](../GameCore/property-economy.instruction.md)
- Testcase: [`../testcase/chat-log-and-input-safety.md`](../testcase/chat-log-and-input-safety.md), [`../testcase/client-state-sync-motion-and-accessibility.md`](../testcase/client-state-sync-motion-and-accessibility.md)

## Quy tắc sửa và checklist kiểm thử

Khi sửa activity log/chat, kiểm tra tối thiểu:

- Chat rỗng/chỉ khoảng trắng/quá 500 ký tự không trở thành committed log.
- Message bình thường tới đúng room và không rò sang room khác.
- Active player, finished player và spectator nhận đúng label/name/color hiện tại.
- Payload chứa `<`, `>`, `&`, quote và script-like text chỉ hiển thị như text, không thực thi HTML/script.
- Legacy string logs remain readable as text; structured chat is never HTML markup.
- Input được xóa sau submit và log auto-scroll khi có dòng mới.
- Ngăn đóng mặc định, nhớ lựa chọn, focus vào panel khi mở, `Escape` đóng (không khi có dialog); không có timer
  idle. State broadcast giữ nguyên `[count,last]` không tạo hoạt động mới.
- Log body còn scroll được bằng wheel/touchpad nhưng không có vertical scrollbar nhìn thấy.
- Nhiều log liên tiếp giữ đúng thứ tự và không mất dòng khi committed public snapshot đến.
- Activity sequence remains monotonic and bounded; spectator projection and reconnect
  preserve the same ordered public tail without duplicate entries.
- Reduced-motion không chạy entry animation.
- Listener `update` không bị nhân đôi sau rerender/reconnect.
- Audit không còn player-facing English/USD trong chat hoặc game-generated log.
- Chạy typecheck, build, lint và testcase được liên kết ở trên.
