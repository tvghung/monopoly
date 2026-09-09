# V1 Production Audio Pipeline and Release Gates

## Pass C boundary

Pass C starts exactly from Pass B SHA
`f1fd0d911438b4f88e5906cb4ce9d97677918e07` on branch
`codex/v1-production-audio-pipeline`. Pass B transport behavior, stem IDs,
ordering, gains, and manifest schema remain authoritative. This document
covers authoring input, deterministic runtime generation, technical
validation, human acceptance binding, and release integration only.

No production soundtrack masters or generated production OGG files are part of
Pass C. No Pass D import or listening acceptance is implied.

## Source contract

The author supplies four untracked files under `audio-source/gameplay/`:

```text
gameplay-foundation.wav
gameplay-city.wav
gameplay-wealth.wav
gameplay-competition.wav
```

Each must be lossless PCM WAV, stereo, 48 kHz, finite, non-silent, below
full-scale sample clipping, and exactly `6,702,545` frames. The contract is
110 BPM, 4/4, 64 bars, and four-bar segments. Source boundaries are cumulative
rounded musical boundaries:

```text
boundary(i) = round(i * 16 * 60 / 110 * 48000)
frameCount(i) = boundary(i + 1) - boundary(i)
```

The source masters stay outside Git and outside the client public/package
trees. Their musical content and licensing remain an authoring responsibility.

## Generation

`pnpm prepare:music-assets` delegates to
`apps/client/scripts/generateGameplayMusicSegments.mjs`. It accepts:

```text
--source-dir <directory>
--output-dir <directory>
--report <file>
```

The defaults are `audio-source/gameplay/` and
`apps/client/public/audio/music/gameplay/`. The generator validates all source
masters, creates a temporary sibling staging directory, and encodes each stem
with one FFmpeg filter graph. Every segment uses exact sample trimming,
`asetpts=PTS-STARTPTS`, stereo 48 kHz output, and one
`libvorbis -q:a 6` encode. There is no normalization, fade, musical synthesis,
or runtime FFmpeg path.

The stage must validate before promotion. Promotion moves only the known
manifest, `segments/`, and legacy full-stem paths; it does not delete unrelated
files. If generation or validation fails, the previous destination remains in
place and the temporary stage is removed.

## Runtime contract

The shipped directory contains exactly one manifest and 64 chunks:

```text
gameplay-music.manifest.json
segments/{foundation,city,wealth,competition}/{00..15}.ogg
```

The manifest is schema `1`, has the exact Pass B track values, uses the
cumulative boundaries above, and records a lowercase SHA-256 for every chunk.
Paths must be exact safe relative paths of the form
`segments/<known-stem>/<00..15>.ogg`. Full legacy stem files, stale chunks,
WAV masters, and arbitrary extras are rejected.

`apps/client/src/audio/music.ts` retains the four IDs and order but no longer
contains four obsolete full-file URLs. The existing segmented transport owns
fetching and scheduling; Pass C does not redesign it.

## Technical validator

`pnpm validate:music-assets` runs
`apps/client/scripts/validateGameplayMusicAssets.mjs`. It uses real FFmpeg and
ffprobe and hard-fails:

- missing/corrupt manifest or chunk, unsafe path, invalid schema, stale file,
  legacy full OGG, or missing/incorrect SHA-256;
- non-OGG/Vorbis data, non-stereo data, wrong sample rate, wrong container or
  decoded timeline, decoded frame error over one frame, cross-stem drift,
  silence, non-finite samples, or clipping;
- reconstructed-stem timeline errors and extreme discontinuities at every
  phrase boundary, including `15 → 00`;
- Level 3 `[1, 0.9, 0.8, 0.75]` clipping, silence, non-finite samples,
  integrated loudness outside `-19..-15 LUFS`, or true peak above `-1.5 dBTP`.

Unity sum `[1,1,1,1]` is measured separately without a LUFS hard target. With
`--build-output`, the manifest and all 64 chunks must be byte-hash identical to
the source runtime directory. Reports contain actual measurements only.

The validator prints the exact expected first downstream blocker when the
canonical production runtime is absent:

```text
EXPECTED BLOCKED — PRODUCTION SEGMENTED MUSIC ASSETS MISSING
```

## Test fixtures

`pnpm test:music-pipeline` exercises source validation, deterministic
segmentation, manifest/hash generation, exact output shape, stale-output
replacement, and failed-generation preservation. It creates synthetic source
WAVs only in a temporary directory.

`pnpm test:music-validator` exercises the real codec/decode validator against
temporary generated chunks and mutations for missing/bad manifests, missing or
corrupt chunks, hash mismatch, wrong codec/rate/channels/timeline, cross-stem
timeline drift, silence, legacy full OGGs, stale chunks, and build-output hash
mismatch. It does not mock FFmpeg or ffprobe and never writes fixtures to
production asset directories.

## Human acceptance record

`project-document/ui-ux-overhaul/V1_AUDIO_HUMAN_ACCEPTANCE.json` is initially
`accepted: false` with null manifest hash, reviewer, and timestamp. After the
real assets pass technical validation, a reviewer must listen to all four
adaptive levels over multiple loop cycles and verify instrument realism,
musical seams, fatigue, and SFX readability. The reviewer then records the
exact manifest SHA-256, ISO timestamp, identity, and acceptance decision.

`pnpm validate:music-release` first requires the technical validator to pass,
then requires that record to be accepted and bound to the exact manifest. It
reports `TECHNICAL AUDIO FAILURE` and `HUMAN AUDIO ACCEPTANCE PENDING`
separately. `pnpm validate:release` invokes this gate only with `--release`;
normal validation stays engineering-only.

## CI, desktop, and release boundaries

Linux CI and the Windows/macOS desktop workflows run the pipeline and
validator tests early, after the V1 contract and segmented transport tests and
before downstream typecheck/lint/database/build work. FFmpeg/ffprobe are
installed as build tools, never shipped to clients. The expected Pass C branch
therefore passes engineering fixtures and then remains blocked at the first
canonical production-asset validation step until Pass D supplies real masters.

Packaged renderer audio proof still requires a packaged manifest and all 64
chunks, verifies MIME, Web Audio decoded timelines, and exact SHA-256 values.
A false or pending proof exits nonzero. It is not a substitute for physical
device listening, installer lifecycle validation, signing, notarization, or
release certification.
