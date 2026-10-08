# Own the Block vNext — release scope (R0–R5)

Master assignment: `OWN_THE_BLOCK_R0_R5_CODEX_MASTER_PROMPT.md` (supplied by the owner on 2026-10-09).
Companion specification `OWN_THE_BLOCK_MULTIPLAYER_BOTS_RELEASE_SPEC_2026-10-08.md` was **not found** in the
repository or in the supplied files; requirements are taken from the master prompt only, and nothing from the
absent document is invented. The master prompt's override applies: no seeded, scripted, simulated or automated
complete matches are run at any wave; complete games are user-manual acceptance.

R0–R5 are new release waves. The historical Phase 7.0/7.1/7.2 names keep their meaning.

## Provenance

| Item | Value |
| --- | --- |
| Previous release | v1.6.1, tag `v1.6.1` → `77953b6547f9d0b79248cd9fafa0c08f8d064c06`, [Release Candidate run 37812624554](https://github.com/tvghung/monopoly/actions/runs/37812624554) all jobs success, [GitHub release](https://github.com/tvghung/monopoly/releases/tag/v1.6.1) published 2026-10-08T17:03:48Z with 7 assets |
| `origin/main` at branch creation | `77953b6547f9d0b79248cd9fafa0c08f8d064c06` |
| local `main` at branch creation | `bffc0da5efba5d0b7bf2992e914dcf706228b4b1` (stale, ancestor of `origin/main`; left untouched) |
| Starting checkout | `overhaul/mobile-tablet-redesign` @ `77953b6`, untracked `mobile-overhaul-before-after.png` (preserved, never added) |
| Feature branch | `feat/own-the-block-multiplayer-bots-vnext`, created from `origin/main` @ `77953b6` before any edit |
| Proposed version | **v1.7.0** (protocol 11 → 12, snapshot 10 → 11). A tag is created only after explicit owner approval |

`main` (local and remote) is read-only for this program: no edit, commit, merge, rebase, tag or push on `main`.

## In scope

1. **R1 Bot lobby** — server-owned bot seats (stable UUID, `kind: BOT`), host-only `add bot` / `remove bot`
   before start, four global slots shared by humans and bots, auto-Ready, `Bot 1/2/3` names, automatic
   non-colliding mascot+colour, start matrix (2–4 total, ≥1 human, every human Ready), synchronized lobby.
2. **R2 Balanced bot AI** — one rules-based policy outside GameCore that reads only the public projection
   plus the bot's own private state, and submits commands through the same command functions humans use:
   roll, buy/decline, develop, card dismiss, jail (bail/card/roll/wait), payment shortfall liquidation,
   forced-sale and trade *responses*, 2v2 rescue/revive. Short presentation delays, cancellation,
   idempotency, bounded retries and lawful fallbacks. Also fixes the verified disconnected-player
   revealed-card deadlock (see decision D13).
3. **R3 Online** — keep LAN independent; keep the Quick Tunnel connectivity adapter; make the existing
   discovery registry usable (build-time configuration, browser lookup, provider-neutral endpoint checks,
   honest states); one Join field for `OTB-XXXXXX` or an invitation URL in the desktop launcher **and** the
   browser join form; fix the five verified Online gaps.
4. **R4 UI/UX** — four-slot lobby with bot affordances and the existing code/link/QR sharing; fix only the
   verified gaps from the audit (card/jail relocation destination highlight, audio mute + interruption
   recovery, missing tests); keep everything that already works.
5. **R5** — release candidate SHA on the feature branch, full non-match validation, CI evidence, packaging,
   release notes, rollback, manual checklist.

## Explicitly excluded

Dedicated cloud gameplay server, host migration, bot takeover of disconnected humans, hot join mid-match,
5+ players, a new spectator system (the existing read-only spectator admission stays as it is), ranked
matchmaking, bot personalities or difficulty tiers, a Fast Bots toggle, bot-initiated trades or forced-sale
proposals, mortgage, auctions, paid AI APIs/LLMs, soundtrack replacement, wholesale UI redesign, mobile
hosting, signed/notarized builds (still blocked on certificates), deploying the registry to the owner's
Cloudflare account (needs the owner's account, see BLOCKED below).

## Verified current state (code is authoritative)

| Area | State on `77953b6` |
| --- | --- |
| Bots | Absent (no bot/CPU/AI concept anywhere in `apps/**/src`, `packages/**/src`) |
| Room cap | 4 seats, `ROOM_FULL` at admission and activation; a started room admits read-only spectators |
| Trading | Present: private offers, 20 s TTL, accept/decline only, no counter-offer |
| Mortgage / auction | Absent (`005_remove_mortgage_open_market.sql`; a declined purchase simply ends the step) |
| Building | Only through the landing development decision on one's own street (2v2: Team Investment); `sell house` any time outside a shortfall |
| Taxes | Thuế Thu Nhập tile 4 = 200 units (200.000 VNĐ), Thuế Xa Xỉ tile 38 = 100 units (100.000 VNĐ), paid to the Bank through the payment queue |
| Jail | Bail 25 units, held card, doubles roll, wait; auto-release when the counter reaches 2 |
| Rematch | `play again` (host, FINISHED → LOBBY), keeps non-LEFT members, resets Ready |
| Persistence | RAM only; a helper exit destroys every room and token; no cross-restart recovery by design |
| Disconnect fallback | 60 s `RECONNECT_GRACE_MS` for the current player (auto-decline / skip / next turn); 120 s payment-shortfall auto-liquidation; **gap:** a revealed card of a disconnected player never times out |
| Online | Quick Tunnel adapter, invitation link + QR, Cloudflare Worker registry in `services/room-registry/` (not deployed, not configured in builds, not in `pnpm test`) |
| UI backlog | Mostly implemented and tested (audit in `UI_UX_REGRESSION_MATRIX.md`) |

## Requirement status summary

Tracked per criterion in [ACCEPTANCE_MATRIX.md](./ACCEPTANCE_MATRIX.md). Status words: `PASS`, `FAIL`,
`BLOCKED`, `NOT RUN`, `NOT RUN (USER MANUAL)`, `N/A — verified absent`, `PLANNED` (R0 only).

## BLOCKED / external dependencies (known at R0)

| Dependency | Needed for | Owner action |
| --- | --- | --- |
| Cloudflare account to deploy `services/room-registry` (Workers Free plan supports SQLite Durable Objects) and its URL baked into builds | NET-07 bare-code lookup across networks for shipped builds | Deploy with `wrangler deploy`, give the `workers.dev` URL; the code path and tests ship regardless |
| Two independent Internet networks + phones/tablets/macOS machine | NET-03, NET-06 scan, NET-10, AC-R04, AC-R07 | Owner-run checks from `USER_MANUAL_BOT_TEST_PLAN.md` / the device matrix |
| Complete matches | AC-R03, full-game parts of BOT-A/BOT-E | Owner-run (`NOT RUN (USER MANUAL)`) |
| Code-signing certificates | signing/notarization | unchanged from v1.x: unsigned builds |

Implementation does not wait on these: every blocked item has an implementation path and automated
coverage, but its real-world acceptance stays BLOCKED/NOT RUN until the owner supplies evidence.

## Documents

- [BOT_SYSTEM_SPEC.md](./BOT_SYSTEM_SPEC.md)
- [ONLINE_MULTIPLAYER_DESIGN.md](./ONLINE_MULTIPLAYER_DESIGN.md)
- [UI_UX_REGRESSION_MATRIX.md](./UI_UX_REGRESSION_MATRIX.md)
- [ACCEPTANCE_MATRIX.md](./ACCEPTANCE_MATRIX.md)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- `USER_MANUAL_BOT_TEST_PLAN.md` (written in R2)
