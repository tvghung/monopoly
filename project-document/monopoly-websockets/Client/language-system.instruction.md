# Client language system (Vietnamese / English)

## Scope and authority

- The client supports Vietnamese (`vi`) and English (`en`); Vietnamese is the default. The list of shipped languages is one
  constant, `SUPPORTED_LANGUAGES` in `apps/client/src/i18n/languages.ts` (see "Adding a language").
- Language is a renderer preference stored with ordinary client settings. It never enters
  room state, socket payloads, ACKs, snapshots, any server-side state (the host runtime is RAM-only), or gameplay rules.
- Shared board/card data, player names, team names, and user-authored chat stay in their
  existing authoritative/canonical form. Display copy is localized in the client.
- “Own the Block” remains the product brand in both locales. VNĐ formatting and all game
  amounts remain unchanged.

## Implementation

| Concern | Source |
| --- | --- |
| The supported-language list, `Language` type, default and stored-value check | `apps/client/src/i18n/languages.ts` |
| Typed Vietnamese/English message catalogs and parity | `apps/client/src/i18n/catalog.ts` |
| `translate` (per-language catalog lookup), interpolation and React context | `apps/client/src/i18n/I18n.tsx` |
| Root provider lifecycle and document metadata | `apps/client/src/index.tsx`, `i18n/LanguageDocumentSync.tsx` |
| Settings value/default/migration | `settings/types.ts`, `settings/defaults.ts`, `settings/storage.ts`, `settings/SettingsProvider.tsx` |
| Main-menu language selector and Settings segmented control | `components/LanguageSelector.tsx` (+ `components/style/LanguageSelector.css`), `components/DesktopMultiplayerLauncher.tsx`, `settings/SettingsPanel.tsx` |
| Landmark (hotel) names in both languages | `game/scene/buildings/landmarks/plan.ts` (`name`, `nameEn`), `game/ui/property/landmarkVisuals.ts` (`getLandmarkName`, `getLandmarkHotelLabel`) |
| Board, structured activity, card presentation and player accessibility copy | `game/ui/formatters.ts`, `game/ui/hud/activityText.ts`, `i18n/cardCopy.ts`, `game/characters/` |
| How To Play model and card lists | `howToPlay/model.ts`, `howToPlay/model.en.ts`, `howToPlay/cards.ts` |

`vi` is the safe default for pure formatter/model APIs. React surfaces read the shared
`I18nProvider`, whose language comes from `SettingsProvider`. The catalogs are typed from
the Vietnamese key set and the English catalog must satisfy the same key record, so a
missing translation fails TypeScript validation. Interpolation values are data only; no
HTML is injected.

## Settings migration

- Current settings use `own-the-block.settings.v2` and `version: 2`.
- The old `own-the-block.settings.v1` key is read only when V2 is absent, normalized, then
  copied forward to V2. Existing audio, animation, reduced-motion, fullscreen and graphics
  preferences are preserved.
- A missing/invalid language becomes `vi`. Reset restores all existing defaults and
  Vietnamese. A valid saved `en` preference survives reload.

## Language-specific presentation rules

- The main menu has a language selector (`LanguageSelector`): a ghost button showing the globe icon, the current language
  in its own name ("Tiếng Việt" / "English") and a chevron, in the utility row next to "Cài đặt" and "Thoát". Pressing it only
  opens a small list titled "Chọn ngôn ngữ" / "Select Language" with one option for every entry of `SUPPORTED_LANGUAGES`; the
  current option has a check and `aria-selected`. **Opening the list changes nothing**: the language changes only when an
  option is chosen, and the list then closes and returns focus to the button. It also closes on Escape (the key is consumed, so it
  cannot close anything behind it), on a press outside and when Tab leaves it. Keyboard: an arrow key opens it on the current
  language, Up/Down/Home/End move, Enter or Space chooses; the options are real buttons (`role="option"`, 44 px) so touch and
  mouse behave the same. The list opens upward when the button is in the lower half of the window, otherwise downward.
- The selector and the Settings dialog write the same `settings.language` through `updateSettings`; the choice is persisted with the
  other settings (`own-the-block.settings.v2`) and read back at start. Both update immediately without reloading; open dialogs and
  error messages render from current locale. Option names are the language's own name (`language.vietnamese` / `language.english`),
  identical in both catalogs, so the list reads the same whichever language is active.
