#include "timing.h"

#include <math.h>

namespace core {

void RateMap::build(uint32_t periodSlowMs, uint32_t periodFastMs) {
  float ratio = (float)periodFastMs / (float)periodSlowMs;
  for (uint8_t i = 0; i <= SEGMENTS; i++) {
    float periodUs = (float)periodSlowMs * 1000.0f * powf(ratio, (float)i / SEGMENTS);
    table_[i] = incForPeriodUs((uint32_t)(periodUs + 0.5f));
  }
}

PhaseInc RateMap::inc(uint16_t rate) const {
  if (rate > WIRE_MAX) rate = WIRE_MAX;
  uint16_t pos = (uint16_t)(rate * SEGMENTS);  // ≤ 32000
  uint8_t i = (uint8_t)(pos / WIRE_MAX);
  if (i == SEGMENTS) return table_[SEGMENTS];
  uint16_t f = (uint16_t)(pos % WIRE_MAX);
  // Increments grow with rate, so the difference is non-negative.
  // Adjacent entries differ by a few percent, so the product fits in 32 bits.
  return table_[i] + (table_[i + 1] - table_[i]) * f / WIRE_MAX;
}

}  // namespace core
