# Monopoly Websockets — Documentation Source of Truth

## Mục đích và phạm vi

Thư mục này là nguồn sự thật duy nhất để định vị phạm vi chức năng, đường dẫn code, rule thay đổi và checklist kiểm thử của project `monopoly-websockets`.

Tài liệu chỉ mô tả hành vi đang tồn tại trong code. Không ghi roadmap, flow đã xóa hoặc giả định chưa được code chứng minh. Code là bằng chứng thực thi; mọi sai khác giữa code và tài liệu phải được đồng bộ ngay trong cùng lần sửa.

Root `README.md` phục vụ giới thiệu, chạy project và deploy. Thư mục `docs/` hiện chỉ chứa ảnh minh họa. Hai nguồn đó không thay thế bộ instruction này.

## Tổng quan kiến trúc hiện tại

| Khối | Đường dẫn code | Trách nhiệm hiện tại | Tài liệu bắt đầu |
| --- | --- | --- | --- |
| Client | `apps/client/` | React 19 + Vite; join room và toàn bộ game UI | [monopoly.client.instructions.md](./monopoly.client.instructions.md) |
| HTTP/Socket API | `apps/server/src/createServer.ts`, `apps/server/src/socket/` | Express runtime và Socket.IO event handlers | [monopoly.api.instructions.md](./monopoly.api.instructions.md) |
| GameCore | `apps/server/src/rooms.ts`, `apps/server/src/game/` | In-memory room state và luật game phía server | [monopoly.game-core.instructions.md](./monopoly.game-core.instructions.md) |
| Shared | `packages/shared/src/` | Event contracts, state/payload types, board và card data | [monopoly.contracts.instructions.md](./monopoly.contracts.instructions.md) |
| Test/CI/deploy | `apps/server/src/game.test.ts`, `.github/`, root configs | Unit test game core, workspace validation và single-service deploy | [monopoly.shared.instructions.md](./monopoly.shared.instructions.md) |

Các khối không tồn tại trong code hiện tại: database, ORM, repository, schema, migration, REST controller nghiệp vụ, auth và RBAC.

## Thứ tự đọc bắt buộc

1. Đọc file này để xác định đúng khối.
2. Đọc [monopoly.shared.instructions.md](./monopoly.shared.instructions.md).
3. Đọc rule nền theo khối:
   - [monopoly.client.instructions.md](./monopoly.client.instructions.md)
   - [monopoly.api.instructions.md](./monopoly.api.instructions.md)
   - [monopoly.game-core.instructions.md](./monopoly.game-core.instructions.md)
   - [monopoly.contracts.instructions.md](./monopoly.contracts.instructions.md)
4. Mở index đúng khối:
   - [Client/README.md](./Client/README.md)
   - [Api/README.md](./Api/README.md)
   - [GameCore/README.md](./GameCore/README.md)
   - [Shared/README.md](./Shared/README.md)
5. Đọc file `.instruction.md` đúng màn hình hoặc module.
6. Đọc các instruction GameCore/Shared được file đó liên kết.
7. Đọc [testcase/README.md](./testcase/README.md) và checklist được liên kết trước khi sửa.

Nếu một thay đổi cắt qua nhiều khối, lặp lại bước 3–7 cho từng khối bị tác động.

## Tra nhanh theo ý định sửa

| Muốn sửa | Mở trước | Logic chính nằm tại |
| --- | --- | --- |
| Join room | [Client/join-room.instruction.md](./Client/join-room.instruction.md) | `apps/client/src/App.tsx`, `apps/client/src/components/JoinForm.tsx`, `apps/server/src/socket/player.ts` |
| Bàn cờ, tile hoặc token animation | [Client/game-board.instruction.md](./Client/game-board.instruction.md) | `apps/client/src/components/Board.tsx`, `apps/client/src/components/Tile.tsx`, `apps/client/src/useSteppedPositions.ts` |
| Roll, mua property hoặc jail action | [Client/turn-actions.instruction.md](./Client/turn-actions.instruction.md) | `apps/client/src/components/Dice.tsx`, `apps/client/src/components/dashboard/BuyPrompt.tsx`, `apps/client/src/components/dashboard/JailPanel.tsx`, `apps/server/src/socket/turn.ts`, `apps/server/src/socket/jail.ts`, `apps/server/src/game/tiles.ts` |
| Player list, start game hoặc winner | [Client/game-status.instruction.md](./Client/game-status.instruction.md) | `apps/client/src/components/Dashboard.tsx`, `apps/client/src/components/dashboard/PlayerList.tsx`, `apps/client/src/components/dashboard/WinnerBanner.tsx`, `apps/server/src/game/turn.ts` |
| Build, sell house hoặc mortgage | [Client/property-management.instruction.md](./Client/property-management.instruction.md) | `apps/client/src/components/BackOfCard.tsx`, `apps/server/src/socket/building.ts`, `apps/server/src/game/property.ts` |
| Open market hoặc private offer | [Client/trading-market.instruction.md](./Client/trading-market.instruction.md) | `apps/client/src/components/MarketPlace.tsx`, `apps/client/src/components/dashboard/SellPrompts.tsx`, `apps/client/src/components/dashboard/IncomingOffers.tsx`, `apps/server/src/socket/trading.ts` |
| Auction | [Client/auction.instruction.md](./Client/auction.instruction.md) | `apps/client/src/components/dashboard/AuctionPanel.tsx`, `apps/server/src/socket/auction.ts`, `apps/server/src/game/auction.ts` |
| Chat hoặc log | [Client/activity-log-and-chat.instruction.md](./Client/activity-log-and-chat.instruction.md) | `apps/client/src/components/Log.tsx`, `apps/server/src/socket/chat.ts`, `apps/server/src/game/text.ts` |
| HTTP health/static/CORS | [Api/http-runtime.instruction.md](./Api/http-runtime.instruction.md) | `apps/server/src/createServer.ts` |
| Socket event | [Api/README.md](./Api/README.md) | `apps/server/src/socket/` |
| Luật game hoặc room lifecycle | [GameCore/README.md](./GameCore/README.md) | `apps/server/src/game/`, `apps/server/src/rooms.ts` |
| Event, payload hoặc `GameState` | [Shared/socket-and-state-contracts.instruction.md](./Shared/socket-and-state-contracts.instruction.md) | `packages/shared/src/events.ts`, `packages/shared/src/types.ts` |
| Tile, color group hoặc card data | [Shared/board-and-card-data.instruction.md](./Shared/board-and-card-data.instruction.md) | `packages/shared/src/tileState.ts`, `packages/shared/src/chanceCards.ts`, `packages/shared/src/chestCards.ts`, `apps/client/src/components/BoardInitState.ts`, `apps/client/src/components/backOfCards.ts` |