- Landmark names: every street has a hotel landmark (`LANDMARK_PLAN`, 22 entries). `name` is the Vietnamese name and stays the
  canonical one; `nameEn` is the English name. UI asks `getLandmarkName(visual, language)`; the deed card line ("Khách sạn · …" / "Hotel · …"),
  the landmark banner ("Khánh thành …!" / "Hotel opened: …!") and the tile button label (`getTileAccessibilityLabel`) all read it, so a language change
  updates them at once without touching tile IDs, slugs, art or any rule. General words are translated and Vietnamese proper nouns keep
  their diacritics:

  | Tile | Vietnamese | English |
  | --- | --- | --- |
  | 1 | Mũi Cà Mau | Cà Mau Cape |
  | 3 | Cánh đồng điện gió | Wind Farm |
  | 6 | Nhà dài Ê Đê | Ê Đê Longhouse |
  | 8 | Chợ nổi Cái Răng | Cái Răng Floating Market |
  | 9 | Nhà hát lớn Hải Phòng | Hải Phòng Opera House |
  | 11 | Ga Đà Lạt | Đà Lạt Railway Station |
  | 13 | Chùa Cầu | Chùa Cầu Temple |
  | 14 | Ngọ Môn | Ngọ Môn Gate |
  | 16 | Đồi cát và thuyền thúng | Sand Dunes and Basket Boats |
  | 18 | Ruộng bậc thang | Terraced Rice Fields |
  | 19 | Tháp Trầm Hương | Trầm Hương Tower |
  | 21 | Hải đăng Vũng Tàu | Vũng Tàu Lighthouse |
  | 23 | Tháp Đôi | Twin Towers |
  | 24 | Cầu Vàng | Golden Bridge |
  | 26 | Vịnh Hạ Long | Hạ Long Bay |
  | 27 | Chùa Trấn Quốc | Trấn Quốc Temple |
  | 29 | Bãi biển và tàu câu mực | Beach and Squid Fishing Boats |
  | 31 | Cầu Ánh Sao | Ánh Sao Bridge |
  | 32 | Biệt thự ven sông | Riverside Villa |
  | 34 | Trụ sở UBND TP.HCM | HCMC People's Committee Building |
  | 37 | Tháp Bitexco | Bitexco Tower |
  | 39 | Landmark 81 | Landmark 81 |

  "Chùa Cầu Temple" follows the product owner's example mapping; the building is a covered bridge, so a future wording pass may prefer
  "Chùa Cầu Japanese Bridge" — one `nameEn` string and its row in `landmarkVisuals.test.ts`. Street (district) tile names such as "Hội An"
  are not landmarks and are unchanged in both languages.
- `document.documentElement.lang`, document title and description follow the preference.
- Special board spaces use short localized labels on the 3D board and full localized names
  in accessibility/detail surfaces. Vietnamese city/landmark names remain proper names in
  both locales; tile indexes and display labels never alter canonical board data.
- Structured activity events and card copy are localized from their semantic IDs. Existing
  game amounts still use the shared VNĐ formatter. Player/team names and chat are shown
  exactly as supplied. Legacy freeform `boardState.logs` strings are compatibility content
  and are not rewritten or translated.
- Technical event/package names, developer-only UAT and art-gallery copy are not player UI.

## Adding a language

1. Add `{ code, labelKey }` to `SUPPORTED_LANGUAGES` (`i18n/languages.ts`). The selector, the Settings segmented control, the
   `Language` type and the stored-value check (`normalizeSettings` accepts only listed codes, so an unknown stored value falls
   back to the default) follow from it. `labelKey` names a message whose text is the language's own name.
2. Add a complete catalog to `catalog.ts` and register it in `CATALOGS` of `I18n.tsx` (a `Record<Language, …>`, so TypeScript
   fails until it exists).
3. Extend the data localized by field instead of by message key: `LANDMARK_PLAN` names (`getLandmarkName`), card copy, character names.
4. Code that still branches on `language === 'en'` (`grep "'en'"`) must learn the new code.

## Verification

Executable coverage is in `settings.test.ts`, `SettingsPanel.test.tsx`, `components/LanguageSelector.test.tsx` (opening does not change the
language, option list = `SUPPORTED_LANGUAGES`, choose/close/focus return, Escape, outside press, Tab, arrow keys, Settings and stored-value
sync), `game/ui/property/landmarkVisuals.test.ts` (all 22 VI/EN pairs), `components/legacy-board/tileAccessibility.test.ts`,
`DesktopMultiplayerLauncher.update.test.tsx`, `i18n/LanguageDocumentSync.test.tsx`,
`game/ui/formatters.test.ts`, `game/ui/hud/activityText.test.ts`,
`game/ui/events/cardVisuals.test.ts` and `howToPlay/model.test.ts`. The wider client
state-sync/accessibility checklist tracks the remaining manual viewport review.
