# Gameplay Music Stem Export Specification

## Status

This is the production contract for the adaptive gameplay soundtrack. The four
final rendered stems are not currently present in the repository. Runtime
integration can therefore play only silence until matching assets are supplied.

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
