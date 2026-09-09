# V1 Segmented Rendered Music Transport

Status: Pass B engineering transport implemented; production soundtrack remains
blocked pending Pass C.

## Baseline

- Starting branch: `codex/v1-release-contract`
- Starting SHA: `4bb6ab88dfdeba85053747c89e29d8414a4b1cb8`
- Working branch: `codex/v1-segmented-music-transport`
- Historical `origin/main`: `68c364d2b88aaa24edfafa16d9157672c3099e31`

## Architecture

The previous runtime fetched and decoded four full 64-bar Ogg stems, retained
four full `AudioBuffer` objects, and ran four long-lived looping sources. At
48 kHz that represented approximately 204.55 MiB of decoded stereo Float32
PCM before decoder and browser overhead. Trusted Web Audio unlock also began
that load even when no room was active.

Pass B keeps the four source-master identities (`foundation`, `city`, `wealth`,
`competition`) and the 110 BPM, 4/4, 64-bar form, but consumes a typed manifest
at `/audio/music/gameplay/gameplay-music.manifest.json`. The manifest describes
16 four-bar segments per stem, cumulative source-frame boundaries, total source
frames, and reserved SHA-256 fields for Pass C.

`SegmentedMusicTransport` owns a single parent transport GainNode beneath the
existing Music bus. Each phrase uses non-looping BufferSource nodes connected
through per-stem gains to that parent. The startup window decodes and schedules
the current and next phrase. `AudioContext.currentTime` and absolute source
start times are the musical clock; `onended` only removes the finished phrase
and prefetches the phrase after the already-scheduled next phrase.

For sequence `n`, `segmentIndex = n % 16` and `loopIndex = floor(n / 16)`.
The start time is derived from `(loopIndex * totalFrames + startFrame) /
sourceSampleRate` relative to the transport anchor. Boundaries use cumulative
rounding of each phrase boundary, never one rounded duration multiplied by 16.

## Memory and lifecycle

The retained decoded window is hard-bounded to two phrase sets, up to eight
stereo segment buffers. The transport reports owned decoded PCM as
`length * numberOfChannels * Float32Array.BYTES_PER_ELEMENT`; the 48 kHz test
window is below 32 MiB. Phrase and source references are dropped before the
following phrase is decoded. Encoded response payloads are not cached by the
engine.

Unlock creates/resumes the shared AudioContext and can play SFX, but does not
fetch the gameplay manifest unless a room is active, the context is running,
and the document is visible. Hidden transport and room leave fade the parent,
stop scheduled sources after the ordinary fade cleanup, abort work, and release
decoded buffers. Visible re-entry starts a fresh sequence. Generation checks and
AbortController cancellation prevent stale room, visibility, context, and
dispose completions from starting audio.

Foundation is mandatory: permanent or exhausted transient failure produces
silence without procedural gameplay BGM. Optional stem failure deterministically
degrades the current room to Foundation-only; a later clean room can retry a
transient optional failure once. Manifest and segment paths are validated as
local `segments/<stem>/<file>.ogg` paths beneath the gameplay asset root.

## Adaptive behavior

Existing public-state intensity weights, thresholds, and hysteresis are
unchanged. Levels remain `[1,0,0,0]`, `[1,.75,0,0]`, `[1,.85,.7,0]`, and
`[1,.9,.8,.75]`. A requested change is applied to the next phrase's gains and
ramped over two beats; repeated changes before that boundary replace the
pending automation without restarting the phrase or changing the segment
sequence.

## Verification and limitations

The dedicated `pnpm test:music-transport` command covers manifest rejection,
startup gating, absolute scheduling across segment 15/0 and multiple loops,
bounded PCM, intensity transitions, degradation, retries, visibility, room
cleanup, buses, SFX, and disposal. Existing production validators remain
unchanged and continue to block the normal test/build/package path while the
four real full source masters and the Pass C-generated runtime manifest/chunks
are absent.

Not proven by Pass B: production Ogg generation, real SHA-256 values, loudness,
true peak, seam quality, browser real-asset decode, packaged real-audio proof,
human listening, physical iPhone Safari output, signing, release, or V1
certification.
