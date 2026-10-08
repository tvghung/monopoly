# v1.7.0 release candidate — evidence index and verdict

**Verdict: RC READY FOR USER MANUAL QA — NOT RELEASE READY.** Every engineering gate that can run on this machine and
on CI passed on the candidate. The release stays blocked until the owner records the manual matrix in
[USER_MANUAL_BOT_TEST_PLAN.md](./USER_MANUAL_BOT_TEST_PLAN.md) and the real-device and cross-network rows of
[ACCEPTANCE_MATRIX.md](./ACCEPTANCE_MATRIX.md), then explicitly approves the merge and the tag. No tag, release or merge to
`main` was made.

## Provenance

| Item | Value |
| --- | --- |
| Base | `origin/main` = tag `v1.6.1` = `77953b6547f9d0b79248cd9fafa0c08f8d064c06` (unchanged during the work; local `main` still `bffc0da`) |
| Branch | `feat/own-the-block-multiplayer-bots-vnext` (pushed; every commit is on this branch only) |
| Candidate code SHA | **`648d4ca7c33e6f41197da403bb4881dad148a426`** (18 commits over the base). Commits after it touch documentation only |
| Proposed version | 1.7.0 (Socket protocol 12, room snapshot schema 11, update policy minimum 1.7.0) |
| Tag / release | none (requires owner approval; `.github/release-notes/v1.7.0.md` is ready) |

## Gates

| Wave | Result | Evidence |
| --- | --- | --- |
| R0 audit and design | PASS | six documents in this folder; decision log D1–D21 in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) |
| R1 bot lobby | PASS (automated + desktop browser smoke) | matrix section A |
| R2 Balanced bot | PASS (engineering) · full games NOT RUN (USER MANUAL) | matrix sections B, C; no complete match was simulated or played |
| R3 Online | PASS (automated, live Quick Tunnel from this machine) · cross-network BLOCKED | matrix section D |
| R4 UI/UX | PASS (automated + emulated phone/tablet) · devices NOT RUN | matrix section E, [UI_UX_REGRESSION_MATRIX.md](./UI_UX_REGRESSION_MATRIX.md) |
| R5 candidate | engineering PASS · release NOT READY | below |

## Validation on `648d4ca` (this Windows x64 machine, 2026-10-09)

| Command | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint` | PASS |
| `pnpm test` | PASS: desktop 479, server 506, client 2271 Vitest tests; V1 contract 33, registry 5, music, card-art, landmark-art node suites |
| `pnpm build` | PASS (audio, card and landmark asset checks PASS) |
| `pnpm test:e2e:mobile` | PASS, 4 tests (Chromium + WebKit) |
| `pnpm desktop:make` | PASS: `OwnTheBlock-1.7.0-win32-x64-Setup.exe` 152,246,784 bytes, SHA-256 `cf08537c2b68e606c001b726752fcce9244da0901921cc0ab2ae18fa68312773` (local build, not the CI artifact) |
| `pnpm desktop:proof:host` | PASS: packaged helper, protocol 12, four clients, LAN discovery, fifth player room full, reconnect, newest connection, restart clears room and token |
| `proof:packaged:budget` | PASS (installer 145.2 MiB) |
| `pnpm validate:release` | PASS in unsigned-validation mode; signing BLOCKED, notarization NOT RUN |
| Packaged app driven by Playwright (`OwnTheBlock.exe`, temporary profile) | PASS: LAN room created from the UI, Add bot → `Bot 1` Ready with Bot badge, Remove bot, Add again; QR sharing card shown; no process left. Screenshot kept locally (session scratchpad `packaged-lobby-bot.png`, not committed: 520 KB) |
| `scripts/proveQuickTunnel.mjs` (on `c764135`, before the relink fix; the tunnel path did not change after it) | PASS: real Cloudflare edge, protocol 12, four public clients, room full, reconnect, edge refuses visitor `CF-Connecting-IP`. Same machine and network: **not** cross-network proof |

## CI on `648d4ca`

| Workflow | Run | Conclusion |
| --- | --- | --- |
| CI (Linux) | [37857669544](https://github.com/tvghung/monopoly/actions/runs/37857669544) | success |
| Desktop Build (Windows, macOS arm64 packaged proofs, DMG, mobile e2e) | [37857673483](https://github.com/tvghung/monopoly/actions/runs/37857673483) | success |
| Release Candidate (workflow_dispatch, unsigned: quality gates, Windows x64, macOS x64, macOS arm64; publish skipped because no tag) | [37857677473](https://github.com/tvghung/monopoly/actions/runs/37857677473) | success |

Earlier runs on `0cafbc2` (before the relink security fix) also passed: CI 37856568312, Desktop Build 37856571948, Release
Candidate 37856575792. They are not evidence for the candidate SHA.

## Security review (AC-R06)

- Bots have no socket, session or token; `add bot` / `remove bot` are host-only, lobby-only and schema-validated.
- The bot view is built from the public projection plus the bot's own private projection (test: no `drawPile`, no hidden card ids).
- Bot decision logs carry names, kinds, choices and public numbers only, and print only with `OTB_BOT_LOG=1`.
- `/_otb/room` returns a random process id; CORS reflects only the game's own origins.
- Registry: owner tokens hashed, public lookup only via CORS GET, `/join` page without secrets, and the tunnel service host itself refused.
- **Fixed during R5:** the relink flow could have sent a player's reconnect token to any pasted link that used the same room code. The token now moves only to an address that proves to be the same Host process (`hostInstanceId`).
- **Fixed during R3:** a code already held by another room (`CODE_TAKEN`) was silently ignored. Starting a room with such a code now fails, so the launcher draws a new one.
- Dependency set unchanged (no new packages); bundled cloudflared integrity pinning unchanged.

## Upgrade and rollback (AC-R09)

- No persistent data exists (RAM-only host), so there is nothing to migrate or lose.
- Protocol 12 refuses protocol 11 peers with `UPGRADE_REQUIRED`, and the update manifest minimum becomes 1.7.0, so 1.6.x apps update before multiplayer.
- **Rollback:** reinstall `v1.6.1` from GitHub Releases, or, once 1.7.0 is published, publish a 1.7.1 that reverts. A Squirrel downgrade is not automatic.
- LAN play needs no registry or tunnel, so a failure of the public service never blocks LAN rooms.

## Still open (owner actions)

1. Play the complete-game matrix with bots and without (USER_MANUAL_BOT_TEST_PLAN, sections B and C) and record results.
2. Test on real phones and tablets: iPhone/iPad Safari, Android Chrome, the lobby with bots, audio, touch targets.
3. Join from a different network by link, QR and code. Bare-code lookup also needs the registry deployed first (see [services/room-registry/README.md](../../services/room-registry/README.md)) and the repository variable `OWN_THE_BLOCK_REGISTRY_URL` set.
4. Optionally run a remote load test (20–50 users across several rooms); it is not run and no capacity is claimed.
5. Sign and notarize the builds (still blocked on certificates; the builds remain unsigned as in v1.x).
6. Approve: fast-forward `main` to the branch, then tag `v1.7.0` (the release workflow publishes from the tag).
