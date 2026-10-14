#include "lfo.h"

#include "trig.h"

namespace core {

void Lfo::set(bool on, uint8_t target, uint16_t mHz, uint16_t depth) {
  if (on && !on_) phase_.reset();
  on_ = on;
  target_ = target == BRIGHTNESS ? BRIGHTNESS : RATE;
  mHz_ = mHz < MHZ_MIN ? MHZ_MIN : mHz > MHZ_MAX ? MHZ_MAX : mHz;
  depth_ = depth > WIRE_MAX ? WIRE_MAX : depth;
  // Q8 increment for a period of 10^9/mHz µs: 2^40 · mHz / 10^9.
  inc_ = (PhaseInc)((((uint64_t)mHz_ << 40) + 500000000ULL) / 1000000000ULL);
}

uint16_t Lfo::apply(uint16_t v) const {
  // sinSmooth peaks at exactly ±32768, so depth 1000 swings the full range peak to peak.
  int32_t offset = (int32_t)depth_ * sinSmooth(phase_.angle()) / 65536;
  int32_t out = (int32_t)v + offset;
  return (uint16_t)(out < 0 ? 0 : out > WIRE_MAX ? WIRE_MAX : out);
}

}  // namespace core
