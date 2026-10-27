# Phase 09B — Card art asset inventory

CURRENT DEVELOPMENT — 2026-10-27 (Asia/Bangkok). All 30 names and rarities below were read from the actual immutable registry. Every asset is original local vector artwork. Each SVG and PNG is 640×400; aspect ratio 8:5.

Production root: `apps/client/public/art/powerups/`. Map: `apps/client/src/game/ui/powerUps/powerUpArtManifest.ts`. Editable source: `scripts/art/powerUpIllustrations.mjs`. Export provenance/hashes: `scripts/art/powerUpExportManifest.json`. No UI name, rarity label or gameplay description is baked into illustrations.

## Front mappings — 30/30

| ID | Approved name | Rarity | SVG | PNG | Original visual story |
| --- | --- | --- | --- | --- | --- |
| A01 | Móc Túi | COMMON | `fronts/A01.svg` | `fronts/A01.png` | A sly hand lifts coins from an open wallet |
| A02 | Tăng Phí Đột Xuất | COMMON | `fronts/A02.svg` | `fronts/A02.png` | A rent sign suddenly rises above a town house |
| A03 | Hợp Đồng Bất Lợi | COMMON | `fronts/A03.svg` | `fronts/A03.png` | An unfavorable deed receives a red surcharge stamp |
| A04 | Tung Tin Đồn | COMMON | `fronts/A04.svg` | `fronts/A04.png` | Whispered rumors circle a property as rent falls |
| A05 | Phong Tỏa Xây Dựng | RARE | `fronts/A05.svg` | `fronts/A05.png` | A striped barrier halts a house under construction |
| A06 | Trộm Thẻ | RARE | `fronts/A06.svg` | `fronts/A06.png` | A gloved trickster snatches a card from a fanned hand |
| A07 | Chiếm Đoạt Doanh Thu | EPIC | `fronts/A07.svg` | `fronts/A07.png` | A branching coin stream diverts part of the rent |
| A08 | Khủng Hoảng Thị Trường | LEGENDARY | `fronts/A08.svg` | `fronts/A08.png` | A market shock sends the city rental indicators tumbling |
| A09 | Thanh Tra Bất Ngờ | COMMON | `fronts/A09.svg` | `fronts/A09.png` | A diligent inspector checks a row of developed properties |
| A10 | Gánh Nặng Tiền Thuê | RARE | `fronts/A10.svg` | `fronts/A10.png` | A weighty stack of rent bills presses onto a tenant token |
| D01 | Bảo Hiểm Tiền Thuê | COMMON | `fronts/D01.svg` | `fronts/D01.png` | An umbrella shelters a rent bill from falling charges |
| D02 | Ví Chống Trộm | COMMON | `fronts/D02.svg` | `fronts/D02.png` | A sturdy lock seals a wallet against a reaching hand |
| D03 | Phá Mưu | COMMON | `fronts/D03.svg` | `fronts/D03.png` | A magnifying glass exposes a scheming trap before it closes |
| D04 | Lá Chắn Bất Động Sản | COMMON | `fronts/D04.svg` | `fronts/D04.png` | A two-charge shield encloses a protected property |
| D05 | Phản Đòn | RARE | `fronts/D05.svg` | `fronts/D05.png` | An incoming attack rebounds from a polished shield |
| D06 | Hủy Phép | RARE | `fronts/D06.svg` | `fronts/D06.png` | A decisive cancellation seal dissolves an incoming attack |
| D07 | Quỹ Cứu Trợ | EPIC | `fronts/D07.svg` | `fronts/D07.png` | An emergency reserve helps balance an overdue obligation |
| D08 | Bất Khả Xâm Phạm | LEGENDARY | `fronts/D08.svg` | `fronts/D08.png` | A golden canopy protects a tenant while the bank settles rent |
| D09 | Khóa Kho Thẻ | COMMON | `fronts/D09.svg` | `fronts/D09.png` | A card vault locks out a reaching thief |
| D10 | Giải Phong Tỏa | RARE | `fronts/D10.svg` | `fronts/D10.png` | An open padlock releases a blocked property |
| U01 | Xúc Xắc May Mắn | COMMON | `fronts/U01.svg` | `fronts/U01.png` | A fresh pair of dice spins into a new result |
| U02 | Tăng Tốc | COMMON | `fronts/U02.svg` | `fronts/U02.png` | A game token races two extra board spaces |
| U03 | Phiếu Giảm Giá Đất | COMMON | `fronts/U03.svg` | `fronts/U03.png` | A discounted deed pairs a property with a purchase coupon |
| U04 | Hiến Tế Nâng Cấp | RARE | `fronts/U04.svg` | `fronts/U04.png` | Two ingredient cards and the activator become a higher-tier card |
| U05 | Định Hướng | RARE | `fronts/U05.svg` | `fronts/U05.png` | A compass plots alternate routes around the board |
| U06 | Trao Đổi Vận May | COMMON | `fronts/U06.svg` | `fronts/U06.png` | Two players willingly exchange mystery cards |
| U07 | Đầu Tư Từ Xa | EPIC | `fronts/U07.svg` | `fronts/U07.png` | A stationary investor buys a distant property across a map |
| U08 | Dịch Chuyển Hoàng Gia | LEGENDARY | `fronts/U08.svg` | `fronts/U08.png` | A crowned token teleports directly to a prestigious estate |
| U09 | Phiếu Ưu Đãi Xây Dựng | COMMON | `fronts/U09.svg` | `fronts/U09.png` | A construction coupon rests on a blueprint and building tools |
| U10 | Tái Cấu Trúc Kho Thẻ | RARE | `fronts/U10.svg` | `fronts/U10.png` | A card changes category while its three rarity marks stay matched |

