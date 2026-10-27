# Phase 09A — Power-up artwork integration readiness

CURRENT DEVELOPMENT — 2026-10-27 (Asia/Bangkok). Readiness inspection only; no artwork generated, edited, replaced, renamed or deleted.

## Current presentation and assets

Power-ups have **0/30 individual illustration mappings** and **no dedicated artwork files**. `apps/client/src/game/ui/powerUps/PowerUpCard.tsx` renders Lucide Swords (ATTACK), Shield (DEFENSE), or Sparkles (UTILITY), localized description text, server-projected name/rarity/activation, and a Check for selection. `PowerUps.css` supplies gradients, category colors, borders, reveal/entry motion and reduced-motion handling. These are the existing complete card presentation, rather than failed-image fallbacks. Hidden reward backs show only category/icon and the choose label; future art must preserve that secrecy. `PowerUpFeedback.tsx` separately renders transient feedback icons; it is not an illustration manifest.

The official identity data is in `apps/server/src/game/powerUps/catalog.ts`; `packages/shared/src/powerUps.ts` has strict definitions with definitionId, name, description, category, rarity, activation and effectKey, without artwork fields. Private reward projections whitelist these display fields. The client does not fetch the server catalog or resolve art URLs.

Related existing assets are separate: `apps/client/public/art/cards/chance/` and `apps/client/public/art/cards/chest/` contain 28 SVG illustrations for classic Chance/Chest IDs; `apps/client/public/art/landmarks/` has 22 landmark illustrations. None maps A01–A10/D01–D10/U01–U10. The 28-card validation/build success in previous reports does **not** mean 28 Power-up cards have illustrations. Full existing art inventory is preserved in external artwork-inventory.json.

## Official identity mapping

| ID | Registry name | Current image reference | Current presentation / missing art |
| --- | --- | --- | --- |
| A01 | Móc Túi | None | Swords + category CSS; individual art absent |
| A02 | Tăng Phí Đột Xuất | None | Swords + category CSS; individual art absent |
| A03 | Hợp Đồng Bất Lợi | None | Swords + category CSS; individual art absent |
| A04 | Tung Tin Đồn | None | Swords + category CSS; individual art absent |
| A05 | Phong Tỏa Xây Dựng | None | Swords + category CSS; individual art absent |
| A06 | Trộm Thẻ | None | Swords + category CSS; individual art absent |
| A07 | Chiếm Đoạt Doanh Thu | None | Swords + category CSS; individual art absent |
| A08 | Khủng Hoảng Thị Trường | None | Swords + category CSS; individual art absent |
| A09 | Thanh Tra Bất Ngờ | None | Swords + category CSS; individual art absent |
| A10 | Gánh Nặng Tiền Thuê | None | Swords + category CSS; individual art absent |
| D01 | Bảo Hiểm Tiền Thuê | None | Shield + category CSS; individual art absent |
| D02 | Ví Chống Trộm | None | Shield + category CSS; individual art absent |
| D03 | Phá Mưu | None | Shield + category CSS; individual art absent |
| D04 | Lá Chắn Bất Động Sản | None | Shield + category CSS; individual art absent |
| D05 | Phản Đòn | None | Shield + category CSS; individual art absent |
| D06 | Hủy Phép | None | Shield + category CSS; individual art absent |
| D07 | Quỹ Cứu Trợ | None | Shield + category CSS; individual art absent |
| D08 | Bất Khả Xâm Phạm | None | Shield + category CSS; individual art absent |
| D09 | Khóa Kho Thẻ | None | Shield + category CSS; individual art absent |
| D10 | Giải Phong Tỏa | None | Shield + category CSS; individual art absent |
| U01 | Xúc Xắc May Mắn | None | Sparkles + category CSS; individual art absent |
| U02 | Tăng Tốc | None | Sparkles + category CSS; individual art absent |
| U03 | Phiếu Giảm Giá Đất | None | Sparkles + category CSS; individual art absent |
| U04 | Hiến Tế Nâng Cấp | None | Sparkles + category CSS; individual art absent |
| U05 | Định Hướng | None | Sparkles + category CSS; individual art absent |
| U06 | Trao Đổi Vận May | None | Sparkles + category CSS; individual art absent |
| U07 | Đầu Tư Từ Xa | None | Sparkles + category CSS; individual art absent |
| U08 | Dịch Chuyển Hoàng Gia | None | Sparkles + category CSS; individual art absent |
| U09 | Phiếu Ưu Đãi Xây Dựng | None | Sparkles + category CSS; individual art absent |
| U10 | Tái Cấu Trúc Kho Thẻ | None | Sparkles + category CSS; individual art absent |

## Formats, resolution and layout

No Power-up image loader, supported-format allowlist, pixel resolution or image aspect-ratio contract exists today. The adjacent classic-card validator accepts SVG with viewBox `0 0 640 400` (8:5); that is a classic-card contract and does not constrain future Power-up art. A later design task must explicitly choose Power-up dimensions/format. Raster or alternative formats would need client integration and matching validation rather than assuming the classic validator supports them.

Existing layout: three equal columns with minmax(0,1fr), 14px gaps, card minimum height 250px, 20px/16px padding, text flex space. At <=650px gaps/padding/type/min-height shrink; at <=520px cards become one column with no minimum height; low-height screens use 190px cards. Reaction options are 220–260px columns (bounded by available width) with 200px minimum height; replacement cards use 220px. There is no fixed image container/ratio. New images must reserve bounded space without hiding labels, text, controls or focus rings. Validate 1440x900, 1280x720, 900x500 and mobile, long VI/EN descriptions, modal scroll/peek/focus, hidden backs and reduced motion.

## Minimal replacement workflow for the future task

1. Keep all 30 stable definition IDs and gameplay parameters unchanged. Author the approved assets in a client-owned directory, with filenames keyed by definitionId. A client-only map keyed by existing IDs can supply URLs; do not add presentation fields to strict shared/server definitions.
2. Because no map/loader exists, the first artwork iteration requires a small client renderer/map change and explicit fallback behavior. Later replacements at unchanged paths can be assets-only. Retain the current icon/category/text surface if an image is missing or fails. Do not expose identity-specific art on unrevealed candidates.
3. Establish format, ratio, size budget and accessibility semantics in that task. Add a dedicated 30-ID completeness/existence/dimensions/build-output validator. The existing validator currently checks only Chance/Chest and must not be reported as Power-up validation.
4. Check source and production/packaged asset URLs, app:// handling, fallback rendering, complete ID mapping, load failures, responsive bounds, keyboard and reduced motion. Artwork must never be used as gameplay identity or authority.

Client-only mappings/assets using existing definitionId require **no socket protocol or RAM snapshot change**. Adding art fields to strict DTOs would change contracts and require compatibility review; it is unnecessary for the suggested client-only approach. No speculative functionality was implemented here.

## Existing validation commands

- `pnpm validate:card-art` and `pnpm test:card-art`: classic 28 SVGs only.
- `pnpm validate:landmark-art` and `pnpm test:landmark-art`: board landmarks only.
- `pnpm build`: production client plus music/classic-card/landmark checks.
- `pnpm desktop:package` and `pnpm --filter @monopoly/desktop proof:packaged:cards`: packaged classic-card assets.
- `node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpAcceptance.check.mjs` and `scripts/powerUpStabilizationAcceptance.check.mjs` (same loader): functional Power-up UI acceptance, not individual artwork completeness.

There is no current dedicated Power-up artwork-validation command.
