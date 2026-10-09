# GameCore — mục lục room aggregate và Standard Mode

## Phạm vi

Game-domain functions dùng stable `PlayerId` và chỉ mutate draft aggregate.
Repository, Socket.IO, ACK và timer runtime nằm ngoài GameCore.

| Nhóm | Code | Instruction | Testcase |
| --- | --- | --- | --- |
| Room/Seat/host/ready/leave | `apps/server/src/rooms.ts`, `apps/server/src/services/playerSessionService.ts`, `apps/server/src/socket/lobby.ts`, `apps/server/src/socket/session.ts` | [room-lifecycle.instruction.md](./room-lifecycle.instruction.md) | [join lifecycle](../testcase/join-room-and-player-lifecycle.md) |
| Turn/payment shortfall/bankruptcy/recovery | `apps/server/src/game/turn.ts`, `apps/server/src/game/dice.ts`, `apps/server/src/game/payment.ts`, `apps/server/src/game/paymentResolution.ts`, `apps/server/src/game/bankruptcy.ts` | [turn-movement-and-bankruptcy.instruction.md](./turn-movement-and-bankruptcy.instruction.md) | [turn](../testcase/turn-movement-buy-and-jail.md), [payment](../testcase/payment-shortfall-and-forced-sale.md) |
| 2v2 Teamplay (teams, revive, Emergency Rescue, team rent) | `apps/server/src/game/team.ts`, `apps/server/src/game/teamState.ts`, `apps/server/src/game/rescue.ts`, `apps/server/src/game/rescueResolution.ts`, `apps/server/src/socket/team.ts`, `apps/server/src/teamLobby.ts`, `packages/shared/src/teams.ts` | [team-play.instruction.md](./team-play.instruction.md) | [team play](../testcase/team-play.md) |
| Bot seats, Balanced bot policy, bot difficulty (CURRENT DEVELOPMENT) | `apps/server/src/bots/policy.ts`, `apps/server/src/bots/driver.ts`, `apps/server/src/bots/view.ts`, `apps/server/src/bots/botSeats.ts`, `apps/server/src/commands/gameplay.ts`, `apps/server/src/socket/bots.ts`, `apps/server/src/services/presence.ts` | [bot-players.instruction.md](./bot-players.instruction.md) | [bot players](../testcase/bot-players.md) |
| Tile/card/deck/jail | `apps/server/src/game/tiles.ts`, `apps/server/src/game/decks.ts` | [tile-cards-and-jail-resolution.instruction.md](./tile-cards-and-jail-resolution.instruction.md) | [turn](../testcase/turn-movement-buy-and-jail.md) |
| Property/building/transfer/forced sale | `apps/server/src/game/property.ts`, `apps/server/src/game/transfer.ts` | [property-economy.instruction.md](./property-economy.instruction.md) | [property](../testcase/property-economy.md), [forced sale](../testcase/payment-shortfall-and-forced-sale.md) |

Room RAM store/command ordering/CAS/deadline recovery: [../Persistence/README.md](../Persistence/README.md).
Protocol/snapshot versions: [Version history](../Shared/socket-and-state-contracts.instruction.md#version-history).

## Standard Mode invariants

- Board Việt Nam giữ 40 index và numeric economy; `1 unit = 1.000 VNĐ` chỉ là
  presentation scale.
- `completeTurnResolution` là điểm duy nhất handoff cho landing/payment/card resolution; turn-recovery hết hạn khi không còn gì chờ (`nextTurn` trong `apps/server/src/services/deadlineScheduler.ts`) và việc loại người chơi hiện tại (`removePlayerFromGame`/`checkBalance` trong `apps/server/src/game/turn.ts`) handoff trực tiếp; v4 chỉ trả
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
- Exact deck order là private state của room aggregate (RAM, mất khi host process thoát); public state không được lộ bài sắp rút.
- 2v2: tiền và sở hữu luôn theo từng `PlayerId`; team chỉ đổi luật thuê, Team Investment, thứ tự lượt, phá sản/hồi sinh,
  Emergency Rescue và điều kiện thắng. Mọi nhánh team ở `game/` phải rẽ qua `isTeamMode(state)`/`teams.ts` để Solo không đổi
  (trừ bonus ×1,5 khi đủ khu màu).
- Disconnect chỉ đổi presence; forfeit là command explicit và phải xử lý active
  debt/creditor trước khi cleanup.
