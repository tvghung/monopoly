# Phase 08B — Card test coverage matrix

CURRENT DEVELOPMENT, 2026-10-27. Registry: `apps/server/src/game/powerUps/catalog.ts` (30 unchanged official definitions).

## Evidence interpretation

Every row has a named parameter case in `apps/server/src/socket.powerUps.allCards.integration.test.ts`: it submits a real authenticated socket command, asserts a card-specific effect in `assertEffect`, rejects foreign ownership and invalid payloads without a revision change, injects a room save failure and compares the whole room, commits successfully, rejects replay, reconnects and compares inventory/status, checks public confidentiality, then removes the owner through the real leave command. U06 commits its later consent and verifies both resulting inventories. These are concrete outcome assertions, not merely an exception-free generic handler.

All identity/rarity/effect parameters are independently locked by `catalog.test.ts` and `config.test.ts`. Legal activation/timing is covered by the named card cases in `runtime.test.ts`; all 22 Active definitions also reject jail. Effect-specific references below are in `apps/server/src/game/powerUps/stabilization.test.ts` unless `runtime.test.ts` or the socket suite is stated.

| ID | Official name | Rarity / activation | Concrete boundary/interaction evidence |
| --- | --- | --- | --- |
| A01 | Móc Túi | COMMON / ACTIVE | 10% floor at cash 1/9/10/499/500/501/10000, zero/negative rejection, 50 cap; reflected payer/beneficiary |
| A02 | Tăng Phí Đột Xuất | COMMON / ACTIVE | 25% ceil, strongest-only stacking, one rent use and two completed owner turns |
| A03 | Hợp Đồng Bất Lợi | COMMON / ACTIVE | 20% ceil / 50 cap; U03 and real U07 price; consumed only by successful purchase |
| A04 | Tung Tin Đồn | COMMON / ACTIVE | 25% floor, two successful reductions / three owner turns; D03/D04/D05/D06/D10 |
| A05 | Phong Tỏa Xây Dựng | RARE / ACTIVE | One target turn restriction; real U09 build rejection and permitted SKIP; debt liquidation remains in original payment path |
| A06 | Trộm Thẻ | RARE / ACTIVE | Capacity, random pool ownership, D09 block, D05 excludes resolving A06 and frees its consumed slot |
| A07 | Chiếm Đoạt Doanh Thu | EPIC / ACTIVE | 50% / 100 cap on realized receipts; modifiers, D01/D08, partial cash, bankruptcy, cumulative rounding, self-beneficiary and team rescue |
| A08 | Khủng Hoảng Thị Trường | LEGENDARY / ACTIVE | Opponents only; strongest reduction, next-source-start expiry, elimination handoff, owner-scoped D10 removal |
| A09 | Thanh Tra Bất Ngờ | COMMON / ACTIVE | 10 per house, hotel five, 50 cap; reflected building levy and mandatory Bank claim |
| A10 | Gánh Nặng Tiền Thuê | RARE / ACTIVE | 50% ceil / 100 cap to Bank independently of D01/D08; A07 combination |
| D01 | Bảo Hiểm Tiền Thuê | COMMON / REACTION | 40% floor / 80 cap at rent 1/101/199/200/201/1000; real payment and A07/A10 |
| D02 | Ví Chống Trộm | COMMON / REACTION | A01 blocked pre-transfer; unsupported attack matrix; timeout spends no defense |
| D03 | Phá Mưu | COMMON / REACTION | All five approved deferred attacks blocked; immediate/global attacks excluded; timeout and replay |
| D04 | Lá Chắn Bất Động Sản | COMMON / ACTIVE | Two compatible interceptions, three owner-turn limit, ownership eligibility; reflected A04; real UI charge changes |
| D05 | Phản Đòn | RARE / REACTION | All eight targeted attacks redirected with effect-specific beneficiary/property; A06 capacity and no nested reaction |
| D06 | Hủy Phép | RARE / REACTION | Targeted cancellation before status/transfer; A04 and eight targeted-attack eligibility cases |
| D07 | Quỹ Cứu Trợ | EPIC / REACTION | Shortfalls 1/99/100/101/250, cap 100, one originating operation, creditor accounting and normal remaining debt |
| D08 | Bất Khả Xâm Phạm | LEGENDARY / REACTION | Rent 1/101/199/200/201/1000, cap 200, full eligible receipt, A07 allocation and independent A10 surcharge |
| D09 | Khóa Kho Thẻ | COMMON / REACTION | A06 block; voluntary U06 remains consent-based; unused D09 may be stolen when A06 times out |
| D10 | Giải Phong Tỏa | RARE / ACTIVE | Removes only future negative remainder; A04 and own participation in global A08; no refund |
| U01 | Xúc Xắc May Mắn | COMMON / ACTIVE | Mandatory new dice result, one movement checkpoint / roll sequence; START once; jailed and second-Active rejection |
| U02 | Tăng Tốc | COMMON / ACTIVE | Raw dice unchanged, +2 actual steps, START once; second movement card rejected |
| U03 | Phiếu Giảm Giá Đất | COMMON / ACTIVE | 15% floor / 50 cap; correct landing only; real A03+U03 purchase, cash rejection retains coupon |
| U04 | Hiến Tế Nâng Cấp | RARE / ACTIVE | All six Common/Rare/Epic rarity recipes, Legendary/non-activator-U04 rejection, three spent / one fresh output |
| U05 | Định Hướng | RARE / ACTIVE | Every integer delta -3..3; minimum one step; -4/4/fraction/NaN rejected before spending; START once |
| U06 | Trao Đổi Vận May | COMMON / ACTIVE | Accept/decline/absolute timeout; full hands; random own non-activator cards; target reload; removal cancels pending consent |
| U07 | Đầu Tư Từ Xa | EPIC / ACTIVE | 125% exact cost at cash 0/74/75/76; rejects non-properties/owned targets; no movement, START or landing |
| U08 | Dịch Chuyển Hoàng Gia | LEGENDARY / ACTIVE | Property destination and original movement helper; crossing START produces one award/offer; real landing continuation |
| U09 | Phiếu Ưu Đãi Xây Dựng | COMMON / ACTIVE | 20% floor / 50 cap at build 1/249/250/400; owner-turn duration; A05 cannot be bypassed |
| U10 | Tái Cấu Trúc Kho Thẻ | RARE / ACTIVE | Same rarity in each eligible category; original excluded; empty Epic pool rejects; fresh U10 permitted; Legendary input rejected |

## Lifecycle and boundary applicability

- Timed statuses A02/A03/A04/A05/A07/A10/D04/U03/U09 have exact remaining-turn/use assertions. A08 has a named source-start expiry assertion, including elimination handoff. D10 verifies prospective removal. Unplayed inventory cards and instantaneous effects have no invented expiration.
- Every Reaction definition has its own exact-deadline expiry case in the socket suite. Response/Pass races, duplicate expiry and injected timeout-save failure are separate tests. D09 timeout intentionally preserves the instance by transferring it to the A06 attacker when it is the only stealable card.
- Money boundaries are N/A for pure inventory/movement/status operations. Those rows instead assert capacity, recipe, valid destination, input and ownership constraints.
- Source/target inventory and pending state removal is checked in the runtime suite and through real socket leave for all 30 rows. Three-seat pending Reaction/consent removal must leave an executable next dice command.
- Reconnect coverage is same-process only. Process-restart loss is the approved RAM architecture, additionally checked by the packaged Host proof.
- The 30/30 figure means concrete functional card evidence plus the applicable recorded dimensions above. It does not mean every combinatorial state, network impairment, physical platform or human strategy was exhaustively tested. Browser/Electron UI coverage is representative; see the stabilization report.
