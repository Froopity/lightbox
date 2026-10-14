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
| Presets | localStorage; export/import as a JSON file. Create, edit, delete (confirm), duplicate, drag to reorder; defaults seeded on first run. Editor edits are previewed live and stored only on **Save** (✕ discards). |
| UI layout | Follows the sketch `docs/UI design.png` (same content in `docs/UI design.svg`), agreed 2026-10-13, except that the editor only appears while editing, in place of Current (Phase 5 gate). See §5 Layout. |
| Shortcuts | `1`–`9` select preset by list position; `B` toggles blackout; arrows nudge live values (Phase 5). |
| Disconnect | The Arduino is powered over USB, so unplugging it turns the LEDs off (accepted hardware limitation, no special handling). UI shows a banner, reconnects automatically when the port comes back, and resends the full state. |
| LFO | Runs in firmware. Sine only. 0.05–5 Hz, depth 0–100%. Targets either rate or brightness. |
| Verification | Board will be attached to the dev machine. Agents compile, flash, and run serial smoke tests themselves; the user checks visuals at phase gates. |
| Workflow | Commit to `main`. Stop at the end of each phase for user sign-off. Never start the next phase without it. |

## 1. Repository layout

```
arduino/            existing reference sketches — leave untouched
firmware/
  platformio.ini    envs: nano (atmelavr, board nanoatmega328new — fall back to nanoatmega328 if upload fails), native, calibrate, verify, demo
  src/main.cpp      Arduino glue only: FastLED setup, layout mapping, serial I/O, frame loop
  src/calibrate.cpp calibration sketch (calibrate env only)
  src/spike.cpp     Phase 2 serial spike (spike env only); results in NOTES.md
  lib/core/         pure C++, NO Arduino/FastLED includes, compiles natively
    rgb.h           Rgb struct, scale8, blend (port the FastLED algorithms). Not `color.h`: lib/core is on
                    the include path and would shadow FastLED's own color.h. Avoid FastLED header names.
    pgm.h           CORE_PROGMEM + pgmCopy: constant tables live in flash on AVR (styles_gen.h uses it)
    style.h         styleDef(id): copies one registry entry out of flash
    trig.h          sin16/cos16 (port the FastLED algorithm), fixed-point helpers
    timing.h        phase accumulator, rate→period mapping
    frame.h         Frame: logical 3×17 view (row 0 = bottom, col 0 = calibrated column 0) over a
                    caller-owned pixel buffer + index function, so main.cpp renders straight into leds[]
    engine.h/.cpp   effect state: style, live rate/brightness, global, colours, params, main phase
    effects/*.h/.cpp one per style
    styles_gen.h    GENERATED from shared/styles.json — never hand-edit
    protocol.h/.cpp line parser + state model
    lfo.h/.cpp
  test/             Unity tests (native env)
web/
  src/protocol/     encoder (mirrors firmware parser)
  src/protocol/device.ts  TypeScript model of the firmware parser (fixtures, fake device, smoke test)
  src/serial/       WebSerial transport (wake/CTS pacing, coalescing, reconnect)
  src/testing/      fake device + fake navigator.serial (unit tests and e2e)
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
Implementation: the increment is held in Q8 (`2^40 / period_us`, rounded) with 8 fractional phase bits, so long periods stay exact to ~10 ppm.
Measured on hardware (Phase 1): Ominous ≈ 400 fps, Alarm ≈ 300 fps; `micros()` tracks host time to 0.04% despite `show()` disabling interrupts.
Phase 4, at full rate (`make smoke` reports these): Two-tone ≈ 246 fps, Pulse ≈ 322 fps, Lighthouse ≈ 265 fps.
Phase 6, with a 5 Hz full-depth LFO sweeping the rate: Ominous ≈ 399, Alarm ≈ 264, Two-tone ≈ 238, Pulse ≈ 305, Lighthouse ≈ 255 fps.
Because rate changes alter the increment and never the phase, rate edits and LFO modulation never cause visual jumps.
Target ≥ 100 fps. Report the measured fps in the `?` dump.

### 2.4 Styles (`shared/styles.json`)
```jsonc
{ "styles": [
  { "id": 0, "key": "ominous", "name": "Ominous Glow", "colors": 1, "periodSlowMs": 8000, "periodFastMs": 1500, "params": [] },
  { "id": 1, "key": "alarm", "name": "Alarm", "colors": 1, "periodSlowMs": 2000, "periodFastMs": 300,
    "params": [{ "key": "tail", "label": "Tail", "wireMin": 0, "wireMax": 16, "default": 0, "scale": 0.5, "unit": "cols" }] },
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
`I = D + (1 − D) · (1 − cos 2πφ) / 2`, with `D = 0.1` (constant). The trough is 10% of the peak (tuned at the Phase 1 gate from 0.25: "should go darker").
Period 8 s (slow) → 1.5 s (fast).
Tests: min/max over one period ≈ 0.1/1.0; the period is exact; changing rate mid-cycle causes no jump in I.

### 3.2 Alarm (Phase 1)
Two full-brightness vertical lines (all rows identical) of the same colour, 8.5 columns apart, rotating toward increasing column numbers.
**Hard-stepped** (Phase 1 gate: "just two full bright columns"): each line occupies exactly one column at full brightness and jumps to the next; no anti-aliasing.
Head columns: `h₀ = ⌊17φ⌋`, `h₁ = ⌊17φ + 8.5⌋ mod 17`. Because 17 is odd, the gap between the lines alternates 8/9 columns every half-column of travel.
For column c and head h, let `d = (h − c) mod 17` in whole columns; `d ∈ 1..8` is behind the head, `d ∈ 9..16` is ahead (dark).
Optional tail, `L` = param `tail` in columns (default **0** = bare columns; kept so presets can dial one in):
```
f(d) = 1                         d = 0
       (1 − d/(L+1))²            1 ≤ d < L+1      (tail, behind the head only)
       0                         otherwise
```
`I(c) = max(f(d₀), f(d₁))`.
Period (one revolution) 2 s → 0.3 s.
Tests: head columns match ⌊17φ⌋ and ⌊17φ + 8.5⌋; L=0 gives exactly two columns at 255 and the rest 0; the tail only lights columns behind the head; at the fastest rate with 1 ms frames each line steps one column at a time and never skips.

### 3.3 Two-tone Glow (Phase 4)
Each LED i (all 51 independently) has its own phase φᵢ (uint16) and multiplier mᵢ ∈ [0.5, 1.5] (uint8, stored as m·128).
Its period is `base · mᵢ`, with base 6 s → 1 s. When φᵢ wraps, re-roll mᵢ uniformly (seeded PRNG, e.g. xorshift16).
Colour: `blend(C, C2, (1 − cos 2πφᵢ)/2)` in RGB. At a wrap the LED is exactly `C`, so re-rolling never causes a jump.
Initial φᵢ are random, so LEDs start de-synchronised.
Implementation (Phase 4): each LED stores a 24-bit phase (uint16 + 8 fractional bits, so slow LEDs keep exact periods) and its
speed 1/mᵢ in Q7 instead of mᵢ, so the per-frame update needs no division. mᵢ·128 is rolled uniformly in 65..192 and the speed
rounded up, which keeps 1/speed inside [0.5, 1.5]. RAM: 51 × 4 = 204 B. It's a plain `Engine` member: the other effects are
pure functions of φ, so there is nothing to share a union with. The xorshift16 state carries on across `P` loads, so each load
starts from a different pattern. A frame gap is clamped to one base cycle.
Tests: continuity across a wrap; the distribution of mᵢ stays within bounds; the colour stays on the C–C2 line.

### 3.4 Vertical Pulse (Phase 4) — port of `arduino/wave/wave.ino`
Total cycle T (2.8 s → 0.7 s; the log midpoint 1.4 s matches wave.ino's 900 + 500 ms).
From wave.ino ratios: `womp = T·9/14`, `gap = T·5/14`, `stagger = T·1.6/14`, `waveLen = womp − 2·stagger`.
Row r starts at `r·stagger`. Its local progress `p = (t − r·stagger)/waveLen`. If 0 ≤ p < 1, `I_r = dim8_video(sin8(128p))`; otherwise 0 (black, no floor, per the decision).
All columns in a row are identical. Rows climb from 0 (bottom) to 2.
`sin8` and `dim8_video` are ported exactly from FastLED. As in wave.ino, `sin8(128p)` runs 128 → 255 → 128 (not from 0), so
each row switches on at ≈ 65/255, swells to full and drops from ≈ 68/255 to black: a faithful port, including that edge.
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
Implementation (Phase 4): θ and m use `sinSmooth` (`trig.h`, a corrected parabola, error < 0.1%, exact at 0 and ±1) rather
than `sin16`. `sin16`'s slope jumps at its table sections made θ step back slightly at k = 0.9, and its peak is 0.4% low,
so the flash never reached full. Both are evaluated once per frame; the beam profile uses `cos16` per column.

## 4. Serial protocol

The classic Nano's AVR FastLED `show()` disables interrupts (~0.5 ms per strip). Bytes that arrive at 115200 baud during a show are lost.
The protocol is built around this.

**Link:** 115200 8N1. Opening the port resets the Nano through DTR, so the host waits 2 s and then retries `H` until `OK` arrives (timeout 5 s).

**Wake/CTS handshake (half-duplex, one command in flight):**
1. The host sends one wake byte `0x01` and waits for `!` (timeout 50 ms, up to 5 retries).
2. After every `show()`, firmware checks `Serial.available()`. If anything arrived, it flushes the input, sends `!`, and **stops rendering** until a full line arrives (`\n`, timeout 30 ms).
3. The host sends the line. Firmware parses it, replies `OK` or `ERR <code>`, and resumes rendering. The time base uses real dt, so animation continues correctly.
4. Every line ends with `*HH`: the XOR of all bytes before `*`, as two hex digits. On a bad checksum, firmware replies `ERR 1`; on a timeout, the host retries the whole sequence.

**Spike result (Phase 2, `firmware/NOTES.md`):** with Alarm rendering at ~284 fps, naive sending corrupted 1,415 of 2,000 commands (71%); wake/CTS delivered 2,000/2,000 with no retries at ~130 commands/s. The handshake stays.
While the firmware is waiting for a line, a repeated wake byte gets another `!` (so a host wake retry never desyncs). A line that doesn't arrive within 30 ms is dropped silently and the host retries.

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
L <on 0|1> <target 0=rate|1=bright> <mHz 50–5000> <depth 0–1000>   LFO (Phase 6)
?                                  dump → "S <style> <r> <b> <g> <c0> <c1> <a0..a3> <lfoOn> <lfoT> <mHz> <depth> <fps>"
```
Unused colour/param slots are sent as `000000` / `0`. Error codes: 1 checksum, 2 unknown command, 3 bad arguments, 4 line too long.

**Parsing rules (Phase 2):**
- Checked in order: too long (4) → checksum (1; hex digits in either case) → command letter (2; exactly one uppercase letter or `?`, then a space or the end) → arguments (3).
- Arguments are separated by exactly one space, with no trailing space. Integers are one or more decimal digits (leading zeros allowed) and at most 65535. Colours are exactly 6 hex digits in either case.
- `r`, `b`, `g` above 1000, a style id ≥ the style count, or a colour slot > 1 is `ERR 3` (rejected, not clamped). Param values are clamped to the style's range.
- `P` ignores params the style doesn't have. `A` with an index the style doesn't have is `ERR 3`.
- An error never changes state. Replies carry no checksum.
- `L` (Phase 6): every field is range-checked, out of range is `ERR 3` (not clamped), whether `on` is 0 or 1. `L` always stores its settings, so the `?` LFO fields
  report the last `L` sent (`0 0 0 0` at boot). `P` sets `lfoOn` to 0 and keeps the other three. `L 1 …` while already on keeps the LFO's phase (only
  off → on resets it), so the host can resend settings during a drag.
- Opening the port resets the Nano (DTR), and a replug power-cycles it anyway, so after a reconnect the board shows the boot default for ~2 s until the host has resent the full state.

**Fixtures** (`shared/protocol-fixtures.json`): `boot` holds the boot state. Each case starts from it, applies `before` (each line must reply `OK`), then sends `line`. `cmd`, when present, must encode to exactly `line`. Each case has either `expectReply` or `expectError` (then the reply is `ERR <n>` and the state must be unchanged), and optionally a partial `expectState`. fps is 0 in tests.
The web suite runs them through the encoder and `src/protocol/device.ts` (a TypeScript model of the firmware parser, also used by the fake device and the smoke test). The firmware suite runs them from `firmware/test/test_protocol/fixtures_gen.h`, generated by `make gen`.
`shared/protocol-fixtures.json` lists `{ line, expectState | expectError }` cases. The firmware parser tests and the web encoder tests both run every fixture. A fixture that one side passes and the other fails is a contract break.

## 5. Web app behaviour

**Connection:** a Connect button (`navigator.serial.requestPort`). On load, try `getPorts()` to reconnect a previously granted port silently.
On the `disconnect` event, show a red "Disconnected — reconnecting" banner. On `connect`, reopen the port, handshake, and resend the full state (`P`, then `G`, then `L` if on).
Use `?` after connecting to verify the firmware state matches the UI.

**Stores:**
- `presets`: localStorage key `lightbox.presets.v1` holding `{ version: 1, presets: Preset[], seeded: StyleKey[] }`.
  `seeded` lists the styles whose default preset has been added once. On load, every style not in it gets its default
  preset appended to the end of the list, once, so new styles appear without bringing back presets the user deleted.
  A document without `seeded` (written before Phase 4) counts as `["ominous", "alarm"]`. Unknown keys are kept.
  `Preset = { id: string (uuid), name, style: StyleKey, colors: string[] ("#rrggbb"), rate: number, brightness: number, params: Record<string, number> (wire units) }`.
  Seed one default preset per available style when the key is absent. Validate on load; reject or repair malformed entries without crashing.
- `live`: active preset id, live rate, live brightness. Not persisted.
- `global`: global brightness (persisted, `lightbox.global.v1`), blackout flag (never persisted).
- `lfo` (Phase 6): on, target, rate, depth. LFO settings persist (`lightbox.lfo.v1` = `{ target, hz, depth }`, repaired on load); the on/off state does not.
  Defaults: Brightness, 1 Hz, 50%. Enabling or disabling sends `L`; setting changes are sent only while it's on (`L` carries them all when it's next enabled).
  Every `P` (select, ↻, editor open/✕, style change) switches the toggle off without sending `L`, since `P` does it on the board.

**Rules:**
- Selecting a preset, or opening its editor, makes it active: send `P`, set live rate/brightness to the preset values, and turn the LFO off.
- The editor works on a draft copy. Each change is sent live so the lights preview it, and rate/brightness edits also update the live values. Nothing is stored until **Save**, which writes the draft to the preset store and closes the editor.
  **✕** discards the draft, closes the editor and reloads the saved preset (sends `P`). `+` opens a draft with the first style's defaults; it becomes a preset only when saved (✕ creates nothing).
  Selecting another preset, opening another editor, or pressing `1`–`9` while the draft has unsaved changes asks "Discard unsaved changes?" first.
- The ↻ on the active preset row reloads that preset: it sends `P` (live rate/brightness back to the preset values, effect state reset, LFO off).
- Details settled in Phase 3 (confirm at the gate):
  on load the first preset in the list is active; clicking the already-active row does nothing (↻ restarts it); selecting another preset closes the editor.
  Changing Style in the editor resets colours and params to that style's defaults and keeps rate/brightness; the name follows the style unless it was customised. A blank name saves as the style name.
  Duplicate saves the current draft as "<name> copy" right after the original and keeps editing the copy (the original is unchanged). Deleting the active preset leaves the lights as they are with nothing selected.
  ↻ on the preset being edited resets the draft (asking first if unsaved) and keeps the editor open. Rows also reorder with ↑/↓ while the drag handle has focus. Colour swatches use the native picker: Chrome previews while picking; Firefox on Linux applies the colour when its dialog closes (accepted at the gate).
  Import asks to discard an unsaved draft and closes the editor; Replace clears the selection if the active preset is gone. A corrupt presets document is not overwritten until the user changes something (the seed is used meanwhile).
- Live values (Phase 5) never write back to the preset. Each has a reset button that returns it to the preset value.
  Details settled in Phase 5 (confirm at the gate): while the editor is open, "the preset value" is the draft's, so an editor Rate/Brightness
  edit moves both the live value and its ↻ target, while a live change leaves the draft alone. Live values survive a reconnect (the resend `P` carries them).
  Arrow nudges auto-repeat while held, snap to the 0.001 slider grid and clamp to 0..1. A focused drag handle keeps ↑/↓ for reordering, even at the ends of the list.
  A focused slider keeps the arrows (native 0.001 steps); making sliders unfocusable was tried at the Phase 5 gate and broke dragging, so it was rolled back.
  Arrows are off while the editor is open, since Current is hidden then.
- The global brightness ↻ sets it to 100%.
- Blackout (`B` key or button) sends `G 0` without changing the global slider. Toggling blackout off resends the slider value. While blackout is on, show a clearly visible indicator.
- Shortcuts are ignored while focus is in a text input. `1`–`9` select the preset at that list position. Arrows (Phase 5): ↑/↓ change brightness ±0.05, ←/→ change rate ±0.05, and holding Shift changes them by ±0.01.
- Export downloads `lightbox-presets-YYYYMMDD.json` = `{ app: "lightbox", version: 1, exportedAt, presets }`.
  Import validates the file and then asks Merge or Replace. Merge appends imported presets with new ids; Replace asks for confirmation.
- Style sliders show "slow…fast" and "dark…bright" labels. Algorithm params render from `styles.json` (slider, value shown as wire × scale + unit).

**Layout (dark theme, big hit targets).** It follows the sketch `docs/UI design.png`. A slim top bar holds the connection pill (and the disconnect banner below it), the blackout button and indicator, and Export / Import.
Below it, columns from left to right (the editor and Current share the second one):
1. **Presets.** A full-height list. Each row has a drag handle, a 1–9 number badge, the name, ✎ (open editor) and a radio showing which preset is active. Clicking the row or its radio selects it. The active row also shows a ↻ (reload preset). The list scrolls, and a `+` (new preset) button sits at its bottom right.
2. **Edit/Create**, only while a preset is being edited or created, in place of Current and LFO, covering both (you aren't playing live while editing; Phase 5 gate). The editor panel, titled with ✕ at the top right: Name (text), Style (dropdown), Colour/s (one swatch per style colour, each opens the native colour picker), Rate (slow…fast), Brightness (dark…bright), then the style's algorithm params. Footer: **Save** (primary), plus Duplicate and Delete (confirm) for existing presets.
   **Current** (Phase 5) above **LFO** (Phase 6), whenever the editor is closed. Current: Rate (slow…fast) and Brightness (dark…bright) sliders, each with a ↻ reset at its right end. LFO: an Enable toggle at the top right, Destination (dropdown: Rate / Brightness), Rate (slow…fast, log 0.05–5 Hz) and Intensity (low…high = depth). Before their phase lands, these panels are left out (not shown disabled).
3. **Brightness** (global). A tall vertical slider (top = 100%, bottom = off) with a ↻ (100%) below it.

↻ buttons are plain icon buttons that match the rest of the UI, not the sketch's dark filled squares (changed at the Phase 3 gate). Reuse one `ResetButton` component everywhere.

**Testing:** Vitest unit tests for every store, the encoder, the registry and import/export validation, plus component tests (@vue/test-utils).
Playwright e2e uses an injected fake `navigator.serial` that speaks the protocol (wake → `!`, checksum, `OK`) and records decoded state.
Tests assert on that recorded state. They cover disconnect/reconnect and verify that coalescing sends only the last value of a drag.

## 6. LFO (firmware, Phase 6)
Sine LFO with its own phase accumulator. φ_L resets to 0 when the LFO is turned on (sin 0 = 0, so turning it on never jumps).
For the target value v ∈ [0,1] (live rate or live brightness, normalised) and depth δ ∈ [0,1]:
`v' = clamp(v + (δ/2) · sin 2πφ_L, 0, 1)`. Depth 100% swings over the full range peak-to-peak.
v' feeds the normal mapping in §2.2. Rate modulation changes the phase increment only, so the effect never jumps.
The LFO keeps running if the browser closes (the board stays powered over USB). `P` turns it off.
The UI rate slider is log-scaled, 0.05–5 Hz.
Implementation (Phase 6, `lib/core/lfo.h`): `sinSmooth` once per frame (exact at ±1, so 100% reaches both ends). A rate target re-evaluates the
rate table each frame; a brightness target only changes the `setBrightness` byte. Turning it off returns to the unmodulated values at once.
The live values (`R`/`B`, the Current sliders, the `?` dump) are never modulated: the LFO works on a copy each frame.
Details settled in Phase 6 (confirm at the gate): the LFO Rate and Intensity sliders show a readout (Hz, %) as well as slow…fast / low…high;
the Enable toggle is a switch-styled native checkbox. No keyboard shortcut for the LFO.

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
5. **Gate checklist:** connect from Chrome; switch effects from the dropdown; unplug and replug USB → banner while unplugged (LEDs go off: USB power), then the UI reconnects and the LEDs come back in the selected effect.

### Phase 3 — Presets & global brightness
1. The four-column layout from §5 (Current/LFO columns absent until their phases). Presets store and list (select via row/radio, ↻ reload on the active row, drag reorder, 1–9 badges, `+`), editor panel (name, style dropdown, colour pickers per style colour count, rate, brightness, params from registry; Save / ✕ draft semantics; Duplicate, Delete with confirm). Selecting or opening a preset activates it.
2. Seed default presets; export/import (§5).
3. Global brightness vertical slider (persisted) with ↻ to 100%, blackout (`B` + button), `1`–`9` shortcuts (with the unsaved-draft confirm).
4. Unit, component and e2e tests for all of the above.
5. **Gate checklist:** the layout matches `docs/UI design.png`; build several presets and switch between them live; edit a preset and press ✕ → the lights and the stored preset return to the saved version; ↻ on the active row restarts it; global brightness scales smoothly to fully off; blackout is instant; export, clear storage, import → identical presets.

### Phase 4 — More effects
1. Add ids 2–4 to `styles.json`, regenerate, and implement §3.3–§3.5 with tests. Recheck the RAM budget (Two-tone state in the union).
2. The UI picks them up from the registry automatically. Add default presets for the new styles, seeding only those missing so existing user presets are kept.
3. `demo` env cycles all five styles (10 s each, in id order), stepping rate 0 → 0.5 → 1 after each round.
4. **Gate checklist (expect tuning iterations):** Two-tone randomness/spread; Pulse vs. the original wave.ino; Lighthouse whip/flash/width at several settings, and which column is the front. Record final defaults in `styles.json` and §3.
   **Signed off 2026-10-13 with no tuning:** the defaults in §2.4/§3 are final, including the Pulse on/off edge (kept as in wave.ino) and front column 0.

### Phase 5 — Live "Current" panel
1. Current panel (third column, above where LFO goes): live rate and brightness sliders with ↻ reset-to-preset buttons, sending `R`/`B`. Never mutates the preset.
2. Arrow-key nudges (§5).
3. Tests: live changes don't touch the stored preset; selecting a preset resets live values; coalescing during fast drags.
4. **Gate checklist:** sweeping rate during an effect causes no jumps or stutter; reset buttons work; arrow keys work.

### Phase 6 — LFO
1. Firmware LFO (§6) + `L` command + `?` fields + native tests (clamping, phase continuity, P turns it off).
2. LFO panel (third column, below Current): Enable toggle, Destination (Rate/Brightness), Rate (log 0.05–5 Hz), Intensity (depth). Off by default and on every preset load.
3. Tests + smoke additions.
4. **Gate checklist:** brightness wobble and rate wobble feel musical across the range; the LFO keeps running with the browser closed; loading a preset stops it.

## 8. Risks & notes for agents
- **RAM:** 2 KB total. FastLED frame 153 B + logical frame (render directly into `leds[]` through the layout map; don't keep a second 153 B buffer unless you've measured that it fits) + serial 64 B + line buffer 72 B + effect union ~160 B. Don't use `String` or dynamic allocation in firmware. Keep string literals in `F()`/PROGMEM.
- **Floats on AVR** are slow. Use them only on parameter change, never per pixel per frame.
- **Old vs new bootloader:** if uploading with `nanoatmega328new` fails, try `nanoatmega328`. Record which one works in `CLAUDE.md`.
- **Dithering at low brightness with black backgrounds:** tails and fades may show 8-bit stepping. If the user reports it at a gate, options are FastLED dithering tweaks or a per-style floor. Ask the user; don't decide alone.
- **Ambiguity:** if the spec here and the hardware result disagree, or something isn't specified, stop and ask the user. Don't guess silently. Write every agreed change back into this file.
