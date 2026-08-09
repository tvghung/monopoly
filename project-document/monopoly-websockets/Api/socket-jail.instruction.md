# Jail Socket instruction

## Phạm vi AS-IS

Đây là Socket event module tương đương controller cho hai lựa chọn rời jail không dùng dice. Jail roll vẫn được nhận bởi event `roll dice` trong module Turn rồi chuyển vào `handleJailRoll`.

- Socket.IO path: `/socket.io` mặc định.
- Namespace: `/` mặc định.
- Function đăng ký: `registerJailHandlers(io, socket)`.
- Handler action: `apps/server/src/socket/jail.ts:5-40`.
- Jail roll service: `apps/server/src/game/tiles.ts:182-206`.

## Auth và permission

Không có auth hoặc permission key.

| Action | Guard trạng thái hiện tại |
|---|---|
| `pay bail` | Room tồn tại; active player tồn tại; `isJail === true`; sender là current player; balance ít nhất `$50M`. |
| `use jail card` | Room/player tồn tại; đang jail; sender là current player; `getOutOfJailCards >= 1`. |
| Jail `roll dice` | Guard chung của Turn: game started, current active player, chưa moved; sau đó `player.isJail` chọn `handleJailRoll`. |

## Action, mutation và outbound

| Inbound event | Mutation thành công | Nhánh từ chối nổi bật | Outbound |
|---|---|---|---|
| `pay bail` | Trừ 50; set `isJail = false`, `jailRounds = 0`; ghi log. | Thiếu tiền ghi log và phát state; sai player/turn/not jailed thì return im lặng. | `update` tới room. |
| `use jail card` | Trừ một card; clear jail và rounds; ghi log. | Không card/sai lượt/not jailed thì return im lặng. | `update` tới room. |
| `roll dice` qua Turn | Set dice; doubles hoặc `jailRounds === 2` thì move và release, nếu không tăng rounds; luôn `nextTurn`. | Guard chung của `apps/server/src/socket/turn.ts:27-37`. | `update` từ Turn handler. |

## Service và state liên quan

| Concern | Code thật |
|---|---|
| Bail/card handler | `apps/server/src/socket/jail.ts:5-40` |
| Roll routing | `apps/server/src/socket/turn.ts:27-53` |
| Jail roll rule | `apps/server/src/game/tiles.ts:182-206` |
| Send-to-jail từ tile/card | `apps/server/src/game/tiles.ts:65-75,138-144` |
| Player jail fields | `packages/shared/src/types.ts:52-61` |
| Jail UI | `apps/client/src/components/dashboard/JailPanel.tsx:4-39` |

## Caveat cần giữ đúng khi sửa

- `pay bail` và `use jail card` không check riêng `gameStarted`, `hasMoved` hoặc winner; chúng dựa vào current-player/jail state.
- Sau khi pay/card thành công, player vẫn chưa move và có thể roll trong chính lượt đó.
- Forced release khi `jailRounds === 2` không thu bail.
- Roll thoát jail di chuyển từ tile 10 rồi gọi `nextTurn`, nhưng không gọi `resolveTile`; property/tax/card tại tile đáp xuống không được xử lý.
- Doubles khi thoát jail không cấp lượt thêm; mọi jail roll kết thúc bằng `nextTurn`.
- UI chỉ hiện panel cho current jailed player và disable bail khi thiếu tiền, nhưng server vẫn phải giữ guard authoritative.

## Liên kết chéo

- Turn API: [`socket-turn.instruction.md`](socket-turn.instruction.md)
- Client turn/jail: [`../Client/turn-actions.instruction.md`](../Client/turn-actions.instruction.md)
- GameCore tile/cards/jail: [`../GameCore/tile-cards-and-jail-resolution.instruction.md`](../GameCore/tile-cards-and-jail-resolution.instruction.md)
- GameCore turn: [`../GameCore/turn-movement-and-bankruptcy.instruction.md`](../GameCore/turn-movement-and-bankruptcy.instruction.md)
- Shared contracts/data: [`../Shared/socket-and-state-contracts.instruction.md`](../Shared/socket-and-state-contracts.instruction.md), [`../Shared/board-and-card-data.instruction.md`](../Shared/board-and-card-data.instruction.md)
- Testcase: [`../testcase/turn-movement-buy-and-jail.md`](../testcase/turn-movement-buy-and-jail.md)

## Quy tắc sửa và kiểm thử

Khi sửa module này phải kiểm tra:

- Pay bail khi đủ/thiếu tiền, sai lượt, không còn jail và emit lặp.
- Use card với 0/1/nhiều card, sai lượt và action lặp.
- Jail roll non-double round 0/1, release round 2 và release bằng doubles.
- State sau release: tile, dice, jail fields, balance, next player và landing tile behavior.
- Panel Client hiển thị/disable đúng theo state server.
- Chạy jail tests `apps/server/src/game.test.ts:266-298` và bổ sung Socket integration test cho guard của hai handler.
