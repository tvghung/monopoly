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

- [ ] Two-PC discovery: PC A chooses "Tạo phòng"; PC B chooses "Tham gia phòng" and types only a name and the
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

## Main menu and way back (V1.1)

Added with the V1.1 owner feedback items 4 and 3 (the start screen as a main menu, a way back from the join screen). Nobody has
observed any of these rows yet. Use a packaged build (`pnpm desktop:package` then `pnpm desktop:run:packaged`) unless a row says
otherwise.

- [ ] Look of the menu: at 1280×720, 1920×1080 and 2560×1440 the start screen shows the buttons "Tạo phòng", "Tham gia phòng",
  "Cài đặt" and "Thoát" in a column toward the left of the window over a picture whose artwork (landmarks and the eight
  mascots) is on the right; there is no sentence under any button; nothing overlaps the buttons; the text is easy to read over
  the background. The "Hướng dẫn chơi" button is visible in the top right corner.
- [ ] Look at 812×375 landscape (a small window or the web preview): the menu, the "Tạo phòng" form and the "Tham gia phòng" form with
  a failed search (the extra "Dán liên kết mời" field) all fit without scrolling and nothing overlaps; the picture gives way when
  a form needs the room.
- [ ] Keyboard and focus: Tab moves through the buttons from top to bottom with a clear focus ring on each, then reaches
  "Hướng dẫn chơi"; Enter opens the focused button; "Quay lại" from a form puts the focus back on the button that opened it.
- [ ] Reduced motion: with "Giảm chuyển động" turned on in "Cài đặt" (or in the operating system) the postcards, the buttons and the
  mascots do not move when the start screen opens.
- [ ] "Cài đặt" on the start screen: it opens the settings dialog; change the volume, "Chất lượng đồ họa" and "Toàn màn hình",
  close the app completely and open it again: the start screen and, after joining a room, the game both show the same values.
  No sound plays on the start screen.
- [ ] "Thoát" with no room: the app closes at once (no question). "Thoát" while a Host runs ("Vào lại phòng đang mở" is shown): the
  question "Đóng phòng và thoát game?" appears; "Ở lại" keeps the app open; "Đóng phòng và thoát" closes the app and no
  Own the Block helper or PostgreSQL process is left running (check the task manager).
- [ ] Way back from a failed join: on PC B choose "Tham gia phòng", cause a failed search so "Dán liên kết mời" appears, and paste
  the Host's invitation link with the last character of its room code changed. The app reaches the Host, the Host does not
  know that code, and the join form appears with the name and the room code already filled in and an error line. "Quay lại"
  returns to the start screen with the choices. Repeat after switching to "Phòng chung" and while the button still says
  "Đang vào phòng…". No name or room code had to be typed again on the join form.
- [ ] Way back from a failure screen: close the Host's game while PC B is in its lobby; PC B shows the failure screen and
  "Về trang chủ" returns to the start screen; the Host can be joined again afterwards with the same room code.

## Debt window timing (V1.1)

- [ ] A player with little cash rolls onto an opponent's property or a tax tile: the mascot hops tile by tile, the coins and the
  plus/minus figures play out, the cash shows 0, and only then does "Cần thanh toán" open. The other players' status strip
  appears at the same moment, and the countdown still shows about the full time.
- [ ] After reconnecting while a debt is open, the debt window shows at once, without waiting for any animation.

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

## In-app update

Added with the in-app updater. No person has observed these rows. The automated evidence is unit and client tests, one run of
the real Electron shell against a local fake feed, and (agent-run, scratch scripts, not a CI gate) one real in-place update and
one refused update of a differently named test copy of the app installed by its own `Setup.exe` on Windows 10; it never claims
a real release or a Mac. Use a build that contains the updater, installed by `Setup.exe` (Windows) or from the disk image
(macOS), and a newer test release.

- [ ] Windows: on the start screen an update is offered ("Có bản cập nhật mới", with "Cập nhật" and "Để sau"); the download shows
  a moving percentage; it ends with "Bản cập nhật đã sẵn sàng"; "Khởi động lại và cập nhật" closes the game and the new
  version opens by itself; Cài đặt shows the new version, and the same release is not offered again.
- [ ] Windows: while a LAN room of this machine is open the restart is not offered and the screen says to close the room
  first ("Đóng phòng" stays reachable); once it is closed the restart is offered.
- [ ] Windows: in a lobby and in a match no dialog interrupts; a toast says the update waits; Cài đặt shows the restart
  disabled with the reason; nothing restarts the game or loses the room.
- [ ] Windows: cut the network in the middle of a download: the screen says it failed and the game stays playable; "Thử lại"
  finishes the download.
- [ ] Windows: a mandatory update (the policy raised on a test release): "Cần cập nhật Own the Block" appears, "Tạo phòng",
  "Tham gia phòng" and "Máy chủ riêng" stay disabled until the update is installed, and "Thoát game" quits.
- [ ] Windows: with no Internet at start there is no dialog and nothing is locked; Cài đặt → "Kiểm tra cập nhật" says the
  check is not possible and that the game stays playable.
- [ ] Windows: after the update the Start menu and desktop shortcuts open the new version, the old version is not left running,
  and the uninstall entry removes it.
- [ ] Windows: `Update.exe --update` (started by the app, not opened from a browser download) is not stopped by antivirus or
  SmartScreen on a clean machine; if it is, the screen says the update could not be installed, "Thử lại" is offered, the game
  stays usable and the shortcut still opens the old version.
- [ ] macOS (both Apple silicon and Intel): the disk image downloads in the app and opens; dragging the app into
  Applications replaces the old version; the new version runs and does not offer itself again.

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
[V1 release contract](V1_RELEASE_CONTRACT.md#v100-release-decision). Tick a row only after a person has observed it.
