# GameCore — mục lục room aggregate và Standard Mode

## Phạm vi

Game-domain functions dùng stable `PlayerId` và chỉ mutate draft aggregate.
Repository, Socket.IO, ACK và timer runtime nằm ngoài GameCore.

| Nhóm | Code | Instruction | Testcase |
| --- | --- | --- | --- |
| Room/Seat/host/ready/leave | `rooms.ts`, lifecycle services | [room-lifecycle.instruction.md](./room-lifecycle.instruction.md) | [join lifecycle](../testcase/join-room-and-player-lifecycle.md) |
| Turn/payment shortfall/bankruptcy/recovery | `game/turn.ts`, `game/dice.ts`, `game/payment.ts`, `game/bankruptcy.ts` | [turn-movement-and-bankruptcy.instruction.md](./turn-movement-and-bankruptcy.instruction.md) | [turn](../testcase/turn-movement-buy-and-jail.md), [payment](../testcase/payment-shortfall-and-forced-sale.md) |
| 2v2 Teamplay (teams, revive, Emergency Rescue, team rent) | `game/team*.ts`, `game/rescue*.ts`, `socket/team.ts`, `teamLobby.ts`, `packages/shared/src/teams.ts` | [team-play.instruction.md](./team-play.instruction.md) | [team play](../testcase/team-play.md) |
| Tile/card/deck/jail | `game/tiles.ts` | [tile-cards-and-jail-resolution.instruction.md](./tile-cards-and-jail-resolution.instruction.md) | [turn](../testcase/turn-movement-buy-and-jail.md) |
| Property/building/transfer | `game/property.ts`, `game/transfer.ts` | [property-economy.instruction.md](./property-economy.instruction.md) | [property](../testcase/property-economy.md) |
| Property/building/forced sale | `game/property.ts`, `game/transfer.ts` | [property-economy.instruction.md](./property-economy.instruction.md) | [property](../testcase/property-economy.md), [forced sale](../testcase/payment-shortfall-and-forced-sale.md) |

Room persistence/CAS/deadline recovery: [../Persistence/README.md](../Persistence/README.md).

## Standard Mode invariants

- Board Việt Nam giữ 40 index và numeric economy; `1 unit = 1.000 VNĐ` chỉ là
  presentation scale.
- `completeTurnResolution` là điểm duy nhất handoff và v4 chỉ trả
  `ADVANCE_TURN`.
  Không handler/tile/card tự ý gọi handoff khi còn
  pending purchase/development decision hoặc `PaymentQueue`; các wait giữ
  `PendingTurnContinuation` của chính operation.
- `PaymentQueue.orderedClaims` là thứ tự claim ổn định có `activeClaimIndex`;
  creditor BANK và PLAYER đều đi qua cùng payment-progression path.
- Payment shortfall tự động bán tài sản theo tile index khi deadline hết; forced-sale
  proposal có một proposal duy nhất, gắn với `paymentOperationId`/`claimId` và
  chỉ seller/buyer được thấy.
- Số luật mà người chơi đọc trong "Hướng dẫn chơi" (tiền khởi đầu, thưởng Xuất Phát, tiền thuê Ga, hệ số Công Ty, 70% khi bán
  cho Ngân hàng, vòng chờ tù, hạn đề nghị) có bản đọc được ở `packages/shared/src/rules.ts`; đổi luật ở `game/`/`socket/`
  mà không đổi `rules.ts` thì `apps/server/src/rulesContract.test.ts` đỏ.
- Exact deck order là private durable state; public state không được lộ bài sắp rút.
- 2v2: tiền và sở hữu luôn theo từng `PlayerId`; team chỉ đổi luật thuê, Team Investment, thứ tự lượt, phá sản/hồi sinh,
  Emergency Rescue và điều kiện thắng. Mọi nhánh team ở `game/` phải rẽ qua `isTeamMode(state)`/`teams.ts` để Solo không đổi
  (trừ bonus ×1,5 khi đủ khu màu).
- Disconnect chỉ đổi presence; forfeit là command explicit và phải xử lý active
  debt/creditor trước khi cleanup.
