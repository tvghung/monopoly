# Own the Block audio sources

All audio files in this directory are local, runtime-served assets. The source
files listed below were copied without trimming, normalization, resampling, or
other processing.

## Music

| Runtime file | Source | License / provenance |
| --- | --- | --- |
| `music/own-the-block-main-theme-loop.wav` | `C:\Users\TVGHu\Downloads\own-the-block-main-theme-loop.wav` | User-provided production source; copied unchanged |

The music source is PCM S16LE, stereo, 48 kHz, 141.272729 seconds. It is
decoded once by `AudioEngine` and looped as one Web Audio buffer only while the
authoritative room status is `IN_PROGRESS`.

## Sampled sound effects

| Runtime files | Original source files | Official source / author | License | Processing |
| --- | --- | --- | --- | --- |
| `sfx/dice/dice-shake-01.ogg`, `sfx/dice/dice-shake-02.ogg`, `sfx/dice/dice-shake-03.ogg` | Kenney Casino Audio: `dice-shake-1.ogg`, `dice-shake-2.ogg`, `dice-shake-3.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio), Kenney | CC0 | None |
| `sfx/dice/dice-impact-01.ogg`, `sfx/dice/dice-impact-02.ogg`, `sfx/dice/dice-impact-03.ogg` | Kenney Casino Audio: `die-throw-1.ogg`, `die-throw-2.ogg`, `die-throw-3.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio), Kenney | CC0 | None |
| `sfx/movement/movement-land-01.ogg`, `sfx/movement/movement-land-02.ogg`, `sfx/movement/movement-land-03.ogg` | Kenney Impact Sounds: `impactSoft_medium_000.ogg`, `impactSoft_medium_001.ogg`, `impactSoft_medium_002.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds), Kenney | CC0 | None |
| `sfx/money/money-receive-01.ogg`, `sfx/money/money-receive-02.ogg`, `sfx/money/money-receive-03.ogg` | StarNinjas: `coin.1.ogg`, `coin.3.ogg`, `coin.8.ogg` | [12 Coin Sound Effects](https://opengameart.org/content/12-coin-sound-effects), StarNinjas | CC0 | None |
| `sfx/money/money-pay-01.ogg` | StarNinjas: `coin.10.ogg` | [12 Coin Sound Effects](https://opengameart.org/content/12-coin-sound-effects), StarNinjas | CC0 | None |
| `sfx/property/property-purchase-01.ogg`, `sfx/property/property-purchase-02.ogg` | Kenney Interface Sounds: `confirmation_001.ogg`, `confirmation_003.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds), Kenney | CC0 | None |
| `sfx/build/build-house-01.ogg`, `sfx/build/build-house-02.ogg` | Kenney Impact Sounds: `impactWood_light_000.ogg`, `impactWood_light_001.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds), Kenney | CC0 | None |
| `sfx/build/build-hotel-01.ogg`, `sfx/build/build-hotel-02.ogg` | Kenney Impact Sounds: `impactWood_medium_000.ogg`, `impactWood_medium_001.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds), Kenney | CC0 | None |
| `sfx/card/card-draw-01.ogg`, `sfx/card/card-draw-02.ogg`, `sfx/card/card-draw-03.ogg` | Kenney Casino Audio: `card-slide-1.ogg`, `card-slide-2.ogg`, `card-slide-3.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio), Kenney | CC0 | None |
| `sfx/card/card-reveal-01.ogg`, `sfx/card/card-reveal-02.ogg` | Kenney Casino Audio: `card-fan-1.ogg`, `card-fan-2.ogg` | [Casino Audio](https://kenney.nl/assets/casino-audio), Kenney | CC0 | None |
| `sfx/jail/jail-enter-01.ogg` | Cough-E: `DoorLock.ogg` | [Door Lock Sounds](https://opengameart.org/content/door-lock-sounds), Cough-E | CC0 | None |
| `sfx/jail/jail-release-01.ogg` | Cough-E: `UnlockDoor.ogg` | [Door Lock Sounds](https://opengameart.org/content/door-lock-sounds), Cough-E | CC0 | None |
| `sfx/bankruptcy/bankruptcy-01.ogg` | Kenney Impact Sounds: `impactSoft_heavy_000.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds), Kenney | CC0 | None |

The registry keeps procedural fallbacks for every sampled cue. Fallbacks are a
runtime resilience path only; no generated audio is used as a production asset.
