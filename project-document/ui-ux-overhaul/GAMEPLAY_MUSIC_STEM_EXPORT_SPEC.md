# Gameplay Music Stem Export Specification

## Status

> SUPERSEDED / HISTORICAL. This is the earlier multi-stem export contract. The
> current V1 architecture is documented in
> [V1_RELEASE_CONTRACT.md](V1_RELEASE_CONTRACT.md); retain this file as design
> history only.

**AUDIO BLOCKED (2026-09-09).** Pass C now supplies the production authoring,
segmentation, hashing, technical validation, human-acceptance record, and
release-gate infrastructure. The four real soundtrack masters have not been
imported, so no production runtime audio is present and no audio acceptance is
claimed.

The historical [V1_AUDIO_FINAL_ACCEPTANCE.md](V1_AUDIO_FINAL_ACCEPTANCE.md)
is retained unchanged as evidence from the earlier full-stem contract. The
current source-to-runtime procedure is documented in
[V1_AUDIO_PRODUCTION_PIPELINE.md](V1_AUDIO_PRODUCTION_PIPELINE.md).

## Musical timeline

- Tempo: `110 BPM`
- Meter: `4/4`
- Key: `F Major`
- Length: `64 bars` / `256 beats`
- Source sample rate: `48,000 Hz`
- Exact source timeline: `6,702,545` stereo frames
- Theoretical duration: `139.6363636 seconds`
- Form: Intro / A / A' / B / Bridge / C / D / A'' / Loop Bridge

All stems must be exported from the same DAW project, timeline selection, and
render operation. The source frame count is defined by cumulative rounded
musical boundaries, not by multiplying one rounded phrase duration:

```text
boundary(i) = round(i * 16 beats * 60 / 110 * 48000)
segment(i) = [boundary(i), boundary(i + 1))
```

This yields 16 four-bar segments and a final boundary of `6,702,545` frames.

## Required source masters

Place these local, untracked files in `audio-source/gameplay/`:

```text
gameplay-foundation.wav
gameplay-city.wav
gameplay-wealth.wav
gameplay-competition.wav
```

Every master must be a lossless PCM WAV, stereo, 48 kHz, exactly 6,702,545
frames, non-silent, finite, and below full-scale sample clipping. The four
masters must share the same start, end, bar alignment, channel layout, and
loop preparation. Do not place WAV masters in `apps/client/public/`, commit
them, or package them.

The files are synchronized layers of one composition, not separate songs.

## Stem contents

- Foundation: warm piano, upright bass, brushed drums, essential harmony, and
  the core melodic identity.
- City: marimba, pizzicato strings, clarinet responses, and playful movement.
- Wealth: secondary piano, subtle muted trumpet, warm pad, and restrained
  development texture.
- Competition: stronger syncopation, additional brushed percussion, harmonic
  tension, and extremely subtle accordion.

## Authoring and mix direction

Target a polished, warm, playful, clever, slightly mischievous city-tycoon party
game. Piano and marimba are the main identity. Keep the primary melody roughly
within `F4–E5`; treble may support it but must not become a repetitive lead.
Intensity must come from arrangement density and tension, not higher pitch,
brightness, or a large loudness increase. Leave space for dice, money,
property, card, building, jail, turn, and UI sound effects.

Avoid General MIDI character, fake acoustic timbres, glockenspiel, bright
plucks, constant high ostinatos, endless ascending patterns, EDM elements,
excessive cymbals, and nursery-rhyme phrasing. Do not synthesize instruments in
production code and do not use placeholder, personal, test-noise, or procedural
replacement audio.

## Deterministic runtime generation

From the repository root, with FFmpeg and ffprobe available:

```text
pnpm prepare:music-assets
```

The command validates all four source masters, stages output outside the
destination, and uses one FFmpeg command per stem with:

