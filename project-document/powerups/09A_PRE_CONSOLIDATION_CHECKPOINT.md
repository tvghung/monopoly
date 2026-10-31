# Phase 09A — Verified pre-consolidation checkpoint

CURRENT DEVELOPMENT — 2026-10-27 (Asia/Bangkok). Local recovery only.

Original branch: `codex/v1.10.0-refactor`; HEAD: `4c878d67072de6fdfb82457203bfa1d3054fed56`. Index: no staged changes. Status lists 72 tracked paths and 88 untracked paths (160); normalized Git diff contains 70 tracked paths. Dashboard.tsx and GameScene.contextIsolation.test.tsx have status-only byte changes and are preserved separately.

## Verified checkpoints

| Snapshot | Files | Integrity | Restore drill |
| --- | ---: | --- | --- |
| `C:\Users\hungtran\Documents\ChatGPT\Own the block (monopoly)\powerup-pre-phase06-checkpoint-2026-10-27-4c878d6` | 107 | SHA-256 PASS | Tracked diff, untracked inventory and clean index PASS |
| `C:\Users\hungtran\Documents\ChatGPT\Own the block (monopoly)\powerup-phase08b-checkpoint-2026-10-27-4c878d6` | 121 | SHA-256 PASS | Tracked diff, untracked inventory and clean index PASS |
| `C:\Users\hungtran\Documents\ChatGPT\Own the block (monopoly)\powerup-pre-phase09a-checkpoint-2026-10-27-4c878d6` | 160 | SHA-256 PASS | Tracked diff, untracked inventory and clean index PASS |

New manifest: `C:\Users\hungtran\Documents\ChatGPT\Own the block (monopoly)\powerup-pre-phase09a-checkpoint-2026-10-27-4c878d6\manifest.json`. SHA-256: `93a3f2103ba0d0020b7dfe73091d95660b0091f9e12eaf3d0d5fb65caa52d056` (also manifest.sha256). Exact original index, binary staged/unstaged/HEAD diffs, full tracked/index/untracked inventories and 160 file copies are saved. All 3,175 tracked plus untracked source/asset file hashes were independently recorded in the external Phase 09A evidence directory. No dirty secret/environment/key paths were found; ignored output/dependencies are excluded. Unchanged tracked artwork is recoverable from the recorded HEAD; no ignored Power-up artwork was found.

Original manifest digests: pre-06 `3c71afad921b49bb0fbe02974c65fa5bfcfe243efad243168594d49e1b54ba3f`; 08B `c7d923f79fe6a18ff207d43996d69d02fa311d04a76a406460029f5ae92db94a`. Every recorded digest was recalculated (pre-06 artifacts includes its file copies; do not double-count). Original snapshots were not changed.

## Restoration

1. Read the new snapshot RESTORE.md. Create a separate local clone at the recorded HEAD; enable core.longpaths=true before checkout on Windows.
2. Verify manifest.sha256, all file copies and metadata against manifest.json. Copy every worktree/ file to the same relative path in the separate checkout. No tracked deletion existed at capture.
3. Restore metadata/git-index to the index path returned by git rev-parse --git-path index in that separate clone. All indexed objects are available at captured HEAD; staging was empty. Compare exact index bytes immediately after copying, before Git refreshes stat metadata.
4. Compare git diff HEAD --binary --full-index with metadata/diff-head.patch, git ls-files --stage -z with index-stages.zlist, and the untracked NUL inventory. Raw SHA-256 checks additionally preserve status-only line-ending differences.
5. Preserve any newer edits before considering an in-place recovery. Do not apply this checkpoint over the live checkout as part of consolidation.

Fresh isolated clones under `C:\Users\hungtran\Documents\ChatGPT\Own the block (monopoly)\powerup-phase09a-evidence` reproduced pre-06 (43 tracked/64 untracked), entry-08B (47/74), and entry-09A (70 normalized tracked/88 untracked plus two status-only files). The initial drill exposed omitted long Windows paths; enabling long paths and rerunning produced exact diffs. Index byte equality was measured before stat refresh, and semantic stage equality afterward. Results: checkpoint-verification.json and new snapshot restore-drill-result.json.
