# RAM hosting verification report — 2026-10-08

## v1.5.0 integration and evidence update (2026-10-08)

- Hardening commit `1f680ae76316610f4dafb2c16d29a9ac51a2d138` passed [CI #37743907131](https://github.com/tvghung/monopoly/actions/runs/37743907131) and [Desktop Build #37743907130](https://github.com/tvghung/monopoly/actions/runs/37743907130), including Windows x64 and macOS arm64 packaged proofs, DMG verification, and mobile browser emulation. The macOS x64 Release Candidate target has not yet run for this change.
- The project owner reports completing manual testing and authorizes v1.5.0 release preparation. Device/network test matrix, screenshots, and independent-network proof details were not supplied here and therefore are not asserted as independently verified.
- v1.5.0 retains Socket protocol 11, snapshot schema 10, and update-policy minimum version 1.4.0; release-candidate publication requires a `v1.5.0` tag on the version-aligned commit. This entry is a preparation record, not evidence that the tagged release succeeded. The release remains unsigned unless release infrastructure is explicitly changed.
- Accepted residual risks: Cloudflare Quick Tunnel has no uptime guarantee; previously reported Host recovery edge case and endpoint-string validation are not claimed fixed by the release-only version bump. Keep these documented for subsequent maintenance.

## Post-migration CI review

- Target `bffc0da5efba5d0b7bf2992e914dcf706228b4b1`: [CI run 37731895953](https://github.com/tvghung/monopoly/actions/runs/37731895953) succeeded. [Desktop Build run 37731896026](https://github.com/tvghung/monopoly/actions/runs/37731896026) passed Windows and failed macOS at `prepareCloudflared.mjs` with `Official cloudflared asset checksum mismatch`; all later macOS steps were skipped. The pinned macOS values were extracted executable hashes rather than downloaded `.tgz` hashes. The release-candidate workflow was not triggered by this ordinary branch push.
- The archive digests in `cloudflared-integrity.json` match the official GitHub release asset API and independently downloaded archives for `2026.9.3`. The extracted executable digests remain pinned separately. New CI results for the remediation commit are recorded after the push; a Windows run alone cannot close the macOS gate.

## Remediation verification — 2026-10-08 (Windows x64, this machine)

| Check | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint` | PASS |
| `pnpm test` | PASS: desktop 471, server 455, client 2204 Vitest tests plus the V1-contract, music, card-art and landmark-art Node suites |
| `pnpm build`, `pnpm test:e2e:mobile` | PASS (Chromium and WebKit, 4 tests; development server profile, see the testcase page) |
| `pnpm desktop:make`, `proof:packaged`, `proof:packaged:host`, audio/card/landmark proofs, package budget (Setup.exe 145.2 MiB) | PASS |
| `pnpm validate:release` | PASS in unsigned mode; signing and notarization NOT RUN |
| Real packaged Electron app driven by Playwright (3 launches, 40 checks) | PASS: capability returned only through the validated IPC, Guest-first via loopback and the real LAN address, forged headers, wrong/foreign capability and a stale one rejected, UI-created room, Online Host through the bundled cloudflared and Cloudflare with a hostile `~/.cloudflared/config.yml` and `TUNNEL_NAME`, tunnel killed and recreated with a new hostname, old link 530, guest resumed the same seat, quitting left no `cloudflared`/app process and removed the private config, tampered cloudflared with a matching sidecar refused with `CLOUDFLARED_CORRUPT` |
| `scripts/proveQuickTunnel.mjs` live probe | PASS (same machine and network; Cloudflare refused a visitor-supplied `CF-Connecting-IP` with 403) |
| macOS (arm64/x64) build, proofs, DMG, execution of the bundled binary | NOT RUN here; the Desktop Build macOS job on the remediation push is the gate. The darwin archive and executable digests were verified by download and extraction |
| Release Candidate and Archive Evidence workflows | not triggered by a branch push (tag / manual dispatch only) |
| Independent networks, physical LAN devices, signing/notarization | NOT RUN: separate release gates |

Known limits recorded by review: roughly 20 distinct visitor addresses can use up the process-wide 600 per minute admission backstop (a single client is bounded at 30 per minute); a signed macOS build re-signs the bundled executable, so pinning the unsigned digest will need a signed-digest decision when macOS signing is introduced; the executable is hashed immediately before launch, not held open.

## Result by phase

| Phase | Status | Evidence boundary |
| --- | --- | --- |
| A — RAM migration | **PASS for automated implementation gate** | Production startup uses a fresh in-memory store without database configuration. Transaction, rollback, CAS, gameplay, reconnect and packaged process-restart checks pass. |
| B — LAN hosting | **PARTIAL** | Packaged Windows x64 helper serves the client and four Socket.IO players through a real LAN interface and LAN discovery; reconnect and process loss pass. Physical Windows/macOS and mobile clients on the same Wi-Fi, including offline LAN and firewall behavior, were not run. |
| C — Online links | **PARTIAL** | A live Quick Tunnel served the client to Chromium, accepted the browser origin and four public WebSocket clients, and passed admission/reconnect checks. Clients were run from this machine; independent Wi-Fi/cellular networks and a normal packaged UI session were not run. |
| D — release readiness | **PARTIAL** | Automated tests, mobile browser emulation, Windows package/installer/proof and documentation pass. macOS packaging, signed/notarized installers and physical cross-network gameplay remain unverified. |

## Executed checks

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: passed.
- `pnpm test`: passed with server 405, desktop 415 and client 2,199 tests before the final cleanup. After final cleanup, targeted full module suites passed: server 404, desktop 419 and client suite rerun. The server count dropped by one when the retired cloud-profile test was removed.
- `pnpm test:e2e:mobile`: four Chromium/WebKit mobile flow and audio tests passed against the RAM server, including invitation prefill, gameplay admission and reconnect.
- `pnpm desktop:make`: Windows x64 installer built. `pnpm desktop:proof:host` passed a real packaged helper with four clients, LAN HTTP/discovery, fifth-player and wrong-room rejection, stable identity/reconnect, newest-connection ownership, and rejection of the old room/token after helper restart.
- `scripts/proveQuickTunnel.mjs`: passed through a live public HTTPS endpoint. Chromium opened the invitation with the correct room prefill; Socket.IO browser-origin polling and four WebSocket clients passed. The tunnel and server were stopped afterward.
- A post-proof Windows process query found no `cloudflared.exe` or `OwnTheBlock.exe` processes running from this repository.
- The package budget check validates the bundled `cloudflared` binary, its SHA-256 digest, its Apache license, and absence of PostgreSQL resources. The Windows installer was about 145 MiB.
- `pnpm validate:release` passed metadata checks in unsigned-validation mode; signing is blocked and notarization was not run.

## Required manual release checks

1. Install and launch the Windows and macOS builds as a normal player. On macOS, build both x64 and arm64 packages and verify executable permissions, signing and notarization.
2. Play a complete LAN game with physical desktop and Android/iOS/tablet browsers on the same network, including a network with no Internet. Check firewall prompts, sleep, IP changes and host close.
3. Host Online on Windows and macOS; have another desktop and mobile browser join and play over independent Wi-Fi and cellular connections. Interrupt the tunnel during play, share the replacement link, then verify helper crash and application quit end the old room.
4. Observe repeated host start/stop cycles and process cleanup on both operating systems. Record any Cloudflare `429` or temporary-hostname behavior.

Cloudflare [documents Quick Tunnels as testing/development infrastructure](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), with temporary hostnames and no uptime guarantee. A stable public hosting claim requires a named tunnel and associated account/domain provisioning. The personal-use link workflow is implemented and verified to the extent recorded above; the independent-network completion gate remains open.
