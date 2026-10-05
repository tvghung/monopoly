# In-app auto update — design record

**Status: implemented on branch `overhaul/auto-update`; the Windows path was run end to end on a real Squirrel install (section
4), the macOS path was not.** Release state is recorded in
[V1_RELEASE_CONTRACT.md](../ui-ux-overhaul/V1_RELEASE_CONTRACT.md#in-app-updates).

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
| Update without opening a browser or finding an installer | The files this installation needs (the Squirrel feed on Windows, the disk image on macOS) are downloaded by the main process | Done |
| Say what is happening: "Đang tải bản cập nhật — 42%" | `UpdateProgress` (sentence + `progressbar`), quiet line on the menu, settings section | Done |
| "Bản cập nhật đã sẵn sàng" with "Khởi động lại và cập nhật" / "Để sau" | `UpdatePrompt` ready dialog | Done |
| Restart closes the game, finishes the update and reopens the new version | Windows: Squirrel's `Update.exe --update=<verified feed>` while the game runs (inside a rollback guard), then `Update.exe --processStartAndWait`. macOS: the verified disk image is opened (unsigned builds cannot replace themselves) | **Windows done and run on a real install; macOS is assisted, not automatic** |
| Never close or restart in the middle of a game; wait for a safe moment and say "Bạn có thể cập nhật sau khi kết thúc ván chơi." | The restart exists only on the start screen with no LAN room of this machine open; in a game a toast says it waits and Cài đặt shows the reason | Done |
| Never lose a room or a match for an update | The main process refuses `install` while its Host is open; the renderer offers the restart only outside a lobby or game; the download may run during play | Done |
| Two kinds of update | `update-policy.json` → `minimumSupportedVersion` → `update-manifest.json` → `AppUpdateInfo.mandatory` | Done |
| Mandatory: "Cần cập nhật Own the Block …", no starting or joining multiplayer until updated; not for small fixes | Non-dismissible dialog; "Tạo phòng", "Tham gia phòng", "Máy chủ riêng" disabled; the policy defaults to "nobody is forced" | Done |
| A failed check or download never locks or blocks an optional update | Every failure is a state, not an exception; check failures show no dialog; "Không thể kiểm tra bản cập nhật lúc này. Bạn vẫn có thể tiếp tục chơi." in Cài đặt | Done |
| Settings: "Phiên bản hiện tại: 1.1.1", "Kiểm tra cập nhật", "Bạn đang sử dụng phiên bản mới nhất.", "Có phiên bản 1.2.0." | Section "Cập nhật" of `SettingsPanel` | Done |
| After updating, the new version is recognised and not offered again | The running version is `app.getVersion()` (the release version); the offer exists only for a version above it | Done; observed on a real install |
| Install once, update from the app | Windows yes; macOS needs a drag from the opened disk image | Partly (macOS) |

## 2. Decisions and the options that were not taken

**D1 — The feed is a small `update-manifest.json` published with every release.** The app reads
`releases/latest/download/update-manifest.json`. Rejected: the GitHub REST API (60 unauthenticated requests per hour per IP, and
players at a LAN party share one public IP), `update.electronjs.org` (a third party in the update path, and it expects Squirrel
feed files), a server of our own (none exists in a LAN-first game). The manifest carries no URL; the app builds the download URL
from the release version and the file name, so a wrong or altered manifest cannot send the app to another host.

**D2 — On Windows the update is Squirrel's own in-place update, fed by a Squirrel feed that every release now publishes.** The
release carries `RELEASES` and `own_the_block-<version>-full.nupkg` next to the `Setup.exe`, and the manifest lists both with
their SHA-256 (a `squirrel` block on the Windows asset). The app downloads those two files (one progress bar over both) and
runs `Update.exe --update=<their folder>` while the game is open: Squirrel unpacks the new version into its own
`app-<version>` folder next to the running one, moves the shortcuts and the uninstall entry, and Squirrel's own
`Update.exe --processStartAndWait` starts the new version once the app has exited.

Measured on a real Squirrel install on 2026-10-05 (a differently named test package, see section 4): the update takes about
12 s for the 160.5 MiB package, the old game keeps answering the whole time, a second `app-<version>` folder of 385 MiB appears
and the new version is running 19.7 s after the click.

Rejected, in the order it was learned:
- **The downloaded `Setup.exe`, run silently over the running app.** This was the first design, because it needs no extra
  release asset. A real install showed it cannot work as an update: `Setup.exe` deletes the whole install folder first
  (Squirrel's log says "burning it to the ground"), including the version that is running, so the game was killed about 6 s
  after the click, in the middle of its own update, and nothing started it again. `Setup.exe --silent` does block until it
  is done, and it does not start the app, but that does not matter once the running version is gone. The earlier reading of
  Squirrel's source (the running version's folder is skipped when old versions are cleaned) is true of `Update.exe --update`
  (its log says "exclude current version folder") and not of the Setup path, which is why this had to be run on a real
  machine before anything was released.
- Electron's `autoUpdater` (Squirrel.Windows). It downloads as soon as it checks (no "offer", no "Để sau" before the
  download) and has no progress event, so "Đang tải bản cập nhật — 42%" would be impossible. It also needs the same two
  release assets. The app uses the same binary (`Update.exe`) with its own download and verification instead.
