# Gameplay Music Stem Export Specification

## Status

**AUDIO BLOCKED (2026-09-06).** All four production stems remain absent. The
temporary procedural fallback has been removed. Invalid Foundation produces
silence; an incomplete/incompatible optional set uses Foundation only. No
replacement music was generated or imported. Production builds and the normal
client test command now fail on missing assets.

See [V1_AUDIO_FINAL_ACCEPTANCE.md](V1_AUDIO_FINAL_ACCEPTANCE.md) for the exact
baseline, checks, limitations, and listening procedure. This specification is
an export requirement, not evidence that the soundtrack has been produced.

## Musical timeline

- Tempo: `110 BPM`
- Meter: `4/4`
- Key: `F Major`
- Length: `64 bars` / `256 beats`
- Theoretical duration: `139.6363636 seconds`
- Form: Intro / A / A' / B / Bridge / C / D / A'' / Loop Bridge

All stems must be exported from the same DAW project, timeline selection, and
render operation. The common selection may end on the nearest sample to the
theoretical duration, but every stem must have the same exact sample count.

## Required files

Place these files in `apps/client/public/audio/music/gameplay/`:

```text
gameplay-foundation.ogg
gameplay-city.ogg
gameplay-wealth.ogg
gameplay-competition.ogg
```

The files are synchronized layers of one composition, not separate songs.

## Stem contents

- Foundation: warm piano, upright bass, brushed drums, essential harmony, and
  the core melodic identity.
- City: marimba, pizzicato strings, clarinet responses, and playful movement.
- Wealth: secondary piano, subtle muted trumpet, warm pad, and restrained
  development texture.
- Competition: stronger syncopation, additional brushed percussion, harmonic
  tension, and extremely subtle accordion.

## Export contract

- Export stereo Ogg files at one shared sample rate; `48 kHz` is preferred.
- Use the exact same start point, end point, bar alignment, loop point, channel
  layout, encoding settings, duration, and sample count for all four files.
- Do not trim stems independently or introduce different leading/trailing
  silence.
- Prepare a seamless loop in the source session. Do not leave an uncontrolled
  reverb tail beyond the common boundary, and do not rely on runtime crossfades
  to repair the export.
- Avoid clipped peaks and verify the seam over multiple complete loops.
- Do not normalize or master stems independently. Preserve their intended level
  relationships and test the maximum-density Foundation + City + Wealth +
  Competition mix.
- Do not depend on embedded metadata, browser processing, or runtime gain as a
  substitute for a correct render.

## Musical and mix direction

Target a polished, warm, playful, clever, slightly mischievous city-tycoon party
game. Piano and marimba are the main identity. Keep the primary melody roughly
within `F4–E5`; treble may support it but must not become a repetitive lead.
Intensity must come from arrangement density and tension, not higher pitch,
brightness, or a large loudness increase. Leave space for dice, money, property,
card, building, jail, turn, and UI sound effects.

Avoid General MIDI character, fake acoustic timbres, glockenspiel, bright plucks,
constant high ostinatos, endless ascending patterns, EDM elements, excessive
cymbals, and nursery-rhyme phrasing.

## External verification

Use proper audio tooling to measure integrated loudness, true peak, spectral
balance, stereo compatibility, and the loop seam. `-17 LUFS integrated` and a
true peak no higher than approximately `-1.5 dBTP` are working targets, not
claims. Record measured results before reporting them.

Final acceptance requires manual listening for instrument realism, melodic and
treble balance, multiple loop cycles, long-session fatigue, SFX readability, and
all four adaptive levels. Automated runtime tests cannot pass this gate.

## Validation and measured asset record

From the repository root, with FFmpeg and ffprobe available:

```text
pnpm test:music-validator
pnpm validate:music-assets
pnpm build
node apps/client/scripts/validateGameplayMusicAssets.mjs --build-output --report project-document/ui-ux-overhaul/V1_AUDIO_ASSET_MEASUREMENTS.json
```

Use `FFMPEG_PATH` / `FFPROBE_PATH` for explicit executable paths. These are
development/build tools, not shipped runtime dependencies. CI installs them;
no npm dependency or lockfile change is needed.

The validator reads the actual files and enforces one stereo Ogg/Vorbis stream,
at least 65,536 bytes, zero timeline start, one sample rate, container frame
count within one frame of `round(256 * 60 / 110 * sampleRate)`, decoded duration
within 10 ms, and exact matching container/decoded frame counts between stems.
It rejects corrupt/silent data, sample peaks at or above full scale, true peaks
at or above 0 dBTP, and extreme seam jumps. `--build-output` also requires each
Vite output file to match the source SHA-256.

The JSON records file sizes/hashes, codec, channels, sample rate, container and
decoded timelines, decoded PCM bytes, LUFS, true peak, and endpoint samples.
The full-density measurement sums all four stems at unity without normalization.
It reports headroom and warns outside the working -17 +/- 2 LUFS or -1.5 dBTP
targets. Runtime Level 3 uses the existing gains `[1, 0.9, 0.8, 0.75]`; the
unity sum is the conservative production headroom check.

The seam screen fails a boundary jump exceeding both 0.5 full scale and four
times the largest within-track adjacent jump. A change above 0.05 full scale
between the first/last 10 ms means produces a warning. This cannot certify a
musical loop bridge or prove that a source-session tail was prepared correctly.

| Required file under `apps/client/public/audio/music/gameplay/` | Current status | Size / rate / channels / duration / SHA-256 / LUFS / dBTP |
| --- | --- | --- |
| `gameplay-foundation.ogg` | MISSING | Not measurable |
| `gameplay-city.ogg` | MISSING | Not measurable |
| `gameplay-wealth.ogg` | MISSING | Not measurable |
| `gameplay-competition.ogg` | MISSING | Not measurable |

No production audio measurement report exists yet. Temporary noise used to
test the validator is never installed in public assets and is not soundtrack
or listening evidence. No third-party music/sample redistribution rights have
been asserted; supply the composition/source license with the final exports.

## Runtime contract and limitations

- One shared AudioContext, separate Master/Music/SFX buses, legitimate user
  activation, and four sources starting at one common timestamp remain intact.
- Level 0 is Foundation; 1 adds City; 2 adds Wealth; 3 adds Competition. Existing
  public-state intensity weights and hysteresis remain unchanged. Changes use
  four-bar boundaries with two-beat gain fades, without restarting stems.
- Successful decodes and permanent failures are cached per context. HTTP
  404/410, corrupt data, and incompatible timelines remain failed for that
  context. Other fetch/read failures allow one controlled retry on a later
  trusted interaction or new room activation. Visibility/state updates do not
  repeatedly fetch. If Foundation is already playing, recovered optional stems
  become active in the next clean room session without interrupting it.
- Hiding fades the same sources; leaving stops them after the fade; entering
  another room starts a fresh synchronized set using cached buffers. Disposal
  stops voices, drops buffer references, disconnects buses, and closes context.
- At the preferred 48 kHz, four float32 stereo buffers cost approximately
  204.55 MiB (`4 * round(48000 * 256 * 60 / 110) * 2 * 4` bytes), before decode
  overhead. This is a calculation, not measured browser memory. Web Audio may
  resample to the device context rate. Actual mobile memory and decoding
  compatibility remain unverified until production assets exist.
- Human listening: **PENDING HUMAN ACCEPTANCE**. Physical iPhone Safari audio:
  **RETEST REQUIRED**. Final V1 acceptance: **HOLD**.
