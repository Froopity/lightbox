# Lightbox — Implementation Plan

Companion to `design.md`, which holds the intent. This file holds the decisions and is the source of truth for agents.
Read all of it before starting any phase.

## 0. Decisions (from interview, 2026-10-12)

| Topic | Decision |
|---|---|
| Board | Classic Arduino Nano, ATmega328P (2 KB RAM, 32 KB flash). Budget: ≤ 75% RAM, ≤ 85% flash. |
| LEDs | WS2812B, GRB, 3 strips × 17 on pins 2, 3, 4 (as in `arduino/*.ino`). Calibrated in Phase 0: bottom = pin 2, middle = pin 3, top = pin 4; identity mapping (no offset, no reversal); increasing column = anticlockwise from above. |
| Architecture | All effects run **on the Arduino**. Browser sends small commands only. |
| Boot behaviour | Fixed default: Ominous Glow, default colour, rate 0.5, brightness 0.8, global 1.0. No EEPROM. |
| Transitions | Hard cut between presets. |
| Power | No firmware power cap; full 255 allowed. User handles supply. |
| Background | Unlit LEDs on moving effects are **black** (no brightness floor). |
| Firmware toolchain | PlatformIO. `nano` env (hardware) + `native` env (host unit tests). |
| Web | Vue 3 + TypeScript (strict) + Vite, plain hand-written CSS, native inputs. Served locally (`vite dev` / `vite preview`) in Chrome. Dark, stage-friendly UI. |
| Presets | localStorage; export/import as a JSON file. Create, edit, delete (confirm), duplicate, drag to reorder; defaults seeded on first run. |
| Shortcuts | `1`–`9` select preset by list position; `B` toggles blackout; arrows nudge live values (Phase 5). |
| Disconnect | Arduino keeps its last state. UI shows a banner, reconnects automatically when the port comes back, and resends the full state. |
| LFO | Runs in firmware. Sine only. 0.05–5 Hz, depth 0–100%. Targets either rate or brightness. |
| Verification | Board will be attached to the dev machine. Agents compile, flash, and run serial smoke tests themselves; the user checks visuals at phase gates. |
| Workflow | Commit to `main`. Stop at the end of each phase for user sign-off. Never start the next phase without it. |

## 1. Repository layout

```
arduino/            existing reference sketches — leave untouched
firmware/
  platformio.ini    envs: nano (atmelavr, board nanoatmega328new — fall back to nanoatmega328 if upload fails), native, calibrate
  src/main.cpp      Arduino glue only: FastLED setup, layout mapping, serial I/O, frame loop
  src/calibrate.cpp calibration sketch (calibrate env only)
  lib/core/         pure C++, NO Arduino/FastLED includes, compiles natively
    color.h         Rgb struct, scale8, blend (port the FastLED algorithms)
    trig.h          sin16/cos16 (port the FastLED algorithm), fixed-point helpers
    timing.h        phase accumulator, rate→period mapping
    frame.h         Frame = Rgb[3][17] (row 0 = bottom, col 0 = calibrated column 0)
    effects/*.h/.cpp one per style
    styles_gen.h    GENERATED from shared/styles.json — never hand-edit
    protocol.h/.cpp line parser + state model
    lfo.h/.cpp
  test/             Unity tests (native env)
web/
  src/protocol/     encoder (mirrors firmware parser)
  src/serial/       WebSerial transport (wake/CTS pacing, coalescing, reconnect)
  src/stores/       Pinia stores: connection, presets, live, global, lfo
  src/styles/       loads shared/styles.json → typed registry
  src/components/
  scripts/gen-firmware-styles.ts  writes firmware/lib/core/styles_gen.h
  scripts/smoke.ts  Node serial smoke test against a real board (uses `serialport`)
  e2e/              Playwright tests against a fake WebSerial device
shared/
  styles.json       single source of truth for styles and parameters
  protocol-fixtures.json  golden command lines ⇄ decoded state, used by BOTH test suites
Makefile            `make check` (everything below), `make flash`, `make smoke`
CLAUDE.md           commands + rules for agents (created in Phase 0)
```

