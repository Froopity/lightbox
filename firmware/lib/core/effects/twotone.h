// Two-tone Glow (PLAN.md §3.3): every LED drifts between C and C2 on its own period, base·m with m
// re-rolled in [0.5, 1.5] each time the LED is back at C, so the LEDs never fall into step.
#pragma once
#include <stdint.h>

#include "../frame.h"

namespace core {
namespace twotone {

// The only effect with per-LED state: 126 × 3 B.
class State {
 public:
  // Random phases and multipliers. The generator carries on across resets, so each load looks different.
  void reset();
  // dBase: progress of the base period this frame, 2^24 = one base cycle (clamped to one cycle).
  void advance(uint32_t dBase);
  void render(Frame& f, Rgb c, Rgb c2) const;

  // Phase of LED i (row·COLS + col) as uint16 turns.
  uint16_t phase(uint8_t i) const { return phase_[i]; }
  // LED i's period as a multiple of the base period, ×128.
  uint8_t multiplier128(uint8_t i) const { return (uint8_t)((SPEED_ONE * 128 + speed_[i] / 2) / speed_[i]); }
  // Blend amount towards C2 for a phase: (1 − cos 2πφ)/2, 0..255.
  static uint8_t mix(uint16_t phase);

 private:
  static constexpr uint16_t SPEED_ONE = 128;  // speed is 1/m in Q7

  uint16_t next();
  uint8_t rollSpeed();

  // Separate arrays, so no padding: 3 B per LED.
  uint16_t phase_[PIXELS] = {};
  uint8_t speed_[PIXELS] = {};  // 1/m in Q7, 86..253
  uint16_t rng_ = 0xACE1;
  // Rounding offset for the step into phase_, stepped by an odd amount each frame so it visits all 256
  // values: steps round up as often as their fraction says, so periods stay exact on average.
  uint8_t dither_ = 0;
};

}  // namespace twotone
}  // namespace core
