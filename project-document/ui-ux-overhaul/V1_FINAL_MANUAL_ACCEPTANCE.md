# Own the Block V1 Final Manual Acceptance

Status: **PENDING HUMAN ACCEPTANCE**

This is the current manual checklist for the code-bearing closeout. Every item
must be exercised by a person on the target browser/device/package and checked
only after direct observation. Automated tests, build output, packaged resource
checks, and CI do not complete these items.

## Audio

- [ ] Lobby has no BGM.
- [ ] Starting an in-progress game starts the approved rendered loop.
- [ ] The loop seam is unobtrusive.
- [ ] Snapshot and reconnect do not duplicate BGM.
- [ ] Hide/show behavior pauses and resumes cleanly.
- [ ] Finished state stops BGM.
- [ ] Replay lobby remains silent until the next game starts.
- [ ] SFX mix is acceptable over the loop, including dice, money, property,
  build, jail, card, and UI cues.

## Cards

- [ ] Landing on Chance immediately opens the revealed card.
- [ ] Landing on Khí Vận immediately opens the revealed card.
- [ ] No Draw action is visible or required.
- [ ] No flip or spin reveal occurs.
- [ ] Artwork, title, deck badge, and authoritative text are readable immediately.
- [ ] All 28 artworks are visually reviewed using the development-only gallery.
- [ ] The acting player's `Đóng` button is clearly visible and enabled.
- [ ] Nothing is applied before `Đóng`.
- [ ] The correct existing card effect occurs after `Đóng`.
- [ ] Reconnect preserves the same open card and message.
- [ ] Spectators can see the card but cannot close another player's card.
- [ ] Mobile portrait and landscape card layouts remain readable and usable.

## Multiplayer

- [ ] Two-player LAN smoke completes with host and client state synchronized.
- [ ] Three-player LAN smoke completes, if practical for this acceptance session.
- [ ] Host/client state remains synchronized through landing, card close, and
  continuation.
- [ ] Reconnect smoke preserves the pending revealed card without a duplicate
  draw, activity event, effect, or turn advance.
- [ ] Finish/replay smoke returns to a silent lobby and allows a new game.

## Desktop

- [ ] Packaged Windows app launches.
- [ ] Packaged LAN host flow works.
- [ ] Browser/mobile join flow works against the packaged host.

## Visual review gallery

Start the client development server from the repository root:

```text
$env:VITE_PHASE4_UAT = '1'
pnpm --filter @monopoly/client dev
```

Open:

```text
http://127.0.0.1:5173/?phase4-uat=1&card-gallery=1
```

The gallery is development-only, renders the same card panel and 28 local SVG
assets used by the game, and is not part of normal production navigation. It is
visual-review support, not a replacement for gameplay or package tests.

## Sign-off

- [ ] Human reviewer records the date and target device/package separately.
- [ ] Human reviewer records any audio, visual, accessibility, multiplayer, or
  desktop issue before approving.
- [ ] Human reviewer explicitly approves V1 after all applicable items pass.

No reviewer, reviewed timestamp, or approval is recorded in this repository by
the code-bearing closeout.