**Quality gate (`make check`)**. It must pass before every commit:
- `web`: `eslint` (flat config, typescript-eslint, eslint-plugin-vue), `vue-tsc --noEmit`, `vitest run`, `playwright test`
- `firmware`: `pio test -e native`, `pio run -e nano` (fails if RAM > 75% or flash > 85%; parse the size output)
- `gen-firmware-styles --check`: the generated header is up to date

When a board is attached, `make smoke` also runs: flash, then `scripts/smoke.ts` (port from `LIGHTBOX_PORT`, default `/dev/ttyUSB0`).

## 2. Shared conventions

### 2.1 Geometry
A logical frame is 3 rows × 17 columns. Row 0 is the bottom. Columns wrap around (column 16 is next to column 0).
`main.cpp` maps the logical frame to physical LEDs using `layout.h`:
```c
const uint8_t STRIP_FOR_ROW[3];   // which strip (0=pin2,1=pin3,2=pin4) is row r
const uint8_t COL_OFFSET[3];      // physical index of logical col 0, per row
const bool    COL_REVERSED[3];    // physical index runs opposite to logical col direction
```
Effects never see physical indices.

### 2.2 Normalised controls
The UI works in floats in [0,1]. On the wire, values are integers.

| Control | Wire range | Firmware meaning |
|---|---|---|
| rate `r` | 0–1000 | period = P_slow · (P_fast/P_slow)^(r/1000) (log interpolation; P per style) |
| brightness `b` | 0–1000 | style byte = B_min + (B_max − B_min) · (b/1000)² |
| global `g` | 0–1000 | output = style byte · (g/1000)², 0 = fully off |
| LFO depth | 0–1000 | see §6 |
| LFO rate | 50–5000 | millihertz |

The final brightness is applied with `FastLED.setBrightness(output)`, with dithering left on. Effects render at full value. B_min = 4 and B_max = 255 for every style for now; both live in `styles.json`.

The rate→period mapping can be evaluated once per frame (the LFO may modulate it), so it must not call `pow()` per frame. Use a 33-entry log-period table with linear interpolation, built when the style changes.

### 2.3 Time base
Each frame, compute `dt_us` from `micros()`. Phase accumulators are `uint32_t`, and 2³² is one cycle.
`phasePerUs = 2^32 / period_us`, computed when the period changes; `phase += dt_us * phasePerUs`.
Because rate changes alter the increment and never the phase, rate edits and LFO modulation never cause visual jumps.
Target ≥ 100 fps. Report the measured fps in the `?` dump.

### 2.4 Styles (`shared/styles.json`)
```jsonc
{ "styles": [
  { "id": 0, "key": "ominous", "name": "Ominous Glow", "colors": 1, "periodSlowMs": 8000, "periodFastMs": 1500, "params": [] },
  { "id": 1, "key": "alarm", "name": "Alarm", "colors": 1, "periodSlowMs": 2000, "periodFastMs": 300,
    "params": [{ "key": "tail", "label": "Tail", "wireMin": 0, "wireMax": 16, "default": 8, "scale": 0.5, "unit": "cols" }] },
  { "id": 2, "key": "twotone", "name": "Two-tone Glow", "colors": 2, "periodSlowMs": 6000, "periodFastMs": 1000, "params": [] },
  { "id": 3, "key": "pulse", "name": "Vertical Pulse", "colors": 1, "periodSlowMs": 2800, "periodFastMs": 700, "params": [] },
  { "id": 4, "key": "lighthouse", "name": "Lighthouse", "colors": 1, "periodSlowMs": 10000, "periodFastMs": 2000,
    "params": [
      { "key": "whip",  "label": "Whip",  "wireMin": 0, "wireMax": 90,  "default": 60,  "scale": 0.01 },
      { "key": "flash", "label": "Flash", "wireMin": 0, "wireMax": 100, "default": 50,  "scale": 0.01 },
      { "key": "width", "label": "Width", "wireMin": 2, "wireMax": 9,   "default": 5,   "scale": 1, "unit": "cols" },
      { "key": "front", "label": "Front column", "wireMin": 0, "wireMax": 16, "default": 0, "scale": 1 } ] }
]}
```
Each style also has `bMin`/`bMax` (4/255) and `defaultColors`. These colour defaults can be tuned later: ominous `#9966CC`, alarm `#FF0000`, twotone `#FF4000`,`#8000FF`, pulse `#9966CC`, lighthouse `#FFD8A0`.
Phases add styles to this file as they implement them. Phase 1 contains ids 0 and 1 only.

