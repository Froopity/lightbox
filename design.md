# Lightbox

Patterns to control a matrix of LEDs with an arduino nano.
Web interface to control those patterns in real time.

## Hardware
Seven strips of eighteen LEDs wrapping horizontally around a cylinder (three strips of seventeen before 2026-10-25). One Arduino nano controlling all of them.

FastLED is used to control the LEDs.

The Arduino is powered over USB, so unplugging the cable turns it and the LEDs off. This is an accepted hardware limitation; nothing needs to handle it. When the cable comes back, the web UI reconnects and restores the current state.

### Effects
**Ominous Glow**
Simple glow effect, all LEDS at the same brightness.

**Two-tone Glow**
Random glow effect. Each LED has a random rate and shifts between two colours.

**Vertical Pulse**
Pulse upwards, like a sci-fi reactor.

**Lighthouse**
Pulse around effect with some sine-like velocity so it gives that mmmmmwhOMmmmmmmmwhOMmmm type feel.

**Alarm**
Like a spinning cop light. Two vertical lines rotating around linearly.


## Web UI
Controls the effects live. Allows creating/editing presets at any time that are saved to local storage and exportable.

### Technical
A typescript-based vue.js chrome webapp. Chrome is used for the webSerial support. Tests for every feature, linting and typechecking run at every step.

### UI Elements
Elements are listed in order of importance to deliver the final product.

**Presets - Essential**
Presets have these properties:
- Name - Text box
- Style - Dropdown list
- Colour/s - Clickable colour picker
- Rate - Slider from "slow" to "fast". Values determined by style.
- Brightness - Slider from "dark" to "bright". Values determined by style.
- Any algorithm-specific parameters

Selecting a preset from the preset list makes it immediately active.
Opening the edit window for a preset makes it immediately active.
Any number of presets can be made and named.

**Global Brightness - Essential**
A slider that affects the global brightness setting, disconnected from presets. Max brightness is the stock brightness of the preset, scaling downwards to completely off.

**Current - Desired**
Live settings for the current preset. Used for dynamic effects at performance time. Two settings:
- Rate
- Brightness

When selecting a preset, these values are set to the preset value.
Shifting them dynamically changes the active light effect. 
Both can be jumped back to the default value by hitting their specific reset button. 
Changing these values does not affect the preset.

**LFO - Stretch**
An LFO for live manipulation of the current rate and brightness. 
Targets one destination, rate or brightness. 
Has a rate and intensity settings.
Can be toggled on and off. Starts off and turns off when new preset is loaded.

## Development Phases

**Phase 1**
Baseline effects. 
Algorithmic descriptions of every effect, turn the subjective description into hard maths. Lots of user questions for this one.

- Glow
- Alarm

**Phase 2**
Control the arduino with Chrome. Switch between two effects from a simple dropdown.

**Phase 3**
Preset creation and editing. Global brightness.

**Phase 4**
More effects.
Algorithmic descriptions of every effect, turn the subjective description into hard maths. Lots of user questions for this one.

**Phase 5**
Live parameter editing (the "current" window)

**Phase 6**
LFO
