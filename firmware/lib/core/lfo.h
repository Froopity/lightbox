// Sine LFO (PLAN.md §6): moves the live rate or brightness by ±depth/2 around its value, once per frame.
#pragma once
#include <stdint.h>

#include "timing.h"

namespace core {

class Lfo {
 public:
  enum Target : uint8_t { RATE = 0, BRIGHTNESS = 1 };
  static constexpr uint16_t MHZ_MIN = 10, MHZ_MAX = 5000;

  // Settings are kept while it's off. Turning it on restarts its phase at 0, where the offset is 0,
  // so nothing jumps. Changing settings while it's on keeps the phase.
  void set(bool on, uint8_t target, uint16_t mHz, uint16_t depth);
  void off() { on_ = false; }
  void advance(uint32_t dtUs) {
    if (on_) phase_.advance(dtUs, inc_);
  }
  // v' = clamp(v + (depth/2)·sin 2πφ, 0, 1), all in wire units (0..1000).
  uint16_t apply(uint16_t v) const;
  // True when the LFO is on and moving this target.
  bool modulates(Target t) const { return on_ && target_ == t; }

  bool on() const { return on_; }
  uint8_t target() const { return target_; }
  uint16_t mHz() const { return mHz_; }
  uint16_t depth() const { return depth_; }
  uint32_t phase() const { return phase_.value; }

 private:
  Phase phase_;
  PhaseInc inc_ = 0;
  uint16_t mHz_ = 0, depth_ = 0;
  uint8_t target_ = RATE;
  bool on_ = false;
};

}  // namespace core