## 3. Effect specifications

Notation: φ ∈ [0,1) is the style's main phase. `C`, `C2` are colours. `I` ∈ [0,1] is intensity, and the pixel is `C · I`.
Use integer sin16/cos16 at runtime; the formulas below are the reference that native tests check against (tolerance ±2/255).

### 3.1 Ominous Glow (Phase 1)
All 51 LEDs are identical. A breathing glow:
`I = D + (1 − D) · (1 − cos 2πφ) / 2`, with `D = 0.25` (constant). The trough is 25% of the peak.
Period 8 s (slow) → 1.5 s (fast).
Tests: min/max over one period ≈ 0.25/1.0; the period is exact; changing rate mid-cycle causes no jump in I.

### 3.2 Alarm (Phase 1)
Two vertical lines (all rows identical) of the same colour, 8.5 columns apart, rotating linearly toward increasing column numbers.
Head positions: `x₀ = 17φ`, `x₁ = x₀ + 8.5` (mod 17).
For column c and head x, let `d = ((x − c) mod 17)` mapped to (−8.5, 8.5]. `d > 0` means the column is behind the head.
Profile, with tail length `L` = param `tail` in columns (default 4):
```
f(d) = 0                         d < −1
       1 + d                     −1 ≤ d < 0       (leading anti-alias edge)
       (1 − d/(L+1))²            0 ≤ d ≤ L+1      (tail)
       0                         otherwise
```
`I(c) = max(f(d₀), f(d₁))`. Because the profile is continuous, sampling at integer columns gives smooth sub-pixel motion.
Period (one revolution) 2 s → 0.3 s.
Tests: the peak column tracks 17φ; the lines stay 8.5 apart; L=0 lights only the 1–2 anti-aliased columns; no column steps by more than (1/(L+1)) between consecutive 1 ms frames.

### 3.3 Two-tone Glow (Phase 4)
Each LED i (all 51 independently) has its own phase φᵢ (uint16) and multiplier mᵢ ∈ [0.5, 1.5] (uint8, stored as m·128).
Its period is `base · mᵢ`, with base 6 s → 1 s. When φᵢ wraps, re-roll mᵢ uniformly (seeded PRNG, e.g. xorshift16).
Colour: `blend(C, C2, (1 − cos 2πφᵢ)/2)` in RGB. At a wrap the LED is exactly `C`, so re-rolling never causes a jump.
Initial φᵢ are random, so LEDs start de-synchronised. RAM: 51 × 3 = 153 B. Hold it in a union shared with other effects' state.
Tests: continuity across a wrap; the distribution of mᵢ stays within bounds; the colour stays on the C–C2 line.

