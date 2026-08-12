# GameCore — mục lục room aggregate và Standard Mode

## Phạm vi

Game-domain functions dùng stable `PlayerId` và chỉ mutate draft aggregate.
Repository, Socket.IO, ACK và timer runtime nằm ngoài GameCore.

| Nhóm | Code | Instruction | Testcase |
| --- | --- | --- | --- |
| Room/Seat/host/ready/leave | `rooms.ts`, lifecycle services | [room-lifecycle.instruction.md](./room-lifecycle.instruction.md) | [join lifecycle](../testcase/join-room-and-player-lifecycle.md) |
| Turn/doubles/payment/bankruptcy/recovery | `game/turn.ts`, `game/dice.ts`, `game/payment.ts`, `game/bankruptcy.ts` | [turn-movement-and-bankruptcy.instruction.md](./turn-movement-and-bankruptcy.instruction.md) | [turn](../testcase/turn-movement-buy-and-jail.md), [winner](../testcase/game-status-bankruptcy-and-winner.md) |
| Tile/card/deck/jail | `game/tiles.ts` | [tile-cards-and-jail-resolution.instruction.md](./tile-cards-and-jail-resolution.instruction.md) | [turn](../testcase/turn-movement-buy-and-jail.md) |
| Property/building/mortgage/transfer | `game/property.ts`, `game/transfer.ts` | [property-economy.instruction.md](./property-economy.instruction.md) | [property](../testcase/property-economy.md) |
| Property/building/bank auctions | `game/auction.ts` | [auction.instruction.md](./auction.instruction.md) | [auction](../testcase/auction.md) |

Room persistence/CAS/deadline recovery: [../Persistence/README.md](../Persistence/README.md).

## Standard Mode invariants

- Board Việt Nam giữ 40 index và numeric economy; `1 unit = 1.000 VNĐ` chỉ là
  presentation scale.
- `completeTurnResolution` là điểm duy nhất trả successful outcome
  `EXTRA_ROLL | ADVANCE_TURN`.
  Không handler/tile/card tự ý gọi handoff khi còn
  `TurnInfo.pendingPropertyDecision`, `PaymentQueue` hoặc auction; các wait giữ
  `PendingTurnContinuation` của chính operation.
- `PaymentQueue.orderedClaims` là thứ tự claim ổn định có `activeClaimIndex`;
  creditor BANK và PLAYER dẫn tới hai pipeline bankruptcy khác nhau.
- `BankPropertyAuctionQueue` và auction/building contention chạy tuần tự, có ID/
  continuation authoritative và phục hồi được sau restart.
- Exact deck order là private durable state; public state không được lộ bài sắp rút.
- Disconnect chỉ đổi presence; forfeit là command explicit và phải xử lý active
  debt/creditor trước khi cleanup.
