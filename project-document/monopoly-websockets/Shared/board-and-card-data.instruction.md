# Dữ liệu bàn cờ và bộ thẻ

## Phạm vi

Dữ liệu tĩnh định nghĩa 40 vị trí bàn cờ, nhóm màu và các hiệu ứng Chance/Community Chest mà game core đang sử dụng.

## Code nguồn và exports

- `packages/shared/src/tileState.ts`
  - default export `tileState: Tile[]`.
  - named export `colorGroups: Record<string, number[]>`.
- `packages/shared/src/chanceCards.ts`
  - default export `chanceCards: GameCard[]`.
- `packages/shared/src/chestCards.ts`
  - default export `chestCards: GameCard[]`.
- `packages/shared/src/index.ts` re-export cả bốn giá trị trên.

`tileState` hiện có 40 phần tử, index `0..39`. Tám nhóm có thể xây nhà là `brown`, `lightblue`, `pink`, `orange`, `red`, `yellow`, `green`, `blue`.

## Schema dữ liệu đang dùng

- Mọi tile có `streetName` và `tileType`.
- Tile mua được có thể có `color`, `price`, `rent`.
- Street xây được dùng `rentTiers` theo mức 1–4 nhà và mức 5 là hotel, cùng `houseCost`.
- `GameCard.message` luôn có; effect tùy chọn gồm `reward`, `penalty`, `moveToTile`, `moveBy`, `goToJail`, `collectFromEachPlayer`, `payEachPlayer`, `getOutOfJailFree`.

Game core chọn ngẫu nhiên một phần tử mỗi lần đáp Chance/Chest. Không có deck state, shuffle/discard pile hoặc cơ chế loại thẻ Get Out of Jail Free khỏi deck.

## Invariants theo index

- Board wrap dùng hằng `40`; GO là index `0`, Jail là `10`.
- Railroad rent dùng các index `5, 15, 25, 35` trong `apps/server/src/game/tiles.ts`.
- Utility multiplier dùng index `12` và `28` trong cùng file.
- Chance card đang tham chiếu trực tiếp `0`, `39`, `24`, `5`; comment đầu deck ghi ý nghĩa các index này.
- `colorGroups` phải chỉ trỏ đến street `tileType: normal` đúng màu; property economy dùng trực tiếp nhóm này cho monopoly và luật xây/bán đều.

## Consumers

- Tile/rent/card resolution: `apps/server/src/game/tiles.ts`.
- Monopoly/build/mortgage: `apps/server/src/game/property.ts`.
- Buy và trade labels: `apps/server/src/socket/turn.ts`, `apps/server/src/socket/trading.ts`.
- Property-card actions: `apps/client/src/components/BackOfCard.tsx`.
- Board/prompt presentation: `apps/client/src/components/BoardInitState.ts`, `apps/client/src/components/backOfCards.ts`, `apps/client/src/components/dashboard/BuyPrompt.tsx`, `apps/client/src/components/dashboard/SellPrompts.tsx`.

## Mutation và hành vi liên quan

- Các array data này không bị mutate trong game state.
- `resolveTile` đọc tile bằng `currentTile`; `applyCard` mutate player balance/position/jail card theo effect.
- `moveToTile` trên card không tự trả tiền qua GO và không resolve tiếp tile đích; tiền GO chỉ có khi card ghi `reward`.
- `moveBy` wrap bằng modulo 40.

## Caveat AS-IS

- Client vẫn có hai bảng trình bày lặp dữ liệu: `BoardInitState.ts` và `backOfCards.ts`. Vì vậy `tileState.ts` chưa phải nguồn dữ liệu duy nhất cho mọi label/price/rent hiển thị.
- Có drift nhìn thấy: index 20 là `Free Parking` trong shared nhưng `BoardInitState.ts` để label rỗng; index 28 là `Water Company` trong shared nhưng `BoardInitState.ts` và `backOfCards.ts` dùng `Water Works`.
- Thêm/xóa/reorder tile mà không cập nhật hard-coded index sẽ làm sai jail, utility, railroad hoặc card destination.
- Card được rút có hoàn lại về mặt dữ liệu; cùng một card có thể xuất hiện liên tiếp và thẻ ra tù không bị loại khỏi deck khi player đang giữ.

## Quy tắc sửa và kiểm thử

1. Không reorder tile như một refactor trình bày; index là khóa nghiệp vụ trong state và nhiều consumer.
2. Khi đổi tile, rà `colorGroups`, hard-coded indices, card destinations, `BoardInitState.ts`, `backOfCards.ts` và icon/layout tương ứng.
3. Khi thêm effect card, cập nhật `GameCard`, `applyCard` và unit test trước khi thêm card dùng effect đó.
4. Chạy `pnpm typecheck`, `pnpm test`, `pnpm build`.
5. Thực hiện [`../testcase/shared-contracts-and-board-data.md`](../testcase/shared-contracts-and-board-data.md); testcase tile/card runtime chính nằm trong [`../testcase/turn-movement-buy-and-jail.md`](../testcase/turn-movement-buy-and-jail.md).

## Liên kết chéo

- [`../GameCore/tile-cards-and-jail-resolution.instruction.md`](../GameCore/tile-cards-and-jail-resolution.instruction.md)
- [`../GameCore/property-economy.instruction.md`](../GameCore/property-economy.instruction.md)
- [`../Client/game-board.instruction.md`](../Client/game-board.instruction.md)
