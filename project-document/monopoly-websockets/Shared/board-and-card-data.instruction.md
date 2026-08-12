# Canonical board Việt Nam, cards và deck state

## Source of truth

- `packages/shared/src/tileState.ts`: duy nhất 40 tile và `colorGroups`.
- `packages/shared/src/chanceCards.ts`, `chestCards.ts`: canonical Vietnamese cards
  có stable `GameCardId`, source deck và typed effects.
- `packages/shared/src/index.ts`: export surface cho server/client.

Client derive mặt trước, property detail, price/rent/build/mortgage text từ shared
data. Không duy trì `BoardInitState.ts` hoặc `backOfCards.ts` như bảng metadata thứ
hai. Presentation-only icon/layout có thể ở Client nhưng không lặp economy/name.

## Board 40 index

| Index | Type | Tên tiếng Việt | Economy/group |
| ---: | --- | --- | --- |
| 0 | start | Xuất Phát | giữ |
| 1 | normal | Cà Mau | brown, giữ |
| 2 | chest | Khí Vận | giữ |
| 3 | normal | Bạc Liêu | brown, giữ |
| 4 | expense | Thuế Thu Nhập | 200 |
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
| 38 | expense | Thuế Xa Xỉ | 75 |
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

- New game shuffle mỗi deck server-side, persist order trong private `DeckState`.
- Draw top; normal card resolve rồi xuống cuối; jail-free card rời pile vào
  `heldJailFreeCardIds`; use/transfer/elimination trả card đúng source deck.
- Reconnect/restart phục hồi exact order/holder. Public projection không lộ pile,
  discard hoặc card kế tiếp.

## Tests

- Exact 40 rows/names/types/groups/economy and no English board label.
- Canonical source derivation: không còn client metadata duplicate.
- Vietnamese card text/effects/destinations; deterministic injected shuffle tests.
- Draw rotation, jail-free remove/return/transfer và exact restart/no-public-leak.
