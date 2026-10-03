# Visual overhaul v2 evidence

The PNG screenshots that review gates G1 to G5 were approved on are **not stored on `main`** since 1.1.1. They were 519
files and 221 MiB, 87% of the repository, and nothing at runtime reads them. Everything else stays in this folder: each
gate's `README.md` and the JSON measurements (capture diagnostics, draw-call and triangle numbers, benchmarks).

## Where the screenshots are

- **Release asset:** [Visual overhaul v2 evidence (archive)](https://github.com/tvghung/monopoly/releases/tag/evidence-visual-v2-2026-10-02),
  `visual-overhaul-v2-evidence.zip` with a `SHA256SUMS.txt`. The zip root is `evidence/`, so a path cited in a plan or a
  test-case document, for example `evidence/02/g2/viewports/02-g2-board-readability-high-2560x1080.png`, is the same path
  inside the zip. It holds the PNG, JSON and Markdown files exactly as they were committed.
- **Online:** the tag still contains the folder, so
  [the evidence at the archive tag](https://github.com/tvghung/monopoly/tree/evidence-visual-v2-2026-10-02/project-document/visual-overhaul-v2/evidence)
  can be browsed on GitHub. The tags `v1.0.0` and `v1.1.0` hold it too.
- **Locally:** restore the screenshots next to the committed files; Git ignores them, so they do not show in `git status`.

```bash
git fetch origin tag evidence-visual-v2-2026-10-02
git restore --source=evidence-visual-v2-2026-10-02 -- project-document/visual-overhaul-v2/evidence
```

## New captures

`pnpm visual:capture` writes into this folder (`VISUAL_EVIDENCE_DIR=<folder>` redirects it). `*.png` files here are ignored by
Git, so a new review package is attached to the pull request or published like the archive above (push a tag named
`evidence-<topic>` and the `Archive Evidence` workflow publishes the folder of the tagged commit as a pre-release); only the
JSON measurements and Markdown are committed.

The `baseline/` sets record states from before the theme switch and cannot be captured again (`e2e/visual/captures.ts`
renders the current theme), so the archive is their only copy besides the tags.