- Delta packages (small updates): they need the previous nupkg at build time, so they cannot start before a release
  publishes full packages. `RELEASES` must therefore hold exactly one full-package line, and staging refuses anything else.
  A possible follow-up (section 6).

The price is one more installer-sized release asset (the `.nupkg`, 160.5 MiB; the release page goes from about 514 MiB to
about 675 MiB), which the product owner accepted on 2026-10-05 after the slimming program of 1.1.1 had taken it from 1,008 MiB.
Every file is verified (size and SHA-256 while it streams to disk, again just before it is used), and a file that is already
staged and verified is not downloaded again.

**D2a — Squirrel's update is not transactional, so the app puts the folder back when it fails.** Measured on a real install,
three ways a failed `Update.exe --update` leaves the game that cannot be opened (or updated) any more:
- A locked file or a refused package leaves an empty or partial `app-<new version>`. The stub that every shortcut starts picks
  the highest version folder, finds no executable in it and **starts nothing**. A retry of the same update repairs it, but a
  player who closes the game instead has nothing left to click.
- After Squirrel's own "falling back to full updates" retry had failed too, `packages\RELEASES` listed the version that never
  installed and the package of the running version was gone. The next update (of a lower version number, in that test) then
  believed the failed version was the installed one: it unpacked the good release, deleted that folder again as a "dead
  version", and failed.
- Killing `Update.exe` half way (6 s in) left `app-<new>` with 1,677 of its 1,678 files and the stub started it.

So the Windows installer runs the update inside a guard (`squirrelGuard.ts`): it records the `app-*` folders, the bytes of
`RELEASES` and the packages (hard links, so no 160 MiB copy) just before, and puts exactly that back when the update fails:
the new folder is removed, `RELEASES` returns byte for byte, the deleted package returns, the added package goes. An exit code
of 0 is not trusted either: `app-<new>\OwnTheBlock.exe` must exist (Squirrel can answer 0 when it believes the version is
installed already). A run that timed out is not undone while it may still be writing, and an install folder that cannot be
read means the update is not started at all. Rejected: repairing Squirrel's private state on the next start (the broken
install cannot start, so there would be no next start), and reimplementing the unpacking, the shortcuts and the registry
entries ourselves (that is Squirrel). What stays beyond the guard is a kill in the middle of the update (power loss, ending the
whole process tree): the next successful update repairs it, because Squirrel removes the partially applied folder of the
version it installs (measured).

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

**D6 — Files and trust.** The downloaded files wait in the operating system's temp folder (`userData` is the roaming profile on
Windows), under `<version>/<squirrel or installer>/`: the Squirrel folder holds exactly `RELEASES` and the package because
`Update.exe` is given the whole folder. They are reused after "Để sau" and a restart (a half-staged feed downloads only what is
missing); a staged update of the running version or older is removed at start.
Only `github.com` and `*.githubusercontent.com` over HTTPS are fetched. The URL that is requested is always checked; the URL a
response ended at is checked only where the network stack reports it. Node's fetch does, but Electron's `net.fetch` answers
`url: ""` and `redirected: false` even after GitHub's redirect to its object storage and rejects `redirect: "manual"` (measured
on 2026-10-05 on Electron 43, HEAD against a real release asset), so in the app the redirect target is not inspected. That
costs little: the installer must match the size and SHA-256 of a manifest that is itself read only from the GitHub URL, and a
redirect that GitHub did not issue would need a broken TLS connection, which also defeats a host check. A per-hop check would
need `net.request` or a session `webRequest` filter instead of `net.fetch`; not built. The renderer has five payload-free
calls and cannot name a URL, a path or a version.