## Quy ước tên và nội dung

- `*.instructions.md`: rule nền dùng cho cả một khối; không lặp nguyên văn vào file leaf.
- `*.instruction.md`: tài liệu chi tiết của một màn hình, event module hoặc nhóm game-domain functions.
- `README.md` trong mỗi khối: index và mapping; không chứa lại toàn bộ business rule.
- `testcase/*.md`: checklist kiểm thử theo chức năng, có phân biệt test tự động hiện có với manual/integration coverage còn thiếu.
- Đường dẫn code luôn tính từ root repo và phải tồn tại.
- Tên Socket event, state field, environment variable và route phải giữ đúng chính tả/casing trong code.
- Giá trị không tồn tại phải ghi rõ `Không có`; không để trống và không dựng tên giả.
- Caveat AS-IS mô tả rủi ro hoặc giới hạn hiện tại, không được diễn đạt như tính năng dự kiến.

## Nguồn thẩm quyền hiện tại

- Server giữ `GameState` thẩm quyền và broadcast toàn state bằng event `update`.
- Client có thêm display/local state cho animation, modal và offer countdown; state này không thay thế server state.
- Socket actor lấy từ `socket.id`; room scope lấy từ `socket.data.roomId`.
- TypeScript shared contracts chỉ kiểm tra compile-time; code hiện không có runtime schema validation.
- Room state là `Map` trong memory một process; restart hoặc redeploy làm mất game.
- Không có permission key. Owner/current-player/auction-participant checks là state guard theo action.

## Ma trận cập nhật bắt buộc

| Thay đổi code | Tài liệu tối thiểu phải cập nhật cùng lần sửa |
| --- | --- |
| View, menu, route, visibility hoặc UI behavior | Client rule + `Client/README.md` + file màn hình + testcase |
| HTTP route, middleware, CORS, static serving | API rule + `Api/README.md` + `http-runtime` + testcase deploy/runtime |
| Socket event, payload, guard hoặc outbound event | API module + Shared contract + Client producer/consumer + testcase |
| `GameState` hoặc shared type | Shared instruction + mọi instruction consumer + fixtures/testcase |
| Game rule, mutation order, bankruptcy/winner | GameCore instruction + liên kết API/Client + testcase |
| Room create/join/disconnect/delete | Room lifecycle + socket-player + join/player testcase |
| Tile/card name, value, index hoặc group | Shared data + client duplicates + hard-coded indices + testcase |
| Auth, permission, DB, schema hoặc migration mới | Root README + `CLAUDE.md` + rule/index/detail/testcase của khối mới |
| Xóa chức năng | Xóa mapping/detail/testcase đã hết hiệu lực; sửa mọi cross-link |

## Quy tắc thêm mới

- Thêm màn hình/panel leaf: tạo `Client/<slug>.instruction.md` và thêm một dòng vào `Client/README.md`.
- Thêm HTTP controller/route hoặc Socket handler module: tạo file tương ứng trong `Api/` và cập nhật `Api/README.md`.
- Thêm game-domain module hoặc shared data family: tạo instruction trong đúng khối và cập nhật index.
- Thêm testcase automation: cập nhật checklist để chỉ rõ mục nào đã được tự động hóa và đường dẫn test thật.
- Không giữ flow đã bị xóa dưới nhãn “legacy”; lịch sử thuộc version control, không thuộc tài liệu AS-IS.

## Kiểm tra cấu trúc và code

Trước khi bàn giao một thay đổi tài liệu hoặc code:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Chạy `pnpm build` khi thay đổi client, shared data/contract mà client import, hoặc cấu hình build/deploy. Ngoài lệnh tự động, thực hiện checklist liên quan trong `testcase/` và ghi đúng phần chưa thể tự động kiểm tra.
