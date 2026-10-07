# Client language system (Vietnamese / English)

## Scope and authority

- The client supports Vietnamese (`vi`) and English (`en`); Vietnamese is the default.
- Language is a renderer preference stored with ordinary client settings. It never enters
  room state, socket payloads, ACKs, snapshots, database records, or gameplay rules.
- Shared board/card data, player names, team names, and user-authored chat stay in their
  existing authoritative/canonical form. Display copy is localized in the client.
- “Own the Block” remains the product brand in both locales. VNĐ formatting and all game
  amounts remain unchanged.

## Implementation

| Concern | Source |
| --- | --- |
| Typed Vietnamese/English message catalogs and parity | `apps/client/src/i18n/catalog.ts` |
| `Language`, `translate`, interpolation and React context | `apps/client/src/i18n/I18n.tsx` |
| Root provider lifecycle and document metadata | `apps/client/src/index.tsx`, `i18n/LanguageDocumentSync.tsx` |
| Settings value/default/migration | `settings/types.ts`, `settings/defaults.ts`, `settings/storage.ts`, `settings/SettingsProvider.tsx` |
| Main-menu one-click switch and Settings segmented control | `components/DesktopMultiplayerLauncher.tsx`, `settings/SettingsPanel.tsx` |
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

- A menu language button toggles the same preference exposed in Settings. Both update
  immediately without reloading; open dialogs and error messages render from current locale.
- `document.documentElement.lang`, document title and description follow the preference.
- Special board spaces use short localized labels on the 3D board and full localized names
  in accessibility/detail surfaces. Vietnamese city/landmark names remain proper names in
  both locales; tile indexes and display labels never alter canonical board data.
- Structured activity events and card copy are localized from their semantic IDs. Existing
  game amounts still use the shared VNĐ formatter. Player/team names and chat are shown
  exactly as supplied. Legacy freeform `boardState.logs` strings are compatibility content
  and are not rewritten or translated.
- Technical event/package names, developer-only UAT and art-gallery copy are not player UI.

## Verification

Executable coverage is in `settings.test.ts`, `SettingsPanel.test.tsx`,
`DesktopMultiplayerLauncher.update.test.tsx`, `i18n/LanguageDocumentSync.test.tsx`,
`game/ui/formatters.test.ts`, `game/ui/hud/activityText.test.ts`,
`game/ui/events/cardVisuals.test.ts` and `howToPlay/model.test.ts`. The wider client
state-sync/accessibility checklist tracks the remaining manual viewport review.
