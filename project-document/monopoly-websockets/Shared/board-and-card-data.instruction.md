# Canonical board Việt Nam, cards và deck state

## Source of truth

- `packages/shared/src/tileState.ts`: duy nhất 40 tile và `colorGroups`.
- `packages/shared/src/chanceCards.ts`, `chestCards.ts`: canonical Vietnamese cards
  có stable `GameCardId`, source deck và typed effects.
- `packages/shared/src/rules.ts`: các **số luật** mà chỉ server thi hành và client cần đọc (tiền khởi đầu 1500, thưởng
  Xuất Phát 200, 2–4 người chơi, giới hạn 4 Nhà rồi Khách Sạn, hoàn một nửa khi bán một cấp công trình, tiền thuê Ga
  25/50/100/200, hệ số Công Ty ×4/×10, 70% khi bán cho Ngân hàng lúc nợ, giới hạn vòng chờ tù 2, hạn đề nghị 20 giây, hạn
  đề nghị bán bắt buộc 20 giây, mặc định chờ mất kết nối 60 giây và hạn trả nợ 120 giây). Dữ liệu bàn cờ (giá, tiền thuê,
  giá xây, tiền thuế, chữ trên thẻ) vẫn chỉ nằm ở `tileState.ts` và hai file thẻ. Hộp thoại "Hướng dẫn chơi" và text của
  deed đọc các số này; `apps/server/src/rulesContract.test.ts` chạy hàm/hằng thật của server (`createFreshPlayer`,
  `START_REWARD`, `railroadRent`, `utilityRent`, `forcedSaleGrossPrice`, `sellHouse`, `nextTurn`, `resolveTile`,
  `loadServerConfig`, và một offer thật qua socket) và so với `rules.ts`, nên đổi luật ở server mà quên `rules.ts` thì CI
  đỏ. Số chỉ đọc từ môi trường (`RECONNECT_GRACE_MS`, `PAYMENT_SHORTFALL_ACTION_TIMEOUT_MS`) là **mặc định** và được
  ghi "(mặc định)" cho người chơi.
- `packages/shared/src/index.ts`: export surface cho server/client.

Client derive mặt trước, property detail, price/rent/build text từ shared
data. Không duy trì `BoardInitState.ts` hoặc `backOfCards.ts` như bảng metadata thứ
hai. Presentation-only icon/layout có thể ở Client nhưng không lặp economy/name.

## Board 40 index

