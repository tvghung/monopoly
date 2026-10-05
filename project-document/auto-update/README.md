# In-app auto update — design record

**Status: implemented on branch `overhaul/auto-update`, not released.** The branch is not merged and no tag was pushed; the
Windows silent-install path and the macOS path have not run on a real installed build (see section 4).

The product owner asked for an update path inside the desktop app: Own the Block checks for a newer release when it opens,
offers it ("Cập nhật" / "Để sau"), downloads it with visible progress, restarts into the new version, never interrupts a room
or a match, distinguishes a normal from a mandatory update (the latter blocks starting and joining multiplayer), never locks the
game because a check or a download failed, and shows the running version with "Kiểm tra cập nhật" in the settings. This folder is
the record of what was built for that request and why. The current behavior is documented as-is in
[Client/app-update.instruction.md](../monopoly-websockets/Client/app-update.instruction.md); the release contract carries the
publication rules ([V1_RELEASE_CONTRACT.md](../ui-ux-overhaul/V1_RELEASE_CONTRACT.md#in-app-updates)).

Language rule (unchanged): this record is English, every player-facing string is plain Vietnamese.

## 1. The request, line by line

| What the owner asked | Where it is | Status |
| --- | --- | --- |
| Check for a newer release when the game opens; say nothing when up to date | `UpdateService` checks 2 s after the window opens and every 6 h; `up-to-date` shows no surface | Done |
| Tell the player: "Có bản cập nhật mới / Own the Block v1.2.0 đã sẵn sàng. Bạn đang sử dụng v1.1.1." with "Cập nhật" and "Để sau" | `UpdatePrompt` (central `Modal`) | Done |
| "Để sau" lets the player in, unless the update is mandatory | `AppUpdateProvider.defer` (per version, this run; refused for a mandatory update) | Done |
| Update without opening a browser or finding an installer | The installer of the player's own platform is downloaded by the main process | Done |
| Say what is happening: "Đang tải bản cập nhật — 42%" | `UpdateProgress` (sentence + `progressbar`), quiet line on the menu, settings section | Done |
| "Bản cập nhật đã sẵn sàng" with "Khởi động lại và cập nhật" / "Để sau" | `UpdatePrompt` ready dialog | Done |
| Restart closes the game, finishes the update and reopens the new version | Windows: silent `Setup.exe`, then `Update.exe --processStartAndWait`. macOS: the verified disk image is opened (unsigned builds cannot replace themselves) | **Windows done in code and fakes, not run on a real install; macOS is assisted, not automatic** |
| Never close or restart in the middle of a game; wait for a safe moment and say "Bạn có thể cập nhật sau khi kết thúc ván chơi." | The restart exists only on the start screen with no LAN room of this machine open; in a game a toast says it waits and Cài đặt shows the reason | Done |
| Never lose a room or a match for an update | The main process refuses `install` while its Host is open; the renderer offers the restart only outside a lobby or game; the download may run during play | Done |
| Two kinds of update | `update-policy.json` → `minimumSupportedVersion` → `update-manifest.json` → `AppUpdateInfo.mandatory` | Done |
| Mandatory: "Cần cập nhật Own the Block …", no starting or joining multiplayer until updated; not for small fixes | Non-dismissible dialog; "Tạo phòng", "Tham gia phòng", "Máy chủ riêng" disabled; the policy defaults to "nobody is forced" | Done |
| A failed check or download never locks or blocks an optional update | Every failure is a state, not an exception; check failures show no dialog; "Không thể kiểm tra bản cập nhật lúc này. Bạn vẫn có thể tiếp tục chơi." in Cài đặt | Done |
| Settings: "Phiên bản hiện tại: 1.1.1", "Kiểm tra cập nhật", "Bạn đang sử dụng phiên bản mới nhất.", "Có phiên bản 1.2.0." | Section "Cập nhật" of `SettingsPanel` | Done |
| After updating, the new version is recognised and not offered again | The running version is `app.getVersion()` (the release version); the offer exists only for a version above it | Done in code and tests; not observed on a real install |
| Install once, update from the app | Windows yes; macOS needs a drag from the opened disk image | Partly (macOS) |

## 2. Decisions and the options that were not taken

**D1 — The feed is a small `update-manifest.json` published with every release.** The app reads
`releases/latest/download/update-manifest.json`. Rejected: the GitHub REST API (60 unauthenticated requests per hour per IP, and
players at a LAN party share one public IP), `update.electronjs.org` (a third party in the update path, and it expects Squirrel
feed files), a server of our own (none exists in a LAN-first game). The manifest carries no URL; the app builds the download URL
from the release version and the file name, so a wrong or altered manifest cannot send the app to another host.

**D2 — On Windows the update is the `Setup.exe` that is already published.** It runs silently while the game is open and
Squirrel installs it next to the running version; Squirrel's own `Update.exe --processStartAndWait` then starts the new version
once the app has exited. Rejected:
- Electron's `autoUpdater` (Squirrel.Windows). It needs `RELEASES` and the `*-full.nupkg` as release assets, and the nupkg is the
  same size as the installer (160.5 MiB against 160.6 MiB, measured on the local Squirrel output of the slimmed package), which
  would put the release assets back up by a third right after the slimming program (1.1.1) took them from 1,008 MiB to 514 MiB.
  It also downloads as soon as it checks (no "offer",
  no "Để sau" before the download) and has no progress event, so "Đang tải bản cập nhật — 42%" would be impossible.
- `Update.exe --update <local folder>` fed with a downloaded nupkg: the same extra asset.
- Delta packages (small updates): they need the previous nupkg at build time, so they cannot start before a release publishes
  full packages. A possible follow-up (section 6).

The installer is verified (size and SHA-256 while it streams to disk, again just before it runs) and its installer keeps the
running game untouched when it fails. A run of the installer from inside the app is the same path a player takes by hand today
("run the installer again"), automated.

**D3 — macOS is assisted.** Builds are unsigned, and Squirrel.Mac refuses to update an app without a code signature. A script that
replaces the `.app` after the app quits was rejected: it would delete and copy the player's application, and there was no Mac to
test it on. So the disk image is downloaded and verified in the app and then opened for the player to drag from. With an Apple
Developer ID the platform could move to Squirrel.Mac (a signed zip and the static JSON feed).

**D4 — Mandatory is an explicit release decision, and it fails open.** `apps/desktop/update-policy.json` holds
`minimumSupportedVersion`; the file starts at `1.0.0`, so nobody is forced. A protocol bump cannot slip by: the policy also
holds `reviewedForSocketProtocol`, and `pnpm validate:v1-contract` fails until it equals `SOCKET_PROTOCOL_VERSION`. Rejected:
deriving "mandatory" from a protocol change automatically (it would force every player on every bump even when the owner wants a
gradual rollout), and remembering the lock across runs (a LAN party without Internet could not play at all, while the server
already refuses an incompatible protocol with `UPGRADE_REQUIRED`). The lock in the launcher is UX; the server stays the authority.

**D5 — Safe moment.** The restart is offered only on the start screen, with no room of this machine open. The main process knows
its Host and refuses `install` itself; the renderer knows lobbies and games. The download may run during play (it is the player's
choice and moves no game state).

**D6 — Files and trust.** The installer waits in the operating system's temp folder (`userData` is the roaming profile on
Windows) and is reused after "Để sau" and a restart; a staged installer of the running version or older is removed at start.
Only `github.com` and `*.githubusercontent.com` over HTTPS are trusted, including after redirects. The renderer has five
payload-free calls and cannot name a URL, a path or a version.

**D7 — A latent bug was fixed on the way.** `--squirrel-firstrun`, which Squirrel passes after a non-silent install and which its
documentation asks the app to treat as a normal run, was handled like a hook and quit the app at once. It is now a normal run.

**D8 — Dev override.** `OWN_THE_BLOCK_UPDATE_MANIFEST_URL` (loopback only) lets a development run use a local feed; a packaged
app ignores it. Without it a development run reports `unsupported` and shows nothing.

**D9 — Screens.** Decisions use the central `Modal` (a project rule), progress and failures use one quiet line, and nothing opens
over a form or in a game. The choice that keeps the player where they are ("Để sau") has the focus. Which surface shows is a
pure function tested for every combination.

## 3. Risks and limits

- **Trust root.** The release has no Authenticode signature and no Apple signature, so the checksum protects against a corrupted
  or truncated file, not against a compromised GitHub account or workflow. A signed manifest or signed installers would add an
  independent root.
- **First update.** Versions up to 1.1.1 have no updater and never learn of one: players install the first updater release by hand.
  The first end-to-end test of the real feed is therefore an update between two updater releases (for example a quick patch
  after the first one).
- **Silent installer on a real machine.** Squirrel's source confirms what the design relies on (a silent install does not start
  the app; the running version's folder is skipped when old versions are cleaned), but this exact sequence has not run on an
  installed build here. Antivirus may stop an unsigned installer started by an unsigned app: the screen then says the installer
  could not be opened and offers a retry, and the game keeps running.
- **Disk.** 160 MiB of installer in the temp folder, plus a second copy of the application (about 400 MiB) next to the running one
  until the next update removes the older folder.
- **"Latest" semantics.** GitHub picks the latest release by creation time; the app compares versions, so an older release that
  becomes "latest" is shown as "up to date", never as an update.
- **CDN hostnames.** GitHub moved its release downloads between hosts before; a future host outside `*.githubusercontent.com` makes
  checks fail open (no updates, no lock) until the list is changed.
- **Bandwidth during play.** A download on the same Wi-Fi as a LAN game can add latency; it is not throttled.

## 4. What was verified, and what was not

Automated (see [testcase/http-runtime-and-deployment.md](../monopoly-websockets/testcase/http-runtime-and-deployment.md#in-app-update-desktop)):
version precedence, the manifest parser and its contract with the release tooling, the verified download against a real local
HTTP server, the service state machine with fakes, the installers with a spawn double, the IPC and preload surface, the client
provider, the choice of surface, the copy, the dialogs, the settings section, the launcher lock and the in-game toast. Lint,
typecheck and the full desktop and client suites pass.

Run once by hand on 2026-10-05, Windows 10, the **development** Electron shell driven by Playwright against a local fake feed
(not committed, not a CI gate): the offer, a download with a moving percentage, the staged file's SHA-256 equal to the feed's, "Để
sau", the settings section, the mandatory dialog (clean start, and with the installer already on disk; Escape does not close it,
"Thoát game" quits through the real quit path), a failing feed (no dialog, manual check reports it), and a corrupted download with
its retry. The development shell uses the open-installer mode; its final "open" was not pressed.

Not run: the silent `Setup.exe` over a running installed build and the restart into the new version (Windows), the macOS flow
(no Mac), a tag run that publishes `update-manifest.json`, and an update over a real GitHub release.

## 5. Releasing it

1. Choose the version (a new feature, so a minor bump such as `1.2.0`), bump every package and the contract
   (`Semantic version:`), and write `.github/release-notes/v<version>.md`. Say in the notes that players on 1.1.1 or older install
   this one by hand and update from the app after that.
2. Leave `apps/desktop/update-policy.json` as it is unless an older version cannot play with this one.
3. Merge, wait for CI and Desktop Build, then ask the owner and push the tag (the repository rule for releases).
4. Afterwards check that `https://github.com/tvghung/monopoly/releases/latest/download/update-manifest.json` serves the manifest,
   then cut a small follow-up release to exercise a real update from an installed build, and tick the rows of
   [V1_FINAL_MANUAL_ACCEPTANCE.md](../ui-ux-overhaul/V1_FINAL_MANUAL_ACCEPTANCE.md#in-app-update) that a person observed.

## 6. Open items

- The manual and packaged rows above; a macOS test needs a Mac.
- macOS in-place updates: Apple Developer ID, signed zip, Squirrel.Mac static feed.
- Delta packages for Windows once full packages are published.
- A signed manifest (for example Ed25519 with the public key in the app) if an independent trust root is wanted.
- The shared `Modal` loses Escape and its focus trap when a dialog is re-opened while it is still animating out (found while
  testing the update dialogs, not caused by them; a separate task was proposed).