## Category backs — exactly 3/3

| Category | SVG | PNG | Distinguishing composition |
| --- | --- | --- | --- |
| ATTACK | `backs/attack.svg` | `backs/attack.png` | Crimson field, coral lightning/impact, angular border |
| DEFENSE | `backs/defense.svg` | `backs/defense.png` | Navy field, blue property shield, protective rings |
| UTILITY | `backs/utility.svg` | `backs/utility.png` | Violet field, dice and two tactical route arrows |

Backs have no individual ID, name, effect or rarity. Their outer geometry belongs to one family; color fields and central silhouettes differ.

## Rarity frames — 4/4

| Rarity | Manifest token | Treatment |
| --- | --- | --- |
| COMMON | balanced | Quiet single frame, round rarity mark |
| RARE | silver | Stronger outline and highlighted top/bottom rails, diamond mark |
| EPIC | ornament | Violet inset line, restrained glow, star mark |
| LEGENDARY | gilded | Double gold outline, gold inset/corner ornaments, crown mark, queued discovery cue |

Frames are live CSS/UI layers in `apps/client/src/game/ui/powerUps/PowerUps.css`; no extra frame bitmaps or rarity-specific backs are necessary. Rarity labels remain real localized text.

## Verified export footprint

33 SVGs: 95,108 bytes. 33 PNGs: 1,376,261 bytes. Total: 1,471,369 bytes (1.403 MiB). PNG is lossless RGBA; rounded-corner transparency is retained. No remote dependencies.

The source/build/packaged validator checks explicit mappings, official registry coverage, XML allowlist, PNG chunk CRC/decode, dimensions, orphan/missing files and manifest/source/build parity. `pnpm art:powerups:verify` independently rerenders and compares all 33 PNG pixel buffers to their SVG compositions.

Contact sheets and the integrated production-frame comparison are test artifacts under `test-results/powerup-09bc/`, separate from packaged assets. See [implementation](./09B_ARTWORK_IMPLEMENTATION_REPORT.md) and [visual QA](./09C_VISUAL_QA_REPORT.md) for references, corrections, commands/results and native limitations.
