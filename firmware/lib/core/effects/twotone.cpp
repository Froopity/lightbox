#include "twotone.h"

#include "../trig.h"

namespace core {
namespace twotone {

namespace {

constexpr uint32_t BASE_CYCLE = 1UL << 24;

}  // namespace

uint16_t State::next() {
  // xorshift16 (7, 9, 8): period 65535.
  rng_ ^= (uint16_t)(rng_ << 7);
  rng_ ^= (uint16_t)(rng_ >> 9);
  rng_ ^= (uint16_t)(rng_ << 8);
  return rng_;
}

uint8_t State::rollSpeed() {
  // m·128 uniform in 65..192, stored as its reciprocal so advance() needs no division.
  // Rounding up keeps 1/speed inside [0.5, 1.5].
  uint8_t m128 = (uint8_t)(65 + (next() >> 9));
  return (uint8_t)((SPEED_ONE * 128 + m128 - 1) / m128);
}

void State::reset() {
  for (uint8_t i = 0; i < PIXELS; i++) {
    speed_[i] = rollSpeed();
    phase_[i] = next();
  }
}

void State::advance(uint32_t dBase) {
  if (dBase > BASE_CYCLE) dBase = BASE_CYCLE;
  dither_ += 157;
  for (uint8_t i = 0; i < PIXELS; i++) {
    // dBase / m in 2^24 units, rounded (dithered) to the uint16 phase.
    uint32_t p = phase_[i] + ((((dBase * speed_[i]) >> 7) + dither_) >> 8);
    if (p > 0xFFFF) {  // back at C: re-roll, which can't cause a jump
      p &= 0xFFFF;
      speed_[i] = rollSpeed();
    }
    phase_[i] = (uint16_t)p;
  }
}

uint8_t State::mix(uint16_t phase) { return (uint8_t)(raisedCos16(phase) >> 8); }

void State::render(Frame& f, Rgb c, Rgb c2) const {
  uint8_t i = 0;
  for (uint8_t r = 0; r < ROWS; r++)
    for (uint8_t col = 0; col < COLS; col++, i++) f.set(r, col, blend(c, c2, mix(phase_[i])));
}

}  // namespace twotone
}  // namespace core
