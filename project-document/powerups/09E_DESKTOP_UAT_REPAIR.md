# Desktop UAT repairs — OB-1, OB-2, OB-3

Status: CURRENT DEVELOPMENT on PR [#28](https://github.com/tvghung/monopoly/pull/28), branch `codex/phase-09d-powerups`.
Owner Power-up UAT remains BLOCKED at the original report; repair retest is pending. Keep this PR Draft until Owner UAT and explicit authorization to merge.

## Scope and findings

- OB-1: reproduced on baseline `5e46f728400e876cd30b2fa6edbf7479eb9a4105` using real unpackaged Electron. Host helper reached HOSTING, but Engine.IO rejected the Vite origin with HTTP 403. A fixed-origin loopback-only development opt-in repairs the connection; room creation still needs the process capability and ordinary join/resume ACKs. Packaged startup disables that opt-in and inherited settings cannot enable it.
- OB-2: clean developer startup compiled the helper but never prepared cloudflared. Both developer entry points now invoke the existing pinned-manifest preparation. Binary download/verification failure leaves LAN available and Online still fails closed. No digest, tunnel configuration, trust header or packaged download policy changed.
- OB-3: removed the configured-server button from desktop main menus. Kept internal configured-server flow for explicit design-lab use; web behavior is unchanged.

No application version, protocol or snapshot bump; no release, installer publication or merge.

## Verification

Native checks: [record](09E_DESKTOP_UAT_NATIVE.json). These are Dev checks, not Owner UAT.

- PASS: native dev LAN Host reaches mascot lobby with the correct Host name.
- PASS: reload/return to the same live Host.
- PASS: new LAN Host after stopping the old helper, with stale session still in the same profile.
- PASS: real Online Host reaches lobby, public route and room probe succeed.
- PASS: browser guest joins through actual public Quick Tunnel, on this same PC/network.
- PASS: menu after returning/reload does not expose configured-server entry.
- PASS: helper/tunnel stopped after verification.
- NOT RUN: physical second device on LAN/independent network, macOS, human-paced full Power-up UAT.

Repository gates: typecheck, lint, client production build, docs validation, Windows packaging and packaged Host proof PASS. Final full regression rerun and remote CI are in progress; see final Jira/PR update.

The packaged Host proof passed 15 checks, including reconnect identity and helper restart rejecting the former room/token. Native packaged LAN and Online creation also reached their mascot lobbies. These checks do not replace physical-device or Owner acceptance.

## Safe local retest

1. Keep existing local edits. In a clean checkout/worktree fetch `origin codex/phase-09d-powerups`, check out the reported repair commit, and verify `git rev-parse HEAD`. Do not reset or clean a working checkout to update it.
2. Node >=24 and pnpm 11.15.1; run `pnpm install --frozen-lockfile`. No database or migrations.
3. Close any app/Host using this checkout's helper before compile/package. Run `pnpm dev:desktop` from repo root. It prepares cloudflared, compiles helper/main/preload, starts Vite and standalone server, then Electron. Internet is needed for first verified cloudflared preparation and Online hosting. Alternatively use `pnpm dev:web` and `pnpm dev:desktop:shell` in separate terminals; do not run both startup layouts together.
4. Vite is `http://127.0.0.1:5173`; standalone server is port 8080. Desktop creates its own helper on an available port; use the invitation the lobby actually displays. The app window is the desktop entry point.
5. Retest OB-1: fresh LAN creation, old-session profile, return/rejoin while Host lives, Close room then create again; join from a second LAN device and select mascot/ready/start. A stopped helper must not restore its former match.
6. Retest OB-2: Online creation, public invitation from an independent network, repeated Close room/Create Online, LAN after an Online failure. Missing/corrupt binary must remain refused; do not modify the pinned manifest or disable verification.
7. Retest OB-3: every main menu, including after failure/return/close; Host and Join still work. Then resume the existing [Power-up UAT checklist](09D_MANUAL_UAT_CHECKLIST.md), not just these launcher cases.
8. Close the test room/app normally to stop helper/tunnel, then Ctrl+C the development terminals. No claim is made that an Owner server is running or that Owner UAT has passed.