**D7 — A latent bug was fixed on the way.** `--squirrel-firstrun`, which Squirrel passes after a non-silent install and which its
documentation asks the app to treat as a normal run, was handled like a hook and quit the app at once. It is now a normal run
(confirmed on a real install: the game started by the installer stays open).

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
- **An update killed half way.** The guard undoes every failure the app can see. A kill of `Update.exe` in the middle (power
  loss, ending the whole process tree) leaves a nearly complete newest folder (1,677 of 1,678 files after a kill at 6 s,
  which the shortcut started) or, if the failure came earlier, an empty one that stops the shortcut from starting anything.
  Retrying the same update repairs both (measured); a player who cannot open the game reinstalls with the `Setup.exe`. The
  window is about 12 s per update.
- **Antivirus and permissions.** An unsigned `Update.exe` started by an unsigned app may be stopped: the screen then says the
  update could not be installed and offers a retry, the guard puts the folder back, and the game keeps running.
- **Disk.** 160 MiB of feed in the temp folder, a second copy of the application next to the running one (385 MiB) and a
  copy of the package that Squirrel keeps in `packages`; the next update removes the older folder. The app asks for 768 MiB
  free beyond the download before it starts. When an update finishes, Squirrel's `cleanDeadVersions` keeps only the running
  and the new version folder (its log names both as excluded), so an install holds two versions; a second consecutive update
  was not run.
- **"Latest" semantics.** GitHub picks the latest release by creation time; the app compares versions, so an older release that
  becomes "latest" is shown as "up to date", never as an update.
- **CDN hostnames.** GitHub moved its release downloads between hosts before; a future host outside `*.githubusercontent.com` makes
  checks fail open (no updates, no lock) until the list is changed.
- **Bandwidth during play.** A download on the same Wi-Fi as a LAN game can add latency; it is not throttled.

## 4. What was verified, and what was not

