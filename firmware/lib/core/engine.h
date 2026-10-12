// Effect state: active style, live controls, colours, params, and the main phase.
// main.cpp drives it each frame (tick → render); protocol.h drives the setters.
#pragma once
#include <stdint.h>

#include "frame.h"
#include "style.h"
#include "timing.h"

namespace core {

class Engine {
 public:
  // Boot default (PLAN.md §0): Ominous Glow, default colour, rate 0.5, brightness 0.8, global 1.0.
  Engine() { reset(); }
  void reset();

  // Switches style with its default colours and params and restarts its phase. Keeps rate/brightness.
  void loadStyle(uint8_t style);
  void setRate(uint16_t r);
  void setBrightness(uint16_t b) { brightness_ = b > WIRE_MAX ? WIRE_MAX : b; }
  void setGlobal(uint16_t g) { global_ = g > WIRE_MAX ? WIRE_MAX : g; }
  void setColor(uint8_t slot, uint32_t rgb);
  // Value in wire units, clamped to the style's range.
  void setParam(uint8_t idx, uint16_t value);

  void tick(uint32_t dtUs) { phase_.advance(dtUs, inc_); }
  void render(Frame& f) const;
  // Value for FastLED.setBrightness().
  uint8_t outputBrightness() const;

  uint8_t style() const { return style_; }
  uint16_t rate() const { return rate_; }
  uint16_t brightness() const { return brightness_; }
  uint16_t global() const { return global_; }
  uint32_t color(uint8_t slot) const { return slot < MAX_COLORS ? colors_[slot] : 0; }
  uint16_t param(uint8_t idx) const { return idx < MAX_PARAMS ? params_[idx] : 0; }
  uint8_t paramCount() const { return def_.paramCount; }
  uint32_t phase() const { return phase_.value; }
  PhaseInc inc() const { return inc_; }

 private:
  StyleDef def_;
  RateMap rates_;
  Phase phase_;
  PhaseInc inc_ = 0;
  uint32_t colors_[MAX_COLORS] = {};
  uint16_t params_[MAX_PARAMS] = {};
  uint16_t rate_ = 0, brightness_ = 0, global_ = 0;
  uint8_t style_ = 0;
};

}  // namespace core
