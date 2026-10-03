# Own the Block V1 Final Manual Acceptance

Status: **V1 RELEASED ON THE PRODUCT OWNER'S DECISION (2026-10-02); THE ROWS BELOW WERE NOT ITEMISED AND STAY UNCHECKED**

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

Since visual overhaul V2 (plan 04) the card is a printed-card modal on the shared `Modal` primitive; every check below
applies to that surface unchanged, and the gate G4 package also records them.

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

## LAN room lookup (V1.1)

Added with the V1.1 owner feedback items 5 and 6 (join by room code, host without a network choice). Nobody has observed
any of these rows yet; the automated evidence is loopback and fake-socket only and never claims a real broadcast, a real
firewall or a real second machine. Use two physical PCs (or a PC and a Mac) on the same Wi-Fi unless a row says otherwise.

- [ ] Two-PC discovery: PC A chooses "Tạo phòng trên máy này"; PC B chooses "Tham gia phòng LAN" and types only a name and the
  room code. The room is found within about 3 seconds and PC B reaches the lobby. No address or port is typed or shown on
  either PC.
- [ ] Host form and invitation card: the host form has a name field and one button (no network dropdown, no helper text); the
  lobby card shows a QR code and a copy button and no address; a phone that scans the QR joins through its browser.
- [ ] Wrong code: a code that no Host holds shows "Không tìm thấy phòng …" within about 3 seconds, offers "Dán liên kết mời" and
  launches nothing.
- [ ] Windows firewall prompt: Windows Defender Firewall asks about Own the Block at most once per PC (Host start; a guest's
  first search may also ask); after Allow access the lookup works; after Cancel the guest sees the failure line and can
  still join with the invitation link.
- [ ] Guest Wi-Fi / client isolation: on a network that blocks broadcast between devices, the guest sees the failure line and
  the "Dán liên kết mời" field, and pasting the Host's copied link enters the room.
- [ ] macOS Local Network permission (macOS 15 or later): the first search asks for Local Network access; after "Allow" the
  lookup works; after "Don't Allow" the guest sees "Không thể tìm phòng tự động. Hãy dán liên kết mời." and the pasted link
  works; a Mac Host that allowed it can be found by a Windows guest.
- [ ] Network choice: with Wi-Fi and Ethernet both connected on the Host, the invitation uses the network that carries the
  internet connection; Docker, VMware, Hyper-V, VPN or Tailscale adapters never become the shared network; with two networks
  of the same kind the lobby card offers "Mạng chia sẻ".

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

The gallery is development-only, renders the same card face (artwork, title, message) and 28 local SVG
assets used by the game, and is not part of normal production navigation. It is
visual-review support, not a replacement for gameplay or package tests.

## Sign-off

- [ ] Human reviewer records the date and target device/package separately.
- [ ] Human reviewer records any audio, visual, accessibility, multiplayer, or
  desktop issue before approving.
- [ ] Human reviewer explicitly approves V1 after all applicable items pass.

No reviewer, reviewed timestamp, or approval is recorded in this repository by
the code-bearing closeout.

## Release decision (2026-10-02)

The product owner decided in chat to release V1 ("thôi hãy publish v1 luôn đi, tôi chốt sổ r release v1 nhé"), after the
agent ran the packaged Windows app (built from the merged `main`) and the development demo pages for them to try. The
agent wrote this section on that instruction.

The owner did not itemise the checklist above, so none of its rows is ticked: a tick here means a person observed the
item, and nobody recorded that. The three sign-off rows stay open for the same reason. V1 was released with these rows
accepted as open by the owner; the decision, the other open gates and the release record are in the
[V1 release contract](V1_RELEASE_CONTRACT.md#v1-release-decision). Tick a row only after a person has observed it.
