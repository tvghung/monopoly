# Gameplay soundtrack source masters

Pass C expects these four local source masters:

```text
gameplay-foundation.wav
gameplay-city.wav
gameplay-wealth.wav
gameplay-competition.wav
```

Each file must be a lossless PCM WAV, stereo, 48 kHz, and exactly 6,702,545
frames: 64 bars, 4/4, 110 BPM. Export all four from the same timeline and
preserve the intended loop seam and level relationships.

The WAV masters are ignored by Git and must not be copied into `public/` or a
package. With FFmpeg and ffprobe available, run `pnpm prepare:music-assets` to
validate the masters, render the canonical 64 Ogg/Vorbis segments, write their
manifest and SHA-256 fields, and promote the staged output only after
structural validation succeeds.

Pass C intentionally contains no production masters or generated soundtrack
files. Synthetic audio is permitted only inside isolated tests.