### 3.4 Vertical Pulse (Phase 4) — port of `arduino/wave/wave.ino`
Total cycle T (2.8 s → 0.7 s; the log midpoint 1.4 s matches wave.ino's 900 + 500 ms).
From wave.ino ratios: `womp = T·9/14`, `gap = T·5/14`, `stagger = T·1.6/14`, `waveLen = womp − 2·stagger`.
Row r starts at `r·stagger`. Its local progress `p = (t − r·stagger)/waveLen`. If 0 ≤ p < 1, `I_r = dim8_video(sin8(128p))`; otherwise 0 (black, no floor, per the decision).
All columns in a row are identical. Rows climb from 0 (bottom) to 2.
Tests: row order of peaks is 0, 1, 2; all rows are dark during the gap; matches wave.ino output at T = 1.4 s.

### 3.5 Lighthouse (Phase 4)
One soft beam rotates with a speed "whip" and an optional brightness "flash" when it passes the front.
Warped angle (in revolutions): `θ = φ + (k / 2π) · sin 2πφ`, with k = `whip` ∈ [0, 0.9].
Then dθ/dφ = 1 + k·cos 2πφ. The beam is fastest when passing the front (θ = 0) and slowest on the far side. θ is monotonic for k < 1, and the period stays exact.
Beam centre: `x = (17θ + front) mod 17`. Width W = `width` columns:
`f(d) = (1 + cos(π d / (W/2))) / 2` for |d| < W/2 (circular distance), else 0.
Flash, with s = `flash` ∈ [0,1]: `m = (1 − s) + s · ((1 + cos 2πθ)/2)³`. Full brightness at the front, `1 − s` at the far side.
`I(c) = f(d(c)) · m`. All rows are identical.
Period 10 s → 2 s.
Tests: monotonic θ; at k=0 the speed is constant; with s=0, m≡1; the peak brightness is at the front column when s>0.

## 4. Serial protocol

The classic Nano's AVR FastLED `show()` disables interrupts (~0.5 ms per strip). Bytes that arrive at 115200 baud during a show are lost.
The protocol is built around this.

**Link:** 115200 8N1. Opening the port resets the Nano through DTR, so the host waits 2 s and then retries `H` until `OK` arrives (timeout 5 s).

**Wake/CTS handshake (half-duplex, one command in flight):**
1. The host sends one wake byte `0x01` and waits for `!` (timeout 50 ms, up to 5 retries).
2. After every `show()`, firmware checks `Serial.available()`. If anything arrived, it flushes the input, sends `!`, and **stops rendering** until a full line arrives (`\n`, timeout 30 ms).
3. The host sends the line. Firmware parses it, replies `OK` or `ERR <code>`, and resumes rendering. The time base uses real dt, so animation continues correctly.
4. Every line ends with `*HH`: the XOR of all bytes before `*`, as two hex digits. On a bad checksum, firmware replies `ERR 1`; on a timeout, the host retries the whole sequence.

**Phase 2 starts with a spike to validate this.** Measure the corruption rate over 2,000 commands with naive sending, then with the wake/CTS handshake. Record the results in `firmware/NOTES.md`. If the spike shows the handshake is unnecessary, simplify the protocol, document why, and update this section.

**Coalescing (host):** the transport keeps a map of pending commands keyed by command type (and colour slot / param id). A newer value replaces a pending older one. Slider drags therefore never queue up, and only the latest value is sent.

**Commands** (ASCII, decimal ints, colours as 6 hex digits, max 72 bytes per line):
```
H                                  hello → "OK lightbox <protoVersion>"
P <style> <r> <b> <c0> <c1> <a0> <a1> <a2> <a3>   atomic preset load: sets style, live rate/brightness, colours, params; resets effect state; turns LFO OFF
R <r>                              live rate
B <b>                              live brightness
G <g>                              global brightness
C <slot> <rrggbb>                  one colour
A <idx> <value>                    one algorithm param (wire units, clamped to styles.json range)
L <on 0|1> <target 0=rate|1=bright> <mHz> <depth>   LFO (Phase 6)
?                                  dump → "S <style> <r> <b> <g> <c0> <c1> <a0..a3> <lfoOn> <lfoT> <mHz> <depth> <fps>"
```
Unused colour/param slots are sent as `000000` / `0`. Error codes: 1 checksum, 2 unknown command, 3 bad arguments, 4 line too long.
`shared/protocol-fixtures.json` lists `{ line, expectState | expectError }` cases. The firmware parser tests and the web encoder tests both run every fixture. A fixture that one side passes and the other fails is a contract break.

## 5. Web app behaviour

**Connection:** a Connect button (`navigator.serial.requestPort`). On load, try `getPorts()` to reconnect a previously granted port silently.
On the `disconnect` event, show a red "Disconnected — reconnecting" banner. On `connect`, reopen the port, handshake, and resend the full state (`P`, then `G`, then `L` if on).
Use `?` after connecting to verify the firmware state matches the UI.

**Stores:**
- `presets`: localStorage key `lightbox.presets.v1` holding `{ version: 1, presets: Preset[] }`.
  `Preset = { id: string (uuid), name, style: StyleKey, colors: string[] ("#rrggbb"), rate: number, brightness: number, params: Record<string, number> (wire units) }`.
  Seed one default preset per available style when the key is absent. Validate on load; reject or repair malformed entries without crashing.
- `live`: active preset id, live rate, live brightness. Not persisted.
- `global`: global brightness (persisted, `lightbox.global.v1`), blackout flag (never persisted).
- `lfo` (Phase 6): on, target, rate, depth. LFO settings persist; the on/off state does not.

**Rules:**
- Selecting a preset, or opening its editor, makes it active: send `P`, set live rate/brightness to the preset values, and turn the LFO off.
- Editing the active preset autosaves and sends each change live. Rate/brightness edits in the editor also update the live values.
- Live values (Phase 5) never write back to the preset. Each has a reset button that returns it to the preset value.
- Blackout (`B` key or button) sends `G 0` without changing the global slider. Toggling blackout off resends the slider value. While blackout is on, show a clearly visible indicator.
- Shortcuts are ignored while focus is in a text input. `1`–`9` select the preset at that list position. Arrows (Phase 5): ↑/↓ change brightness ±0.05, ←/→ change rate ±0.05, and holding Shift changes them by ±0.01.
- Export downloads `lightbox-presets-YYYYMMDD.json` = `{ app: "lightbox", version: 1, exportedAt, presets }`.
  Import validates the file and then asks Merge or Replace. Merge appends imported presets with new ids; Replace asks for confirmation.
- Style sliders show "slow…fast" and "dark…bright" labels. Algorithm params render from `styles.json` (slider, value shown as wire × scale + unit).

**Layout (dark theme, big hit targets):** preset list on the left (drag handle, number badge 1–9, name, style), with the editor in a side drawer. Main area, top to bottom: connection pill + blackout, Global brightness, Current panel (Phase 5), LFO panel (Phase 6).

**Testing:** Vitest unit tests for every store, the encoder, the registry and import/export validation, plus component tests (@vue/test-utils).
Playwright e2e uses an injected fake `navigator.serial` that speaks the protocol (wake → `!`, checksum, `OK`) and records decoded state.
Tests assert on that recorded state. They cover disconnect/reconnect and verify that coalescing sends only the last value of a drag.

## 6. LFO (firmware, Phase 6)
Sine LFO with its own phase accumulator. φ_L resets to 0 when the LFO is turned on.
For the target value v ∈ [0,1] (live rate or live brightness, normalised) and depth δ ∈ [0,1]:
`v' = clamp(v + (δ/2) · sin 2πφ_L, 0, 1)`. Depth 100% swings over the full range peak-to-peak.
v' feeds the normal mapping in §2.2. Rate modulation changes the phase increment only, so the effect never jumps.
The LFO keeps running if the browser disconnects. `P` turns it off.
The UI rate slider is log-scaled, 0.05–5 Hz.

## 7. Phases

Each phase ends with: `make check` green → `make smoke` green on the board → commit to `main` (`Phase N: <summary>`) → **stop** and give the user the hardware checklist for that phase. Do not continue until the user signs off.
Within a phase, firmware and web work can run as two parallel agents once the `shared/` contract for that phase is committed. The lead agent then does the integration and smoke testing on hardware.

### Phase 0 — Scaffolding & calibration
1. Create the layout in §1, the `Makefile`, `CLAUDE.md` (commands, the §1 quality gate, "never hand-edit styles_gen.h", "stop at phase gates"), and `.gitignore`.
2. Install PlatformIO (`pipx install platformio`) if missing. Check the user is in the `dialout`/`uucp` group; if not, tell the user to fix it rather than using sudo.
3. Web scaffold: Vite + Vue 3 + TS strict + Pinia + Vitest + Playwright + ESLint. One trivial test per tool so the gate works end to end.
4. Native test env with one trivial Unity test. The `nano` env compiles a blank sketch.
5. `calibrate` env. Each strip lights LED 0 white. LEDs 1, 2, 3 light in that strip's colour (pin 2 red, pin 3 green, pin 4 blue) at decreasing brightness to show direction. All other LEDs are off.
6. **Gate:** ask the user which colour is at the bottom/middle/top, whether the white LEDs line up vertically (if not, how many LEDs apart), whether the R/G/B tails run the same direction, and whether 17 LEDs wrap exactly once. Fill in `layout.h`. Then flash a verification pattern: logical column 0 lit on all rows, plus a dot sweeping logical columns 0→16 on row 0 only. Get the user's confirmation.

### Phase 1 — Core library, Ominous Glow, Alarm
1. Write `lib/core`: color, trig, timing, frame, styles_gen (ids 0–1).
2. Implement the effects from §3.1 and §3.2, with native tests as specified.
3. `main.cpp`: boot into Ominous Glow (default per §0). Add a `demo` build flag/env that cycles Ominous → Alarm every 10 s and steps rate 0 → 0.5 → 1 each cycle. Hardware gate only.
4. **Gate checklist:** breathing feels right at slow/mid/fast; trough depth OK; Alarm motion is smooth without visible column stepping; tail length looks good; lines appear vertical (validates calibration). Note any tuning the user asks for in `styles.json` / §3, and update this plan.

### Phase 2 — Chrome control (protocol + minimal UI)
1. Serial spike (§4) → `firmware/NOTES.md`.
2. Firmware parser + state model + `?` dump; native tests from `protocol-fixtures.json`.
3. Web: protocol encoder (fixture tests), transport (handshake, checksum, retry, coalescing, reconnect, resend), connection store, Connect button, connection pill/banner, and one dropdown for Ominous/Alarm that sends `P` with style defaults.
4. `scripts/smoke.ts`: handshake; 1,000 random valid commands, each verified with `?`; bad checksum → `ERR 1`; reconnect after the port is reopened.
5. **Gate checklist:** connect from Chrome; switch effects from the dropdown; unplug and replug USB → UI recovers and LEDs keep running throughout.

### Phase 3 — Presets & global brightness
1. Presets store, list (select, delete with confirm, duplicate, drag reorder, 1–9 badges), editor drawer (name, style dropdown, colour pickers per style colour count, rate, brightness, params from registry). Selecting or opening a preset activates it. Live autosave.
2. Seed default presets; export/import (§5).
3. Global brightness slider (persisted), blackout (`B` + button), `1`–`9` shortcuts.
4. Unit, component and e2e tests for all of the above.
5. **Gate checklist:** build several presets and switch between them live; global brightness scales smoothly to fully off; blackout is instant; export, clear storage, import → identical presets.

### Phase 4 — More effects
1. Add ids 2–4 to `styles.json`, regenerate, and implement §3.3–§3.5 with tests. Recheck the RAM budget (Two-tone state in the union).
2. The UI picks them up from the registry automatically. Add default presets for the new styles, seeding only those missing so existing user presets are kept.
3. `demo` env cycles all five styles.
4. **Gate checklist (expect tuning iterations):** Two-tone randomness/spread; Pulse vs. the original wave.ino; Lighthouse whip/flash/width at several settings, and which column is the front. Record final defaults in `styles.json` and §3.

### Phase 5 — Live "Current" panel
1. Current panel: live rate and brightness sliders with reset-to-preset buttons, sending `R`/`B`. Never mutates the preset.
2. Arrow-key nudges (§5).
3. Tests: live changes don't touch the stored preset; selecting a preset resets live values; coalescing during fast drags.
4. **Gate checklist:** sweeping rate during an effect causes no jumps or stutter; reset buttons work; arrow keys work.

### Phase 6 — LFO
1. Firmware LFO (§6) + `L` command + `?` fields + native tests (clamping, phase continuity, P turns it off).
2. LFO panel: on/off toggle, target (rate/brightness), rate (log 0.05–5 Hz), depth. Off by default and on every preset load.
3. Tests + smoke additions.
4. **Gate checklist:** brightness wobble and rate wobble feel musical across the range; the LFO keeps running with the browser closed; loading a preset stops it.

## 8. Risks & notes for agents
- **RAM:** 2 KB total. FastLED frame 153 B + logical frame (render directly into `leds[]` through the layout map; don't keep a second 153 B buffer unless you've measured that it fits) + serial 64 B + line buffer 72 B + effect union ~160 B. Don't use `String` or dynamic allocation in firmware. Keep string literals in `F()`/PROGMEM.
- **Floats on AVR** are slow. Use them only on parameter change, never per pixel per frame.
- **Old vs new bootloader:** if uploading with `nanoatmega328new` fails, try `nanoatmega328`. Record which one works in `CLAUDE.md`.
- **Dithering at low brightness with black backgrounds:** tails and fades may show 8-bit stepping. If the user reports it at a gate, options are FastLED dithering tweaks or a per-style floor. Ask the user; don't decide alone.
- **Ambiguity:** if the spec here and the hardware result disagree, or something isn't specified, stop and ask the user. Don't guess silently. Write every agreed change back into this file.