Automated (see [testcase/http-runtime-and-deployment.md](../monopoly-websockets/testcase/http-runtime-and-deployment.md#in-app-update-desktop)):
version precedence, the manifest parser and its contract with the release tooling, the staging of the Squirrel feed, the
verified download against a real local HTTP server, the service state machine with fakes, the installers with a spawn double
over a temp install folder laid out like the real one, the Squirrel guard (rollback of every debris pattern above, byte for
byte, with and without hard links), the IPC and preload surface, the client provider, the choice of surface, the copy, the
dialogs, the settings section, the launcher lock and the in-game toast. Lint, typecheck and the full desktop and client suites
pass.

Run once by hand on 2026-10-05, Windows 10, the **development** Electron shell driven by Playwright against a local fake feed
(not committed, not a CI gate): the offer, a download with a moving percentage, the staged file's SHA-256 equal to the feed's, "Để
sau", the settings section, the mandatory dialog (clean start, and with the installer already on disk; Escape does not close it,
"Thoát game" quits through the real quit path), a failing feed (no dialog, manual check reports it), and a corrupted download with
its retry. The development shell uses the open-installer mode; its final "open" was not pressed.

Run once by hand on 2026-10-05 on the **packaged** Windows app (`pnpm desktop:package`, run from `out/`, not installed), against the
real GitHub feed: `app.isPackaged` is true, the development override (a URL that would have failed as "offline") is ignored, the
check reaches `releases/latest/download/update-manifest.json`, which does not exist yet because `v1.1.1` is the latest release (a
404 after GitHub's redirect), and the app stays fully usable: state `error` at stage `check`, no dialog, every menu button
enabled, and Cài đặt says "Không thể kiểm tra bản cập nhật lúc này. Bạn vẫn có thể tiếp tục chơi." The mode is `open-installer`
because that copy was not installed by Squirrel. The same run measured Electron's `net.fetch` against a real release asset (HEAD,
no download): it follows GitHub's redirect and answers 200, with `url: ""` (see D6). The size budget gate passes on that package
(`app.asar` 0.5 MiB).

Run on a **real Squirrel install** on 2026-10-05 (Windows 10; scratch scripts, not committed, not a CI gate). The app was built as
a differently named copy (`Own the Block UpdateTest`, Squirrel id `own_the_block_updatetest`, versions 1.90.0 and 1.90.1) whose
update feed is a local server, installed by its own `Setup.exe` under the owner's normal user token (an install made by the
agent's shell token gets an extra AppContainer ACE that crashes the GPU process, so the runs went through `explorer.exe`) and
driven by Playwright. The real `own_the_block` 1.1.1 install was never touched; the test install was uninstalled and its
folders, shortcuts and registry entry removed afterwards. The app's temp folder was named `own the block tést`, so the folder
handed to `Update.exe` had spaces and an accent. What it showed:

1. The silent `Setup.exe` over the running app kills it about 6 s later (D2), which is why that design was dropped.
2. `Update.exe --update` given a package it cannot read leaves the debris of D2a, and one such failure broke every later
   update. That is the guard's reason to exist.
3. With the guard, an update that Squirrel refuses (a "release" whose package is random bytes with a `RELEASES` line that
   describes them exactly, which the app downloads and verifies and `Update.exe` rejects): the quiet line says "Không cài đặt
   được bản cập nhật. Hãy thử lại. Bạn vẫn có thể tiếp tục chơi." with "Thử lại" and "Đóng", every menu button stays enabled,
   the old game keeps running and answering, the install folder is **byte-identical** to before (folder names, package sizes,
   the bytes of `RELEASES`), and the shortcut stub still starts the old version.
4. The real update from 1.90.0 to 1.90.1: the offer names v1.90.1 and the size of `RELEASES` plus the package; the progress is
   one monotonic bar over both files; the staged folder holds exactly those two files (a staged release left by the previous
   step is pruned); the app requested `update-manifest.json`, `RELEASES` and the package and **never the `Setup.exe`**; the
   install wait dialog showed; the new version folder appeared 3 s after the click while the old game still answered; the old
   game closed by itself 19.2 s after the click and `app-1.90.1` was running 19.7 s after it, started by Squirrel; the install
   folder held `app-1.90.0` and `app-1.90.1`, `packages` held only the new package and `RELEASES` (besides Squirrel's own
   `.betaId` and `SquirrelTemp`), no `update-guard` folder was left, the uninstall entry said 1.90.1, the Start menu and desktop
   shortcuts existed, and Squirrel's log ended with "Finished Squirrel Updater".
5. The installed 1.90.1: `phase: up-to-date` after its startup check (the same version is not offered again), no dialog, the
   staged files gone from TEMP, and Cài đặt says "Phiên bản hiện tại: 1.90.1 / Bạn đang sử dụng phiên bản mới nhất."

Failure experiments on the same install, running `Update.exe` directly (not through the app): killing it 6 s in; and a
partial `app-<new>` folder with a file held open. In both, a retry of the same update repaired the install and the shortcut then
started the new version; in the second the shortcut started nothing until then. The real `Squirrel-Update.log` of each run is
the source of the facts quoted in D2 and D2a.

Not run: the macOS flow (no Mac), a second consecutive Squirrel update (the removal of the oldest folder), a tag run that
publishes the feed, an update over a real GitHub release, antivirus interference, and an update killed by the system.

## 5. Releasing it

1. Choose the version (a new feature, so a minor bump such as `1.2.0`), bump every package and the contract
   (`Semantic version:`), and write `.github/release-notes/v<version>.md`. Say in the notes that players on 1.1.1 or older install
   this one by hand and update from the app after that.
2. Leave `apps/desktop/update-policy.json` as it is unless an older version cannot play with this one.
3. Merge, wait for CI and Desktop Build, then push the tag once the product owner has said yes (the repository rule for releases).
4. Afterwards check that `https://github.com/tvghung/monopoly/releases/latest/download/update-manifest.json` serves the manifest
   with the `squirrel` block and that the release page has `RELEASES` and the `.nupkg`, then cut a small follow-up release to
   exercise a real update from an installed build, and tick the rows of
   [V1_FINAL_MANUAL_ACCEPTANCE.md](../ui-ux-overhaul/V1_FINAL_MANUAL_ACCEPTANCE.md#in-app-update) that a person observed.

## 6. Open items

- The manual and packaged rows above; a macOS test needs a Mac.
- macOS in-place updates: Apple Developer ID, signed zip, Squirrel.Mac static feed.
- Delta packages for Windows once full packages are published.
- A signed manifest (for example Ed25519 with the public key in the app) if an independent trust root is wanted.
- The shared `Modal` loses Escape and its focus trap when a dialog is re-opened while it is still animating out (found while
  testing the update dialogs, not caused by them; a separate task was proposed).