| Index | Type | Tên tiếng Việt | Economy/group |
| ---: | --- | --- | --- |
| 0 | start | Xuất Phát | giữ |
| 1 | normal | Cà Mau | brown, giữ |
| 2 | chest | Khí Vận | giữ |
| 3 | normal | Bạc Liêu | brown, giữ |
| 4 | expense | Thuế Thu Nhập | RELEASED v1.7.0: `expenseAmount` 200 (nộp 200.000 ₫ cho Ngân hàng, không phải no-op). CURRENT DEVELOPMENT (vNext, unreleased, commit 1937a73; implemented on the vNext development branch; product approval/release decision not independently verified): `expenseAmount` 150 trong `packages/shared/src/tileState.ts`. Rủi ro tương thích 1.7.0 ↔ vNext: [Version history](./socket-and-state-contracts.instruction.md#version-history) |
| 5 | railroad | Ga Hà Nội | giữ |
| 6 | normal | Buôn Ma Thuột | lightblue, giữ |
| 7 | chance | Cơ Hội | giữ |
| 8 | normal | Cần Thơ | lightblue, giữ |
| 9 | normal | Hải Phòng | lightblue, giữ |
| 10 | jail | Nhà Tù / Thăm Tù | giữ |
| 11 | normal | Đà Lạt | pink, giữ |
| 12 | company | Công Ty Điện | giữ |
| 13 | normal | Hội An | pink, giữ |
| 14 | normal | Huế | pink, giữ |
| 15 | railroad | Ga Huế | giữ |
| 16 | normal | Mũi Né | orange, giữ |
| 17 | chest | Khí Vận | đổi type Chance cũ → Chest |
| 18 | normal | Sa Pa | orange, giữ |
| 19 | normal | Nha Trang | orange, giữ |
| 20 | parking | Bãi Đỗ Xe | no-op |
| 21 | normal | Vũng Tàu | red, giữ |
| 22 | chance | Cơ Hội | giữ |
| 23 | normal | Quy Nhơn | red, giữ |
| 24 | normal | Đà Nẵng | red, giữ |
| 25 | railroad | Ga Đà Nẵng | giữ |
| 26 | normal | Bãi Cháy | yellow, giữ |
| 27 | normal | Hồ Tây | yellow, giữ |
| 28 | company | Công Ty Nước | giữ |
| 29 | normal | Phú Quốc | yellow, giữ |
| 30 | gojail | Vào Tù | giữ |
| 31 | normal | Phú Mỹ Hưng | green, giữ |
| 32 | normal | Thảo Điền | green, giữ |
| 33 | chest | Khí Vận | giữ |
| 34 | normal | Nguyễn Huệ | green, giữ |
| 35 | railroad | Ga Sài Gòn | giữ |
| 36 | chance | Cơ Hội | giữ |
| 37 | normal | Đồng Khởi | blue, giữ |
| 38 | expense | Thuế Xa Xỉ | `expenseAmount` 100: người chơi nộp 100.000 ₫ cho Ngân hàng |
| 39 | normal | Landmark 81 | blue, giữ |

Mọi price/base rent/rent tiers/house cost và 8 `colorGroups` giữ numeric value hiện
tại. `1 game unit = 1.000 VNĐ`; shared math không nhân 1000.

## Index invariants

- Board size 40; Xuất Phát 0; Jail 10; Go-to-jail 30.
- Khí Vận 2/17/33; Cơ Hội 7/22/36; Ga 5/15/25/35; utilities 12/28.
- Card destinations dùng canonical index, không hard-code English name. Tests phải
  phát hiện sai type index 17 và mọi mismatch group/type/destination.

## Card content/effects

- Tất cả message là tiếng Việt và dùng formatter semantics VNĐ; themes gồm hoàn
  thuế, thưởng Tết, sửa nhà, viện phí, học phí, cổ tức, sinh nhật, du lịch, phạt
  giao thông, Xuất Phát, địa danh Việt Nam, Vào Tù và Thoát Tù Miễn Phí.
- Không còn beauty contest/chairman/Reading Railroad/Meadowlands hoặc `$`/`$M`.
- Numeric balance giữ tương đương deck cũ trừ thay đổi rule được test rõ; movement
  card tham chiếu canonical destination.
- Effect schema hỗ trợ bank/player payment, absolute/relative movement, jail và
  jail-free card identity/source deck.

## Deck lifecycle

- New game shuffle mỗi deck server-side, giữ order trong private `DeckState` của room aggregate (RAM).
- Draw top; normal card resolve rồi xuống cuối; jail-free card rời pile vào
  `heldJailFreeCardIds`; use/transfer/elimination trả card đúng source deck.
- Reconnect (khi host process còn sống) giữ exact order/holder; host process thoát thì deck mất cùng room. Public projection không lộ pile,
  discard hoặc card kế tiếp.

## Tests

- Exact 40 rows/names/types/groups/economy and no English board label.
- Canonical source derivation: không còn client metadata duplicate.
- Vietnamese card text/effects/destinations; deterministic injected shuffle tests.
- Draw rotation, jail-free remove/return/transfer, exact order trong snapshot (reconnect cùng process) và no-public-leak.
- `rules.ts` đúng giá trị/hàm và khớp code server thật (`rulesContract.test.ts`, kể cả mỗi ô thuế thu đúng
  `expenseAmount` về Ngân hàng); mọi số tiền trong hộp thoại hướng dẫn có trong dữ liệu dùng chung (`howToPlay/model.test.ts`).