- `atrim=start_sample=<boundary(i)>:end_sample=<boundary(i+1)>`
- `asetpts=PTS-STARTPTS`
- stereo 48 kHz output
- one `libvorbis -q:a 6` encode per segment
- no normalization, fades, or runtime FFmpeg dependency

Only after all 64 chunks encode, structural validation succeeds, and the
manifest SHA-256 fields are written does the command promote the known output
paths. A failure leaves the previous destination intact and removes only known
generated staging/backup paths.

## Canonical shipped output

The output directory is `apps/client/public/audio/music/gameplay/` and must
contain exactly this set:

```text
gameplay-music.manifest.json
segments/foundation/00.ogg ... segments/foundation/15.ogg
segments/city/00.ogg ... segments/city/15.ogg
segments/wealth/00.ogg ... segments/wealth/15.ogg
segments/competition/00.ogg ... segments/competition/15.ogg
```

Each chunk is one stereo Ogg/Vorbis stream at 48 kHz. The manifest remains
schema version `1` and contains the exact track contract, cumulative
`startFrame`/`frameCount` values, safe relative paths, and a lowercase
64-character SHA-256 for every chunk. Legacy full-stem OGG files and stale
chunks are forbidden.

## Technical validation and measured evidence

The real-asset validator uses FFmpeg and ffprobe; it never mocks codec or
decoded-audio behavior. Run:

```text
pnpm test:music-pipeline
pnpm test:music-validator
pnpm validate:music-assets
pnpm build
node apps/client/scripts/validateGameplayMusicAssets.mjs --build-output --report project-document/ui-ux-overhaul/V1_AUDIO_ASSET_MEASUREMENTS.json
```

The tests create synthetic WAV/OGG fixtures only in isolated temporary
directories. They never install those fixtures into `public/` or use them as
production listening evidence.

Validation hard-fails missing/corrupt files, unsafe paths, bad hashes, legacy
full OGGs, stale files, wrong codec/rate/channel count, non-finite or clipped
PCM, silence, decoded frame error above one frame, cross-stem timeline drift,
and reconstructed timeline drift. It reconstructs every stem from the shipped
chunks and checks all 15 internal seams plus the `15 → 00` loop seam.

Runtime Level 3 is measured with gains `[1, 0.9, 0.8, 0.75]` and hard-gated to
integrated loudness `-19..-15 LUFS` inclusive and true peak `<= -1.5 dBTP`,
with no clipping, silence, or non-finite samples. Unity-sum `[1,1,1,1]` is
measured separately as a conservative headroom diagnostic; it has no LUFS
hard target. The build-output check requires the manifest and all 64 chunks to
match the source SHA-256 values exactly.

The validator records actual file hashes, codec, channels, rate, container and
decoded timelines, PCM peaks, LUFS, true peak, mix gains, and seam statistics.
No measurement is reported until the actual files have been read and decoded.

## Manual acceptance and release binding

Technical validation does not certify instrument realism, musical loop
quality, long-session fatigue, SFX readability, or all four adaptive levels.
The reviewer must listen to multiple loop cycles and all runtime intensity
levels, then update `V1_AUDIO_HUMAN_ACCEPTANCE.json` with `accepted: true`, a
reviewer, timestamp, and the exact released manifest SHA-256.

`pnpm validate:music-release` distinguishes:

- `TECHNICAL AUDIO FAILURE` — the shipped segmented assets or technical gates
  fail; or
- `HUMAN AUDIO ACCEPTANCE PENDING` — technical assets pass but the signed-off
  acceptance record is absent, false, incomplete, or bound to another manifest.

Only `pnpm validate:release -- --release` invokes this human-bound gate.
Ordinary contract validation does not require human acceptance. Packaged audio
proof remains nonzero when production assets are absent or the proof result is
false. Physical iPhone Safari listening, installer lifecycle, signing,
notarization, and V1 certification remain separate gates.

No production soundtrack was imported or generated in Pass C. Pass D is the
authorized next step for importing the real masters and completing technical
audio acceptance.
