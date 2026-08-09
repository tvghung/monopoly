# Socket và state contracts

## Phạm vi

Contract TypeScript dùng chung giữa Socket.IO server và React client. File này không mô tả runtime validation, authentication hay persistence vì các lớp đó không tồn tại trong package shared hiện tại.

## Code nguồn

- Barrel export: `packages/shared/src/index.ts`.
- State và payload types: `packages/shared/src/types.ts`.
- Event contracts: `packages/shared/src/events.ts`.
- Typed server aliases: `apps/server/src/socket/types.ts`.
- Typed client aliases/wrappers: `apps/client/src/types.ts`, `apps/client/src/App.tsx`.
- State khởi tạo phía server: `apps/server/src/rooms.ts` (`freshState`).
- State khởi tạo phía client: `apps/client/src/App.tsx` (`initialState`).
- Test fixture cùng shape: `apps/server/src/game.test.ts` (`makeState`, `makePlayer`).

## Exports nhìn thấy trong code

### State và data model

- Board data: `TileType`, `Tile`, `GameCard`.
- Player/property: `Player`, `FinishedPlayer`, `OwnedProp`, `OpenMarketEntry`.
- Turn/game state: `Die`, `DiceValue`, `CurrentPlayer`, `TurnInfo`, `Auction`, `BoardState`, `GameState`.
- Trading payloads: `SaleInfo`, `OfferInfo`, `OfferOnProp`, `OfferResult`, `Offer`.

`GameState` gồm `boardState`, map `players`, `turnInfo` và cờ `loaded`. `BoardState` giữ danh sách player id, current player, log, dice, ownership, open market, winner và auction hiện tại.

### Server → client

- `update(state)` — broadcast toàn bộ `GameState`.
- `offer on prop(info)` — gửi offer tới owner.
- `offer declined(info)` và `offer accepted(info)` — trả kết quả cho buyer.

### Client → server

- Lifecycle/turn/chat: `new player`, `start game`, `send chat`, `roll dice`, `buy property`.
- Trading: `put on open market`, `make offer`, `accept offer`, `decline offer`, `make sale`, `remove sale`.
- Property: `build house`, `sell house`, `mortgage property`, `unmortgage property`.
- Jail: `pay bail`, `use jail card`.
- Auction: `decline property`, `place bid`, `pass bid`.

`SocketData` chỉ có `roomId?`; nó được gán sau event `new player`. `InterServerEvents` hiện là record rỗng.

## Invariants và luồng mutation

- Server là nguồn state runtime có thẩm quyền. Client emit ý định; server mutate room state rồi phát `update` cho cả Socket.IO room.
- Player actor phải lấy từ `socket.id`; payload `playerId` trong trade không phải bằng chứng quyền sở hữu.
- Mỗi room có một `GameState` riêng. Các handler lấy room từ `socket.data.roomId`.
- Shared package chỉ khai báo shape/data; mutation nằm trong `apps/server/src/game/` và `apps/server/src/socket/`.
- Khi nhận `update`, reducer client thay state bằng shallow copy của payload; không merge từng field.

## Caveat AS-IS

- TypeScript chỉ kiểm tra code đã compile; payload từ browser vẫn cần guard runtime ở handler. Không được viết tài liệu rằng event “đã validate” chỉ vì nó có type.
- Contract `start game` nhận một `string` và `buy property` nhận một `boolean`, nhưng server hiện không dùng hai payload này; client vẫn emit `''` và `true`.
- Shape state được khởi tạo lặp ở `rooms.ts`, `App.tsx` và `game.test.ts`. Thêm field bắt buộc phải đồng bộ cả ba nơi.
- `loaded` là `true` trong room state, `false` trong client initial state và chuyển theo bản `update` đầu tiên.
- Không có versioning/backward compatibility cho event hay state; server và client được deploy như một bộ cùng version.

## Consumers và liên kết chéo

- Room/state lifecycle: [`../GameCore/room-lifecycle.instruction.md`](../GameCore/room-lifecycle.instruction.md).
- Turn và bankruptcy: [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md).
- Socket handler index: [`../Api/README.md`](../Api/README.md).
- Client state sync: [`../Client/README.md`](../Client/README.md).

## Quy tắc sửa và kiểm thử

1. Tìm tất cả consumer bằng import `@monopoly/shared` trước khi đổi type/export.
2. Nếu đổi event, sửa đồng thời interface event, emit/listener client, listener/emit server và targeted-event hook.
3. Nếu đổi state, sửa `freshState`, `initialState`, test fixtures và mọi UI đọc field đó.
4. Chạy `pnpm typecheck`, `pnpm lint`, `pnpm test`; chạy `pnpm build` khi client bị ảnh hưởng.
5. Thực hiện checklist [`../testcase/shared-contracts-and-board-data.md`](../testcase/shared-contracts-and-board-data.md) và testcase chức năng của event bị đổi.
