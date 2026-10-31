# Own the Block v1.11.0 release verification

Status: PREPARED — publication is not yet verified. The Product Owner explicitly authorizes merging PR #28 and publishing through the existing pipeline with manual gaps recorded as NOT RUN. Release authorization does not establish manual UAT PASS.

## Source and preservation

- Previous published version: v1.10.0, protocol 14 / RAM snapshot 11. The remote v1.11.0 tag was unused at preparation.
- [PR #28](https://github.com/tvghung/monopoly/pull/28) is verified merged into main at `8325faf39e0750756eecdc5219af787597a8c56e`. Its head `7d296dda44bed2219fa5eee920958764c822a291` is an ancestor of main. This preparation starts from that merge.
- Scope: the complete Power-up System and artwork, OB-1/2/3 desktop repairs, OB-4 collectible picker and the two test synchronization fixes. The previously merged PR #27 reliability/refactor baseline is included through main.
- Read-only local audit found no missing completed Power-up/OB commits. All 126 files of the old staging snapshot match consolidation `a0eb9a8`. Six dirty hosting prototypes are superseded by the stricter `2eadca0` repair; unrelated historical work and all local edits were preserved.

## Compatibility and publication boundary

- v1.11.0 uses socket protocol **16**, RAM snapshot **14** and LAN discovery **16**. The update floor is **1.11.0** because published v1.10.0 protocol-14 desktops are incompatible. Strict `UPGRADE_REQUIRED` handshakes remain unchanged.
- Root, client, server, desktop and shared packages share version 1.11.0. Root package metadata remains the packaging authority. No protocol/schema increment is added by version preparation.
- Finish matches before updating: the Host owns rooms/sessions only in RAM, and stopping it ends them permanently. No database or cross-process migration exists.
- The annotated `v1.11.0` tag must target verified main. The existing `release-candidate.yml` publishes only after quality, all three distribution targets, packaged proofs and integrity checks pass. Manual dispatch does not publish.
- Tag distribution remains unsigned; macOS is not notarized. No signing or integrity gate is bypassed. The existing packaged Power-up byte-parity proof is now run for every distribution target alongside the other art proofs.

## Pre-merge validation at 7d296dd

| Check | Result |
| --- | --- |
| Frozen install, typecheck, lint, renderer build, docs and V1 contract | PASS |
| Fresh complete local test suite | PASS: 4,594 tests; 2 existing server skips. Client 2,728, server 1,163, desktop 629 and root/tooling 74 |
| Final-head GitHub CI / Docs | [CI PASS](https://github.com/tvghung/monopoly/actions/runs/41190297883), [Docs PASS](https://github.com/tvghung/monopoly/actions/runs/41190297884) |
| Focused production picker | PASS, 9 checks: secrecy, authority, particle cleanup, keyboard, OS/game reduced motion, four viewports, reconnect, replacement and eight cycles |
| Packaged runtime, Host, audio, cards, landmarks, Power-up and size budget | PASS; all 33 Power-up SVG/PNG pairs match packaged bytes |
| Actual Windows native LAN / Online UI | PASS, 7 checks; isolated profiles, LAN same-room/Host reload, real public Quick Tunnel Chrome guest on the same PC/network, no page errors, helper/tunnel stop returned IDLE |

The pre-merge native candidate used runtime source 7d296dd with development application version 1.10.0. It is not binary acceptance of the later published installer. All Electron/Chrome test processes were closed. Native evidence is summarized in [pre-merge evidence](./v1.11.0-premerge-evidence.json); detailed picker evidence remains in [OB-4 validation](../powerups/OB4_PICKER_VALIDATION.md).

## Versioned release and publication verification

NOT RUN until the final versioned main checks and tag workflow finish. Record the release-preparation main commit, annotated tag object/target, CI and Release Candidate runs, all seven public assets, SHA256SUMS/manifest/RELEASES verification and latest-feed result after actual checks.

## Remaining manual gaps and accepted risks

Owner/human-paced full-match Power-up UAT and balance, physical second-device LAN, independent-network guests, actual macOS device use, installed v1.10.0 → v1.11.0 upgrade, other-GPU/high-refresh performance and human listening remain NOT RUN. Native suspended-renderer recovery retains its historical BLOCKED reproduction limit. The owner authorizes release with these gaps disclosed. Automated native/pipeline proofs do not make these manual rows PASS. Quick Tunnel remains temporary personal/testing connectivity.
