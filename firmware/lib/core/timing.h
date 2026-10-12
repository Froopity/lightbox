// Phase accumulators and the rate → period mapping (PLAN.md §2.2, §2.3).
#pragma once
#include <stdint.h>

namespace core {

// Phase increment per microsecond in Q8: 2^40 / period_us. 2^32 phase = one cycle.
using PhaseInc = uint32_t;

// A uint32 phase (2^32 = one cycle) with 8 extra fractional bits, so long periods stay exact.
struct Phase {
  uint32_t value = 0;
  uint8_t frac = 0;

  void reset() { value = 0, frac = 0; }
  void advance(uint32_t dtUs, PhaseInc inc) {
    uint64_t d = (uint64_t)dtUs * inc + frac;
    frac = (uint8_t)d;
    value += (uint32_t)(d >> 8);
  }
  // Top 16 bits, the angle used by sin16/cos16.
  uint16_t angle() const { return (uint16_t)(value >> 16); }
};

constexpr uint16_t WIRE_MAX = 1000;  // normalised controls run 0..1000 on the wire

// Maps rate 0..1000 to a phase increment: period = slow · (fast/slow)^(r/1000).
// The table is built (with floats) once per style change; lookups are integer and cheap enough per frame.
class RateMap {
 public:
  static constexpr uint8_t SEGMENTS = 32;

  void build(uint32_t periodSlowMs, uint32_t periodFastMs);
  PhaseInc inc(uint16_t rate) const;

 private:
  PhaseInc table_[SEGMENTS + 1] = {};
};

// Q8 increment for a period in microseconds.
inline PhaseInc incForPeriodUs(uint32_t periodUs) {
  return (PhaseInc)((((uint64_t)1 << 40) + periodUs / 2) / periodUs);
}

// Style byte = bMin + (bMax − bMin)·(b/1000)², then · (g/1000)² (PLAN.md §2.2).
inline uint8_t outputBrightness(uint8_t bMin, uint8_t bMax, uint16_t b, uint16_t g) {
  if (b > WIRE_MAX) b = WIRE_MAX;
  if (g > WIRE_MAX) g = WIRE_MAX;
  uint8_t style = (uint8_t)(bMin + (uint32_t)(bMax - bMin) * ((uint32_t)b * b) / 1000000UL);
  return (uint8_t)((uint32_t)style * ((uint32_t)g * g) / 1000000UL);
}

}  // namespace core
